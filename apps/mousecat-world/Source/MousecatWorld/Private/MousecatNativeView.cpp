#include "MousecatNativeView.h"

#include "Async/Async.h"
#include "Dom/JsonObject.h"
#include "Engine/Console.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/Texture2D.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformTime.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "InputCoreTypes.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/DateTime.h"
#include "Misc/FileHelper.h"
#include "Misc/Guid.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Modules/ModuleManager.h"
#include "RenderCommandFence.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UnrealClient.h"
#if PLATFORM_WINDOWS
#include "Windows/WindowsHWrapper.h"
#endif

namespace MousecatWorldManifest { FSHA256Signature HashSha256(const TArray<uint8>& Bytes); }

namespace MousecatNative
{
	constexpr int64 MaxInteger = 9007199254740991LL;
	constexpr int32 MaxWidth = 4096, MaxHeight = 2160;
	constexpr double PollInterval = 0.025;
	struct FSnapshot
	{
		FString Session, State, Title, Summary, File, Hash;
		FString ResultStatus, ResultMessage;
		FString CameraMode, CameraSummary;
		TArray<FString> CameraPeople;
		int64 Sequence = 0, CapturedAt = 0, Acknowledged = 0, Width = 0, Height = 0;
		int64 ResultSequence = 0;
		TArray<TSharedPtr<FJsonObject>> People;
	};
	struct FImageKey
	{
		FString Session, File, Hash;
		int64 Width = 0, Height = 0;
		bool Matches(const FSnapshot& Snapshot) const
		{
			return !Session.IsEmpty() && Session == Snapshot.Session && File == Snapshot.File
				&& Hash.Equals(Snapshot.Hash, ESearchCase::IgnoreCase)
				&& Width == Snapshot.Width && Height == Snapshot.Height;
		}
	};
	struct FReadCursor
	{
		FString Session, ManifestHash, ResultStatus, ResultMessage;
		int64 Sequence = 0, CapturedAt = 0, Acknowledged = 0, ResultSequence = 0;
		FImageKey Image;
	};
	enum class EReadState { Unchanged, Ready, Rejected, SessionChanged };
	struct FReadResult
	{
		EReadState State = EReadState::Rejected;
		FSnapshot Snapshot;
		FString ManifestHash, Error;
		TArray64<uint8> Pixels;
	};
	bool PlainText(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, FString& Out, int32 Limit, bool bEmpty = false)
	{
		const auto Field = Object->TryGetField(Key);
		if (!Field.IsValid() || Field->Type != EJson::String) return false;
		if (!Object->TryGetStringField(Key, Out) || Out.Len() > Limit || (!bEmpty && Out.IsEmpty())) return false;
		for (TCHAR C : Out) if ((C < 32 && C != '\n' && C != '\t') || C == 127) return false;
		return true;
	}
	bool Fields(const TSharedPtr<FJsonObject>& Object, std::initializer_list<const TCHAR*> Names, std::initializer_list<const TCHAR*> Optional = {})
	{
		if (!Object.IsValid()) return false;
		int32 Count = static_cast<int32>(Names.size());
		for (const TCHAR* Name : Optional) if (Object->HasField(Name)) ++Count;
		if (Object->Values.Num() != Count) return false;
		for (const TCHAR* Name : Names) if (!Object->HasField(Name)) return false;
		return true;
	}
	bool Integer(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, int64 Minimum, int64 Maximum, int64& Out)
	{
		const auto Field = Object->TryGetField(Key);
		if (!Field.IsValid() || Field->Type != EJson::Number) return false;
		double Value;
		if (!Object->TryGetNumberField(Key, Value) || !FMath::IsFinite(Value)
			|| Value < Minimum || Value > Maximum || Value != FMath::FloorToDouble(Value)) return false;
		Out = static_cast<int64>(Value);
		return true;
	}
	bool Hex(const FString& Value)
	{
		if (Value.Len() != 64) return false;
		for (TCHAR C : Value) if (!((C >= '0' && C <= '9') || (C >= 'a' && C <= 'f') || (C >= 'A' && C <= 'F'))) return false;
		return true;
	}
	bool PngFile(const FString& Value)
	{
		if (Value.IsEmpty() || Value.Len() > 128 || Value.Contains(TEXT("..")) || !Value.EndsWith(TEXT(".png"), ESearchCase::CaseSensitive)) return false;
		for (TCHAR C : Value) if (!((C >= 'a' && C <= 'z') || (C >= 'A' && C <= 'Z') || (C >= '0' && C <= '9') || C == '-' || C == '_' || C == '.')) return false;
		FString Stem, Suffix;
		Value.Split(TEXT("."), &Stem, &Suffix);
		Stem.ToUpperInline();
		if (Stem == TEXT("CON") || Stem == TEXT("PRN") || Stem == TEXT("AUX") || Stem == TEXT("NUL")
			|| (Stem.Len() == 4 && (Stem.StartsWith(TEXT("COM")) || Stem.StartsWith(TEXT("LPT"))) && Stem[3] >= '1' && Stem[3] <= '9')) return false;
		return Value[0] != '.';
	}
#if PLATFORM_WINDOWS
	FString NativePath(const FString& Path)
	{
		FString Full = FPaths::ConvertRelativePathToFull(Path);
		Full.ReplaceInline(TEXT("/"), TEXT("\\"));
		if (Full.StartsWith(TEXT("\\\\?\\"))) return Full;
		return Full.StartsWith(TEXT("\\\\")) ? TEXT("\\\\?\\UNC\\") + Full.Mid(2) : TEXT("\\\\?\\") + Full;
	}
#endif
	bool ReparsePoint(const FString& Path)
	{
#if PLATFORM_WINDOWS
		const DWORD Attributes = ::GetFileAttributesW(*NativePath(Path));
		return Attributes != INVALID_FILE_ATTRIBUTES && (Attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
#else
		return IFileManager::Get().IsSymlink(*Path);
#endif
	}
	bool ReadBounded(const FString& Path, int64 Limit, TArray<uint8>& Bytes)
	{
		if (ReparsePoint(Path)) return false;
		TUniquePtr<FArchive> Reader(IFileManager::Get().CreateFileReader(*Path));
		if (!Reader || Reader->TotalSize() <= 0 || Reader->TotalSize() > Limit) return false;
		const int64 Size = Reader->TotalSize();
		Bytes.SetNumUninitialized(static_cast<int32>(Size));
		Reader->Serialize(Bytes.GetData(), Size);
		return !Reader->IsError() && Reader->TotalSize() == Size && Reader->Close();
	}
	bool StrictJson(const FString& Text, TSharedPtr<FJsonObject>& Out)
	{
		struct FScope { bool bObject; TSet<FString> Keys; };
		TArray<FScope> Scopes;
		const auto Reader = TJsonReaderFactory<>::Create(Text);
		EJsonNotation Token;
		while (Reader->ReadNext(Token))
		{
			if (Token == EJsonNotation::Error) return false;
			if (Token == EJsonNotation::ObjectEnd || Token == EJsonNotation::ArrayEnd)
			{
				if (Scopes.IsEmpty()) return false;
				Scopes.Pop(EAllowShrinking::No);
				continue;
			}
			if (!Scopes.IsEmpty() && Scopes.Last().bObject)
			{
				const FString Key = Reader->GetIdentifier();
				if (Scopes.Last().Keys.Contains(Key)) return false;
				Scopes.Last().Keys.Add(Key);
			}
			if (Token == EJsonNotation::ObjectStart || Token == EJsonNotation::ArrayStart)
			{
				if (Scopes.Num() >= 8) return false;
				Scopes.Add({Token == EJsonNotation::ObjectStart, {}});
			}
			if (Token == EJsonNotation::Number && !FMath::IsFinite(Reader->GetValueAsNumber())) return false;
		}
		return Scopes.IsEmpty() && Reader->GetErrorMessage().IsEmpty()
			&& FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Out) && Out.IsValid();
	}
	bool Parse(const FString& Text, FSnapshot& Out)
	{
		Out = FSnapshot();
		TSharedPtr<FJsonObject> Root;
		if (!StrictJson(Text, Root) || !Fields(Root, {TEXT("schema"), TEXT("sessionId"), TEXT("sequence"), TEXT("capturedAtUnixMs"), TEXT("image"), TEXT("state"), TEXT("title"), TEXT("summary"), TEXT("people"), TEXT("lastCommandSequence")}, {TEXT("commandResult"), TEXT("camera")})) return false;
		FString Schema;
		FGuid Guid;
		if (!PlainText(Root, TEXT("schema"), Schema, 80) || Schema != TEXT("mousecat.native-view/1")
			|| !PlainText(Root, TEXT("sessionId"), Out.Session, 36) || Out.Session.Len() != 36
			|| !FGuid::ParseExact(Out.Session, EGuidFormats::DigitsWithHyphens, Guid)
			|| !Integer(Root, TEXT("sequence"), 1, MaxInteger, Out.Sequence)
			|| !Integer(Root, TEXT("capturedAtUnixMs"), 0, MaxInteger, Out.CapturedAt)
			|| !Integer(Root, TEXT("lastCommandSequence"), 0, MaxInteger, Out.Acknowledged)
			|| !PlainText(Root, TEXT("state"), Out.State, 16)
			|| !(Out.State == TEXT("running") || Out.State == TEXT("paused") || Out.State == TEXT("ended"))
			|| !PlainText(Root, TEXT("title"), Out.Title, 160)
			|| !PlainText(Root, TEXT("summary"), Out.Summary, 4096, true)) return false;
		if (Root->HasField(TEXT("commandResult")))
		{
			const TSharedPtr<FJsonObject>* Result;
			if (!Root->TryGetObjectField(TEXT("commandResult"), Result)
				|| !Fields(*Result, {TEXT("sequence"), TEXT("status"), TEXT("message")})
				|| !Integer(*Result, TEXT("sequence"), 1, MaxInteger, Out.ResultSequence)
				|| Out.ResultSequence != Out.Acknowledged
				|| !PlainText(*Result, TEXT("status"), Out.ResultStatus, 8)
				|| !(Out.ResultStatus == TEXT("applied") || Out.ResultStatus == TEXT("rejected"))
				|| !PlainText(*Result, TEXT("message"), Out.ResultMessage, 512, true)) return false;
		}
		const TSharedPtr<FJsonObject>* Image;
		if (!Root->TryGetObjectField(TEXT("image"), Image) || !Fields(*Image, {TEXT("file"), TEXT("sha256"), TEXT("width"), TEXT("height")})
			|| !PlainText(*Image, TEXT("file"), Out.File, 128) || !PngFile(Out.File)
			|| !PlainText(*Image, TEXT("sha256"), Out.Hash, 64) || !Hex(Out.Hash)
			|| !Integer(*Image, TEXT("width"), 1, MaxWidth, Out.Width)
			|| !Integer(*Image, TEXT("height"), 1, MaxHeight, Out.Height)) return false;
		const TArray<TSharedPtr<FJsonValue>>* People;
		if (!Root->TryGetArrayField(TEXT("people"), People) || People->Num() > 2048) return false;
		TSet<FString> Ids;
		for (const auto& Entry : *People)
		{
			const TSharedPtr<FJsonObject>* Person;
			FString Id, Label, Summary;
			if (!Entry->TryGetObject(Person) || !Fields(*Person, {TEXT("id"), TEXT("label"), TEXT("summary")})
				|| !PlainText(*Person, TEXT("id"), Id, 128) || Ids.Contains(Id)
				|| !PlainText(*Person, TEXT("label"), Label, 160)
				|| !PlainText(*Person, TEXT("summary"), Summary, 4096, true)) return false;
			Ids.Add(Id); Out.People.Add(*Person);
		}
		if (Root->HasField(TEXT("camera")))
		{
			const TSharedPtr<FJsonObject>* Camera;
			const TArray<TSharedPtr<FJsonValue>>* CameraPeople;
			if (!Root->TryGetObjectField(TEXT("camera"), Camera)
				|| !Fields(*Camera, {TEXT("mode"), TEXT("personIds"), TEXT("summary")})
				|| !PlainText(*Camera, TEXT("mode"), Out.CameraMode, 9)
				|| !(Out.CameraMode == TEXT("automatic") || Out.CameraMode == TEXT("manual"))
				|| !PlainText(*Camera, TEXT("summary"), Out.CameraSummary, 512, true)
				|| !(*Camera)->TryGetArrayField(TEXT("personIds"), CameraPeople) || CameraPeople->Num() > 5) return false;
			for (const auto& Person : *CameraPeople)
			{
				FString Id;
				if (!Person.IsValid() || Person->Type != EJson::String || !Person->TryGetString(Id)
					|| !Ids.Contains(Id) || Out.CameraPeople.Contains(Id)) return false;
				Out.CameraPeople.Add(Id);
			}
		}
		return true;
	}
	EReadState ValidateNext(const FSnapshot& Snapshot, const FReadCursor& Cursor, FString& Error)
	{
		if (!Cursor.Session.IsEmpty() && Snapshot.Session != Cursor.Session)
		{ Error = TEXT("Producer session changed. Reopen this view to connect."); return EReadState::SessionChanged; }
		if (Snapshot.Sequence <= Cursor.Sequence || Snapshot.CapturedAt < Cursor.CapturedAt || Snapshot.Acknowledged < Cursor.Acknowledged)
		{ Error = TEXT("Snapshot rejected: sequence, time or acknowledgement moved backwards."); return EReadState::Rejected; }
		if (Snapshot.ResultSequence > 0 && (Snapshot.ResultSequence < Cursor.ResultSequence
			|| (Snapshot.ResultSequence == Cursor.ResultSequence && (Snapshot.ResultStatus != Cursor.ResultStatus || Snapshot.ResultMessage != Cursor.ResultMessage))))
		{ Error = TEXT("Snapshot rejected: a processed command result changed."); return EReadState::Rejected; }
		return EReadState::Ready;
	}
	FReadResult ReadFrame(const FString& Directory, const FReadCursor& Cursor, IImageWrapperModule& Module)
	{
		// This worker owns all file bytes, JSON and PNG state. It never touches an actor,
		// texture or command queue, and only one worker can be outstanding per viewer.
		FReadResult Result;
		TArray<uint8> Bytes;
		if (!ReadBounded(FPaths::Combine(Directory, TEXT("latest.json")), 1024 * 1024, Bytes))
		{ Result.Error = TEXT("Waiting for a readable snapshot."); return Result; }
		Result.ManifestHash = MousecatWorldManifest::HashSha256(Bytes).ToString();
		if (Result.ManifestHash == Cursor.ManifestHash)
		{ Result.State = EReadState::Unchanged; return Result; }
		FString Text;
		FFileHelper::BufferToString(Text, Bytes.GetData(), Bytes.Num());
		if (!Parse(Text, Result.Snapshot))
		{ Result.Error = TEXT("Snapshot rejected: invalid native-view data."); return Result; }
		Result.State = ValidateNext(Result.Snapshot, Cursor, Result.Error);
		if (Result.State != EReadState::Ready) return Result;
		if (Cursor.Image.Matches(Result.Snapshot)) return Result;
		Result.State = EReadState::Rejected;
		if (!ReadBounded(FPaths::Combine(Directory, Result.Snapshot.File), 16 * 1024 * 1024, Bytes)
			|| !MousecatWorldManifest::HashSha256(Bytes).ToString().Equals(Result.Snapshot.Hash, ESearchCase::IgnoreCase))
		{ Result.Error = TEXT("Waiting for matching image bytes."); return Result; }
		TSharedPtr<IImageWrapper> Decoder = Module.CreateImageWrapper(EImageFormat::PNG);
		if (!Decoder || !Decoder->SetCompressed(Bytes.GetData(), Bytes.Num())
			|| Decoder->GetWidth() != Result.Snapshot.Width || Decoder->GetHeight() != Result.Snapshot.Height)
		{ Result.Error = TEXT("Image rejected: PNG dimensions differ from the snapshot."); return Result; }
		if (!Decoder->GetRaw(ERGBFormat::BGRA, 8, Result.Pixels)
			|| Result.Pixels.Num() != Result.Snapshot.Width * Result.Snapshot.Height * 4)
		{ Result.Pixels.Empty(); Result.Error = TEXT("Image rejected: PNG decoding failed."); return Result; }
		Result.State = EReadState::Ready;
		return Result;
	}
	FString InspectorSelection(const FString& Selected, const FString& PreviousMode, const FString& PreviousPerson, const FSnapshot& Snapshot)
	{
		const FString Person = Snapshot.CameraPeople.IsEmpty() ? FString() : Snapshot.CameraPeople[0];
		// Follow each automatic camera cut. Between cuts Tab remains usable before F.
		return Snapshot.CameraMode == TEXT("automatic") && !Person.IsEmpty()
			&& (PreviousMode != TEXT("automatic") || PreviousPerson != Person) ? Person : Selected;
	}
	void ApplyOutcome(const FSnapshot& Snapshot, FString& Rejection)
	{
		if (Snapshot.ResultSequence == 0) return;
		if (Snapshot.ResultStatus == TEXT("applied")) Rejection.Empty();
		else Rejection = FString::Printf(TEXT("Command %lld rejected: %s"), Snapshot.ResultSequence, *Snapshot.ResultMessage);
	}
	enum class EPublication { Published, Collision, Failed };
	EPublication PublishCommand(const FString& Directory, const FString& Json, int64& NextSequence)
	{
		const FString Final = FPaths::Combine(Directory, FString::Printf(TEXT("%016lld.json"), NextSequence));
		const FString Temp = FPaths::Combine(Directory, FGuid::NewGuid().ToString(EGuidFormats::Digits) + TEXT(".tmp"));
		if (!FFileHelper::SaveStringToFile(Json, *Temp, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM, &IFileManager::Get(), FILEWRITE_NoReplaceExisting))
		{
			IFileManager::Get().Delete(*Temp, false, true, true);
			return EPublication::Failed;
		}
#if PLATFORM_WINDOWS
		const bool bPublished = ::MoveFileW(*NativePath(Temp), *NativePath(Final)) != 0;
#else
		const bool bPublished = IFileManager::Get().Move(*Final, *Temp, false, false, false, true);
#endif
		if (bPublished) { ++NextSequence; return EPublication::Published; }
		IFileManager::Get().Delete(*Temp, false, true, true);
		if (IFileManager::Get().FileExists(*Final)) { ++NextSequence; return EPublication::Collision; }
		return EPublication::Failed;
	}
	int64 UnixMs() { return (FDateTime::UtcNow() - FDateTime(1970, 1, 1)).GetTicks() / ETimespan::TicksPerMillisecond; }
}

