#pragma once

#include "CoreMinimal.h"

struct FMousecatElevationPoint
{
	FVector2D PositionMeters = FVector2D::ZeroVector;
	float RadiusMeters = 1.0f;
	float StrengthMeters = 0.0f;
};

struct FMousecatTerrainSpec
{
	FString Authority;
	int32 Columns = 0;
	int32 Rows = 0;
	float CellSizeMeters = 1.0f;
	float BaseHeightMeters = 0.0f;
	float PrimaryAmplitudeMeters = 0.0f;
	float SecondaryAmplitudeMeters = 0.0f;
	float PrimaryFrequency = 0.0f;
	int32 Seed = 0;
	float WaterLevelMeters = 0.0f;
	float CollisionRadiusMeters = 180.0f;
	FLinearColor LowColor = FLinearColor(0.17f, 0.27f, 0.12f);
	FLinearColor MidColor = FLinearColor(0.27f, 0.43f, 0.18f);
	FLinearColor HighColor = FLinearColor(0.42f, 0.48f, 0.30f);
	FLinearColor WaterColor = FLinearColor(0.08f, 0.28f, 0.42f);
	// Optional authoritative row-major source heights. When populated, procedural terms are not evaluated.
	TArray<float> HeightSamplesMeters;
	// Optional row-major water column depth paired one-to-one with HeightSamplesMeters (0 = dry).
	TArray<float> WaterDepthSamplesMeters;
	TArray<FMousecatElevationPoint> ElevationPoints;
};

struct FMousecatRegionSpec
{
	FString Id;
	FString DisplayName;
	FVector2D MinMeters = FVector2D::ZeroVector;
	FVector2D MaxMeters = FVector2D::ZeroVector;
	FLinearColor Color = FLinearColor::White;
};

struct FMousecatLandmarkSpec
{
	FString Id;
	FString DisplayName;
	FString Kind;
	FVector2D PositionMeters = FVector2D::ZeroVector;
	FVector SizeMeters = FVector(10.0f);
	float YawDegrees = 0.0f;
	FLinearColor Color = FLinearColor::White;
};

struct FMousecatGroveSpec
{
	FString Id;
	FVector2D CenterMeters = FVector2D::ZeroVector;
	float RadiusMeters = 10.0f;
	int32 Count = 0;
	int32 Seed = 0;
	FLinearColor TrunkColor = FLinearColor(0.24f, 0.12f, 0.05f);
	FLinearColor CanopyColor = FLinearColor(0.08f, 0.27f, 0.08f);
};

struct FMousecatCoordinateTransform
{
	FString Schema;
	// Source component order is (x, y-up, z). Runtime FVector order is UE (x, y, z-up).
	FVector LocalOriginSourceMeters = FVector::ZeroVector;

	FVector SourceMetersToLocalUnrealMeters(const FVector& SourceMeters) const;
};

struct FMousecatTraversalGrid
{
	FString Encoding;
	FString BitOrder;
	FString Sha256;
	int32 Width = 0;
	int32 Height = 0;
	int32 PassableCells = 0;
	TArray<uint8> Bytes;

	bool IsPassable(int32 Column, int32 Row) const;
};

struct FMousecatSemanticGrid
{
	FString Encoding;
	FString Sha256;
	int32 Width = 0;
	int32 Height = 0;
	TArray<FString> Vocabulary;
	TArray<uint8> CellIndices;

	FString GetSemantic(int32 Column, int32 Row) const;
};

struct FMousecatPortalSpec
{
	FString Id;
	FString MapId;
	FString Kind;
	FString Mode;
	FString RegionTransition;
	FString ResolutionKind;
	FString TargetMapId;
	FString TargetGateId;

	FString SourcePath;
	FString SourceSha256;
	FString SourceSymbol;
	int32 SourceLineStart = -1;
	int32 SourceOrdinal = -1;

	bool bHasSourceCell = false;
	FIntPoint SourceCell = FIntPoint::ZeroValue;
	// Absolute source coordinates in (x, y-up, z) metres.
	bool bHasSourceWorldMeters = false;
	FVector SourceWorldMeters = FVector::ZeroVector;
	// Absolute UE coordinates in (x, y, z-up) centimetres.
	bool bHasUnrealWorldCentimeters = false;
	FVector UnrealWorldCentimeters = FVector::ZeroVector;

	bool bHasBoundary = false;
	FString BoundaryDirection;
	int32 BoundaryOffset = 0;

	bool bHasAvailability = false;
	FString AvailabilityState;
	FString AvailabilityAuthority;
	FString AvailabilityPolicy;
};

struct FMousecatMapSpec
{
	FString Id;
	FString Label;
	FString Type;
	int32 Priority = 0;
	int32 Columns = 0;
	int32 Rows = 0;

	// Absolute source-frame values. FVector components are (x, y-up, z).
	FVector SourceOriginMeters = FVector::ZeroVector;
	FVector2D SourceCellSizeMeters = FVector2D::ZeroVector;
	FVector SourceBoundsMinMeters = FVector::ZeroVector;
	FVector SourceBoundsMaxExclusiveMeters = FVector::ZeroVector;
	bool bSourceColumnsDecreaseX = false;

	FMousecatTraversalGrid Traversal;
	FMousecatSemanticGrid Semantics;
	TArray<FString> PortalIds;

	FString GetSemantic(int32 Column, int32 Row) const;
	bool IsPassable(int32 Column, int32 Row) const;
	FVector GetSourceCellCenterMeters(int32 Column, int32 Row) const;
	FVector GetLocalCellCenterMeters(
		int32 Column,
		int32 Row,
		const FMousecatCoordinateTransform& CoordinateTransform) const;
};

struct FMousecatRuntimeParcelSpec
{
	FString Id;
	FString Kind;
	int32 Columns = 0;
	int32 Rows = 0;
	// Absolute source-frame values. FVector components are (x, y-up, z).
	FVector SourceOriginMeters = FVector::ZeroVector;
	FVector2D SourceCellSizeMeters = FVector2D::ZeroVector;
	FVector SourceBoundsMinMeters = FVector::ZeroVector;
	FVector SourceBoundsMaxExclusiveMeters = FVector::ZeroVector;
};

struct FMousecatWorldManifest
{
	FString Schema;
	// Required for sampled-source manifests and bound to the sibling export receipt.
	FString SemanticHash;
	FString WorldId;
	FString DisplayName;
	FString SourceLabel;
	FMousecatTerrainSpec Terrain;
	// Stored in UE axis order (x, y, z-up), still in metres. JSON 3-vectors use source order (x, y-up, z).
	FVector PlayerSpawnMeters = FVector(0.0f, 0.0f, 2.0f);
	TArray<FMousecatRegionSpec> Regions;
	TArray<FMousecatLandmarkSpec> Landmarks;
	TArray<FMousecatGroveSpec> Groves;
	FMousecatCoordinateTransform CoordinateTransform;
	TArray<FMousecatMapSpec> Maps;
	TArray<FMousecatPortalSpec> Portals;
	TArray<FMousecatRuntimeParcelSpec> RuntimeParcels;
};

class MOUSECATWORLD_API FMousecatWorldManifestLoader final
{
public:
	static constexpr int64 MaxManifestBytes = 4 * 1024 * 1024;
	static constexpr int64 MaxReceiptBytes = 64 * 1024;

	static bool LoadFromFile(
		const FString& AbsolutePath,
		FMousecatWorldManifest& OutManifest,
		FString& OutError);
};
