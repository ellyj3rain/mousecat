#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MousecatNativeView.generated.h"

class UTexture2D;
class APlayerController;
struct FMousecatNativeReader;
struct FMousecatNativeReaderDeleter
{
	void operator()(FMousecatNativeReader* Reader) const;
};

/** Displays validated producer pixels and sends a bounded set of operator requests. */
UCLASS()
class MOUSECATWORLD_API AMousecatNativeView : public AActor
{
	GENERATED_BODY()
public:
	AMousecatNativeView();
	virtual ~AMousecatNativeView() override;
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;
	UTexture2D* GetImage() const { return Image; }
	FIntPoint GetImageSize() const { return ImageSize; }
	FString GetTitle() const { return Title; }
	FString GetSummary() const { return Summary; }
	FString GetStatus() const;
	FString GetPersonSummary() const;
	FString GetCommandStatus() const;
	FString GetCameraStatus() const;
	FString GetInputHint() const;
	void SetImageRect(FVector2D Position, FVector2D Size);
	bool IsConnected() const;

private:
	struct FPerson { FString Id, Label, Summary; };
	struct FPending { int64 Sequence; FString Description; };
	UPROPERTY() TObjectPtr<UTexture2D> Image;
	FIntPoint ImageSize = FIntPoint::ZeroValue;
	TArray<FPerson> People;
	TArray<FPending> Pending;
	FString Directory, SessionId, ManifestHash, State;
	FString Title = TEXT("Native view"), Summary, ReadError, CommandError;
	FString LastResultStatus, LastResultMessage, Rejection;
	FString CameraMode, CameraSummary, CameraPerson;
	FBox2D ImageRect = FBox2D(ForceInit);
	FVector2D LastDragPosition = FVector2D::ZeroVector, DragDistance = FVector2D::ZeroVector;
	TWeakObjectPtr<APlayerController> InputController;
	TUniquePtr<FMousecatNativeReader, FMousecatNativeReaderDeleter> Reader;
	int64 FrameSequence = 0, CapturedAt = 0, LastAcknowledged = 0, NextCommand = 1;
	int64 LastResultSequence = 0;
	int64 PendingPauseSequence = 0;
	int32 PersonIndex = 0;
	double NextPoll = 0, NextPan = 0, LastAccepted = 0, RateStarted = 0;
	int32 AcceptedImages = 0, ViewerTicks = 0;
	float ImageRate = 0, ViewerRate = 0, PreviousMaxFPS = 0;
	bool bSessionChanged = false, bCommandsReady = false, bRequestedPause = false;
	bool bDragging = false, bControlsFocused = false, bChangedMaxFPS = false, bStopped = false;
	void Poll();
	void ConfigureInput(APlayerController* Controller);
	void ProcessControls(APlayerController* Controller, bool bFocused, bool bHasMouse, FVector2D Mouse, double Now);
	bool InitializeCommands();
	bool Send(const FString& Action, int32 Value = 0, int32 Dx = 0, int32 Dy = 0);
	double AgeSeconds() const;
	friend class FMousecatNativeInputTest;
	friend class FMousecatNativeReaderTest;
};