struct FMousecatNativeReader
{
	TFuture<MousecatNative::FReadResult> Pending;
	MousecatNative::FImageKey Image;
	FRenderCommandFence UploadFence;
	IImageWrapperModule* Module = nullptr;
	~FMousecatNativeReader()
	{
		// Actor shutdown may wait for its one bounded read; ordinary ticks never do.
		if (Pending.IsValid()) Pending.Wait();
		UploadFence.Wait();
	}
};

void FMousecatNativeReaderDeleter::operator()(FMousecatNativeReader* Reader) const { delete Reader; }

AMousecatNativeView::AMousecatNativeView()
{
	PrimaryActorTick.bCanEverTick = true;
	// PlayerInput publishes key events during the controller's tick.
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
}

AMousecatNativeView::~AMousecatNativeView() = default;

void AMousecatNativeView::BeginPlay()
{
	Super::BeginPlay();
	if (!FParse::Value(FCommandLine::Get(), TEXT("MousecatNativeView="), Directory) || Directory.IsEmpty() || FPaths::IsRelative(Directory))
	{
		Directory.Empty(); ReadError = TEXT("An absolute native-view directory is required."); return;
	}
	Directory = FPaths::ConvertRelativePathToFull(Directory);
	FPaths::NormalizeDirectoryName(Directory);
	// The external producer owns simulation time. Limit only this image viewer's
	// render loop, preserving an operator's existing lower cap.
	if (GEngine)
	{
		PreviousMaxFPS = GEngine->GetMaxFPS();
		if (PreviousMaxFPS <= 0 || PreviousMaxFPS > 60)
		{ GEngine->SetMaxFPS(60); bChangedMaxFPS = true; }
	}
	RateStarted = FPlatformTime::Seconds();
	Poll();
}

