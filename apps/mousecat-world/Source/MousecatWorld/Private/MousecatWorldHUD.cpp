#include "MousecatWorldHUD.h"

#include "MousecatWorldBootstrap.h"
#include "MousecatWorldReplay.h"
#include "MousecatNativeView.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Texture2D.h"
#include "EngineUtils.h"

const TArray<FString>& AMousecatWorldHUD::NativeTextLines(int32 Slot, const FString& Text, float Width,
	int32 MaxLines, UFont* Font, TFunctionRef<float(const FString&)> Measure)
{
	// A fixed slot per visible panel retains only its current layout. Growing source
	// histories cannot grow this cache, and unchanged panels require no font work.
	check(Slot >= 0 && Slot < 16);
	if (NativeTextLayouts.Num() <= Slot) NativeTextLayouts.SetNum(Slot + 1);
	FNativeTextLayout& Layout = NativeTextLayouts[Slot];
	if (Layout.Text == Text && Layout.Width == Width && Layout.MaxLines == MaxLines && Layout.Font.Get() == Font)
		return Layout.Lines;
	Layout.Text = Text; Layout.Width = Width; Layout.MaxLines = MaxLines; Layout.Font = Font;
	Layout.Lines.Empty();
	if (Width <= 0 || MaxLines <= 0 || Text.IsEmpty()) return Layout.Lines;
	const FString Value = Text.Replace(TEXT("\t"), TEXT(" "));
	auto Fit = [&](const FString& Line, float Available)
	{
		// Binary search also wraps long identifiers, without repeatedly measuring
		// every growing character prefix on every rendered frame.
		int32 Low = 0, High = Line.Len();
		while (Low < High)
		{
			const int32 Middle = (Low + High + 1) / 2;
			if (Measure(Line.Left(Middle)) <= Available) Low = Middle;
			else High = Middle - 1;
		}
		return Low;
	};
	int32 Start = 0;
	while (Start < Value.Len() && Layout.Lines.Num() < MaxLines)
	{
		int32 End = Value.Find(TEXT("\n"), ESearchCase::CaseSensitive, ESearchDir::FromStart, Start);
		if (End == INDEX_NONE) End = Value.Len();
		const FString Remaining = Value.Mid(Start, End - Start);
		const int32 Count = Fit(Remaining, Width);
		// A panel narrower than one glyph draws nothing outside its bounds.
		if (Count == 0 && !Remaining.IsEmpty()) break;
		FString Line = Remaining.Left(Count);
		Start += Count;
		if (Start == End) ++Start;
		if (Layout.Lines.Num() + 1 == MaxLines && Start < Value.Len())
		{
			const FString Ellipsis = TEXT("...");
			const float EllipsisWidth = Measure(Ellipsis);
			Line = EllipsisWidth <= Width ? Line.Left(Fit(Line, Width - EllipsisWidth)) + Ellipsis : FString();
		}
		Layout.Lines.Add(MoveTemp(Line));
	}
	return Layout.Lines;
}

