#include "MousecatWorldReplay.h"

#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "InputCoreTypes.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace MousecatWorldManifest
{
	FSHA256Signature HashSha256(const TArray<uint8>& Bytes);
}

namespace MousecatReplay
{
	bool SafeFile(const FString& Name)
	{
		return !Name.IsEmpty() && Name.Len() <= 160 && FPaths::GetCleanFilename(Name) == Name
			&& !Name.Contains(TEXT("..")) && !Name.Contains(TEXT(":")) && Name.EndsWith(TEXT(".json"));
	}
	bool Read(const FString& Name, int64 Limit, TSharedPtr<FJsonObject>& Out, FString& Hash, FString& Error)
	{
		if (!SafeFile(Name)) { Error = TEXT("Unsafe replay filename."); return false; }
		const FString Path = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("MousecatWorld/Generated"), Name);
		const int64 Size = IFileManager::Get().FileSize(*Path);
		TArray<uint8> Bytes;
		if (Size < 1 || Size > Limit || !FFileHelper::LoadFileToArray(Bytes, *Path))
		{ Error = TEXT("Replay file is missing or exceeds its byte limit."); return false; }
		Hash = MousecatWorldManifest::HashSha256(Bytes).ToString().ToLower();
		FString Json;
		FFileHelper::BufferToString(Json, Bytes.GetData(), Bytes.Num());
		if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Out) || !Out.IsValid())
		{ Error = TEXT("Replay JSON is invalid."); return false; }
		return true;
	}
	bool Text(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, FString& Value, int32 Limit)
	{
		return Object.IsValid() && Object->TryGetStringField(Key, Value) && !Value.IsEmpty() && Value.Len() <= Limit;
	}
	bool Vector(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, FVector& Value)
	{
		const TArray<TSharedPtr<FJsonValue>>* Values;
		if (!Object.IsValid() || !Object->TryGetArrayField(Key, Values) || Values->Num() != 3) return false;
		double X, Y, Z;
		if (!(*Values)[0]->TryGetNumber(X) || !(*Values)[1]->TryGetNumber(Y) || !(*Values)[2]->TryGetNumber(Z)
			|| !FMath::IsFinite(X) || !FMath::IsFinite(Y) || !FMath::IsFinite(Z)
			|| FMath::Max3(FMath::Abs(X), FMath::Abs(Y), FMath::Abs(Z)) > 1000000) return false;
		Value = FVector(X, Y, Z);
		return true;
	}
	struct FMesh
	{
		TArray<FVector> Vertices, Normals;
		TArray<int32> Triangles;
		TArray<FVector2D> UV;
		TArray<FLinearColor> Colors;
		TArray<FProcMeshTangent> Tangents;
		void Box(const FVector& Center, const FVector& Half, const FLinearColor& Color)
		{
			const FVector Corners[] = {
				{-Half.X,-Half.Y,-Half.Z}, {Half.X,-Half.Y,-Half.Z}, {Half.X,Half.Y,-Half.Z}, {-Half.X,Half.Y,-Half.Z},
				{-Half.X,-Half.Y,Half.Z}, {Half.X,-Half.Y,Half.Z}, {Half.X,Half.Y,Half.Z}, {-Half.X,Half.Y,Half.Z}};
			const int32 Faces[6][4] = {{0,3,2,1},{4,5,6,7},{0,1,5,4},{1,2,6,5},{2,3,7,6},{3,0,4,7}};
			for (const auto& Face : Faces)
			{
				const int32 Base = Vertices.Num();
				const FVector Normal = FVector::CrossProduct(Corners[Face[1]] - Corners[Face[0]], Corners[Face[2]] - Corners[Face[0]]).GetSafeNormal();
				for (int32 I = 0; I < 4; ++I)
				{
					Vertices.Add(Center + Corners[Face[I]]); Normals.Add(Normal); Colors.Add(Color);
					UV.Add(FVector2D(I == 1 || I == 2, I >= 2)); Tangents.Add(FProcMeshTangent(1,0,0));
				}
				Triangles.Append({Base,Base+1,Base+2,Base,Base+2,Base+3});
			}
		}
		void Apply(UProceduralMeshComponent* Component)
		{
			Component->ClearAllMeshSections();
			Component->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UV, Colors, Tangents, false);
		}
	};
}