void AMousecatNativeView::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	bStopped = true;
	Reader.Reset();
	if (bChangedMaxFPS && GEngine && GEngine->GetMaxFPS() == 60) GEngine->SetMaxFPS(PreviousMaxFPS);
	Super::EndPlay(EndPlayReason);
}

void AMousecatNativeView::Poll()
{
	using namespace MousecatNative;
	if (Directory.IsEmpty() || bSessionChanged || bStopped) return;
	if (!Reader)
	{
		Reader.Reset(new FMousecatNativeReader());
		// Module loading stays on the game thread; each worker creates its own decoder.
		Reader->Module = &FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
	}
	auto Cursor = [&]()
	{
		FReadCursor Value;
		Value.Session = SessionId; Value.ManifestHash = ManifestHash;
		Value.Sequence = FrameSequence; Value.CapturedAt = CapturedAt; Value.Acknowledged = LastAcknowledged;
		Value.ResultSequence = LastResultSequence; Value.ResultStatus = LastResultStatus; Value.ResultMessage = LastResultMessage;
		if (Image) Value.Image = Reader->Image;
		return Value;
	};
	if (Reader->Pending.IsValid())
	{
		if (!Reader->Pending.IsReady() || !Reader->UploadFence.IsFenceComplete()) return;
		FReadResult Result = Reader->Pending.Consume();
		if (Result.State == EReadState::Ready)
		{
			// Recheck on completion so no asynchronous result can roll back the
			// displayed image, a session, or an acknowledged command.
			Result.State = ValidateNext(Result.Snapshot, Cursor(), Result.Error);
			if (Result.State == EReadState::Ready && Result.Pixels.IsEmpty() && (!Image || !Reader->Image.Matches(Result.Snapshot)))
			{ Result.State = EReadState::Rejected; Result.Error = TEXT("Waiting for matching image bytes."); }
		}
		if (Result.State == EReadState::SessionChanged) bSessionChanged = true;
		if (Result.State == EReadState::Ready)
		{
			const FSnapshot& Snapshot = Result.Snapshot;
			if (!Result.Pixels.IsEmpty())
			{
				if (!Image)
				{
					// One fixed allocation prevents changing producer dimensions from accumulating textures.
					Image = UTexture2D::CreateTransient(MaxWidth, MaxHeight, PF_B8G8R8A8);
					if (!Image) { ReadError = TEXT("Image texture could not be allocated."); return; }
					Image->NeverStream = true; Image->SRGB = true; Image->Filter = TF_Bilinear;
					Image->UpdateResource();
				}
				uint8* Upload = static_cast<uint8*>(FMemory::Malloc(Result.Pixels.Num()));
				FMemory::Memcpy(Upload, Result.Pixels.GetData(), Result.Pixels.Num());
				auto* Region = new FUpdateTextureRegion2D(0, 0, 0, 0, Snapshot.Width, Snapshot.Height);
				Image->UpdateTextureRegions(0, 1, Region, Snapshot.Width * 4, 4, Upload,
					[](uint8* Data, const FUpdateTextureRegion2D* Regions) { FMemory::Free(Data); delete Regions; });
				// A slow render thread may retain this upload, never a queue of uploads.
				Reader->UploadFence.BeginFence();
				Reader->Image = {Snapshot.Session, Snapshot.File, Snapshot.Hash, Snapshot.Width, Snapshot.Height};
				++AcceptedImages;
			}
			const FString Selected = InspectorSelection(People.IsValidIndex(PersonIndex) ? People[PersonIndex].Id : FString(), CameraMode, CameraPerson, Snapshot);
			People.Empty(); PersonIndex = 0;
			for (const auto& Person : Snapshot.People)
			{
				FPerson Entry{Person->GetStringField(TEXT("id")), Person->GetStringField(TEXT("label")), Person->GetStringField(TEXT("summary"))};
				if (Entry.Id == Selected) PersonIndex = People.Num();
				People.Add(MoveTemp(Entry));
			}
			SessionId = Snapshot.Session; State = Snapshot.State; Title = Snapshot.Title; Summary = Snapshot.Summary;
			CameraMode = Snapshot.CameraMode; CameraSummary = Snapshot.CameraSummary;
			CameraPerson = Snapshot.CameraPeople.IsEmpty() ? FString() : Snapshot.CameraPeople[0];
			if (Snapshot.Acknowledged > LastAcknowledged && bCommandsReady) CommandError.Empty();
			if (Snapshot.ResultSequence > 0)
			{
				LastResultSequence = Snapshot.ResultSequence; LastResultStatus = Snapshot.ResultStatus; LastResultMessage = Snapshot.ResultMessage;
				ApplyOutcome(Snapshot, Rejection);
			}
			FrameSequence = Snapshot.Sequence; CapturedAt = Snapshot.CapturedAt; LastAcknowledged = Snapshot.Acknowledged;
			ImageSize = FIntPoint(Snapshot.Width, Snapshot.Height);
			ManifestHash = Result.ManifestHash; LastAccepted = FPlatformTime::Seconds(); ReadError.Empty();
			Pending.RemoveAll([&](const FPending& Request) { return Request.Sequence <= LastAcknowledged; });
			NextCommand = FMath::Max(NextCommand, LastAcknowledged + 1);
			if (!bCommandsReady) bCommandsReady = InitializeCommands();
		}
		else if (Result.State == EReadState::Unchanged) ReadError.Empty();
		else ReadError = Result.Error;
	}
	const double Now = FPlatformTime::Seconds();
	if (bSessionChanged || Now < NextPoll || !Reader->UploadFence.IsFenceComplete()) return;
	NextPoll = Now + PollInterval;
	const FString ReadDirectory = Directory;
	const FReadCursor ReadCursor = Cursor();
	IImageWrapperModule* Module = Reader->Module;
	Reader->Pending = Async(EAsyncExecution::ThreadPool, [ReadDirectory, ReadCursor, Module]()
	{
		return ReadFrame(ReadDirectory, ReadCursor, *Module);
	});
}

