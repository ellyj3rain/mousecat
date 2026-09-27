#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "MousecatWorldHUD.generated.h"

UCLASS()
class MOUSECATWORLD_API AMousecatWorldHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	struct FNativeTextLayout
	{
		FString Text;
		float Width = -1;
		int32 MaxLines = -1;
		TWeakObjectPtr<UFont> Font;
		TArray<FString> Lines;
	};
	TArray<FNativeTextLayout> NativeTextLayouts;
	const TArray<FString>& NativeTextLines(int32 Slot, const FString& Text, float Width, int32 MaxLines,
		UFont* Font, TFunctionRef<float(const FString&)> Measure);
	friend class FMousecatNativeHUDLayoutTest;
};