AMousecatWorldReplay::AMousecatWorldReplay()
{
	PrimaryActorTick.bCanEverTick = true;
	Geometry = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("ObservedGeometry"));
	SetRootComponent(Geometry);
	People = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("ObservedPeople"));
	People->SetupAttachment(Geometry);
	Geometry->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	People->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AMousecatWorldReplay::BeginPlay()
{
	Super::BeginPlay();
	UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr,
		TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"));
	Geometry->SetMaterial(0, Material); People->SetMaterial(0, Material);
	bReady = LoadIndex() && LoadFrame(Frames.Num() - 1);
	if (!bReady && LoadError.IsEmpty()) LoadError = TEXT("Replay content was rejected.");
}

bool AMousecatWorldReplay::LoadIndex()
{
	using namespace MousecatReplay;
	FString Name, Hash, Schema, Admission;
	if (!FParse::Value(FCommandLine::Get(), TEXT("MousecatWorldReplay="), Name)) return false;
	TSharedPtr<FJsonObject> Index;
	if (!Read(Name, 4 * 1024 * 1024, Index, Hash, LoadError)) return false;
	const TArray<TSharedPtr<FJsonValue>>* Entries;
	if (!Text(Index, TEXT("schema"), Schema, 80) || Schema != TEXT("mousecat.world-replay/1")
		|| !Text(Index, TEXT("title"), Title, 160) || !Text(Index, TEXT("sourceDescription"), SourceDescription, 1024)
		|| !Text(Index, TEXT("datasetAdmission"), Admission, 32) || Admission != TEXT("unreviewed")
		|| !Vector(Index, TEXT("origin"), Origin) || !Index->TryGetArrayField(TEXT("frames"), Entries)
		|| Entries->Num() < 1 || Entries->Num() > 10000) return false;
	double Previous = -1;
	TSet<FString> Seen;
	for (const auto& Entry : *Entries)
	{
		const TSharedPtr<FJsonObject>* Object;
		FString File, Digest;
		double Time;
		if (!Entry->TryGetObject(Object) || !Text(*Object, TEXT("file"), File, 160) || !SafeFile(File)
			|| Seen.Contains(File) || !Text(*Object, TEXT("sha256"), Digest, 64) || Digest.Len() != 64
			|| !(*Object)->TryGetNumberField(TEXT("hours"), Time) || !FMath::IsFinite(Time) || Time < Previous) return false;
		Seen.Add(File); Previous = Time; Frames.Add(*Object);
	}
	return true;
}

bool AMousecatWorldReplay::LoadFrame(int32 Index)
{
	using namespace MousecatReplay;
	if (!Frames.IsValidIndex(Index)) return false;
	LoadError = TEXT("Replay frame content was rejected.");
	TSharedPtr<FJsonObject> Frame;
	FString Hash, Schema, NewCoverage;
	const auto& Entry = Frames[Index];
	if (!Read(Entry->GetStringField(TEXT("file")), 64 * 1024 * 1024, Frame, Hash, LoadError)
		|| Hash != Entry->GetStringField(TEXT("sha256")).ToLower()) { LoadError = TEXT("Replay frame bytes differ from the index."); return false; }
	const TArray<TSharedPtr<FJsonValue>> *Primitives, *Actors;
	double Time;
	if (!Text(Frame, TEXT("schema"), Schema, 80) || Schema != TEXT("mousecat.world-frame/1")
		|| !Frame->TryGetNumberField(TEXT("hours"), Time) || !FMath::IsFinite(Time)
		|| Time != Entry->GetNumberField(TEXT("hours")) || !Text(Frame, TEXT("coverage"), NewCoverage, 1024)
		|| !Frame->TryGetArrayField(TEXT("primitives"), Primitives) || Primitives->Num() > 100000
		|| !Frame->TryGetArrayField(TEXT("entities"), Actors) || Actors->Num() > 100000) return false;
	FMesh Ground, Bodies;
	TArray<TSharedPtr<FJsonObject>> NewEntities;
	for (const auto& Primitive : *Primitives)
	{
		const TSharedPtr<FJsonObject>* Object;
		FVector Position, Extent, RGB;
		if (!Primitive->TryGetObject(Object) || !Vector(*Object, TEXT("position"), Position)
			|| !Vector(*Object, TEXT("extent"), Extent) || !Vector(*Object, TEXT("color"), RGB)
			|| Extent.GetMin() <= 0 || Extent.GetMax() > 256 || RGB.GetMin() < 0 || RGB.GetMax() > 1) return false;
		Ground.Box((Position - Origin) * 100, Extent * 100, FLinearColor(RGB.X, RGB.Y, RGB.Z));
	}
	TSet<FString> Ids;
	for (const auto& Actor : *Actors)
	{
		const TSharedPtr<FJsonObject>* Object;
		FVector Position;
		FString Id, Label, Source, Detail;
		if (!Actor->TryGetObject(Object) || !Vector(*Object, TEXT("position"), Position)
			|| !Text(*Object, TEXT("id"), Id, 160) || Ids.Contains(Id) || !Text(*Object, TEXT("label"), Label, 160)
			|| !Text(*Object, TEXT("positionSource"), Source, 80) || !Text(*Object, TEXT("details"), Detail, 4096)
			|| (Source != TEXT("active-body") && Source != TEXT("durable-state"))) return false;
		Ids.Add(Id); NewEntities.Add(*Object);
		const FLinearColor Color = Source == TEXT("active-body") ? FLinearColor(0.15f,0.75f,1.0f) : FLinearColor(0.95f,0.55f,0.15f);
		Bodies.Box((Position - Origin) * 100 + FVector(0,0,85), FVector(22,22,85), Color);
	}
	Ground.Apply(Geometry); Bodies.Apply(People);
	Entities = MoveTemp(NewEntities); Coverage = NewCoverage; Hours = Time; FrameIndex = Index;
	PersonIndex = FMath::Clamp(PersonIndex, 0, FMath::Max(0, Entities.Num()-1));
	CameraStart = FVector(-1800,-1800,1800);
	LoadError.Empty();
	return true;
}