bool AMousecatNativeView::InitializeCommands()
{
	using namespace MousecatNative;
	const FString CommandDirectory = FPaths::Combine(Directory, TEXT("commands"));
	if (ReparsePoint(CommandDirectory) || !IFileManager::Get().MakeDirectory(*CommandDirectory, true))
	{ CommandError = TEXT("Command directory is unavailable."); return false; }
	TArray<FString> Files;
	IFileManager::Get().FindFiles(Files, *FPaths::Combine(CommandDirectory, TEXT("*.json")), true, false);
	for (const FString& File : Files)
	{
		int64 Sequence = 0;
		const FString Number = File.LeftChop(5);
		bool bDigits = Number.Len() == 16;
		for (TCHAR C : Number) bDigits &= C >= '0' && C <= '9';
		if (!bDigits || !LexTryParseString(Sequence, *Number) || Sequence < 1 || Sequence > MaxInteger)
		{ CommandError = TEXT("Command directory contains an invalid sequence filename."); return false; }
		NextCommand = FMath::Max(NextCommand, Sequence + 1);
	}
	CommandError.Empty(); return true;
}

double AMousecatNativeView::AgeSeconds() const
{
	if (FrameSequence == 0) return 0;
	return FMath::Max(FPlatformTime::Seconds() - LastAccepted,
		FMath::Max(0.0, (MousecatNative::UnixMs() - CapturedAt) / 1000.0));
}

bool AMousecatNativeView::IsConnected() const
{
	return FrameSequence > 0 && !bSessionChanged && State != TEXT("ended") && ReadError.IsEmpty() && AgeSeconds() < 10;
}

FString AMousecatNativeView::GetStatus() const
{
	if (bSessionChanged) return ReadError + TEXT(" | Unreviewed");
	if (FrameSequence == 0) return TEXT("Disconnected | Unreviewed | ") + ReadError;
	const double Age = AgeSeconds();
	FString Status = State == TEXT("ended") ? TEXT("Ended") : Age >= 10 ? TEXT("Disconnected")
		: !ReadError.IsEmpty() ? TEXT("Waiting for a valid frame") : Age >= 3 ? TEXT("Stale") : State == TEXT("paused") ? TEXT("Paused") : TEXT("Running");
	Status += FString::Printf(TEXT(" | Unreviewed | Frame %lld | %.1fs old | Images %.1f/s | Viewer %.0f FPS"), FrameSequence, Age, ImageRate, ViewerRate);
	if (!ReadError.IsEmpty()) Status += TEXT(" | ") + ReadError;
	return Status;
}

FString AMousecatNativeView::GetPersonSummary() const
{
	if (!People.IsValidIndex(PersonIndex)) return TEXT("No people reported in this frame.");
	return FString::Printf(TEXT("%d / %d\n%s\n\n%s"), PersonIndex + 1, People.Num(), *People[PersonIndex].Label, *People[PersonIndex].Summary);
}

FString AMousecatNativeView::GetCameraStatus() const
{
	if (CameraMode.IsEmpty()) return TEXT("Camera mode not reported");
	FString Status = CameraMode == TEXT("automatic") ? TEXT("Automatic camera") : TEXT("Manual camera | R: automatic");
	if (!CameraSummary.IsEmpty()) Status += TEXT(" | ") + CameraSummary;
	return Status;
}

FString AMousecatNativeView::GetInputHint() const
{
	return bControlsFocused ? TEXT("WASD / arrows / drag image: manual camera | R: automatic")
		: TEXT("Focus this window, then point at the image | WASD / arrows / drag: camera | R: automatic");
}

void AMousecatNativeView::SetImageRect(FVector2D Position, FVector2D Size)
{
	ImageRect = Size.X > 0 && Size.Y > 0 ? FBox2D(Position, Position + Size) : FBox2D(ForceInit);
}

FString AMousecatNativeView::GetCommandStatus() const
{
	FString Status = Rejection;
	if (!CommandError.IsEmpty()) Status += (Status.IsEmpty() ? TEXT("") : TEXT(" | ")) + CommandError;
	if (!Pending.IsEmpty()) Status += (Status.IsEmpty() ? TEXT("") : TEXT(" | "))
		+ FString::Printf(TEXT("Requested: %s | %d awaiting outcome"), *Pending.Last().Description, Pending.Num());
	if (!Status.IsEmpty()) return Status;
	if (LastResultSequence == LastAcknowledged && LastResultStatus == TEXT("applied"))
		return FString::Printf(TEXT("Command %lld applied: %s"), LastResultSequence, *LastResultMessage);
	return LastAcknowledged > 0 ? FString::Printf(TEXT("Command %lld processed; outcome unavailable"), LastAcknowledged) : TEXT("Controls send requests to the producer.");
}

bool AMousecatNativeView::Send(const FString& Action, int32 Value, int32 Dx, int32 Dy)
{
	using namespace MousecatNative;
	if (!IsConnected() || !bCommandsReady) { CommandError = TEXT("Requests are unavailable until the producer is connected."); return false; }
	if (Pending.Num() >= 128) { CommandError = TEXT("Waiting for earlier requests to be acknowledged."); return false; }
	if (!(Action == TEXT("pause") || Action == TEXT("resume") || Action == TEXT("speed") || Action == TEXT("pan") || Action == TEXT("focus") || Action == TEXT("auto") || Action == TEXT("stop"))) return false;
	if (Action == TEXT("speed") && (Value < 1 || Value > 3)) return false;
	if (Action == TEXT("pan") && (FMath::Abs(Dx) > 8 || FMath::Abs(Dy) > 8 || (Dx == 0 && Dy == 0))) return false;
	if (Action == TEXT("focus") && !People.IsValidIndex(PersonIndex)) return false;
	const FString CommandDirectory = FPaths::Combine(Directory, TEXT("commands"));
	if (ReparsePoint(CommandDirectory)) { CommandError = TEXT("Command directory changed; requests stopped."); return false; }
	for (int32 Retry = 0; Retry < 4; ++Retry)
	{
		if (NextCommand > MaxInteger) { CommandError = TEXT("Command sequence exhausted."); return false; }
		const int64 Sequence = NextCommand;
		auto Object = MakeShared<FJsonObject>();
		Object->SetStringField(TEXT("schema"), TEXT("mousecat.native-view-command/1"));
		Object->SetStringField(TEXT("sessionId"), SessionId);
		Object->SetNumberField(TEXT("sequence"), Sequence);
		Object->SetStringField(TEXT("action"), Action);
		if (Action == TEXT("speed")) Object->SetNumberField(TEXT("value"), Value);
		if (Action == TEXT("pan")) { Object->SetNumberField(TEXT("dx"), Dx); Object->SetNumberField(TEXT("dy"), Dy); }
		if (Action == TEXT("focus")) Object->SetStringField(TEXT("personId"), People[PersonIndex].Id);
		FString Json;
		FJsonSerializer::Serialize(Object, TJsonWriterFactory<>::Create(&Json));
		const EPublication Published = PublishCommand(CommandDirectory, Json, NextCommand);
		if (Published == EPublication::Collision) continue;
		if (Published == EPublication::Failed) { CommandError = TEXT("Request could not be published; its sequence is retained for retry."); return false; }
		FString Description = Action;
		if (Action == TEXT("auto")) Description = TEXT("automatic camera");
		if (Action == TEXT("pan")) Description = TEXT("manual camera pan");
		if (Action == TEXT("speed")) Description += FString::Printf(TEXT(" %d"), Value);
		if (Action == TEXT("focus")) Description = TEXT("manual camera: ") + People[PersonIndex].Label;
		Pending.Add({Sequence, Description}); CommandError.Empty();
		if (Action == TEXT("pause") || Action == TEXT("resume")) { PendingPauseSequence = Sequence; bRequestedPause = Action == TEXT("pause"); }
		return true;
	}
	CommandError = TEXT("Another viewer is writing requests; try again."); return false;
}

