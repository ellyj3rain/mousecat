#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MousecatWorldReplay.generated.h"

class FJsonObject;
class UProceduralMeshComponent;

/** Reads source-owned frame files. Its camera and playback never update a producer. */
UCLASS()
class MOUSECATWORLD_API AMousecatWorldReplay : public AActor
{
	GENERATED_BODY()
public:
	AMousecatWorldReplay();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	bool IsReady() const { return bReady; }
	FVector GetCameraStart() const { return CameraStart; }
	FString GetTitle() const { return Title; }
	FString GetSummary() const;
	FString GetSourceDescription() const { return SourceDescription; }
	FString GetPersonSummary() const;
	FString GetLoadError() const { return LoadError; }

private:
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Geometry;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> People;
	TArray<TSharedPtr<FJsonObject>> Frames;
	TArray<TSharedPtr<FJsonObject>> Entities;
	FString Title, SourceDescription, Coverage, LoadError;
	FVector CameraStart = FVector::ZeroVector;
	FVector Origin = FVector::ZeroVector;
	int32 FrameIndex = 0, PersonIndex = 0;
	double Hours = 0;
	bool bReady = false, bPlaying = false;
	float PlaybackSeconds = 0;
	bool LoadIndex();
	bool LoadFrame(int32 Index);
};