void AMousecatWorldReplay::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bReady) return;
	APlayerController* Controller = UGameplayStatics::GetPlayerController(this, 0);
	if (!Controller) return;
	int32 Next = FrameIndex;
	if (Controller->WasInputKeyJustPressed(EKeys::Left)) { --Next; bPlaying = false; }
	if (Controller->WasInputKeyJustPressed(EKeys::Right)) { ++Next; bPlaying = false; }
	if (Controller->WasInputKeyJustPressed(EKeys::Home)) Next = 0;
	if (Controller->WasInputKeyJustPressed(EKeys::End)) Next = Frames.Num()-1;
	if (Controller->WasInputKeyJustPressed(EKeys::P)) bPlaying = !bPlaying;
	if (Controller->WasInputKeyJustPressed(EKeys::Tab) && !Entities.IsEmpty()) PersonIndex = (PersonIndex+1) % Entities.Num();
	if (Controller->WasInputKeyJustPressed(EKeys::F) && Entities.IsValidIndex(PersonIndex) && Controller->GetPawn())
	{
		FVector Position;
		if (MousecatReplay::Vector(Entities[PersonIndex], TEXT("position"), Position))
		{
			Controller->GetPawn()->SetActorLocation((Position-Origin)*100 + FVector(-1400,-1400,1400));
			Controller->SetControlRotation(FRotator(-35,45,0));
		}
	}
	if (bPlaying)
	{
		PlaybackSeconds += DeltaSeconds;
		if (PlaybackSeconds >= 1) { ++Next; PlaybackSeconds = 0; }
		if (Next >= Frames.Num()) bPlaying = false;
	}
	Next = FMath::Clamp(Next, 0, Frames.Num()-1);
	if (Next != FrameIndex && !LoadFrame(Next)) { bReady = false; Geometry->ClearAllMeshSections(); People->ClearAllMeshSections(); }
}

FString AMousecatWorldReplay::GetSummary() const
{
	return FString::Printf(TEXT("Frame %d/%d | %.4f game hours | %s"), FrameIndex+1, Frames.Num(), Hours, *Coverage);
}

FString AMousecatWorldReplay::GetPersonSummary() const
{
	if (!Entities.IsValidIndex(PersonIndex)) return TEXT("No captured person in this frame.");
	const auto& Person = Entities[PersonIndex];
	return Person->GetStringField(TEXT("label")) + TEXT(" | ") + Person->GetStringField(TEXT("positionSource"))
		+ TEXT("\n") + Person->GetStringField(TEXT("details"));
}