void AMousecatNativeView::ConfigureInput(APlayerController* Controller)
{
	// SetInputMode accumulates Slate operations: GameOnly supplies viewport focus;
	// GameAndUI releases its capture/lock and leaves that keyboard focus in place.
	Controller->bShowMouseCursor = true;
	Controller->SetInputMode(FInputModeGameOnly().SetConsumeCaptureMouseDown(false));
	Controller->SetInputMode(FInputModeGameAndUI().SetHideCursorDuringCapture(false)
		.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock));
}

void AMousecatNativeView::ProcessControls(APlayerController* Controller, bool bFocused, bool bHasMouse, FVector2D Mouse, double Now)
{
	bControlsFocused = bFocused;
	if (!bFocused)
	{
		bDragging = false; DragDistance = FVector2D::ZeroVector; return;
	}
	if (Controller->WasInputKeyJustPressed(EKeys::Tab) && !People.IsEmpty())
	{
		const bool bBack = Controller->IsInputKeyDown(EKeys::LeftShift) || Controller->IsInputKeyDown(EKeys::RightShift);
		PersonIndex = (PersonIndex + (bBack ? People.Num() - 1 : 1)) % People.Num();
	}
	if (Controller->WasInputKeyJustPressed(EKeys::SpaceBar))
	{
		const bool bPaused = PendingPauseSequence > LastAcknowledged ? bRequestedPause : State == TEXT("paused");
		Send(bPaused ? TEXT("resume") : TEXT("pause"));
	}
	if (Controller->WasInputKeyJustPressed(EKeys::One)) Send(TEXT("speed"), 1);
	if (Controller->WasInputKeyJustPressed(EKeys::Two)) Send(TEXT("speed"), 2);
	if (Controller->WasInputKeyJustPressed(EKeys::Three)) Send(TEXT("speed"), 3);
	if (Controller->WasInputKeyJustPressed(EKeys::F)) Send(TEXT("focus"));
	if (Controller->WasInputKeyJustPressed(EKeys::R)) Send(TEXT("auto"));
	if (Controller->WasInputKeyJustPressed(EKeys::Escape)) Send(TEXT("stop"));

	const bool bInImage = bHasMouse && ImageRect.bIsValid && ImageRect.IsInside(Mouse);
	if (Controller->WasInputKeyJustPressed(EKeys::LeftMouseButton))
	{
		bDragging = bInImage; LastDragPosition = Mouse; DragDistance = FVector2D::ZeroVector;
	}
	if (bDragging)
	{
		if (bInImage)
		{
			// Grab-style drag. One request is bounded even after a fast cursor sweep.
			DragDistance += LastDragPosition - Mouse;
			DragDistance.X = FMath::Clamp(DragDistance.X, -192.0, 192.0);
			DragDistance.Y = FMath::Clamp(DragDistance.Y, -192.0, 192.0);
			LastDragPosition = Mouse;
			if (!Controller->IsInputKeyDown(EKeys::LeftMouseButton)) bDragging = false;
		}
		else { bDragging = false; DragDistance = FVector2D::ZeroVector; }
	}
	if (Now >= NextPan)
	{
		const bool bRight = Controller->IsInputKeyDown(EKeys::Right) || Controller->IsInputKeyDown(EKeys::D);
		const bool bLeft = Controller->IsInputKeyDown(EKeys::Left) || Controller->IsInputKeyDown(EKeys::A);
		const bool bDown = Controller->IsInputKeyDown(EKeys::Down) || Controller->IsInputKeyDown(EKeys::S);
		const bool bUp = Controller->IsInputKeyDown(EKeys::Up) || Controller->IsInputKeyDown(EKeys::W);
		int32 Dx = 8 * (static_cast<int32>(bRight) - static_cast<int32>(bLeft));
		int32 Dy = 8 * (static_cast<int32>(bDown) - static_cast<int32>(bUp));
		if (Dx || Dy) DragDistance = FVector2D::ZeroVector;
		else
		{
			Dx = FMath::Clamp(FMath::TruncToInt(DragDistance.X / 24), -8, 8);
			Dy = FMath::Clamp(FMath::TruncToInt(DragDistance.Y / 24), -8, 8);
			DragDistance -= FVector2D(Dx, Dy) * 24;
		}
		if (Dx || Dy) { NextPan = Now + 0.2; Send(TEXT("pan"), 0, Dx, Dy); }
	}
}

void AMousecatNativeView::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const double Now = FPlatformTime::Seconds();
	++ViewerTicks;
	if (Now - RateStarted >= 1)
	{
		const double Interval = Now - RateStarted;
		ImageRate = AcceptedImages / Interval; ViewerRate = ViewerTicks / Interval;
		AcceptedImages = 0; ViewerTicks = 0; RateStarted = Now;
	}
	Poll();
	APlayerController* Controller = UGameplayStatics::GetPlayerController(this, 0);
	if (!Controller) return;
	if (InputController.Get() != Controller)
	{
		if (InputController.IsValid()) RemoveTickPrerequisiteActor(InputController.Get());
		InputController = Controller;
		AddTickPrerequisiteActor(Controller);
		// GameMode configures input after SpawnActor/BeginPlay, so initialize here.
		ConfigureInput(Controller);
	}
	UGameViewportClient* Client = GetWorld()->GetGameViewport();
	FViewport* Viewport = Client ? Client->Viewport : nullptr;
	FVector2D Mouse = FVector2D::ZeroVector;
	const bool bHasMouse = Controller->GetMousePosition(Mouse.X, Mouse.Y);
	const bool bForeground = Viewport && Viewport->IsForegroundWindow()
		&& !(Client->ViewportConsole && Client->ViewportConsole->ConsoleActive());
	if (bForeground && bHasMouse && ImageRect.bIsValid && ImageRect.IsInside(Mouse) && !Viewport->HasFocus())
		ConfigureInput(Controller);
	ProcessControls(Controller, bForeground && Viewport->HasFocus(), bHasMouse, Mouse, Now);
}