void AMousecatWorldHUD::DrawHUD()
{
	Super::DrawHUD();
	if (Canvas == nullptr || GetWorld() == nullptr)
	{
		return;
	}

	for (TActorIterator<AMousecatNativeView> Iterator(GetWorld()); Iterator; ++Iterator)
	{
		AMousecatNativeView* View = *Iterator;
		UFont* Font = GEngine ? GEngine->GetSmallFont() : nullptr;
		const FLinearColor Background(0.018f, 0.025f, 0.04f, 1.f);
		const FLinearColor Panel(0.035f, 0.045f, 0.065f, 1.f);
		const FLinearColor Text(0.87f, 0.91f, 0.96f, 1.f);
		const float Width = Canvas->SizeX, Height = Canvas->SizeY, Margin = 16;
		int32 LayoutSlot = 0;
		auto Wrapped = [&](const FString& Value, float X, float Y, float MaxWidth, float Bottom, FLinearColor Color)
		{
			const int32 MaxLines = FMath::Max(0, FMath::FloorToInt((Bottom - Y) / 18));
			const auto& Lines = NativeTextLines(LayoutSlot++, Value, MaxWidth, MaxLines, Font, [&](const FString& TextToMeasure)
			{
				float TextWidth = 0, TextHeight = 0;
				GetTextSize(TextToMeasure, TextWidth, TextHeight, Font, 1);
				return TextWidth;
			});
			for (const FString& Line : Lines) { DrawText(Line, Color, X, Y, Font); Y += 18; }
		};
		DrawRect(Background, 0, 0, Width, Height);
		DrawRect(Panel, Margin, Margin, Width - 2 * Margin, 140);
		Wrapped(View->GetTitle(), 30, 24, Width - 60, 44, FLinearColor::White);
		Wrapped(View->GetStatus(), 30, 46, Width - 60, 84,
			View->IsConnected() ? FLinearColor(0.52f, 0.85f, 0.72f) : FLinearColor(1.f, 0.71f, 0.4f));
		Wrapped(View->GetSummary(), 30, 86, Width - 60, 112, Text);
		Wrapped(View->GetCameraStatus(), 30, 108, Width - 60, 150, FLinearColor(0.56f, 0.77f, 1.f));

		const float ControlRow = Width >= 900 ? 22.f : 40.f;
		const float FooterHeight = 50 + 3 * ControlRow, FooterY = Height - FooterHeight - Margin;
		const float ViewTop = 168, Bottom = FMath::Max(ViewTop + 1, FooterY - 12);
		const bool bSidePanel = Width >= 820;
		const float PersonWidth = bSidePanel ? FMath::Clamp(Width * .27f, 250.f, 390.f) : Width - 32;
		const float PersonX = bSidePanel ? Width - PersonWidth - Margin : Margin;
		const float PersonY = bSidePanel ? ViewTop : FMath::Max(ViewTop, Bottom - 126);
		const float ImageWidth = FMath::Max(1.f, bSidePanel ? PersonX - 2 * Margin : Width - 2 * Margin);
		const float ImageHeight = FMath::Max(1.f, (bSidePanel ? Bottom : PersonY - 12) - ViewTop);
		DrawRect(FLinearColor::Black, Margin, ViewTop, ImageWidth, ImageHeight);
		UTexture2D* Texture = View->GetImage();
		const FIntPoint Size = View->GetImageSize();
		View->SetImageRect(FVector2D::ZeroVector, FVector2D::ZeroVector);
		if (Texture && Size.X > 0 && Size.Y > 0)
		{
			const float Scale = FMath::Min(ImageWidth / Size.X, ImageHeight / Size.Y);
			const float W = Size.X * Scale, H = Size.Y * Scale;
			const float X = Margin + (ImageWidth - W) / 2, Y = ViewTop + (ImageHeight - H) / 2;
			View->SetImageRect(FVector2D(X, Y), FVector2D(W, H));
			DrawTexture(Texture, X, Y,
				W, H, 0, 0, static_cast<float>(Size.X) / Texture->GetSizeX(),
				static_cast<float>(Size.Y) / Texture->GetSizeY(), FLinearColor::White, BLEND_Opaque);
		}
		else Wrapped(TEXT("Waiting for a validated image from the producer."), Margin + 16, ViewTop + 20,
			ImageWidth - 32, ViewTop + ImageHeight, Text);
		DrawRect(Panel, PersonX, PersonY, PersonWidth, FMath::Max(1.f, Bottom - PersonY));
		Wrapped(TEXT("Selected person"), PersonX + 14, PersonY + 10, PersonWidth - 28, PersonY + 32, FLinearColor(0.56f, 0.77f, 1.f));
		Wrapped(View->GetPersonSummary(), PersonX + 14, PersonY + 36, PersonWidth - 28, Bottom - 8, Text);
		DrawRect(Panel, Margin, FooterY, Width - 32, FooterHeight);
		Wrapped(View->GetCommandStatus(), 30, FooterY + 6, Width - 60, FooterY + 44, FLinearColor(1.f, .8f, .53f));
		Wrapped(View->GetInputHint(), 30, FooterY + 46, Width - 60, FooterY + 46 + ControlRow, Text);
		Wrapped(TEXT("Tab / Shift+Tab: select person | F: observe selected person"),
			30, FooterY + 46 + ControlRow, Width - 60, FooterY + 46 + 2 * ControlRow, Text);
		Wrapped(TEXT("Space: pause/resume | 1/2/3: speed | Esc: stop request"),
			30, FooterY + 46 + 2 * ControlRow, Width - 60, Height - Margin, Text);
		return;
	}
	AMousecatWorldBootstrap* Bootstrap = nullptr;
	for (TActorIterator<AMousecatWorldReplay> Iterator(GetWorld()); Iterator; ++Iterator)
	{
		AMousecatWorldReplay* Replay = *Iterator;
		UFont* Font = GEngine->GetSmallFont();
		auto Wrapped = [&](const FString& Text, float X, float Y, float Width, float Bottom, FLinearColor Color)
		{
			TArray<FString> Paragraphs;
			Text.ParseIntoArrayLines(Paragraphs, false);
			for (const FString& Paragraph : Paragraphs)
			{
				TArray<FString> Words; Paragraph.ParseIntoArray(Words, TEXT(" "), true);
				FString Line;
				for (const FString& Word : Words)
				{
					const FString Next = Line.IsEmpty() ? Word : Line + TEXT(" ") + Word;
					float W, H; GetTextSize(Next, W, H, Font, 1);
					if (W > Width && !Line.IsEmpty())
					{
						if (Y+18 > Bottom) { DrawText(TEXT("More detail is retained in the source frame."), Color, X,Y,Font); return; }
						DrawText(Line, Color, X,Y,Font); Y += 18; Line = Word;
					}
					else Line = Next;
				}
				if (Y+18 > Bottom) return;
				DrawText(Line, Color, X,Y,Font); Y += 22;
			}
		};
		const float Width = Canvas->SizeX-32;
		DrawRect(FLinearColor(0.02f,0.025f,0.04f,0.94f),16,16,Width,172);
		DrawText(Replay->GetTitle(),FLinearColor::White,30,26,GEngine->GetLargeFont());
		Wrapped(Replay->IsReady() ? Replay->GetSummary() : Replay->GetLoadError(),30,62,Width-28,112,FLinearColor(0.6f,0.85f,1));
		Wrapped(TEXT("UNREVIEWED | Observed geometry markers. Blank areas are unobserved. Blue: native body. Amber: durable position."),30,112,Width-28,150,FLinearColor(1,0.7f,0.4f));
		Wrapped(TEXT("WASD + mouse: camera | arrows: frames | P: playback | Tab: person | F: focus person"),30,152,Width-28,186,FLinearColor::White);
		const float SideWidth = FMath::Min(420.f, Canvas->SizeX*0.36f);
		const float SideX = Canvas->SizeX-SideWidth-16;
		DrawRect(FLinearColor(0.02f,0.025f,0.04f,0.94f),SideX,204,SideWidth,Canvas->SizeY-260);
		Wrapped(Replay->GetPersonSummary(),SideX+14,216,SideWidth-28,Canvas->SizeY-72,FLinearColor(0.86f,0.9f,0.92f));
		DrawRect(FLinearColor(0.02f,0.025f,0.04f,0.9f),16,Canvas->SizeY-44,Width,32);
		Wrapped(Replay->GetSourceDescription(),28,Canvas->SizeY-39,Width-24,Canvas->SizeY,FLinearColor(0.65f,0.7f,0.75f));
		return;
	}
	for (TActorIterator<AMousecatWorldBootstrap> Iterator(GetWorld()); Iterator; ++Iterator)
	{
		Bootstrap = *Iterator;
		break;
	}

	const float PanelX = 28.0f;
	const float PanelY = 26.0f;
	const float PanelWidth = FMath::Min(620.0f, Canvas->SizeX - 56.0f);
	const bool bReady = Bootstrap != nullptr && Bootstrap->IsWorldReady();
	const float PanelHeight = bReady ? 154.0f : 190.0f;
	DrawRect(FLinearColor(0.018f, 0.025f, 0.025f, 0.90f), PanelX, PanelY, PanelWidth, PanelHeight);
	DrawRect(bReady ? FLinearColor(0.20f, 0.72f, 0.52f) : FLinearColor(0.88f, 0.24f, 0.20f), PanelX, PanelY, 5.0f, PanelHeight);

	UFont* LargeFont = GEngine != nullptr ? GEngine->GetLargeFont() : nullptr;
	UFont* SmallFont = GEngine != nullptr ? GEngine->GetSmallFont() : nullptr;
	DrawText(TEXT("MOUSECAT WORLD"), FLinearColor(0.88f, 0.93f, 0.91f), PanelX + 22.0f, PanelY + 16.0f, LargeFont, 1.0f, false);

	if (bReady)
	{
		const FString Summary = FString::Printf(
			TEXT("%s  |  %d source maps  |  %d linked portals  |  %d terrain chunks"),
			*Bootstrap->GetWorldDisplayName(),
			Bootstrap->GetMapCount(),
			Bootstrap->GetActivePortalCount(),
			Bootstrap->GetTerrainChunkCount());
		DrawText(Summary, FLinearColor(0.66f, 0.80f, 0.74f), PanelX + 22.0f, PanelY + 61.0f, SmallFont, 1.0f, false);
		DrawText(TEXT("WASD / LEFT STICK move    MOUSE / RIGHT STICK look"), FLinearColor(0.80f, 0.84f, 0.82f), PanelX + 22.0f, PanelY + 94.0f, SmallFont, 1.0f, false);
		DrawText(TEXT("SPACE / A jump    SHIFT / LB sprint"), FLinearColor(0.80f, 0.84f, 0.82f), PanelX + 22.0f, PanelY + 119.0f, SmallFont, 1.0f, false);
	}
	else
	{
		DrawText(TEXT("MANIFEST REJECTED - WORLD NOT STARTED"), FLinearColor(0.96f, 0.46f, 0.38f), PanelX + 22.0f, PanelY + 62.0f, SmallFont, 1.0f, false);
		const FString Error = Bootstrap != nullptr ? Bootstrap->GetLoadError() : TEXT("World bootstrap actor was not created.");
		DrawText(Error.Left(100), FLinearColor(0.88f, 0.78f, 0.75f), PanelX + 22.0f, PanelY + 96.0f, SmallFont, 0.9f, false);
		const FString SelectedManifest = Bootstrap != nullptr && !Bootstrap->GetManifestPath().IsEmpty()
			? Bootstrap->GetManifestPath()
			: TEXT("the selected generated manifest");
		DrawText(
			FString::Printf(TEXT("Fix %s and restart."), *SelectedManifest.Right(112)),
			FLinearColor(0.70f, 0.73f, 0.72f),
			PanelX + 22.0f,
			PanelY + 139.0f,
			SmallFont,
			0.9f,
			false);
	}
}

