#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MousecatWorldManifest.h"
#include "MousecatWorldBootstrap.generated.h"

class UMaterialInterface;
class UProceduralMeshComponent;
class USceneComponent;

UCLASS()
class MOUSECATWORLD_API AMousecatWorldBootstrap : public AActor
{
	GENERATED_BODY()

public:
	AMousecatWorldBootstrap();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	bool IsWorldReady() const { return bWorldReady; }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	FString GetWorldDisplayName() const { return Manifest.DisplayName; }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	FString GetManifestPath() const { return ManifestPath; }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	FString GetLoadError() const { return LoadError; }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	FVector GetPlayerSpawnWorldLocation() const;

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetRegionCount() const { return Manifest.Regions.Num(); }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetLandmarkCount() const { return Manifest.Landmarks.Num(); }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetTreeCount() const;

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetTerrainChunkCount() const { return TerrainChunks.Num(); }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetMapCount() const { return Manifest.Maps.Num(); }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetPortalCount() const { return Manifest.Portals.Num(); }

	UFUNCTION(BlueprintPure, Category = "Mousecat World")
	int32 GetActivePortalCount() const { return RuntimePortals.Num(); }

private:
	UPROPERTY(VisibleAnywhere, Category = "Mousecat World")
	TObjectPtr<USceneComponent> SceneRoot;

	UPROPERTY(VisibleAnywhere, Category = "Mousecat World")
	TObjectPtr<UProceduralMeshComponent> WaterMesh;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInterface> VertexColorMaterial;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInterface> WaterMaterial;

	FMousecatWorldManifest Manifest;
	FString ManifestPath;
	FString LoadError;
	bool bWorldReady = false;

	struct FRuntimeChunk
	{
		UProceduralMeshComponent* Mesh = nullptr;
		FIntPoint Coordinate = FIntPoint::ZeroValue;
		FVector2D CenterMeters = FVector2D::ZeroVector;
		bool bCollisionEnabled = false;
	};

	TArray<FRuntimeChunk> TerrainChunks;
	TArray<FRuntimeChunk> WorldObjectChunks;
	TArray<FRuntimeChunk> DecorativeObjectChunks;
	TArray<FRuntimeChunk> MappedPlaceChunks;
	TArray<FRuntimeChunk> MappedWaterChunks;
	TArray<FRuntimeChunk> SemanticMarkerChunks;

	struct FRuntimePortal
	{
		FString Id;
		FString TargetId;
		FString MapId;
		FString TargetMapId;
		FVector2D SourceMeters = FVector2D::ZeroVector;
		FVector2D TargetMeters = FVector2D::ZeroVector;
	};

	TArray<FRuntimePortal> RuntimePortals;
	FString ActiveMapId;
	bool bPortalTriggersArmed = true;

	bool ResolveAndLoadManifest();
	bool BuildWorldGeometry();
	bool BuildTerrain();
	void BuildWater();
	void BuildWorldObjects();
	void BuildMappedPlaces();
	void BuildRuntimePortals();
	void BuildLighting();
	void ApplyRuntimeMaterial();
	void RefreshCollisionEnvelope();
	void RefreshPortalTransitions();
	void SetChunkCollision(FRuntimeChunk& Chunk, bool bEnableCollision);
	void ResetRuntimeChunks();
	UProceduralMeshComponent* CreateChunkComponent(
		const TCHAR* Prefix,
		const FIntPoint& Coordinate,
		bool bEnableCollision,
		bool bSynchronousInitialCollision = false);

	float SampleTerrainHeightMeters(double X, double Y) const;
	float SampleRenderedTerrainHeightMeters(double X, double Y) const;
	float SampleTerrainWaterDepthMeters(double X, double Y) const;
	FLinearColor SampleTerrainColor(double X, double Y, float HeightMeters) const;
};