#if WITH_DEV_AUTOMATION_TESTS
#include "GameFramework/PlayerInput.h"
#include "InputKeyEventArgs.h"
#include "Misc/AutomationTest.h"
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMousecatNativeViewProtocolTest, "Mousecat.NativeView.Protocol", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::CommandletContext | EAutomationTestFlags::EngineFilter)
bool FMousecatNativeViewProtocolTest::RunTest(const FString& Parameters)
{
	using namespace MousecatNative;
	const FString Valid = TEXT("{\"schema\":\"mousecat.native-view/1\",\"sessionId\":\"f1d4f27d-05fe-407e-9d0c-ac97156b51bc\",\"sequence\":1,\"capturedAtUnixMs\":1,\"image\":{\"file\":\"frame-1.png\",\"sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"width\":960,\"height\":540},\"state\":\"running\",\"title\":\"Example\",\"summary\":\"\",\"people\":[],\"lastCommandSequence\":0}");
	FSnapshot Frame;
	TestTrue(TEXT("Valid producer snapshot"), Parse(Valid, Frame));
	for (const auto& Pair : TArray<TPair<FString,FString>>{
		{TEXT("\"sequence\":1"),TEXT("\"sequence\":1,\"sequence\":2")},
		{TEXT("\"sequence\":1"),TEXT("\"sequence\":1.5")},
		{TEXT("\"sequence\":1"),TEXT("\"sequence\":\"1\"")},
		{TEXT("\"sequence\":1"),TEXT("\"sequence\":1e999")},
		{TEXT("frame-1.png"),TEXT("../frame-1.png")},
		{TEXT("frame-1.png"),TEXT("C:frame.png")},
		{TEXT("frame-1.png"),TEXT("CON.png")},
		{TEXT("\"width\":960"),TEXT("\"width\":4097")},
		{TEXT("\"height\":540"),TEXT("\"height\":2161")},
		{TEXT("\"state\":\"running\""),TEXT("\"state\":\"approved\"")},
		{TEXT("\"lastCommandSequence\":0"),TEXT("\"lastCommandSequence\":-1")}})
	{
		FSnapshot Bad;
		TestFalse(*Pair.Value, Parse(Valid.Replace(*Pair.Key, *Pair.Value), Bad));
	}
	const FString WithResult = Valid.Replace(TEXT("\"lastCommandSequence\":0"),
		TEXT("\"lastCommandSequence\":1,\"commandResult\":{\"sequence\":1,\"status\":\"rejected\",\"message\":\"Camera target is unavailable.\"}"));
	FSnapshot Rejected;
	TestTrue(TEXT("Explicit rejection accepted"), Parse(WithResult, Rejected));
	for (const auto& Pair : TArray<TPair<FString,FString>>{
		{TEXT("\"status\":\"rejected\""), TEXT("\"status\":\"pending\"")},
		{TEXT("\"lastCommandSequence\":1"), TEXT("\"lastCommandSequence\":0")},
		{TEXT("\"lastCommandSequence\":1"), TEXT("\"lastCommandSequence\":2")},
		{TEXT("\"message\":\"Camera target is unavailable.\""), TEXT("\"message\":42")},
		{TEXT("\"message\":\"Camera target is unavailable.\""), TEXT("\"message\":\"") + FString::ChrN(513, 'x') + TEXT("\"")},
		{TEXT("\"status\":\"rejected\""), TEXT("\"extra\":true,\"status\":\"rejected\"")}})
	{
		FSnapshot Bad;
		TestFalse(TEXT("Malformed command result rejected"), Parse(WithResult.Replace(*Pair.Key, *Pair.Value), Bad));
	}
	FString Rejection;
	ApplyOutcome(Rejected, Rejection);
	TestTrue(TEXT("Rejection is displayed"), Rejection.Contains(TEXT("Camera target is unavailable.")));
	FSnapshot CursorOnly;
	TestTrue(TEXT("Processed cursor without outcome accepted"), Parse(Valid.Replace(TEXT("\"lastCommandSequence\":0"), TEXT("\"lastCommandSequence\":2"))
		.Replace(TEXT("\"sequence\":1"), TEXT("\"sequence\":2")), CursorOnly));
	ApplyOutcome(CursorOnly, Rejection);
	TestFalse(TEXT("A cursor without an outcome cannot clear rejection"), Rejection.IsEmpty());
	FSnapshot Applied;
	TestTrue(TEXT("Explicit application accepted"), Parse(WithResult.Replace(TEXT("\"rejected\""), TEXT("\"applied\""))
		.Replace(TEXT("\"lastCommandSequence\":1"), TEXT("\"lastCommandSequence\":3"))
		.Replace(TEXT("\"sequence\":1"), TEXT("\"sequence\":3")), Applied));
	ApplyOutcome(Applied, Rejection);
	TestTrue(TEXT("Explicit application clears rejection"), Rejection.IsEmpty());
	const FString PeopleJson = TEXT("\"people\":[{\"id\":\"p1\",\"label\":\"One\",\"summary\":\"\"},{\"id\":\"p2\",\"label\":\"Two\",\"summary\":\"\"},{\"id\":\"p3\",\"label\":\"Three\",\"summary\":\"\"},{\"id\":\"p4\",\"label\":\"Four\",\"summary\":\"\"},{\"id\":\"p5\",\"label\":\"Five\",\"summary\":\"\"},{\"id\":\"p6\",\"label\":\"Six\",\"summary\":\"\"}]");
	const FString WithCamera = WithResult.Replace(TEXT("\"people\":[]"), *PeopleJson).Replace(TEXT("\"lastCommandSequence\":1"),
		TEXT("\"lastCommandSequence\":1,\"camera\":{\"mode\":\"automatic\",\"personIds\":[\"p1\",\"p2\"],\"summary\":\"Two people moving together.\"}"));
	FSnapshot Camera;
	TestTrue(TEXT("Camera and command result coexist"), Parse(WithCamera, Camera));
	TestEqual(TEXT("Automatic camera chooses inspector on first cut"), InspectorSelection(TEXT("p3"), TEXT(""), TEXT(""), Camera), FString(TEXT("p1")));
	TestEqual(TEXT("Tab selection survives unchanged camera target"), InspectorSelection(TEXT("p3"), TEXT("automatic"), TEXT("p1"), Camera), FString(TEXT("p3")));
	TestEqual(TEXT("New automatic target updates inspector"), InspectorSelection(TEXT("p3"), TEXT("automatic"), TEXT("p2"), Camera), FString(TEXT("p1")));
	TestTrue(TEXT("Manual camera accepted"), Parse(WithCamera.Replace(TEXT("\"mode\":\"automatic\""), TEXT("\"mode\":\"manual\"")), Camera));
	TestEqual(TEXT("Manual camera preserves inspector selection"), InspectorSelection(TEXT("p3"), TEXT("automatic"), TEXT("p2"), Camera), FString(TEXT("p3")));
	TestTrue(TEXT("Camera may have no people"), Parse(WithCamera.Replace(TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":[]")), Camera));
	TestTrue(TEXT("Camera accepts five unique reported people"), Parse(WithCamera.Replace(TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":[\"p1\",\"p2\",\"p3\",\"p4\",\"p5\"]")), Camera));
	for (const auto& Pair : TArray<TPair<FString,FString>>{
		{TEXT("\"mode\":\"automatic\""), TEXT("\"mode\":\"other\"")},
		{TEXT("\"mode\":\"automatic\""), TEXT("\"mode\":1")},
		{TEXT("\"mode\":\"automatic\""), TEXT("\"extra\":true,\"mode\":\"automatic\"")},
		{TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":[\"p1\",\"p1\"]")},
		{TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":[\"missing\"]")},
		{TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":[1]")},
		{TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":[\"p1\",\"p2\",\"p3\",\"p4\",\"p5\",\"p6\"]")},
		{TEXT("\"personIds\":[\"p1\",\"p2\"]"), TEXT("\"personIds\":null")},
		{TEXT("\"summary\":\"Two people moving together.\""), TEXT("\"summary\":false")},
		{TEXT("Two people moving together."), FString::ChrN(513, 'x')}})
	{
		FSnapshot Bad;
		TestFalse(TEXT("Malformed camera rejected"), Parse(WithCamera.Replace(*Pair.Key, *Pair.Value), Bad));
	}
	return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMousecatNativeReaderTest, "Mousecat.NativeView.Reader", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::CommandletContext | EAutomationTestFlags::EngineFilter)