#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMousecatNativeHUDLayoutTest, "Mousecat.NativeView.Layout", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::CommandletContext | EAutomationTestFlags::EngineFilter)
bool FMousecatNativeHUDLayoutTest::RunTest(const FString& Parameters)
{
	UWorld::InitializationValues Values;
	Values.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
	UWorld* World = UWorld::CreateWorld(EWorldType::Game, false, NAME_None, nullptr, true, ERHIFeatureLevel::Num, &Values);
	if (!TestNotNull(TEXT("Native layout test world"), World)) return false;
	AMousecatWorldHUD* HUD = World->SpawnActor<AMousecatWorldHUD>();
	int32 Measurements = 0;
	auto Measure = [&](const FString& Text) { ++Measurements; return Text.Len() * 8.f; };
	const FString Content = TEXT("0123456789ABCDEFGHIJ\nNext person");
	const auto First = HUD->NativeTextLines(0, Content, 80, 3, nullptr, Measure);
	TestEqual(TEXT("Long identifiers fit panel width"), First[0], FString(TEXT("0123456789")));
	TestEqual(TEXT("Long identifiers continue inside panel"), First[1], FString(TEXT("ABCDEFGHIJ")));
	TestTrue(TEXT("Clipped text ends in a bounded ellipsis"), First[2].EndsWith(TEXT("...")) && First[2].Len() <= 10);
	const int32 Before = Measurements;
	HUD->NativeTextLines(0, Content, 80, 3, nullptr, Measure);
	TestEqual(TEXT("Unchanged content and width perform no font measurements"), Measurements, Before);
	const auto Narrow = HUD->NativeTextLines(0, Content, 48, 3, nullptr, Measure);
	TestTrue(TEXT("Resize rebuilds layout"), Measurements > Before && Narrow[0].Len() == 6);
	const auto Changed = HUD->NativeTextLines(0, TEXT("Changed"), 80, 3, nullptr, Measure);
	TestEqual(TEXT("New person replaces the prior layout"), Changed[0], FString(TEXT("Changed")));
	const auto Short = HUD->NativeTextLines(0, Content, 80, 1, nullptr, Measure);
	TestTrue(TEXT("Panel height change invalidates cached layout"), Short.Num() == 1 && Short[0].EndsWith(TEXT("...")));
	const auto Paragraphs = HUD->NativeTextLines(0, TEXT("One\n\nTwo"), 80, 4, nullptr, Measure);
	TestTrue(TEXT("Blank paragraphs preserve inspector spacing"), Paragraphs.Num() == 3 && Paragraphs[1].IsEmpty());
	for (int32 Index = 0; Index < 100; ++Index)
		HUD->NativeTextLines(0, FString::FromInt(Index), 80, 1, nullptr, Measure);
	TestEqual(TEXT("Growing update history retains one layout per panel"), HUD->NativeTextLayouts.Num(), 1);
	World->DestroyWorld(false);
	return true;
}
#endif