bool FMousecatNativeReaderTest::RunTest(const FString& Parameters)
{
	using namespace MousecatNative;
	const FString Root = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Automation/NativeView"), FGuid::NewGuid().ToString(EGuidFormats::Digits));
	IFileManager& Files = IFileManager::Get();
	if (!TestTrue(TEXT("Create isolated reader directory"), Files.MakeDirectory(*Root, true))) return false;
	IImageWrapperModule& Module = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
	TSharedPtr<IImageWrapper> Encoder = Module.CreateImageWrapper(EImageFormat::PNG);
	const TArray<uint8> Raw{17, 33, 65, 255, 129, 7, 99, 255};
	if (!TestTrue(TEXT("Encode actual test pixels"), Encoder->SetRaw(Raw.GetData(), Raw.Num(), 2, 1, ERGBFormat::BGRA, 8))) return false;
	const TArray64<uint8>& Compressed = Encoder->GetCompressed();
	TArray<uint8> Png; Png.Append(Compressed.GetData(), Compressed.Num());
	const FString Hash = MousecatWorldManifest::HashSha256(Png).ToString().ToLower();
	const FString ImagePath = FPaths::Combine(Root, TEXT("frame-1.png"));
	const FString ManifestPath = FPaths::Combine(Root, TEXT("latest.json"));
	TestTrue(TEXT("Write immutable producer image"), FFileHelper::SaveArrayToFile(Png, *ImagePath));
	const FString First = FString::Printf(TEXT("{\"schema\":\"mousecat.native-view/1\",\"sessionId\":\"f1d4f27d-05fe-407e-9d0c-ac97156b51bc\",\"sequence\":1,\"capturedAtUnixMs\":100,\"image\":{\"file\":\"frame-1.png\",\"sha256\":\"%s\",\"width\":2,\"height\":1},\"state\":\"running\",\"title\":\"Example\",\"summary\":\"First image\",\"people\":[],\"lastCommandSequence\":0}"), *Hash);
	TestTrue(TEXT("Write producer manifest"), FFileHelper::SaveStringToFile(First, *ManifestPath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM));
	FReadCursor Cursor;
	const auto Read = [&]()
	{
		return Async(EAsyncExecution::ThreadPool, [&, Cursor]()
		{
			check(!IsInGameThread());
			return ReadFrame(Root, Cursor, Module);
		}).Consume();
	};
	FReadResult Decoded = Read();
	TestTrue(TEXT("Worker accepts validated PNG and manifest together"), Decoded.State == EReadState::Ready);
	TestEqual(TEXT("Decoded byte count"), Decoded.Pixels.Num(), int64(Raw.Num()));
	TestTrue(TEXT("Worker retains the actual BGRA pixels"), Decoded.Pixels.Num() == Raw.Num() && FMemory::Memcmp(Decoded.Pixels.GetData(), Raw.GetData(), Raw.Num()) == 0);
	Cursor.Session = Decoded.Snapshot.Session; Cursor.ManifestHash = Decoded.ManifestHash;
	Cursor.Sequence = 1; Cursor.CapturedAt = 100;
	Cursor.Image = {Cursor.Session, TEXT("frame-1.png"), Hash, 2, 1};
	TestTrue(TEXT("Identical manifest skips repeated image work"), Read().State == EReadState::Unchanged);
	const FString Second = First.Replace(TEXT("\"sequence\":1"), TEXT("\"sequence\":2"))
		.Replace(TEXT("\"lastCommandSequence\":0"), TEXT("\"lastCommandSequence\":1,\"commandResult\":{\"sequence\":1,\"status\":\"applied\",\"message\":\"Paused\"}"));
	auto Write = [&](const FString& Json) { TestTrue(TEXT("Replace producer manifest"), FFileHelper::SaveStringToFile(Json, *ManifestPath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM)); };
	Files.Delete(*ImagePath);
	Write(Second);
	FReadResult Cached = Read();
	TestTrue(TEXT("Metadata update reuses validated image even after producer retention removes its file"), Cached.State == EReadState::Ready && Cached.Pixels.IsEmpty());
	TestEqual(TEXT("Cached image carries current command acknowledgement"), Cached.Snapshot.Acknowledged, int64(1));
	TestEqual(TEXT("Cached image carries exact current command outcome"), Cached.Snapshot.ResultMessage, FString(TEXT("Paused")));
	Write(Second.Replace(TEXT("frame-1.png"), TEXT("frame-2.png")));
	TestTrue(TEXT("Different filename cannot borrow cached pixels"), Read().State == EReadState::Rejected);
	Write(Second.Replace(*Hash, *FString::ChrN(64, 'a')));
	TestTrue(TEXT("Different hash cannot borrow cached pixels"), Read().State == EReadState::Rejected);
	Write(Second.Replace(TEXT("f1d4f27d-05fe-407e-9d0c-ac97156b51bc"), TEXT("f1d4f27d-05fe-407e-9d0c-ac97156b51bd")));
	TestTrue(TEXT("New session is rejected before image cache reuse"), Read().State == EReadState::SessionChanged);
	FFileHelper::SaveArrayToFile(Png, *ImagePath);
	Write(Second.Replace(TEXT("\"width\":2"), TEXT("\"width\":3")));
	TestTrue(TEXT("Changed dimensions force actual PNG dimension validation"), Read().State == EReadState::Rejected);
	Write(Second.Replace(TEXT("\"capturedAtUnixMs\":100"), TEXT("\"capturedAtUnixMs\":99")));
	TestTrue(TEXT("Image reuse cannot roll back capture time"), Read().State == EReadState::Rejected);
	Cursor.Acknowledged = 2;
	Write(Second);
	TestTrue(TEXT("Image reuse cannot roll back command cursor"), Read().State == EReadState::Rejected);
	Cursor.Acknowledged = 0; Cursor.ResultSequence = 1; Cursor.ResultStatus = TEXT("rejected"); Cursor.ResultMessage = TEXT("Unavailable");
	TestTrue(TEXT("Image reuse cannot rewrite a processed outcome"), Read().State == EReadState::Rejected);
	Cursor.ResultSequence = 0;
	TArray<uint8> Broken{1, 2, 3, 4};
	FFileHelper::SaveArrayToFile(Broken, *ImagePath);
	Write(Second.Replace(*Hash, *MousecatWorldManifest::HashSha256(Broken).ToString().ToLower()));
	TestTrue(TEXT("Matching hash alone cannot admit corrupt PNG"), Read().State == EReadState::Rejected);

	UWorld::InitializationValues Values;
	Values.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
	UWorld* World = UWorld::CreateWorld(EWorldType::Game, false, NAME_None, nullptr, true, ERHIFeatureLevel::Num, &Values);
	if (TestNotNull(TEXT("Reader completion test world"), World))
	{
		AMousecatNativeView* View = World->SpawnActor<AMousecatNativeView>();
		View->Directory = Root; View->SessionId = Cursor.Session; View->FrameSequence = 3;
		View->Summary = TEXT("Displayed frame"); View->LastAcknowledged = 2;
		View->NextPoll = TNumericLimits<double>::Max();
		View->Reader.Reset(new FMousecatNativeReader());
		TPromise<FReadResult> Promise;
		View->Reader->Pending = Promise.GetFuture();
		View->Poll();
		TestTrue(TEXT("An outstanding worker remains the single pending operation"), View->Reader->Pending.IsValid() && !View->Reader->Pending.IsReady());
		TestEqual(TEXT("A pending worker leaves displayed metadata intact"), View->Summary, FString(TEXT("Displayed frame")));
		Promise.SetValue(MoveTemp(Decoded));
		View->Poll();
		TestEqual(TEXT("A late completion cannot roll back frame sequence"), View->FrameSequence, int64(3));
		TestEqual(TEXT("A late completion cannot roll back acknowledgement"), View->LastAcknowledged, int64(2));
		TestEqual(TEXT("A late completion cannot replace displayed metadata"), View->Summary, FString(TEXT("Displayed frame")));
		TestNull(TEXT("A rejected asynchronous completion never allocates an image"), View->GetImage());
		World->DestroyWorld(false);
	}
	Files.Delete(*ManifestPath); Files.Delete(*ImagePath); Files.DeleteDirectory(*Root);
	return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMousecatNativeCommandPublishTest, "Mousecat.NativeView.CommandPublish", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::CommandletContext | EAutomationTestFlags::EngineFilter)
bool FMousecatNativeCommandPublishTest::RunTest(const FString& Parameters)
{
	using namespace MousecatNative;
	const FString Root = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Automation/NativeView"), FGuid::NewGuid().ToString(EGuidFormats::Digits));
	IFileManager& Files = IFileManager::Get();
	if (!TestTrue(TEXT("Create isolated transport directory"), Files.MakeDirectory(*Root, true))) return false;
	const FString Directory = FPaths::Combine(Root, TEXT("commands"));
	int64 Next = 1;
	const FString First = TEXT("{\"sequence\":1}");
	// An existing file used as the parent prevents opening the temporary file.
	TestTrue(TEXT("Create write-failure control"), FFileHelper::SaveStringToFile(TEXT("blocked"), *Directory));
	TestTrue(TEXT("Write failure is reported"), PublishCommand(Directory, First, Next) == EPublication::Failed);
	TestEqual(TEXT("Write failure retains sequence"), Next, int64(1));
	Files.Delete(*Directory);
	Files.MakeDirectory(*Directory);
	const FString One = FPaths::Combine(Directory, TEXT("0000000000000001.json"));
	// A directory at the target prevents rename without constituting a file collision.
	Files.MakeDirectory(*One);
	TestTrue(TEXT("Noncollision publish failure is reported"), PublishCommand(Directory, First, Next) == EPublication::Failed);
	TestEqual(TEXT("Publish failure retains sequence"), Next, int64(1));
	Files.DeleteDirectory(*One);
	TestTrue(TEXT("Recovered publisher uses original sequence"), PublishCommand(Directory, First, Next) == EPublication::Published);
	TestEqual(TEXT("Successful publication advances sequence"), Next, int64(2));
	Next = 1;
	TestTrue(TEXT("Existing file collision is reported"), PublishCommand(Directory, TEXT("{\"changed\":true}"), Next) == EPublication::Collision);
	TestEqual(TEXT("Existing collision advances sequence"), Next, int64(2));
	FString Preserved;
	FFileHelper::LoadFileToString(Preserved, *One);
	TestEqual(TEXT("Collision preserves prior command bytes"), Preserved, First);
	TestTrue(TEXT("Next command publishes without a gap"), PublishCommand(Directory, TEXT("{\"sequence\":2}"), Next) == EPublication::Published);
	TestTrue(TEXT("First command remains present"), Files.FileExists(*One));
	const FString Two = FPaths::Combine(Directory, TEXT("0000000000000002.json"));
	TestTrue(TEXT("Second command is present"), Files.FileExists(*Two));
	Files.Delete(*One); Files.Delete(*Two);
	Files.DeleteDirectory(*Directory); Files.DeleteDirectory(*Root);
	return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMousecatNativeInputTest, "Mousecat.NativeView.Input", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::CommandletContext | EAutomationTestFlags::EngineFilter)
bool FMousecatNativeInputTest::RunTest(const FString& Parameters)
{
	using namespace MousecatNative;
	const FString Root = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Automation/NativeView"), FGuid::NewGuid().ToString(EGuidFormats::Digits));
	IFileManager& Files = IFileManager::Get();
	const FString Commands = FPaths::Combine(Root, TEXT("commands"));
	if (!TestTrue(TEXT("Create isolated input transport"), Files.MakeDirectory(*Commands, true))) return false;
	UWorld::InitializationValues Values;
	Values.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
	UWorld* World = UWorld::CreateWorld(EWorldType::Game, false, NAME_None, nullptr, true, ERHIFeatureLevel::Num, &Values);
	if (!TestNotNull(TEXT("Input test world"), World)) return false;
	APlayerController* Controller = World->SpawnActor<APlayerController>();
	Controller->PlayerInput = NewObject<UPlayerInput>(Controller);
	AMousecatNativeView* View = World->SpawnActor<AMousecatNativeView>();
	View->Directory = Root; View->SessionId = TEXT("f1d4f27d-05fe-407e-9d0c-ac97156b51bc");
	View->State = TEXT("running"); View->FrameSequence = 1; View->bCommandsReady = true;
	View->CapturedAt = UnixMs(); View->LastAccepted = FPlatformTime::Seconds();
	View->People.Add({TEXT("p1"), TEXT("One"), TEXT("")}); View->People.Add({TEXT("p2"), TEXT("Two"), TEXT("")});
	View->SetImageRect(FVector2D(100, 100), FVector2D(600, 400));
	TestEqual(TEXT("Native input runs after controller input"), View->PrimaryActorTick.TickGroup, TG_PostUpdateWork);
	double Now = FPlatformTime::Seconds();
	auto Step = [&](TArray<TPair<FKey, EInputEvent>> Events, bool bFocused = true, FVector2D Mouse = FVector2D(300, 300))
	{
		for (const auto& Event : Events) Controller->PlayerInput->InputKey(FInputKeyEventArgs::CreateSimulated(Event.Key, Event.Value, Event.Value == IE_Released ? 0.0f : 1.0f));
		Controller->PlayerInput->ProcessInputStack({}, 0.016f, false);
		Now += 0.21;
		View->ProcessControls(Controller, bFocused, true, Mouse, Now);
	};
	auto LastCommand = [&]() -> TSharedPtr<FJsonObject>
	{
		FString Json;
		FFileHelper::LoadFileToString(Json, *FPaths::Combine(Commands, FString::Printf(TEXT("%016lld.json"), View->NextCommand - 1)));
		TSharedPtr<FJsonObject> Command;
		if (!TestTrue(TEXT("Input publishes valid JSON"), StrictJson(Json, Command))) return MakeShared<FJsonObject>();
		return Command;
	};
	Step({{EKeys::W, IE_Pressed}});
	TestEqual(TEXT("W requests upward camera pan"), LastCommand()->GetIntegerField(TEXT("dy")), -8);
	Step({{EKeys::W, IE_Released}});
	Step({{EKeys::Up, IE_Pressed}, {EKeys::W, IE_Pressed}});
	TestEqual(TEXT("Arrow and WASD overlap stays bounded"), LastCommand()->GetIntegerField(TEXT("dy")), -8);
	Step({{EKeys::Up, IE_Released}, {EKeys::W, IE_Released}});
	int64 Before = View->NextCommand;
	Step({{EKeys::A, IE_Pressed}, {EKeys::D, IE_Pressed}});
	TestEqual(TEXT("Opposing pan keys cancel"), View->NextCommand, Before);
	Step({{EKeys::A, IE_Released}, {EKeys::D, IE_Released}});
	Step({{EKeys::R, IE_Pressed}});
	TestEqual(TEXT("R resumes automatic camera"), LastCommand()->GetStringField(TEXT("action")), FString(TEXT("auto")));
	TestEqual(TEXT("Automatic request has no action-specific fields"), LastCommand()->Values.Num(), 4);
	Step({{EKeys::R, IE_Released}});
	Before = View->NextCommand;
	Step({{EKeys::W, IE_Pressed}}, false);
	TestEqual(TEXT("Unfocused viewer cannot send requests"), View->NextCommand, Before);
	Step({{EKeys::W, IE_Released}});
	Step({{EKeys::LeftMouseButton, IE_Pressed}}, true, FVector2D(50, 300));
	Step({}, true, FVector2D(200, 300));
	TestEqual(TEXT("Drag must begin inside actual image"), View->NextCommand, Before);
	Step({{EKeys::LeftMouseButton, IE_Released}});
	Step({{EKeys::LeftMouseButton, IE_Pressed}});
	Step({}, true, FVector2D(204, 252));
	TestEqual(TEXT("Image drag pans horizontally"), LastCommand()->GetIntegerField(TEXT("dx")), 4);
	TestEqual(TEXT("Image drag pans vertically"), LastCommand()->GetIntegerField(TEXT("dy")), 2);
	Step({}, true, FVector2D(650, 450));
	TestEqual(TEXT("Fast drag stays bounded"), LastCommand()->GetIntegerField(TEXT("dx")), -8);
	Before = View->NextCommand;
	Step({}, false, FVector2D(600, 400));
	Step({}, true, FVector2D(400, 300));
	TestEqual(TEXT("Lost focus cancels drag until another press"), View->NextCommand, Before);
	Step({{EKeys::LeftMouseButton, IE_Released}});
	Step({{EKeys::Tab, IE_Pressed}});
	TestEqual(TEXT("Tab selects the next person"), View->PersonIndex, 1);
	Step({{EKeys::Tab, IE_Released}, {EKeys::F, IE_Pressed}});
	TestEqual(TEXT("F requests the selected person"), LastCommand()->GetStringField(TEXT("personId")), FString(TEXT("p2")));
	Step({{EKeys::F, IE_Released}, {EKeys::SpaceBar, IE_Pressed}});
	TestEqual(TEXT("Space requests pause"), LastCommand()->GetStringField(TEXT("action")), FString(TEXT("pause")));
	Step({{EKeys::SpaceBar, IE_Released}});
	Step({{EKeys::SpaceBar, IE_Pressed}});
	TestEqual(TEXT("Second Space requests resume while outcome is pending"), LastCommand()->GetStringField(TEXT("action")), FString(TEXT("resume")));
	Step({{EKeys::SpaceBar, IE_Released}, {EKeys::Three, IE_Pressed}});
	TestEqual(TEXT("Speed input is preserved"), LastCommand()->GetIntegerField(TEXT("value")), 3);
	Step({{EKeys::Three, IE_Released}, {EKeys::Escape, IE_Pressed}});
	TestEqual(TEXT("Escape requests stop"), LastCommand()->GetStringField(TEXT("action")), FString(TEXT("stop")));
	World->DestroyWorld(false);
	TArray<FString> Published;
	Files.FindFiles(Published, *FPaths::Combine(Commands, TEXT("*.json")), true, false);
	for (const FString& File : Published) Files.Delete(*FPaths::Combine(Commands, File));
	Files.DeleteDirectory(*Commands); Files.DeleteDirectory(*Root);
	return true;
}
#endif
