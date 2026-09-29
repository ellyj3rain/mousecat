#include "MousecatWorldBootstrap.h"

#include "MousecatWorld.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SceneComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/SkyLight.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "HAL/PlatformFileManager.h"
#include "Materials/Material.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Kismet/GameplayStatics.h"

namespace MousecatWorldGeometry
{
	constexpr double CentimetersPerMeter = 100.0;
	constexpr double TargetTerrainVoxelCellMeters = 2.0;
	constexpr double VerticalTerrainVoxelStepMeters = 0.25;

	struct FMeshBuffer
	{
		TArray<FVector> Vertices;
		TArray<int32> Triangles;
		TArray<FVector> Normals;
		TArray<FVector2D> UV0;
		TArray<FLinearColor> Colors;
		TArray<FProcMeshTangent> Tangents;
	};

	void AppendFace(
		FMeshBuffer& Buffer,
		const FTransform& Transform,
		const FVector& A,
		const FVector& B,
		const FVector& C,
		const FVector& D,
		const FVector& LocalNormal,
		const FLinearColor& Color)
	{
		const int32 BaseIndex = Buffer.Vertices.Num();
		Buffer.Vertices.Append({
			Transform.TransformPosition(A),
			Transform.TransformPosition(B),
			Transform.TransformPosition(C),
			Transform.TransformPosition(D)
		});
		Buffer.Triangles.Append({BaseIndex, BaseIndex + 1, BaseIndex + 2, BaseIndex, BaseIndex + 2, BaseIndex + 3});
		const FVector Normal = Transform.TransformVectorNoScale(LocalNormal).GetSafeNormal();
		Buffer.Normals.Append({Normal, Normal, Normal, Normal});
		Buffer.UV0.Append({FVector2D(0.0, 1.0), FVector2D(1.0, 1.0), FVector2D(1.0, 0.0), FVector2D(0.0, 0.0)});
		Buffer.Colors.Append({Color, Color, Color, Color});
		const FProcMeshTangent Tangent(Transform.TransformVectorNoScale(FVector::ForwardVector), false);
		Buffer.Tangents.Append({Tangent, Tangent, Tangent, Tangent});
	}

	void AppendBox(
		FMeshBuffer& Buffer,
		const FVector& Center,
		const FVector& HalfExtent,
		float YawDegrees,
		const FLinearColor& Color)
	{
		const FTransform Transform(FRotator(0.0f, YawDegrees, 0.0f), Center);
		const double X = HalfExtent.X;
		const double Y = HalfExtent.Y;
		const double Z = HalfExtent.Z;

		AppendFace(Buffer, Transform, FVector(X, -Y, -Z), FVector(X, Y, -Z), FVector(X, Y, Z), FVector(X, -Y, Z), FVector::ForwardVector, Color);
		AppendFace(Buffer, Transform, FVector(-X, Y, -Z), FVector(-X, -Y, -Z), FVector(-X, -Y, Z), FVector(-X, Y, Z), -FVector::ForwardVector, Color);
		AppendFace(Buffer, Transform, FVector(X, Y, -Z), FVector(-X, Y, -Z), FVector(-X, Y, Z), FVector(X, Y, Z), FVector::RightVector, Color);
		AppendFace(Buffer, Transform, FVector(-X, -Y, -Z), FVector(X, -Y, -Z), FVector(X, -Y, Z), FVector(-X, -Y, Z), -FVector::RightVector, Color);
		AppendFace(Buffer, Transform, FVector(-X, -Y, Z), FVector(X, -Y, Z), FVector(X, Y, Z), FVector(-X, Y, Z), FVector::UpVector, Color);
		AppendFace(Buffer, Transform, FVector(-X, Y, -Z), FVector(X, Y, -Z), FVector(X, -Y, -Z), FVector(-X, -Y, -Z), -FVector::UpVector, Color);
	}

	void AppendPyramid(
		FMeshBuffer& Buffer,
		const FVector& BaseCenter,
		const FVector& HalfBase,
		float Height,
		float YawDegrees,
		const FLinearColor& Color)
	{
		const FTransform Transform(FRotator(0.0f, YawDegrees, 0.0f), BaseCenter);
		const FVector P0(-HalfBase.X, -HalfBase.Y, 0.0);
		const FVector P1(HalfBase.X, -HalfBase.Y, 0.0);
		const FVector P2(HalfBase.X, HalfBase.Y, 0.0);
		const FVector P3(-HalfBase.X, HalfBase.Y, 0.0);
		const FVector Peak(0.0, 0.0, Height);

		AppendFace(Buffer, Transform, P3, P2, P1, P0, -FVector::UpVector, Color);
		const auto AppendTriangle = [&Buffer, &Transform, &Color](const FVector& A, const FVector& B, const FVector& C)
		{
			const int32 BaseIndex = Buffer.Vertices.Num();
			const FVector WorldA = Transform.TransformPosition(A);
			const FVector WorldB = Transform.TransformPosition(B);
			const FVector WorldC = Transform.TransformPosition(C);
			const FVector Normal = FVector::CrossProduct(WorldB - WorldA, WorldC - WorldA).GetSafeNormal();
			Buffer.Vertices.Append({WorldA, WorldB, WorldC});
			Buffer.Triangles.Append({BaseIndex, BaseIndex + 1, BaseIndex + 2});
			Buffer.Normals.Append({Normal, Normal, Normal});
			Buffer.UV0.Append({FVector2D(0.0, 1.0), FVector2D(1.0, 1.0), FVector2D(0.5, 0.0)});
			Buffer.Colors.Append({Color, Color, Color});
			const FProcMeshTangent Tangent((WorldB - WorldA).GetSafeNormal(), false);
			Buffer.Tangents.Append({Tangent, Tangent, Tangent});
		};

		AppendTriangle(P0, P1, Peak);
		AppendTriangle(P1, P2, Peak);
		AppendTriangle(P2, P3, Peak);
		AppendTriangle(P3, P0, Peak);
	}

	uint32 StableGridHash(int32 X, int32 Y, int32 Salt = 0)
	{
		uint32 Value = static_cast<uint32>(X) * 0x9e3779b9u;
		Value ^= static_cast<uint32>(Y) * 0x85ebca6bu;
		Value ^= static_cast<uint32>(Salt) * 0xc2b2ae35u;
		Value ^= Value >> 16;
		Value *= 0x7feb352du;
		Value ^= Value >> 15;
		Value *= 0x846ca68bu;
		return Value ^ (Value >> 16);
	}

	FLinearColor VaryColor(const FLinearColor& Color, uint32 Hash, float Amount = 0.08f)
	{
		const float Unit = static_cast<float>(Hash & 0xffffu) / 65535.0f;
		const float Scale = 1.0f + (Unit * 2.0f - 1.0f) * Amount;
		return FLinearColor(
			FMath::Clamp(Color.R * Scale, 0.0f, 1.0f),
			FMath::Clamp(Color.G * Scale, 0.0f, 1.0f),
			FMath::Clamp(Color.B * Scale, 0.0f, 1.0f),
			Color.A);
	}

	void AppendVoxelSurfaceCell(
		FMeshBuffer& Buffer,
		const FVector2D& CenterCentimeters,
		double HalfCellCentimeters,
		double TopCentimeters,
		double EastCentimeters,
		double WestCentimeters,
		double NorthCentimeters,
		double SouthCentimeters,
		const FLinearColor& SurfaceColor,
		const FLinearColor& StrataColor)
	{
		const double MinX = CenterCentimeters.X - HalfCellCentimeters;
		const double MaxX = CenterCentimeters.X + HalfCellCentimeters;
		const double MinY = CenterCentimeters.Y - HalfCellCentimeters;
		const double MaxY = CenterCentimeters.Y + HalfCellCentimeters;
		const FTransform Identity = FTransform::Identity;

		AppendFace(
			Buffer,
			Identity,
			FVector(MinX, MinY, TopCentimeters),
			FVector(MaxX, MinY, TopCentimeters),
			FVector(MaxX, MaxY, TopCentimeters),
			FVector(MinX, MaxY, TopCentimeters),
			FVector::UpVector,
			SurfaceColor);

		const auto AppendSide = [&Buffer, &Identity, &StrataColor](
			const FVector& A,
			const FVector& B,
			const FVector& C,
			const FVector& D,
			const FVector& Normal,
			double NeighborHeight,
			double CellHeight)
		{
			if (CellHeight - NeighborHeight > 0.5)
			{
				AppendFace(Buffer, Identity, A, B, C, D, Normal, StrataColor);
			}
		};

		AppendSide(
			FVector(MaxX, MinY, EastCentimeters), FVector(MaxX, MaxY, EastCentimeters),
			FVector(MaxX, MaxY, TopCentimeters), FVector(MaxX, MinY, TopCentimeters),
			FVector::ForwardVector, EastCentimeters, TopCentimeters);
		AppendSide(
			FVector(MinX, MaxY, WestCentimeters), FVector(MinX, MinY, WestCentimeters),
			FVector(MinX, MinY, TopCentimeters), FVector(MinX, MaxY, TopCentimeters),
			-FVector::ForwardVector, WestCentimeters, TopCentimeters);
		AppendSide(
			FVector(MaxX, MaxY, NorthCentimeters), FVector(MinX, MaxY, NorthCentimeters),
			FVector(MinX, MaxY, TopCentimeters), FVector(MaxX, MaxY, TopCentimeters),
			FVector::RightVector, NorthCentimeters, TopCentimeters);
		AppendSide(
			FVector(MinX, MinY, SouthCentimeters), FVector(MaxX, MinY, SouthCentimeters),
			FVector(MaxX, MinY, TopCentimeters), FVector(MinX, MinY, TopCentimeters),
			-FVector::RightVector, SouthCentimeters, TopCentimeters);
	}

	void AppendVoxelTree(
		FMeshBuffer& PhysicalBuffer,
		FMeshBuffer& DecorativeBuffer,
		const FVector& GroundCentimeters,
		uint32 Seed,
		float Scale,
		const FLinearColor& TrunkColor,
		const FLinearColor& LeafColor)
	{
		FRandomStream Random(static_cast<int32>(Seed));
		const float HeightMeters = Random.FRandRange(8.0f, 14.5f) * Scale;
		const float TrunkRadiusMeters = Random.FRandRange(0.22f, 0.42f) * Scale;
		const float SegmentHeightMeters = HeightMeters / 6.0f;
		FVector SegmentOffset = FVector::ZeroVector;
		for (int32 Segment = 0; Segment < 6; ++Segment)
		{
			SegmentOffset.X += Random.FRandRange(-0.08f, 0.08f) * Scale * CentimetersPerMeter;
			SegmentOffset.Y += Random.FRandRange(-0.08f, 0.08f) * Scale * CentimetersPerMeter;
			const float Taper = 1.0f - Segment * 0.085f;
			AppendBox(
				PhysicalBuffer,
				GroundCentimeters + SegmentOffset + FVector(0.0, 0.0, (Segment + 0.5f) * SegmentHeightMeters * CentimetersPerMeter),
				FVector(TrunkRadiusMeters * Taper, TrunkRadiusMeters * Taper, SegmentHeightMeters * 0.5f) * CentimetersPerMeter,
				Random.FRandRange(-12.0f, 12.0f),
				VaryColor(TrunkColor, StableGridHash(Segment, static_cast<int32>(Seed), 17), 0.18f));
		}

		for (int32 Root = 0; Root < 5; ++Root)
		{
			const float Yaw = Root * 72.0f + Random.FRandRange(-15.0f, 15.0f);
			const float LengthMeters = Random.FRandRange(0.9f, 1.8f) * Scale;
			const FVector2D Direction(FMath::Cos(FMath::DegreesToRadians(Yaw)), FMath::Sin(FMath::DegreesToRadians(Yaw)));
			AppendBox(
				PhysicalBuffer,
				GroundCentimeters + FVector(Direction.X * LengthMeters * 0.42f, Direction.Y * LengthMeters * 0.42f, 0.11f) * CentimetersPerMeter,
				FVector(LengthMeters * 0.5f, TrunkRadiusMeters * 0.34f, 0.11f * Scale) * CentimetersPerMeter,
				Yaw,
				VaryColor(TrunkColor, StableGridHash(Root, static_cast<int32>(Seed), 23), 0.20f));
		}

		for (int32 Branch = 0; Branch < 7; ++Branch)
		{
			const float Yaw = Branch * (360.0f / 7.0f) + Random.FRandRange(-18.0f, 18.0f);
			const float LengthMeters = Random.FRandRange(1.4f, 3.4f) * Scale;
			const float BranchHeightMeters = HeightMeters * Random.FRandRange(0.54f, 0.84f);
			const FVector2D Direction(FMath::Cos(FMath::DegreesToRadians(Yaw)), FMath::Sin(FMath::DegreesToRadians(Yaw)));
			AppendBox(
				DecorativeBuffer,
				GroundCentimeters + FVector(Direction.X * LengthMeters * 0.42f, Direction.Y * LengthMeters * 0.42f, BranchHeightMeters) * CentimetersPerMeter,
				FVector(LengthMeters * 0.52f, TrunkRadiusMeters * 0.34f, TrunkRadiusMeters * 0.30f) * CentimetersPerMeter,
				Yaw,
				VaryColor(TrunkColor, StableGridHash(Branch, static_cast<int32>(Seed), 31), 0.17f));
		}

		const FVector CrownCenter = GroundCentimeters + SegmentOffset + FVector(0.0, 0.0, HeightMeters * 0.82f * CentimetersPerMeter);
		for (int32 Crown = 0; Crown < 11; ++Crown)
		{
			const float Angle = Random.FRandRange(0.0f, 2.0f * PI);
			const float DistanceMeters = Crown == 0 ? 0.0f : Random.FRandRange(0.45f, 2.35f) * Scale;
			const float RadiusMeters = Random.FRandRange(0.95f, 1.85f) * Scale;
			const FVector Offset(
				FMath::Cos(Angle) * DistanceMeters,
				FMath::Sin(Angle) * DistanceMeters,
				Random.FRandRange(-1.25f, 1.55f) * Scale);
			AppendBox(
				DecorativeBuffer,
				CrownCenter + Offset * CentimetersPerMeter,
				FVector(RadiusMeters, RadiusMeters * Random.FRandRange(0.72f, 1.08f), RadiusMeters * Random.FRandRange(0.55f, 0.95f)) * CentimetersPerMeter,
				Random.FRandRange(-180.0f, 180.0f),
				VaryColor(LeafColor, StableGridHash(Crown, static_cast<int32>(Seed), 41), 0.24f));
		}
	}

	void AppendGrassTuft(
		FMeshBuffer& Buffer,
		const FVector& GroundCentimeters,
		uint32 Seed,
		const FLinearColor& Color)
	{
		FRandomStream Random(static_cast<int32>(Seed));
		for (int32 Blade = 0; Blade < 5; ++Blade)
		{
			const float HeightMeters = Random.FRandRange(0.35f, 0.95f);
			const FVector Offset(Random.FRandRange(-0.85f, 0.85f), Random.FRandRange(-0.85f, 0.85f), HeightMeters * 0.5f);
			AppendBox(
				Buffer,
				GroundCentimeters + Offset * CentimetersPerMeter,
				FVector(0.05f, 0.16f, HeightMeters * 0.5f) * CentimetersPerMeter,
				Random.FRandRange(-180.0f, 180.0f),
				VaryColor(Color, StableGridHash(Blade, static_cast<int32>(Seed), 53), 0.22f));
		}
	}

	void AppendVoxelBuilding(
		FMeshBuffer& PhysicalBuffer,
		FMeshBuffer& DecorativeBuffer,
		const FVector& DoorGroundCentimeters,
		const FVector2D& ExteriorDirection,
		uint32 Seed,
		float SourceWidthMeters,
		float SourceDepthMeters,
		bool bOpenRoof,
		const FLinearColor& BrickColor,
		const FLinearColor& RoofColor)
	{
		FVector2D Outward = ExteriorDirection.GetSafeNormal();
		if (Outward.IsNearlyZero())
		{
			Outward = FVector2D(0.0, -1.0);
		}
		const FVector2D Right(-Outward.Y, Outward.X);
		FRandomStream Random(static_cast<int32>(Seed));
		const float WidthMeters = FMath::Clamp(SourceWidthMeters, 8.0f, 32.0f);
		const float DepthMeters = FMath::Clamp(SourceDepthMeters, 7.0f, 32.0f);
		const float WallHeightMeters = Random.FRandRange(4.6f, 7.2f);
		const FVector2D DoorGroundMeters(DoorGroundCentimeters.X, DoorGroundCentimeters.Y);
		const FVector2D CenterMeters = DoorGroundMeters / CentimetersPerMeter - Outward * (DepthMeters * 0.5f - 0.45f);
		const float GroundZ = DoorGroundCentimeters.Z;
		const float RightYaw = FMath::RadiansToDegrees(FMath::Atan2(Right.Y, Right.X));
		const float OutwardYaw = FMath::RadiansToDegrees(FMath::Atan2(Outward.Y, Outward.X));
		const auto WorldPoint = [&CenterMeters, &Right, &Outward, GroundZ](float LateralMeters, float ForwardMeters, float HeightMeters)
		{
			const FVector2D Horizontal = CenterMeters + Right * LateralMeters + Outward * ForwardMeters;
			return FVector(Horizontal.X * CentimetersPerMeter, Horizontal.Y * CentimetersPerMeter, GroundZ + HeightMeters * CentimetersPerMeter);
		};

		const FLinearColor FoundationColor(0.18f, 0.20f, 0.19f);
		AppendBox(
			PhysicalBuffer,
			WorldPoint(0.0f, 0.0f, 0.18f),
			FVector(WidthMeters * 0.5f + 0.35f, DepthMeters * 0.5f + 0.35f, 0.18f) * CentimetersPerMeter,
			OutwardYaw,
			FoundationColor);

		constexpr float BrickLengthMeters = 1.05f;
		constexpr float BrickDepthMeters = 0.34f;
		constexpr float BrickHeightMeters = 0.48f;
		const int32 WallRows = FMath::CeilToInt(WallHeightMeters / BrickHeightMeters);
		const int32 FrontColumns = FMath::CeilToInt(WidthMeters / BrickLengthMeters);
		const int32 SideColumns = FMath::CeilToInt(DepthMeters / BrickLengthMeters);
		const auto AddWallBrick = [&](float Lateral, float Forward, float Z, float Yaw, uint32 Hash)
		{
			AppendBox(
				PhysicalBuffer,
				WorldPoint(Lateral, Forward, Z),
				FVector(BrickLengthMeters * 0.49f, BrickDepthMeters * 0.5f, BrickHeightMeters * 0.47f) * CentimetersPerMeter,
				Yaw,
				VaryColor(BrickColor, Hash, 0.16f));
		};

		for (int32 Row = 0; Row < WallRows; ++Row)
		{
			const float Z = (Row + 0.5f) * BrickHeightMeters + 0.34f;
			const float RowOffset = (Row & 1) ? BrickLengthMeters * 0.5f : 0.0f;
			for (int32 Column = 0; Column < FrontColumns; ++Column)
			{
				const float Lateral = -WidthMeters * 0.5f + (Column + 0.5f) * BrickLengthMeters + RowOffset;
				if (Lateral > WidthMeters * 0.5f)
				{
					continue;
				}
				const bool bDoorOpening = FMath::Abs(Lateral) < 1.25f && Z < 3.15f;
				const bool bWindowOpening = FMath::Abs(Lateral) > WidthMeters * 0.23f && FMath::Abs(Lateral) < WidthMeters * 0.42f && Z > 1.25f && Z < 3.05f;
				if (!bDoorOpening && !bWindowOpening)
				{
					AddWallBrick(Lateral, DepthMeters * 0.5f, Z, RightYaw, StableGridHash(Row, Column, static_cast<int32>(Seed)));
				}
				AddWallBrick(Lateral, -DepthMeters * 0.5f, Z, RightYaw, StableGridHash(Row, Column, static_cast<int32>(Seed) + 101));
			}

			for (int32 Column = 0; Column < SideColumns; ++Column)
			{
				const float Forward = -DepthMeters * 0.5f + (Column + 0.5f) * BrickLengthMeters + RowOffset;
				if (Forward > DepthMeters * 0.5f)
				{
					continue;
				}
				const bool bWindowOpening = FMath::Abs(Forward) < DepthMeters * 0.18f && Z > 1.35f && Z < 3.1f;
				if (!bWindowOpening)
				{
					AddWallBrick(-WidthMeters * 0.5f, Forward, Z, OutwardYaw, StableGridHash(Row, Column, static_cast<int32>(Seed) + 211));
					AddWallBrick(WidthMeters * 0.5f, Forward, Z, OutwardYaw, StableGridHash(Row, Column, static_cast<int32>(Seed) + 307));
				}
			}
		}

		const FLinearColor TimberColor(0.20f, 0.10f, 0.045f);
		const FLinearColor GlassColor(0.16f, 0.36f, 0.46f);
		AppendBox(PhysicalBuffer, WorldPoint(-1.42f, DepthMeters * 0.5f, 1.65f), FVector(0.16f, 0.28f, 1.65f) * CentimetersPerMeter, RightYaw, TimberColor);
		AppendBox(PhysicalBuffer, WorldPoint(1.42f, DepthMeters * 0.5f, 1.65f), FVector(0.16f, 0.28f, 1.65f) * CentimetersPerMeter, RightYaw, TimberColor);
		AppendBox(PhysicalBuffer, WorldPoint(0.0f, DepthMeters * 0.5f, 3.15f), FVector(1.58f, 0.28f, 0.16f) * CentimetersPerMeter, RightYaw, TimberColor);
		AppendBox(DecorativeBuffer, WorldPoint(0.0f, DepthMeters * 0.5f - 0.22f, 1.55f), FVector(1.18f, 0.10f, 1.45f) * CentimetersPerMeter, RightYaw, FLinearColor(0.10f, 0.075f, 0.05f));
		for (float Side : {-1.0f, 1.0f})
		{
			const float Lateral = Side * WidthMeters * 0.325f;
			AppendBox(DecorativeBuffer, WorldPoint(Lateral, DepthMeters * 0.5f + 0.02f, 2.15f), FVector(WidthMeters * 0.085f, 0.08f, 0.78f) * CentimetersPerMeter, RightYaw, GlassColor);
			AppendBox(DecorativeBuffer, WorldPoint(Lateral, DepthMeters * 0.5f + 0.12f, 2.15f), FVector(0.05f, 0.13f, 0.82f) * CentimetersPerMeter, RightYaw, TimberColor);
		}

		for (int32 RoofLayer = 0; !bOpenRoof && RoofLayer < 5; ++RoofLayer)
		{
			const float InsetMeters = RoofLayer * 0.42f;
			AppendBox(
				PhysicalBuffer,
				WorldPoint(0.0f, 0.0f, WallHeightMeters + 0.28f + RoofLayer * 0.34f),
				FVector(
					FMath::Max(1.0f, WidthMeters * 0.5f + 0.55f - InsetMeters),
					FMath::Max(1.0f, DepthMeters * 0.5f + 0.55f - InsetMeters),
					0.20f) * CentimetersPerMeter,
				OutwardYaw,
				VaryColor(RoofColor, StableGridHash(RoofLayer, static_cast<int32>(Seed), 401), 0.13f));
		}
		if (!bOpenRoof)
		{
			AppendBox(
				PhysicalBuffer,
				WorldPoint(WidthMeters * 0.28f, -DepthMeters * 0.12f, WallHeightMeters + 2.3f),
				FVector(0.48f, 0.48f, 1.4f) * CentimetersPerMeter,
				OutwardYaw,
				VaryColor(BrickColor, StableGridHash(9, static_cast<int32>(Seed), 503), 0.10f));
		}
	}

	constexpr float WaterWetThresholdMeters = 0.0001f;
	constexpr double WaterSurfaceBiasCentimeters = 1.5;

	struct FWaterClipVertex
	{
		FVector PositionCentimeters = FVector::ZeroVector;
		FVector2D UV = FVector2D::ZeroVector;
		float DepthMeters = 0.0f;
	};

	FWaterClipVertex InterpolateWaterBoundary(const FWaterClipVertex& A, const FWaterClipVertex& B)
	{
		const float Denominator = B.DepthMeters - A.DepthMeters;
		const float Alpha = FMath::IsNearlyZero(Denominator)
			? 0.5f
			: FMath::Clamp((WaterWetThresholdMeters - A.DepthMeters) / Denominator, 0.0f, 1.0f);
		return {
			FMath::Lerp(A.PositionCentimeters, B.PositionCentimeters, Alpha),
			FMath::Lerp(A.UV, B.UV, Alpha),
			WaterWetThresholdMeters
		};
	}

	void AppendClippedWaterTriangle(
		FMeshBuffer& Buffer,
		const FWaterClipVertex& A,
		const FWaterClipVertex& B,
		const FWaterClipVertex& C,
		const FLinearColor& Color)
	{
		TArray<FWaterClipVertex, TInlineAllocator<4>> Input;
		Input.Add(A);
		Input.Add(B);
		Input.Add(C);
		TArray<FWaterClipVertex, TInlineAllocator<4>> Clipped;

		for (int32 Index = 0; Index < Input.Num(); ++Index)
		{
			const FWaterClipVertex& Current = Input[Index];
			const FWaterClipVertex& Next = Input[(Index + 1) % Input.Num()];
			const bool bCurrentWet = Current.DepthMeters > WaterWetThresholdMeters;
			const bool bNextWet = Next.DepthMeters > WaterWetThresholdMeters;
			if (bCurrentWet && bNextWet)
			{
				Clipped.Add(Next);
			}
			else if (bCurrentWet && !bNextWet)
			{
				Clipped.Add(InterpolateWaterBoundary(Current, Next));
			}
			else if (!bCurrentWet && bNextWet)
			{
				Clipped.Add(InterpolateWaterBoundary(Current, Next));
				Clipped.Add(Next);
			}
		}

		if (Clipped.Num() < 3)
		{
			return;
		}

		for (int32 TriangleIndex = 1; TriangleIndex < Clipped.Num() - 1; ++TriangleIndex)
		{
			FWaterClipVertex V0 = Clipped[0];
			FWaterClipVertex V1 = Clipped[TriangleIndex];
			FWaterClipVertex V2 = Clipped[TriangleIndex + 1];
			FVector Normal = FVector::CrossProduct(
				V1.PositionCentimeters - V0.PositionCentimeters,
				V2.PositionCentimeters - V0.PositionCentimeters).GetSafeNormal();
			if (Normal.IsNearlyZero())
			{
				continue;
			}
			if (Normal.Z < 0.0)
			{
				Swap(V1, V2);
				Normal *= -1.0;
			}

			const int32 Base = Buffer.Vertices.Num();
			Buffer.Vertices.Append({V0.PositionCentimeters, V1.PositionCentimeters, V2.PositionCentimeters});
			Buffer.Triangles.Append({Base, Base + 1, Base + 2});
			Buffer.Normals.Append({Normal, Normal, Normal});
			Buffer.UV0.Append({V0.UV, V1.UV, V2.UV});
			Buffer.Colors.Append({Color, Color, Color});
			const FProcMeshTangent Tangent((V1.PositionCentimeters - V0.PositionCentimeters).GetSafeNormal(), false);
			Buffer.Tangents.Append({Tangent, Tangent, Tangent});
		}
	}

	void SubmitMesh(UProceduralMeshComponent* Component, const FMeshBuffer& Buffer, bool bCreateCollision, int32 SectionIndex = 0)
	{
		if (Component == nullptr || Buffer.Vertices.IsEmpty())
		{
			return;
		}

		Component->CreateMeshSection_LinearColor(
			SectionIndex,
			Buffer.Vertices,
			Buffer.Triangles,
			Buffer.Normals,
			Buffer.UV0,
			Buffer.Colors,
			Buffer.Tangents,
			bCreateCollision);
	}
}

AMousecatWorldBootstrap::AMousecatWorldBootstrap()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.5f;
	SetActorEnableCollision(true);

	SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
	SetRootComponent(SceneRoot);

	WaterMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("WaterMesh"));
	WaterMesh->SetupAttachment(SceneRoot);
	WaterMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	WaterMesh->SetCastShadow(false);

}

void AMousecatWorldBootstrap::BeginPlay()
{
	Super::BeginPlay();

	ResetRuntimeChunks();
	WaterMesh->ClearAllMeshSections();
	bWorldReady = false;

	if (!ResolveAndLoadManifest())
	{
		UE_LOG(LogMousecatWorld, Error, TEXT("Mousecat World refused to start: %s"), *LoadError);
		return;
	}

	if (!BuildWorldGeometry())
	{
		if (LoadError.IsEmpty())
		{
			LoadError = TEXT("Procedural geometry generation failed.");
		}
		ResetRuntimeChunks();
		WaterMesh->ClearAllMeshSections();
		UE_LOG(LogMousecatWorld, Error, TEXT("Mousecat World failed closed during build: %s"), *LoadError);
		return;
	}

	ApplyRuntimeMaterial();
	BuildLighting();
	bWorldReady = true;
	UE_LOG(
		LogMousecatWorld,
		Display,
		TEXT("Loaded native world '%s' (%s): %d terrain chunks, %d physical object chunks, %d mapped-place chunks, %d decorative chunks, %d source maps, %d active portals, %d regions, %d trees from %s"),
		*Manifest.DisplayName,
		*Manifest.WorldId,
		TerrainChunks.Num(),
		WorldObjectChunks.Num(),
		MappedPlaceChunks.Num(),
		DecorativeObjectChunks.Num(),
		Manifest.Maps.Num(),
		RuntimePortals.Num(),
		Manifest.Regions.Num(),
		GetTreeCount(),
		*ManifestPath);
}

void AMousecatWorldBootstrap::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bWorldReady)
	{
		RefreshCollisionEnvelope();
		RefreshPortalTransitions();
	}
}

bool AMousecatWorldBootstrap::ResolveAndLoadManifest()
{
	FString ManifestFileName = TEXT("synthetic-smoke.world-manifest.json");
	FParse::Value(FCommandLine::Get(), TEXT("MousecatWorldManifest="), ManifestFileName);
	ManifestFileName.TrimQuotesInline();
	ManifestFileName.TrimStartAndEndInline();

	if (ManifestFileName.IsEmpty() || FPaths::GetCleanFilename(ManifestFileName) != ManifestFileName ||
		!FPaths::GetExtension(ManifestFileName).Equals(TEXT("json"), ESearchCase::IgnoreCase))
	{
		LoadError = TEXT("-MousecatWorldManifest must name one .json file inside Content/MousecatWorld/Generated; paths are rejected.");
		return false;
	}

	const FString GeneratedDirectory = FPaths::ConvertRelativePathToFull(
		FPaths::Combine(FPaths::ProjectContentDir(), TEXT("MousecatWorld/Generated")));
	ManifestPath = FPaths::ConvertRelativePathToFull(FPaths::Combine(GeneratedDirectory, ManifestFileName));

	FMousecatWorldManifest Candidate;
	if (!FMousecatWorldManifestLoader::LoadFromFile(ManifestPath, Candidate, LoadError))
	{
		return false;
	}

	Manifest = MoveTemp(Candidate);
	return true;
}

bool AMousecatWorldBootstrap::BuildWorldGeometry()
{
	if (!BuildTerrain())
	{
		return false;
	}
	BuildWater();
	BuildWorldObjects();
	BuildMappedPlaces();
	BuildRuntimePortals();
	return true;
}

float AMousecatWorldBootstrap::SampleTerrainHeightMeters(double X, double Y) const
{
	const FMousecatTerrainSpec& Terrain = Manifest.Terrain;
	if (!Terrain.HeightSamplesMeters.IsEmpty())
	{
		const double HalfWidth = (Terrain.Columns - 1) * Terrain.CellSizeMeters * 0.5;
		const double HalfHeight = (Terrain.Rows - 1) * Terrain.CellSizeMeters * 0.5;
		const double GridX = FMath::Clamp((X + HalfWidth) / Terrain.CellSizeMeters, 0.0, static_cast<double>(Terrain.Columns - 1));
		const double GridY = FMath::Clamp((Y + HalfHeight) / Terrain.CellSizeMeters, 0.0, static_cast<double>(Terrain.Rows - 1));
		const int32 X0 = FMath::FloorToInt(GridX);
		const int32 Y0 = FMath::FloorToInt(GridY);
		const int32 X1 = FMath::Min(X0 + 1, Terrain.Columns - 1);
		const int32 Y1 = FMath::Min(Y0 + 1, Terrain.Rows - 1);
		const float AlphaX = static_cast<float>(GridX - X0);
		const float AlphaY = static_cast<float>(GridY - Y0);
		const float H00 = Terrain.HeightSamplesMeters[Y0 * Terrain.Columns + X0];
		const float H10 = Terrain.HeightSamplesMeters[Y0 * Terrain.Columns + X1];
		const float H01 = Terrain.HeightSamplesMeters[Y1 * Terrain.Columns + X0];
		const float H11 = Terrain.HeightSamplesMeters[Y1 * Terrain.Columns + X1];
		return FMath::Lerp(FMath::Lerp(H00, H10, AlphaX), FMath::Lerp(H01, H11, AlphaX), AlphaY);
	}

	const float SeedX = static_cast<float>(Terrain.Seed % 10007) * 0.031f;
	const float SeedY = static_cast<float>(Terrain.Seed % 7907) * -0.027f;
	const float Frequency = Terrain.PrimaryFrequency;
	const FVector2D PrimaryInput(
		static_cast<double>(X * Frequency + SeedX),
		static_cast<double>(Y * Frequency + SeedY));
	const FVector2D SecondaryInput(
		static_cast<double>(X * Frequency * 3.73 - SeedY),
		static_cast<double>(Y * Frequency * 3.73 + SeedX));

	float Height = Terrain.BaseHeightMeters;
	Height += FMath::PerlinNoise2D(PrimaryInput) * Terrain.PrimaryAmplitudeMeters;
	Height += FMath::PerlinNoise2D(SecondaryInput) * Terrain.SecondaryAmplitudeMeters;

	const FVector2D SamplePosition(X, Y);
	for (const FMousecatElevationPoint& Point : Terrain.ElevationPoints)
	{
		const double DistanceSquared = FVector2D::DistSquared(SamplePosition, Point.PositionMeters);
		const double RadiusSquared = FMath::Square(static_cast<double>(Point.RadiusMeters));
		Height += Point.StrengthMeters * FMath::Exp(-DistanceSquared / FMath::Max(1.0, RadiusSquared));
	}
	return Height;
}

float AMousecatWorldBootstrap::SampleRenderedTerrainHeightMeters(double X, double Y) const
{
	return FMath::GridSnap(
		SampleTerrainHeightMeters(X, Y),
		MousecatWorldGeometry::VerticalTerrainVoxelStepMeters);
}

float AMousecatWorldBootstrap::SampleTerrainWaterDepthMeters(double X, double Y) const
{
	const FMousecatTerrainSpec& Terrain = Manifest.Terrain;
	if (Terrain.WaterDepthSamplesMeters.IsEmpty() || Terrain.Columns <= 0 || Terrain.Rows <= 0)
	{
		return 0.0f;
	}
	const double HalfWidth = (Terrain.Columns - 1) * Terrain.CellSizeMeters * 0.5;
	const double HalfHeight = (Terrain.Rows - 1) * Terrain.CellSizeMeters * 0.5;
	const double GridX = FMath::Clamp((X + HalfWidth) / Terrain.CellSizeMeters, 0.0, static_cast<double>(Terrain.Columns - 1));
	const double GridY = FMath::Clamp((Y + HalfHeight) / Terrain.CellSizeMeters, 0.0, static_cast<double>(Terrain.Rows - 1));
	const int32 X0 = FMath::FloorToInt(GridX);
	const int32 Y0 = FMath::FloorToInt(GridY);
	const int32 X1 = FMath::Min(X0 + 1, Terrain.Columns - 1);
	const int32 Y1 = FMath::Min(Y0 + 1, Terrain.Rows - 1);
	const float AlphaX = static_cast<float>(GridX - X0);
	const float AlphaY = static_cast<float>(GridY - Y0);
	const float D00 = Terrain.WaterDepthSamplesMeters[Y0 * Terrain.Columns + X0];
	const float D10 = Terrain.WaterDepthSamplesMeters[Y0 * Terrain.Columns + X1];
	const float D01 = Terrain.WaterDepthSamplesMeters[Y1 * Terrain.Columns + X0];
	const float D11 = Terrain.WaterDepthSamplesMeters[Y1 * Terrain.Columns + X1];
	return FMath::Max(0.0f, FMath::Lerp(FMath::Lerp(D00, D10, AlphaX), FMath::Lerp(D01, D11, AlphaX), AlphaY));
}

FLinearColor AMousecatWorldBootstrap::SampleTerrainColor(double X, double Y, float HeightMeters) const
{
	const FMousecatTerrainSpec& Terrain = Manifest.Terrain;
	const float Amplitude = FMath::Max(1.0f, Terrain.PrimaryAmplitudeMeters + Terrain.SecondaryAmplitudeMeters);
	const float HeightAlpha = FMath::Clamp((HeightMeters - Terrain.BaseHeightMeters + Amplitude) / (2.0f * Amplitude), 0.0f, 1.0f);
	FLinearColor BaseColor = HeightAlpha < 0.55f
		? FMath::Lerp(Terrain.LowColor, Terrain.MidColor, HeightAlpha / 0.55f)
		: FMath::Lerp(Terrain.MidColor, Terrain.HighColor, (HeightAlpha - 0.55f) / 0.45f);

	for (const FMousecatRegionSpec& Region : Manifest.Regions)
	{
		if (X >= Region.MinMeters.X && X <= Region.MaxMeters.X && Y >= Region.MinMeters.Y && Y <= Region.MaxMeters.Y)
		{
			BaseColor = FMath::Lerp(BaseColor, Region.Color, 0.22f);
			break;
		}
	}
	return BaseColor;
}

bool AMousecatWorldBootstrap::BuildTerrain()
{
	using namespace MousecatWorldGeometry;
	constexpr int32 SourceChunkCells = 32;

	const FMousecatTerrainSpec& Terrain = Manifest.Terrain;
	const int64 SourceSampleCount = static_cast<int64>(Terrain.Columns) * Terrain.Rows;
	if (SourceSampleCount <= 0 || SourceSampleCount > 300000)
	{
		LoadError = TEXT("Terrain vertex count is outside the native shell safety budget.");
		return false;
	}

	const double HalfWidth = (Terrain.Columns - 1) * Terrain.CellSizeMeters * 0.5;
	const double HalfHeight = (Terrain.Rows - 1) * Terrain.CellSizeMeters * 0.5;
	const int32 Subdivisions = FMath::Max(
		1,
		FMath::CeilToInt(Terrain.CellSizeMeters / TargetTerrainVoxelCellMeters));
	const double VoxelCellMeters = Terrain.CellSizeMeters / Subdivisions;
	const int32 RenderColumns = (Terrain.Columns - 1) * Subdivisions;
	const int32 RenderRows = (Terrain.Rows - 1) * Subdivisions;
	const int64 RenderCellCount = static_cast<int64>(RenderColumns) * RenderRows;
	if (RenderCellCount <= 0 || RenderCellCount > 600000)
	{
		LoadError = TEXT("Voxel terrain cell count is outside the native runtime safety budget.");
		return false;
	}

	TArray<float> Heights;
	Heights.SetNumUninitialized(static_cast<int32>(RenderCellCount));
	for (int32 Row = 0; Row < RenderRows; ++Row)
	{
		for (int32 Column = 0; Column < RenderColumns; ++Column)
		{
			const double X = (Column + 0.5) * VoxelCellMeters - HalfWidth;
			const double Y = (Row + 0.5) * VoxelCellMeters - HalfHeight;
			Heights[Row * RenderColumns + Column] = SampleRenderedTerrainHeightMeters(X, Y);
		}
	}

	const int32 RenderChunkCells = SourceChunkCells * Subdivisions;
	const int32 ChunkCountX = FMath::DivideAndRoundUp(RenderColumns, RenderChunkCells);
	const int32 ChunkCountY = FMath::DivideAndRoundUp(RenderRows, RenderChunkCells);
	const FVector2D SpawnMeters(Manifest.PlayerSpawnMeters.X, Manifest.PlayerSpawnMeters.Y);
	for (int32 ChunkY = 0; ChunkY < ChunkCountY; ++ChunkY)
	{
		for (int32 ChunkX = 0; ChunkX < ChunkCountX; ++ChunkX)
		{
			const int32 StartColumn = ChunkX * RenderChunkCells;
			const int32 StartRow = ChunkY * RenderChunkCells;
			const int32 EndColumn = FMath::Min(StartColumn + RenderChunkCells, RenderColumns);
			const int32 EndRow = FMath::Min(StartRow + RenderChunkCells, RenderRows);
			const int32 LocalColumns = EndColumn - StartColumn;
			const int32 LocalRows = EndRow - StartRow;

			FMeshBuffer Buffer;
			const int32 LocalCellCount = LocalColumns * LocalRows;
			Buffer.Vertices.Reserve(LocalCellCount * 8);
			Buffer.Normals.Reserve(LocalCellCount * 8);
			Buffer.UV0.Reserve(LocalCellCount * 8);
			Buffer.Colors.Reserve(LocalCellCount * 8);
			Buffer.Tangents.Reserve(LocalCellCount * 8);
			Buffer.Triangles.Reserve(LocalCellCount * 12);

			for (int32 Row = StartRow; Row < EndRow; ++Row)
			{
				for (int32 Column = StartColumn; Column < EndColumn; ++Column)
				{
					const int32 Index = Row * RenderColumns + Column;
					const double X = (Column + 0.5) * VoxelCellMeters - HalfWidth;
					const double Y = (Row + 0.5) * VoxelCellMeters - HalfHeight;
					const float Height = Heights[Index];
					const float West = Column > 0 ? Heights[Index - 1] : Height - 2.0f;
					const float East = Column + 1 < RenderColumns ? Heights[Index + 1] : Height - 2.0f;
					const float South = Row > 0 ? Heights[Index - RenderColumns] : Height - 2.0f;
					const float North = Row + 1 < RenderRows ? Heights[Index + RenderColumns] : Height - 2.0f;
					const float LocalRelief = FMath::Max(
						FMath::Max(FMath::Abs(Height - West), FMath::Abs(Height - East)),
						FMath::Max(FMath::Abs(Height - South), FMath::Abs(Height - North)));
					const uint32 Hash = StableGridHash(Column, Row, Terrain.Seed);
					FLinearColor SurfaceColor = VaryColor(SampleTerrainColor(X, Y, Height), Hash, 0.10f);
					if (LocalRelief > 0.75f)
					{
						SurfaceColor = FMath::Lerp(SurfaceColor, FLinearColor(0.28f, 0.25f, 0.19f), 0.28f);
					}
					const FLinearColor StrataColor = VaryColor(
						LocalRelief > 1.75f
							? FLinearColor(0.29f, 0.30f, 0.28f)
							: FLinearColor(0.30f, 0.22f, 0.13f),
						Hash ^ 0xa5a5a5a5u,
						0.12f);
					AppendVoxelSurfaceCell(
						Buffer,
						FVector2D(X, Y) * CentimetersPerMeter,
						VoxelCellMeters * CentimetersPerMeter * 0.5,
						Height * CentimetersPerMeter,
						East * CentimetersPerMeter,
						West * CentimetersPerMeter,
						North * CentimetersPerMeter,
						South * CentimetersPerMeter,
						SurfaceColor,
						StrataColor);
				}
			}

			const FVector2D CenterMeters(
				((StartColumn + EndColumn) * 0.5) * VoxelCellMeters - HalfWidth,
				((StartRow + EndRow) * 0.5) * VoxelCellMeters - HalfHeight);
			const double HalfChunkWidth = (EndColumn - StartColumn) * VoxelCellMeters * 0.5;
			const double HalfChunkHeight = (EndRow - StartRow) * VoxelCellMeters * 0.5;
			const double ChunkRadius = FVector2D(HalfChunkWidth, HalfChunkHeight).Size();
			const bool bEnableCollision = FVector2D::Distance(SpawnMeters, CenterMeters) <= Terrain.CollisionRadiusMeters + ChunkRadius;
			const FIntPoint Coordinate(ChunkX, ChunkY);
			UProceduralMeshComponent* ChunkMesh = CreateChunkComponent(TEXT("TerrainChunk"), Coordinate, bEnableCollision, true);
			SubmitMesh(ChunkMesh, Buffer, bEnableCollision);
			if (ChunkMesh != nullptr)
			{
				// The spawn envelope was cooked synchronously; later streamed collision may cook asynchronously.
				ChunkMesh->bUseAsyncCooking = true;
			}
			TerrainChunks.Add({ChunkMesh, Coordinate, CenterMeters, bEnableCollision});
		}
	}

	return !TerrainChunks.IsEmpty();
}

void AMousecatWorldBootstrap::BuildWater()
{
	using namespace MousecatWorldGeometry;
	constexpr int32 ChunkCells = 16;

	const FMousecatTerrainSpec& Terrain = Manifest.Terrain;
	const double HalfWidthCm = (Terrain.Columns - 1) * Terrain.CellSizeMeters * 0.5 * CentimetersPerMeter;
	const double HalfHeightCm = (Terrain.Rows - 1) * Terrain.CellSizeMeters * 0.5 * CentimetersPerMeter;
	if (!Terrain.WaterDepthSamplesMeters.IsEmpty())
	{
		const double HalfWidthMeters = HalfWidthCm / CentimetersPerMeter;
		const double HalfHeightMeters = HalfHeightCm / CentimetersPerMeter;
		const int32 ChunkCountX = FMath::DivideAndRoundUp(Terrain.Columns - 1, ChunkCells);
		const int32 ChunkCountY = FMath::DivideAndRoundUp(Terrain.Rows - 1, ChunkCells);
		for (int32 ChunkY = 0; ChunkY < ChunkCountY; ++ChunkY)
		{
			for (int32 ChunkX = 0; ChunkX < ChunkCountX; ++ChunkX)
			{
				const int32 StartColumn = ChunkX * ChunkCells;
				const int32 StartRow = ChunkY * ChunkCells;
				const int32 EndColumn = FMath::Min(StartColumn + ChunkCells, Terrain.Columns - 1);
				const int32 EndRow = FMath::Min(StartRow + ChunkCells, Terrain.Rows - 1);
				FMeshBuffer Buffer;

				for (int32 Row = StartRow; Row < EndRow; ++Row)
				{
					for (int32 Column = StartColumn; Column < EndColumn; ++Column)
					{
						const int32 I00 = Row * Terrain.Columns + Column;
						const int32 I10 = I00 + 1;
						const int32 I01 = I00 + Terrain.Columns;
						const int32 I11 = I01 + 1;
						const float D00 = Terrain.WaterDepthSamplesMeters[I00];
						const float D10 = Terrain.WaterDepthSamplesMeters[I10];
						const float D01 = Terrain.WaterDepthSamplesMeters[I01];
						const float D11 = Terrain.WaterDepthSamplesMeters[I11];
						if (FMath::Max(FMath::Max(D00, D10), FMath::Max(D01, D11)) <= WaterWetThresholdMeters)
						{
							continue;
						}

						const double X0 = Column * Terrain.CellSizeMeters - HalfWidthMeters;
						const double X1 = (Column + 1) * Terrain.CellSizeMeters - HalfWidthMeters;
						const double Y0 = Row * Terrain.CellSizeMeters - HalfHeightMeters;
						const double Y1 = (Row + 1) * Terrain.CellSizeMeters - HalfHeightMeters;
						const auto MakeWaterVertex = [&Terrain](double X, double Y, int32 SampleIndex, float Depth, const FVector2D& UV)
						{
							return FWaterClipVertex{
								FVector(
									X * CentimetersPerMeter,
									Y * CentimetersPerMeter,
									(Terrain.HeightSamplesMeters[SampleIndex] + Depth) * CentimetersPerMeter + WaterSurfaceBiasCentimeters),
								UV,
								Depth
							};
						};
						const FWaterClipVertex V00 = MakeWaterVertex(X0, Y0, I00, D00, FVector2D(0.0, 0.0));
						const FWaterClipVertex V10 = MakeWaterVertex(X1, Y0, I10, D10, FVector2D(1.0, 0.0));
						const FWaterClipVertex V01 = MakeWaterVertex(X0, Y1, I01, D01, FVector2D(0.0, 1.0));
						const FWaterClipVertex V11 = MakeWaterVertex(X1, Y1, I11, D11, FVector2D(1.0, 1.0));

						// Match the terrain diagonal: [00,10,01] and [10,11,01]. Each triangle is clipped by depth sign.
						AppendClippedWaterTriangle(Buffer, V00, V10, V01, Terrain.WaterColor);
						AppendClippedWaterTriangle(Buffer, V10, V11, V01, Terrain.WaterColor);
					}
				}

				const int32 SectionIndex = ChunkY * ChunkCountX + ChunkX;
				SubmitMesh(WaterMesh, Buffer, false, SectionIndex);
			}
		}
		return;
	}

	const double WaterZ = Terrain.WaterLevelMeters * CentimetersPerMeter;

	FMeshBuffer Buffer;
	Buffer.Vertices.Append({
		FVector(-HalfWidthCm, -HalfHeightCm, WaterZ),
		FVector(HalfWidthCm, -HalfHeightCm, WaterZ),
		FVector(HalfWidthCm, HalfHeightCm, WaterZ),
		FVector(-HalfWidthCm, HalfHeightCm, WaterZ)
	});
	Buffer.Triangles.Append({0, 1, 2, 0, 2, 3});
	Buffer.Normals.Init(FVector::UpVector, 4);
	Buffer.UV0.Append({FVector2D(0.0, 0.0), FVector2D(8.0, 0.0), FVector2D(8.0, 8.0), FVector2D(0.0, 8.0)});
	Buffer.Colors.Init(Terrain.WaterColor, 4);
	Buffer.Tangents.Init(FProcMeshTangent(FVector::ForwardVector, false), 4);
	SubmitMesh(WaterMesh, Buffer, false);
}

void AMousecatWorldBootstrap::BuildWorldObjects()
{
	using namespace MousecatWorldGeometry;
	constexpr int32 ChunkCells = 16;

	const FMousecatTerrainSpec& Terrain = Manifest.Terrain;
	const double HalfWidth = (Terrain.Columns - 1) * Terrain.CellSizeMeters * 0.5;
	const double HalfHeight = (Terrain.Rows - 1) * Terrain.CellSizeMeters * 0.5;
	const int32 ChunkCountX = FMath::DivideAndRoundUp(Terrain.Columns - 1, ChunkCells);
	const int32 ChunkCountY = FMath::DivideAndRoundUp(Terrain.Rows - 1, ChunkCells);
	const auto ResolveChunkCoordinate = [&Terrain, HalfWidth, HalfHeight, ChunkCountX, ChunkCountY](const FVector2D& Position)
	{
		const int32 CellX = FMath::Clamp(FMath::FloorToInt((Position.X + HalfWidth) / Terrain.CellSizeMeters), 0, Terrain.Columns - 2);
		const int32 CellY = FMath::Clamp(FMath::FloorToInt((Position.Y + HalfHeight) / Terrain.CellSizeMeters), 0, Terrain.Rows - 2);
		return FIntPoint(
			FMath::Clamp(CellX / ChunkCells, 0, ChunkCountX - 1),
			FMath::Clamp(CellY / ChunkCells, 0, ChunkCountY - 1));
	};

	TMap<FIntPoint, FMeshBuffer> PhysicalChunkBuffers;
	TMap<FIntPoint, FMeshBuffer> DecorativeChunkBuffers;
	TMap<FIntPoint, FMeshBuffer> SemanticChunkBuffers;
	const bool bShowSemanticMarkers = FParse::Param(FCommandLine::Get(), TEXT("MousecatWorldShowSemanticMarkers"));
	for (const FMousecatLandmarkSpec& Landmark : Manifest.Landmarks)
	{
		const float SurfaceZ = SampleRenderedTerrainHeightMeters(Landmark.PositionMeters.X, Landmark.PositionMeters.Y);
		const FIntPoint Coordinate = ResolveChunkCoordinate(Landmark.PositionMeters);
		const bool bPhysicalPrimitive =
			Landmark.Kind.Equals(TEXT("building"), ESearchCase::IgnoreCase) ||
			Landmark.Kind.Equals(TEXT("structure"), ESearchCase::IgnoreCase) ||
			Landmark.Kind.Equals(TEXT("civic"), ESearchCase::IgnoreCase) ||
			Landmark.Kind.Equals(TEXT("settlement"), ESearchCase::IgnoreCase) ||
			Landmark.Kind.Equals(TEXT("station"), ESearchCase::IgnoreCase);

		if (bPhysicalPrimitive)
		{
			FMeshBuffer& Buffer = PhysicalChunkBuffers.FindOrAdd(Coordinate);
			const FVector SizeCm = Landmark.SizeMeters * CentimetersPerMeter;
			const FVector BaseCenter(
				Landmark.PositionMeters.X * CentimetersPerMeter,
				Landmark.PositionMeters.Y * CentimetersPerMeter,
				(SurfaceZ + Landmark.SizeMeters.Z * 0.5f) * CentimetersPerMeter);
			AppendBox(Buffer, BaseCenter, SizeCm * 0.5, Landmark.YawDegrees, Landmark.Color);

			if (Landmark.Kind.Equals(TEXT("settlement"), ESearchCase::IgnoreCase) ||
				Landmark.Kind.Equals(TEXT("civic"), ESearchCase::IgnoreCase))
			{
				const FVector RoofBase = BaseCenter + FVector(0.0, 0.0, SizeCm.Z * 0.5);
				AppendPyramid(
					Buffer,
					RoofBase,
					FVector(SizeCm.X * 0.58, SizeCm.Y * 0.58, 0.0),
					FMath::Max(150.0f, static_cast<float>(SizeCm.Z * 0.3)),
					Landmark.YawDegrees,
					Landmark.Color * 0.65f);
			}
		}
		else if (bShowSemanticMarkers)
		{
			// Map/city/route/forest/interior records are semantic envelopes, not decoded physical structures.
			// Optional diagnostics show a small non-colliding locator; playable defaults render no fake pins.
			FMeshBuffer& MarkerBuffer = SemanticChunkBuffers.FindOrAdd(Coordinate);
			const FVector MarkerCenter(
				Landmark.PositionMeters.X * CentimetersPerMeter,
				Landmark.PositionMeters.Y * CentimetersPerMeter,
				(SurfaceZ + 2.0f) * CentimetersPerMeter);
			AppendBox(
				MarkerBuffer,
				MarkerCenter,
				FVector(0.55, 0.55, 2.0) * CentimetersPerMeter,
				Landmark.YawDegrees,
				Landmark.Color);
		}
	}

	for (const FMousecatGroveSpec& Grove : Manifest.Groves)
	{
		FRandomStream Random(Grove.Seed);
		for (int32 TreeIndex = 0; TreeIndex < Grove.Count; ++TreeIndex)
		{
			const float Angle = Random.FRandRange(0.0f, 2.0f * PI);
			const float Radius = Grove.RadiusMeters * FMath::Sqrt(Random.FRand());
			const FVector2D Position = Grove.CenterMeters + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * Radius;
			const FIntPoint Coordinate = ResolveChunkCoordinate(Position);
			FMeshBuffer& TrunkBuffer = PhysicalChunkBuffers.FindOrAdd(Coordinate);
			FMeshBuffer& CrownBuffer = DecorativeChunkBuffers.FindOrAdd(Coordinate);
			const float SurfaceZ = SampleRenderedTerrainHeightMeters(Position.X, Position.Y);
			const float HeightMeters = Random.FRandRange(6.5f, 13.5f);
			const float TrunkRadiusMeters = Random.FRandRange(0.18f, 0.38f);
			const float CanopyRadiusMeters = Random.FRandRange(1.5f, 3.0f);
			const float TreeYaw = Random.FRandRange(-180.0f, 180.0f);
			const FVector TrunkOrigin(
				Position.X * CentimetersPerMeter,
				Position.Y * CentimetersPerMeter,
				SurfaceZ * CentimetersPerMeter);
			AppendBox(
				TrunkBuffer,
				TrunkOrigin + FVector(0.0, 0.0, HeightMeters * 0.18f * CentimetersPerMeter),
				FVector(TrunkRadiusMeters * 1.25f, TrunkRadiusMeters * 1.15f, HeightMeters * 0.18f) * CentimetersPerMeter,
				TreeYaw,
				VaryColor(Grove.TrunkColor, StableGridHash(TreeIndex, Grove.Seed, 1), 0.13f));
			AppendPyramid(
				TrunkBuffer,
				TrunkOrigin + FVector(0.0, 0.0, HeightMeters * 0.34f * CentimetersPerMeter),
				FVector(TrunkRadiusMeters * 1.05f, TrunkRadiusMeters, 0.0f) * CentimetersPerMeter,
				HeightMeters * 0.46f * CentimetersPerMeter,
				TreeYaw,
				VaryColor(Grove.TrunkColor, StableGridHash(TreeIndex, Grove.Seed, 2), 0.11f));

			for (int32 RootIndex = 0; RootIndex < 4; ++RootIndex)
			{
				const float RootYaw = TreeYaw + RootIndex * 90.0f + Random.FRandRange(-18.0f, 18.0f);
				const float RootLength = Random.FRandRange(0.65f, 1.35f);
				const FVector2D Direction(FMath::Cos(FMath::DegreesToRadians(RootYaw)), FMath::Sin(FMath::DegreesToRadians(RootYaw)));
				AppendBox(
					TrunkBuffer,
					FVector(
						(Position.X + Direction.X * RootLength * 0.45f) * CentimetersPerMeter,
						(Position.Y + Direction.Y * RootLength * 0.45f) * CentimetersPerMeter,
						(SurfaceZ + 0.10f) * CentimetersPerMeter),
					FVector(RootLength * 0.5f, TrunkRadiusMeters * 0.38f, 0.10f) * CentimetersPerMeter,
					RootYaw,
					VaryColor(Grove.TrunkColor, StableGridHash(TreeIndex, RootIndex, Grove.Seed), 0.16f));
			}

			for (int32 BranchIndex = 0; BranchIndex < 4; ++BranchIndex)
			{
				const float BranchYaw = TreeYaw + BranchIndex * 87.0f + Random.FRandRange(-24.0f, 24.0f);
				const float BranchLength = Random.FRandRange(CanopyRadiusMeters * 0.65f, CanopyRadiusMeters * 1.15f);
				const FVector2D Direction(FMath::Cos(FMath::DegreesToRadians(BranchYaw)), FMath::Sin(FMath::DegreesToRadians(BranchYaw)));
				const float BranchZ = SurfaceZ + HeightMeters * Random.FRandRange(0.58f, 0.78f);
				AppendBox(
					CrownBuffer,
					FVector(
						(Position.X + Direction.X * BranchLength * 0.45f) * CentimetersPerMeter,
						(Position.Y + Direction.Y * BranchLength * 0.45f) * CentimetersPerMeter,
						BranchZ * CentimetersPerMeter),
					FVector(BranchLength * 0.52f, TrunkRadiusMeters * 0.38f, TrunkRadiusMeters * 0.32f) * CentimetersPerMeter,
					BranchYaw,
					VaryColor(Grove.TrunkColor, StableGridHash(TreeIndex, BranchIndex, 91), 0.16f));
			}

			const FVector CanopyCenter(
				Position.X * CentimetersPerMeter,
				Position.Y * CentimetersPerMeter,
				(SurfaceZ + HeightMeters * 0.82f) * CentimetersPerMeter);
			for (int32 CrownIndex = 0; CrownIndex < 7; ++CrownIndex)
			{
				const float CrownAngle = Random.FRandRange(0.0f, 2.0f * PI);
				const float CrownDistance = CrownIndex == 0 ? 0.0f : Random.FRandRange(CanopyRadiusMeters * 0.25f, CanopyRadiusMeters * 0.80f);
				const float CrownScale = Random.FRandRange(0.58f, 1.02f);
				const FVector Offset(
					FMath::Cos(CrownAngle) * CrownDistance,
					FMath::Sin(CrownAngle) * CrownDistance,
					Random.FRandRange(-CanopyRadiusMeters * 0.30f, CanopyRadiusMeters * 0.45f));
				AppendBox(
					CrownBuffer,
					CanopyCenter + Offset * CentimetersPerMeter,
					FVector(
						CanopyRadiusMeters * CrownScale,
						CanopyRadiusMeters * CrownScale * Random.FRandRange(0.72f, 1.0f),
						CanopyRadiusMeters * CrownScale * Random.FRandRange(0.48f, 0.82f)) * CentimetersPerMeter,
					Random.FRandRange(-180.0f, 180.0f),
					VaryColor(Grove.CanopyColor, StableGridHash(TreeIndex, CrownIndex, Grove.Seed), 0.20f));
			}
		}
	}

	const FVector2D SpawnMeters(Manifest.PlayerSpawnMeters.X, Manifest.PlayerSpawnMeters.Y);
	const auto EmitChunkBuffers = [
		this,
		&Terrain,
		&SpawnMeters,
		HalfWidth,
		HalfHeight,
		ChunkCountX,
		ChunkCountY](
			const TMap<FIntPoint, FMeshBuffer>& ChunkBuffers,
			const TCHAR* Prefix,
			bool bPhysical,
			TArray<FRuntimeChunk>& OutChunks)
	{
		for (int32 ChunkY = 0; ChunkY < ChunkCountY; ++ChunkY)
		{
			for (int32 ChunkX = 0; ChunkX < ChunkCountX; ++ChunkX)
			{
				const FIntPoint Coordinate(ChunkX, ChunkY);
				const FMeshBuffer* Buffer = ChunkBuffers.Find(Coordinate);
				if (Buffer == nullptr || Buffer->Vertices.IsEmpty())
				{
					continue;
				}

				const int32 StartColumn = ChunkX * ChunkCells;
				const int32 StartRow = ChunkY * ChunkCells;
				const int32 EndColumn = FMath::Min(StartColumn + ChunkCells, Terrain.Columns - 1);
				const int32 EndRow = FMath::Min(StartRow + ChunkCells, Terrain.Rows - 1);
				const FVector2D CenterMeters(
					((StartColumn + EndColumn) * 0.5) * Terrain.CellSizeMeters - HalfWidth,
					((StartRow + EndRow) * 0.5) * Terrain.CellSizeMeters - HalfHeight);
				const double HalfChunkWidth = (EndColumn - StartColumn) * Terrain.CellSizeMeters * 0.5;
				const double HalfChunkHeight = (EndRow - StartRow) * Terrain.CellSizeMeters * 0.5;
				const double ChunkRadius = FVector2D(HalfChunkWidth, HalfChunkHeight).Size();
				const bool bEnableCollision = bPhysical &&
					FVector2D::Distance(SpawnMeters, CenterMeters) <= Terrain.CollisionRadiusMeters + ChunkRadius;
				UProceduralMeshComponent* ChunkMesh = CreateChunkComponent(Prefix, Coordinate, bEnableCollision, bPhysical);
				SubmitMesh(ChunkMesh, *Buffer, bEnableCollision);
				if (ChunkMesh != nullptr && bEnableCollision)
				{
					ChunkMesh->bUseAsyncCooking = true;
				}
				OutChunks.Add({ChunkMesh, Coordinate, CenterMeters, bEnableCollision});
			}
		}
	};

	EmitChunkBuffers(PhysicalChunkBuffers, TEXT("ObjectChunk"), true, WorldObjectChunks);
	EmitChunkBuffers(DecorativeChunkBuffers, TEXT("DecorationChunk"), false, DecorativeObjectChunks);
	EmitChunkBuffers(SemanticChunkBuffers, TEXT("SemanticMarkerChunk"), false, SemanticMarkerChunks);
}

void AMousecatWorldBootstrap::BuildMappedPlaces()
{
	using namespace MousecatWorldGeometry;
	constexpr float ChunkSizeMeters = 128.0f;
	constexpr float SurfaceLiftMeters = 0.055f;

	TMap<FIntPoint, FMeshBuffer> PhysicalBuffers;
	TMap<FIntPoint, FMeshBuffer> DecorativeBuffers;
	TMap<FIntPoint, FMeshBuffer> WaterBuffers;
	const auto ChunkFor = [](const FVector2D& PositionMeters)
	{
		return FIntPoint(
			FMath::FloorToInt(PositionMeters.X / ChunkSizeMeters),
			FMath::FloorToInt(PositionMeters.Y / ChunkSizeMeters));
	};
	const auto AddRock = [](FMeshBuffer& Buffer, const FVector& GroundCentimeters, uint32 Seed)
	{
		FRandomStream Random(static_cast<int32>(Seed));
		const int32 Pieces = Random.RandRange(2, 4);
		for (int32 Piece = 0; Piece < Pieces; ++Piece)
		{
			const float Radius = Random.FRandRange(0.22f, 0.62f);
			const FVector Offset(Random.FRandRange(-0.35f, 0.35f), Random.FRandRange(-0.35f, 0.35f), Radius * 0.55f);
			AppendBox(
				Buffer,
				GroundCentimeters + Offset * CentimetersPerMeter,
				FVector(Radius, Radius * Random.FRandRange(0.7f, 1.1f), Radius * Random.FRandRange(0.45f, 0.8f)) * CentimetersPerMeter,
				Random.FRandRange(-180.0f, 180.0f),
				VaryColor(FLinearColor(0.30f, 0.31f, 0.29f), StableGridHash(Piece, static_cast<int32>(Seed), 71), 0.22f));
		}
	};
	const auto AddInteriorWall = [](FMeshBuffer& Physical, FMeshBuffer& Decorative, const FVector& GroundCentimeters, float CellMeters, uint32 Seed)
	{
		const float HalfCell = CellMeters * 0.47f;
		constexpr float WallHeightMeters = 3.4f;
		AppendBox(
			Physical,
			GroundCentimeters + FVector(0.0, 0.0, WallHeightMeters * 0.5f * CentimetersPerMeter),
			FVector(HalfCell, HalfCell, WallHeightMeters * 0.5f) * CentimetersPerMeter,
			0.0f,
			FLinearColor(0.24f, 0.22f, 0.19f));

		const int32 EstimatedColumns = FMath::Max(1, FMath::CeilToInt(CellMeters / 1.15f));
		const float BrickLength = FMath::Clamp(CellMeters / EstimatedColumns, 0.72f, 1.15f);
		const int32 Columns = FMath::Max(2, FMath::CeilToInt(CellMeters / BrickLength));
		constexpr float BrickHeight = 0.52f;
		const int32 Rows = FMath::CeilToInt(WallHeightMeters / BrickHeight);
		const FLinearColor BrickColor(0.43f, 0.38f, 0.31f);
		for (int32 Row = 0; Row < Rows; ++Row)
		{
			const float Z = (Row + 0.5f) * BrickHeight;
			const float Stagger = (Row & 1) ? BrickLength * 0.5f : 0.0f;
			for (int32 Column = 0; Column < Columns; ++Column)
			{
				const float Along = -HalfCell + (Column + 0.5f) * BrickLength + Stagger;
				if (Along > HalfCell)
				{
					continue;
				}
				const FLinearColor Color = VaryColor(BrickColor, StableGridHash(Row, Column, static_cast<int32>(Seed)), 0.13f);
				AppendBox(Decorative, GroundCentimeters + FVector(Along, HalfCell + 0.03f, Z) * CentimetersPerMeter, FVector(BrickLength * 0.48f, 0.05f, BrickHeight * 0.46f) * CentimetersPerMeter, 0.0f, Color);
				AppendBox(Decorative, GroundCentimeters + FVector(Along, -HalfCell - 0.03f, Z) * CentimetersPerMeter, FVector(BrickLength * 0.48f, 0.05f, BrickHeight * 0.46f) * CentimetersPerMeter, 0.0f, Color);
				AppendBox(Decorative, GroundCentimeters + FVector(HalfCell + 0.03f, Along, Z) * CentimetersPerMeter, FVector(BrickLength * 0.48f, 0.05f, BrickHeight * 0.46f) * CentimetersPerMeter, 90.0f, Color);
				AppendBox(Decorative, GroundCentimeters + FVector(-HalfCell - 0.03f, Along, Z) * CentimetersPerMeter, FVector(BrickLength * 0.48f, 0.05f, BrickHeight * 0.46f) * CentimetersPerMeter, 90.0f, Color);
			}
		}
	};
	const int32 TerrainSubdivisions = FMath::Max(
		1,
		FMath::CeilToInt(Manifest.Terrain.CellSizeMeters / TargetTerrainVoxelCellMeters));
	const double OwnershipCellMeters = Manifest.Terrain.CellSizeMeters / TerrainSubdivisions;
	const double TerrainHalfWidthMeters =
		(Manifest.Terrain.Columns - 1) * Manifest.Terrain.CellSizeMeters * 0.5;
	const double TerrainHalfHeightMeters =
		(Manifest.Terrain.Rows - 1) * Manifest.Terrain.CellSizeMeters * 0.5;
	const auto OwnershipKeyFor = [OwnershipCellMeters, TerrainHalfWidthMeters, TerrainHalfHeightMeters](const FVector2D& PositionMeters)
	{
		return FIntPoint(
			FMath::FloorToInt((PositionMeters.X + TerrainHalfWidthMeters) / OwnershipCellMeters),
			FMath::FloorToInt((PositionMeters.Y + TerrainHalfHeightMeters) / OwnershipCellMeters));
	};
	const auto OwnershipCenterForKey = [OwnershipCellMeters, TerrainHalfWidthMeters, TerrainHalfHeightMeters](const FIntPoint& Key)
	{
		return FVector2D(
			-TerrainHalfWidthMeters + (Key.X + 0.5) * OwnershipCellMeters,
			-TerrainHalfHeightMeters + (Key.Y + 0.5) * OwnershipCellMeters);
	};
	TMap<FIntPoint, int32> HighestPriorityByCell;
	for (const FMousecatMapSpec& CandidateMap : Manifest.Maps)
	{
		for (int32 CandidateRow = 0; CandidateRow < CandidateMap.Rows; ++CandidateRow)
		{
			for (int32 CandidateColumn = 0; CandidateColumn < CandidateMap.Columns; ++CandidateColumn)
			{
				const FVector Center = CandidateMap.GetLocalCellCenterMeters(CandidateColumn, CandidateRow, Manifest.CoordinateTransform);
				const double MinX = Center.X - CandidateMap.SourceCellSizeMeters.X * 0.5;
				const double MaxX = Center.X + CandidateMap.SourceCellSizeMeters.X * 0.5;
				const double MinY = Center.Y - CandidateMap.SourceCellSizeMeters.Y * 0.5;
				const double MaxY = Center.Y + CandidateMap.SourceCellSizeMeters.Y * 0.5;
				const int32 StartKeyX = FMath::FloorToInt((MinX + TerrainHalfWidthMeters) / OwnershipCellMeters);
				const int32 EndKeyX = FMath::CeilToInt((MaxX + TerrainHalfWidthMeters) / OwnershipCellMeters) - 1;
				const int32 StartKeyY = FMath::FloorToInt((MinY + TerrainHalfHeightMeters) / OwnershipCellMeters);
				const int32 EndKeyY = FMath::CeilToInt((MaxY + TerrainHalfHeightMeters) / OwnershipCellMeters) - 1;
				for (int32 KeyY = StartKeyY; KeyY <= EndKeyY; ++KeyY)
				{
					for (int32 KeyX = StartKeyX; KeyX <= EndKeyX; ++KeyX)
					{
						const FIntPoint Key(KeyX, KeyY);
						const FVector2D SubcellCenter = OwnershipCenterForKey(Key);
						if (SubcellCenter.X < MinX || SubcellCenter.X >= MaxX ||
							SubcellCenter.Y < MinY || SubcellCenter.Y >= MaxY)
						{
							continue;
						}
						int32& Priority = HighestPriorityByCell.FindOrAdd(Key, CandidateMap.Priority);
						Priority = FMath::Max(Priority, CandidateMap.Priority);
					}
				}
			}
		}
	}
	const auto GatherOwnedSubcells = [
		&HighestPriorityByCell,
		&OwnershipCenterForKey,
		OwnershipCellMeters,
		TerrainHalfWidthMeters,
		TerrainHalfHeightMeters](
		const FMousecatMapSpec& Map,
		const FVector2D& CellCenterMeters,
		float CellWidthMeters,
		float CellHeightMeters,
		TArray<FVector2D, TInlineAllocator<16>>& OutCenters)
	{
		OutCenters.Reset();
		const double MinX = CellCenterMeters.X - CellWidthMeters * 0.5;
		const double MaxX = CellCenterMeters.X + CellWidthMeters * 0.5;
		const double MinY = CellCenterMeters.Y - CellHeightMeters * 0.5;
		const double MaxY = CellCenterMeters.Y + CellHeightMeters * 0.5;
		const int32 StartKeyX = FMath::FloorToInt((MinX + TerrainHalfWidthMeters) / OwnershipCellMeters);
		const int32 EndKeyX = FMath::CeilToInt((MaxX + TerrainHalfWidthMeters) / OwnershipCellMeters) - 1;
		const int32 StartKeyY = FMath::FloorToInt((MinY + TerrainHalfHeightMeters) / OwnershipCellMeters);
		const int32 EndKeyY = FMath::CeilToInt((MaxY + TerrainHalfHeightMeters) / OwnershipCellMeters) - 1;
		for (int32 KeyY = StartKeyY; KeyY <= EndKeyY; ++KeyY)
		{
			for (int32 KeyX = StartKeyX; KeyX <= EndKeyX; ++KeyX)
			{
				const FIntPoint Key(KeyX, KeyY);
				const int32* HighestPriority = HighestPriorityByCell.Find(Key);
				if (HighestPriority != nullptr && *HighestPriority > Map.Priority)
				{
					continue;
				}
				const FVector2D SubcellCenter = OwnershipCenterForKey(Key);
				if (SubcellCenter.X >= MinX && SubcellCenter.X < MaxX &&
					SubcellCenter.Y >= MinY && SubcellCenter.Y < MaxY)
				{
					OutCenters.Add(SubcellCenter);
				}
			}
		}
	};

	for (int32 MapIndex = 0; MapIndex < Manifest.Maps.Num(); ++MapIndex)
	{
		const FMousecatMapSpec& Map = Manifest.Maps[MapIndex];
		const bool bInterior = Map.Type.Equals(TEXT("interior"), ESearchCase::IgnoreCase) ||
			Map.Type.Equals(TEXT("gatehouse"), ESearchCase::IgnoreCase);
		const bool bForest = Map.Type.Equals(TEXT("forest"), ESearchCase::IgnoreCase);
		const bool bRoute = Map.Type.Equals(TEXT("route"), ESearchCase::IgnoreCase);
		const bool bCity = Map.Type.Equals(TEXT("city"), ESearchCase::IgnoreCase);
		const bool bTown = Map.Type.Equals(TEXT("town"), ESearchCase::IgnoreCase);
		const float CellX = static_cast<float>(Map.SourceCellSizeMeters.X);
		const float CellY = static_cast<float>(Map.SourceCellSizeMeters.Y);
		const float CellScale = FMath::Clamp(FMath::Min(CellX, CellY) / 8.0f, 0.72f, 1.15f);
		const FLinearColor PathColor = bCity
			? FLinearColor(0.42f, 0.43f, 0.41f)
			: bInterior
				? FLinearColor(0.39f, 0.28f, 0.18f)
				: bForest
					? FLinearColor(0.25f, 0.22f, 0.13f)
					: FLinearColor(0.55f, 0.47f, 0.31f);
		TArray<FIntPoint> BuiltDoorCells;

		for (int32 Row = 0; Row < Map.Rows; ++Row)
		{
			for (int32 Column = 0; Column < Map.Columns; ++Column)
			{
				const FString Semantic = Map.GetSemantic(Column, Row);
				const FVector LocalCell = Map.GetLocalCellCenterMeters(Column, Row, Manifest.CoordinateTransform);
				const FVector2D PositionMeters(LocalCell.X, LocalCell.Y);
				TArray<FVector2D, TInlineAllocator<16>> OwnedSubcells;
				GatherOwnedSubcells(Map, PositionMeters, CellX, CellY, OwnedSubcells);
				const bool bHasOwnedArea = !OwnedSubcells.IsEmpty();
				const int32 OwnershipSamplesX = FMath::Max(1, FMath::CeilToInt(CellX / OwnershipCellMeters));
				const int32 OwnershipSamplesY = FMath::Max(1, FMath::CeilToInt(CellY / OwnershipCellMeters));
				const bool bFullyOwned = OwnedSubcells.Num() == OwnershipSamplesX * OwnershipSamplesY;
				const bool bPreserveExteriorDoorAnchor =
					(bTown || bCity) && Semantic.Equals(TEXT("DOOR"), ESearchCase::IgnoreCase);
				const float SurfaceZ = SampleRenderedTerrainHeightMeters(PositionMeters.X, PositionMeters.Y);
				const FVector GroundCentimeters(PositionMeters.X * CentimetersPerMeter, PositionMeters.Y * CentimetersPerMeter, SurfaceZ * CentimetersPerMeter);
				FVector OwnedGroundCentimeters = GroundCentimeters;
				if (bHasOwnedArea && !bFullyOwned)
				{
					const FVector2D* ClosestOwned = &OwnedSubcells[0];
					double ClosestDistanceSquared = FVector2D::DistSquared(PositionMeters, *ClosestOwned);
					for (const FVector2D& Candidate : OwnedSubcells)
					{
						const double DistanceSquared = FVector2D::DistSquared(PositionMeters, Candidate);
						if (DistanceSquared < ClosestDistanceSquared)
						{
							ClosestOwned = &Candidate;
							ClosestDistanceSquared = DistanceSquared;
						}
					}
					OwnedGroundCentimeters = FVector(
						ClosestOwned->X * CentimetersPerMeter,
						ClosestOwned->Y * CentimetersPerMeter,
						SampleRenderedTerrainHeightMeters(ClosestOwned->X, ClosestOwned->Y) * CentimetersPerMeter);
				}
				const FIntPoint Chunk = ChunkFor(PositionMeters);
				FMeshBuffer& Physical = PhysicalBuffers.FindOrAdd(Chunk);
				FMeshBuffer& Decorative = DecorativeBuffers.FindOrAdd(Chunk);
				FMeshBuffer& MappedWater = WaterBuffers.FindOrAdd(Chunk);
				const uint32 Hash = StableGridHash(Column + MapIndex * 409, Row + MapIndex * 131, MapIndex + 83);

				const bool bFloorLike = Semantic.Equals(TEXT("FLOOR"), ESearchCase::IgnoreCase) ||
					Semantic.Equals(TEXT("DOOR"), ESearchCase::IgnoreCase) ||
					Semantic.Contains(TEXT("WARP_CARPET"), ESearchCase::IgnoreCase) ||
					Semantic.Equals(TEXT("COUNTER"), ESearchCase::IgnoreCase) ||
					Semantic.StartsWith(TEXT("HOP_"), ESearchCase::IgnoreCase) ||
					Semantic.Equals(TEXT("CAVE"), ESearchCase::IgnoreCase) ||
					Semantic.Equals(TEXT("TALL_GRASS"), ESearchCase::IgnoreCase);
				if (bFloorLike)
				{
					for (const FVector2D& SubcellCenter : OwnedSubcells)
					{
						const float PatchZ = SampleRenderedTerrainHeightMeters(SubcellCenter.X, SubcellCenter.Y);
						const FIntPoint OwnershipKey = OwnershipKeyFor(SubcellCenter);
						AppendBox(
							Decorative,
							FVector(SubcellCenter.X, SubcellCenter.Y, PatchZ + SurfaceLiftMeters) * CentimetersPerMeter,
							FVector(OwnershipCellMeters * 0.49f, OwnershipCellMeters * 0.49f, 0.045f) * CentimetersPerMeter,
							0.0f,
							VaryColor(PathColor, StableGridHash(OwnershipKey.X, OwnershipKey.Y, MapIndex), 0.12f));
					}
				}

				if (Semantic.Equals(TEXT("WATER"), ESearchCase::IgnoreCase))
				{
					for (const FVector2D& SubcellCenter : OwnedSubcells)
					{
						if (SampleTerrainWaterDepthMeters(SubcellCenter.X, SubcellCenter.Y) > WaterWetThresholdMeters)
						{
							continue;
						}
						const float WaterGroundZ = SampleRenderedTerrainHeightMeters(SubcellCenter.X, SubcellCenter.Y);
						const FIntPoint OwnershipKey = OwnershipKeyFor(SubcellCenter);
						AppendBox(
							MappedWater,
							FVector(SubcellCenter.X, SubcellCenter.Y, WaterGroundZ + 0.10f) * CentimetersPerMeter,
							FVector(OwnershipCellMeters * 0.49f, OwnershipCellMeters * 0.49f, 0.08f) * CentimetersPerMeter,
							0.0f,
							VaryColor(FLinearColor(0.055f, 0.29f, 0.43f, 0.72f), StableGridHash(OwnershipKey.X, OwnershipKey.Y, MapIndex), 0.15f));
					}
				}
				else if (!bHasOwnedArea && !bPreserveExteriorDoorAnchor)
				{
					continue;
				}
				else if (Semantic.Equals(TEXT("HEADBUTT_TREE"), ESearchCase::IgnoreCase) || Semantic.Equals(TEXT("CUT_TREE"), ESearchCase::IgnoreCase))
				{
					AppendVoxelTree(Physical, Decorative, OwnedGroundCentimeters, Hash, CellScale, FLinearColor(0.27f, 0.12f, 0.045f), FLinearColor(0.075f, 0.29f, 0.09f));
				}
				else if (Semantic.Equals(TEXT("TALL_GRASS"), ESearchCase::IgnoreCase))
				{
					for (const FVector2D& SubcellCenter : OwnedSubcells)
					{
						const FIntPoint OwnershipKey = OwnershipKeyFor(SubcellCenter);
						const uint32 TuftHash = StableGridHash(OwnershipKey.X, OwnershipKey.Y, MapIndex + 137);
						if (TuftHash % 3u != 0u)
						{
							continue;
						}
						const FVector SubcellGround(
							SubcellCenter.X * CentimetersPerMeter,
							SubcellCenter.Y * CentimetersPerMeter,
							SampleRenderedTerrainHeightMeters(SubcellCenter.X, SubcellCenter.Y) * CentimetersPerMeter);
						AppendGrassTuft(Decorative, SubcellGround, TuftHash, FLinearColor(0.16f, 0.42f, 0.10f));
					}
				}
				else if (Semantic.Equals(TEXT("COUNTER"), ESearchCase::IgnoreCase))
				{
					AppendBox(Physical, OwnedGroundCentimeters + FVector(0.0, 0.0, 0.72f * CentimetersPerMeter), FVector(CellX * 0.46f, CellY * 0.32f, 0.72f) * CentimetersPerMeter, 0.0f, FLinearColor(0.31f, 0.16f, 0.07f));
					AppendBox(Decorative, OwnedGroundCentimeters + FVector(0.0, 0.0, 1.48f * CentimetersPerMeter), FVector(CellX * 0.49f, CellY * 0.37f, 0.08f) * CentimetersPerMeter, 0.0f, FLinearColor(0.48f, 0.28f, 0.12f));
				}
				else if (Semantic.StartsWith(TEXT("HOP_"), ESearchCase::IgnoreCase))
				{
					const bool bHorizontal = Semantic.Contains(TEXT("LEFT"), ESearchCase::IgnoreCase) || Semantic.Contains(TEXT("RIGHT"), ESearchCase::IgnoreCase);
					AppendBox(
						Physical,
						OwnedGroundCentimeters + FVector(0.0, 0.0, 0.38f * CentimetersPerMeter),
						FVector(bHorizontal ? 0.35f : CellX * 0.48f, bHorizontal ? CellY * 0.48f : 0.35f, 0.38f) * CentimetersPerMeter,
						0.0f,
						FLinearColor(0.34f, 0.31f, 0.24f));
				}
				else if (Semantic.Equals(TEXT("CAVE"), ESearchCase::IgnoreCase))
				{
					AppendBox(Physical, OwnedGroundCentimeters + FVector(-CellX * 0.34f, 0.0f, 2.2f) * CentimetersPerMeter, FVector(CellX * 0.16f, CellY * 0.45f, 2.2f) * CentimetersPerMeter, 0.0f, FLinearColor(0.26f, 0.27f, 0.25f));
					AppendBox(Physical, OwnedGroundCentimeters + FVector(CellX * 0.34f, 0.0f, 2.2f) * CentimetersPerMeter, FVector(CellX * 0.16f, CellY * 0.45f, 2.2f) * CentimetersPerMeter, 0.0f, FLinearColor(0.26f, 0.27f, 0.25f));
					AppendBox(Physical, OwnedGroundCentimeters + FVector(0.0f, 0.0f, 4.15f) * CentimetersPerMeter, FVector(CellX * 0.5f, CellY * 0.45f, 0.35f) * CentimetersPerMeter, 0.0f, FLinearColor(0.22f, 0.23f, 0.21f));
				}
				else if (Semantic.Equals(TEXT("BUOY"), ESearchCase::IgnoreCase))
				{
					AppendBox(Physical, OwnedGroundCentimeters + FVector(0.0, 0.0, 0.8f) * CentimetersPerMeter, FVector(0.16f, 0.16f, 0.8f) * CentimetersPerMeter, 0.0f, FLinearColor(0.84f, 0.56f, 0.08f));
				}
				else if (Semantic.Equals(TEXT("WALL"), ESearchCase::IgnoreCase) || Semantic.Equals(TEXT("UP_WALL"), ESearchCase::IgnoreCase))
				{
					if (bInterior)
					{
						for (const FVector2D& SubcellCenter : OwnedSubcells)
						{
							const FIntPoint OwnershipKey = OwnershipKeyFor(SubcellCenter);
							const FVector SubcellGround(
								SubcellCenter.X * CentimetersPerMeter,
								SubcellCenter.Y * CentimetersPerMeter,
								SampleRenderedTerrainHeightMeters(SubcellCenter.X, SubcellCenter.Y) * CentimetersPerMeter);
							AddInteriorWall(
								Physical,
								Decorative,
								SubcellGround,
								OwnershipCellMeters,
								StableGridHash(OwnershipKey.X, OwnershipKey.Y, MapIndex));
						}
					}
					else if (bForest)
					{
						const uint32 Choice = Hash % 100u;
						if (Choice < 20u)
						{
							FRandomStream Random(static_cast<int32>(Hash));
							const float ScatterWidth = bFullyOwned ? CellX : OwnershipCellMeters;
							const float ScatterHeight = bFullyOwned ? CellY : OwnershipCellMeters;
							const FVector Offset(Random.FRandRange(-ScatterWidth * 0.27f, ScatterWidth * 0.27f), Random.FRandRange(-ScatterHeight * 0.27f, ScatterHeight * 0.27f), 0.0f);
							AppendVoxelTree(Physical, Decorative, OwnedGroundCentimeters + Offset * CentimetersPerMeter, Hash, Random.FRandRange(0.82f, 1.16f), FLinearColor(0.24f, 0.10f, 0.035f), FLinearColor(0.055f, 0.25f, 0.075f));
						}
						else if (Choice < 61u)
						{
							AppendGrassTuft(Decorative, OwnedGroundCentimeters, Hash, FLinearColor(0.12f, 0.34f, 0.075f));
						}
						else if (Choice < 68u)
						{
							AddRock(Decorative, OwnedGroundCentimeters, Hash);
						}
					}
					else if (bRoute)
					{
						const uint32 Choice = Hash % 100u;
						if (Choice < 6u)
						{
							AppendVoxelTree(Physical, Decorative, OwnedGroundCentimeters, Hash, 0.88f, FLinearColor(0.27f, 0.12f, 0.04f), FLinearColor(0.09f, 0.31f, 0.10f));
						}
						else if (Choice < 32u)
						{
							AppendGrassTuft(Decorative, OwnedGroundCentimeters, Hash, FLinearColor(0.18f, 0.39f, 0.10f));
						}
						else if (Choice < 38u)
						{
							AddRock(Decorative, OwnedGroundCentimeters, Hash);
						}
					}
					else if ((bTown || bCity) && (Hash % 100u) < 7u)
					{
					AppendGrassTuft(Decorative, OwnedGroundCentimeters, Hash, FLinearColor(0.20f, 0.40f, 0.12f));
					}
				}

				if ((bTown || bCity) && Semantic.Equals(TEXT("DOOR"), ESearchCase::IgnoreCase))
				{
					bool bNearBuiltDoor = false;
					for (const FIntPoint& Existing : BuiltDoorCells)
					{
						if (FMath::Abs(Existing.X - Column) + FMath::Abs(Existing.Y - Row) <= 1)
						{
							bNearBuiltDoor = true;
							break;
						}
					}
					if (!bNearBuiltDoor)
					{
						FVector2D ExteriorDirection(0.0, -1.0);
						FIntPoint ExteriorCellDirection(0, -1);
						const FIntPoint Directions[] = {FIntPoint(1, 0), FIntPoint(-1, 0), FIntPoint(0, 1), FIntPoint(0, -1)};
						for (const FIntPoint& Direction : Directions)
						{
							const int32 NeighborColumn = Column + Direction.X;
							const int32 NeighborRow = Row + Direction.Y;
							if (!Map.IsPassable(NeighborColumn, NeighborRow))
							{
								continue;
							}
							const FVector Neighbor = Map.GetLocalCellCenterMeters(NeighborColumn, NeighborRow, Manifest.CoordinateTransform);
							ExteriorDirection = FVector2D(Neighbor.X - LocalCell.X, Neighbor.Y - LocalCell.Y).GetSafeNormal();
							ExteriorCellDirection = Direction;
							break;
						}
						const auto IsStructuralCell = [&Map](int32 TestColumn, int32 TestRow)
						{
							const FString Value = Map.GetSemantic(TestColumn, TestRow);
							return Value.Equals(TEXT("WALL"), ESearchCase::IgnoreCase) ||
								Value.Equals(TEXT("UP_WALL"), ESearchCase::IgnoreCase) ||
								Value.Equals(TEXT("DOOR"), ESearchCase::IgnoreCase);
						};
						const FIntPoint BackDirection(-ExteriorCellDirection.X, -ExteriorCellDirection.Y);
						const FIntPoint RightDirection(-ExteriorCellDirection.Y, ExteriorCellDirection.X);
						int32 DepthCells = 1;
						for (int32 Step = 1; Step <= 4; ++Step)
						{
							if (!IsStructuralCell(Column + BackDirection.X * Step, Row + BackDirection.Y * Step))
							{
								break;
							}
							++DepthCells;
						}
						int32 WidthCells = 1;
						for (int32 Side : {-1, 1})
						{
							for (int32 Step = 1; Step <= 3; ++Step)
							{
								const int32 TestColumn = Column + BackDirection.X + RightDirection.X * Step * Side;
								const int32 TestRow = Row + BackDirection.Y + RightDirection.Y * Step * Side;
								if (!IsStructuralCell(TestColumn, TestRow))
								{
									break;
								}
								++WidthCells;
							}
						}
						bool bOpenRoof = false;
						for (const FMousecatPortalSpec& DoorPortal : Manifest.Portals)
						{
							if (DoorPortal.MapId != Map.Id || !DoorPortal.bHasSourceCell ||
								DoorPortal.SourceCell != FIntPoint(Column, Row))
							{
								continue;
							}
							const FMousecatMapSpec* TargetMap = Manifest.Maps.FindByPredicate([&DoorPortal](const FMousecatMapSpec& Candidate)
							{
								return Candidate.Id == DoorPortal.TargetMapId;
							});
							bOpenRoof = TargetMap != nullptr && TargetMap->Type.Equals(TEXT("interior"), ESearchCase::IgnoreCase);
							if (bOpenRoof)
							{
								break;
							}
						}
						const FLinearColor Brick = bCity ? FLinearColor(0.40f, 0.30f, 0.24f) : FLinearColor(0.48f, 0.34f, 0.20f);
						const FLinearColor Roof = bCity ? FLinearColor(0.20f, 0.22f, 0.25f) : FLinearColor(0.43f, 0.16f, 0.09f);
						AppendVoxelBuilding(
							Physical,
							Decorative,
							GroundCentimeters,
							ExteriorDirection,
							Hash,
							FMath::Max(2, WidthCells) * FMath::Min(CellX, CellY),
							FMath::Max(2, DepthCells) * FMath::Min(CellX, CellY),
							bOpenRoof,
							Brick,
							Roof);
						BuiltDoorCells.Add(FIntPoint(Column, Row));
					}
				}
			}
		}
	}

	const FVector2D SpawnMeters(Manifest.PlayerSpawnMeters.X, Manifest.PlayerSpawnMeters.Y);
	const auto EmitBuffers = [this, &SpawnMeters](
		const TMap<FIntPoint, FMeshBuffer>& Buffers,
		const TCHAR* Prefix,
		bool bPhysical,
		TArray<FRuntimeChunk>& OutChunks)
	{
		for (const TPair<FIntPoint, FMeshBuffer>& Entry : Buffers)
		{
			if (Entry.Value.Vertices.IsEmpty())
			{
				continue;
			}
			const FVector2D CenterMeters((Entry.Key.X + 0.5f) * ChunkSizeMeters, (Entry.Key.Y + 0.5f) * ChunkSizeMeters);
			const double ChunkRadius = ChunkSizeMeters * 0.5 * FMath::Sqrt(2.0);
			const bool bCollision = bPhysical && FVector2D::Distance(SpawnMeters, CenterMeters) <= Manifest.Terrain.CollisionRadiusMeters + ChunkRadius;
			UProceduralMeshComponent* Mesh = CreateChunkComponent(Prefix, Entry.Key, bCollision, bPhysical);
			SubmitMesh(Mesh, Entry.Value, bCollision);
			if (Mesh != nullptr)
			{
				Mesh->bUseAsyncCooking = true;
			}
			OutChunks.Add({Mesh, Entry.Key, CenterMeters, bCollision});
		}
	};

	EmitBuffers(PhysicalBuffers, TEXT("MappedPlaceChunk"), true, MappedPlaceChunks);
	EmitBuffers(DecorativeBuffers, TEXT("MappedDetailChunk"), false, DecorativeObjectChunks);
	EmitBuffers(WaterBuffers, TEXT("MappedWaterChunk"), false, MappedWaterChunks);
}

void AMousecatWorldBootstrap::BuildRuntimePortals()
{
	TMap<FString, const FMousecatPortalSpec*> PortalById;
	TSet<FString> IncludedMapIds;
	for (const FMousecatMapSpec& Map : Manifest.Maps)
	{
		IncludedMapIds.Add(Map.Id);
	}
	for (const FMousecatPortalSpec& Portal : Manifest.Portals)
	{
		PortalById.Add(Portal.Id, &Portal);
	}

	for (const FMousecatPortalSpec& Portal : Manifest.Portals)
	{
		if (!Portal.Mode.Equals(TEXT("warp"), ESearchCase::IgnoreCase) ||
			!Portal.bHasSourceWorldMeters ||
			Portal.TargetGateId.IsEmpty() ||
			!IncludedMapIds.Contains(Portal.TargetMapId))
		{
			continue;
		}
		const FMousecatPortalSpec* const* TargetPointer = PortalById.Find(Portal.TargetGateId);
		if (TargetPointer == nullptr || *TargetPointer == nullptr || !(*TargetPointer)->bHasSourceWorldMeters)
		{
			continue;
		}

		const FMousecatPortalSpec& Target = **TargetPointer;
		const FVector SourceLocal = Manifest.CoordinateTransform.SourceMetersToLocalUnrealMeters(Portal.SourceWorldMeters);
		FVector TargetLocal = Manifest.CoordinateTransform.SourceMetersToLocalUnrealMeters(Target.SourceWorldMeters);
		const FMousecatMapSpec* TargetMap = Manifest.Maps.FindByPredicate([&Target](const FMousecatMapSpec& Map)
		{
			return Map.Id == Target.MapId;
		});
		if (TargetMap != nullptr && Target.bHasSourceCell)
		{
			const FIntPoint Directions[] = {FIntPoint(0, -1), FIntPoint(0, 1), FIntPoint(-1, 0), FIntPoint(1, 0)};
			for (const FIntPoint& Direction : Directions)
			{
				const int32 Column = Target.SourceCell.X + Direction.X;
				const int32 Row = Target.SourceCell.Y + Direction.Y;
				if (TargetMap->IsPassable(Column, Row))
				{
					const FVector Neighbor = TargetMap->GetLocalCellCenterMeters(Column, Row, Manifest.CoordinateTransform);
					const FVector2D Offset = FVector2D(Neighbor.X - TargetLocal.X, Neighbor.Y - TargetLocal.Y).GetSafeNormal() * 1.65f;
					TargetLocal.X += Offset.X;
					TargetLocal.Y += Offset.Y;
					break;
				}
			}
		}
		RuntimePortals.Add({
			Portal.Id,
			Target.Id,
			Portal.MapId,
			Target.MapId,
			FVector2D(SourceLocal.X, SourceLocal.Y),
			FVector2D(TargetLocal.X, TargetLocal.Y)});
	}
}

void AMousecatWorldBootstrap::RefreshPortalTransitions()
{
	APawn* PlayerPawn = UGameplayStatics::GetPlayerPawn(this, 0);
	if (PlayerPawn == nullptr || RuntimePortals.IsEmpty())
	{
		return;
	}
	const FVector2D PlayerMeters(PlayerPawn->GetActorLocation().X / MousecatWorldGeometry::CentimetersPerMeter, PlayerPawn->GetActorLocation().Y / MousecatWorldGeometry::CentimetersPerMeter);
	const auto ContainsLocalPoint = [this](const FMousecatMapSpec& Map, const FVector2D& LocalPoint)
	{
		const FVector SourcePoint(
			LocalPoint.X + Manifest.CoordinateTransform.LocalOriginSourceMeters.X,
			Manifest.CoordinateTransform.LocalOriginSourceMeters.Y,
			LocalPoint.Y + Manifest.CoordinateTransform.LocalOriginSourceMeters.Z);
		return SourcePoint.X >= Map.SourceBoundsMinMeters.X && SourcePoint.X < Map.SourceBoundsMaxExclusiveMeters.X &&
			SourcePoint.Z >= Map.SourceBoundsMinMeters.Z && SourcePoint.Z < Map.SourceBoundsMaxExclusiveMeters.Z;
	};
	const FMousecatMapSpec* CurrentMap = Manifest.Maps.FindByPredicate([this](const FMousecatMapSpec& Map)
	{
		return Map.Id == ActiveMapId;
	});
	if (CurrentMap == nullptr || !ContainsLocalPoint(*CurrentMap, PlayerMeters))
	{
		CurrentMap = nullptr;
		for (const FMousecatMapSpec& Candidate : Manifest.Maps)
		{
			if (ContainsLocalPoint(Candidate, PlayerMeters) && (CurrentMap == nullptr || Candidate.Priority > CurrentMap->Priority))
			{
				CurrentMap = &Candidate;
			}
		}
		ActiveMapId = CurrentMap != nullptr ? CurrentMap->Id : FString();
	}
	if (!bPortalTriggersArmed)
	{
		for (const FRuntimePortal& Portal : RuntimePortals)
		{
			if ((ActiveMapId.IsEmpty() || Portal.MapId == ActiveMapId) && FVector2D::Distance(PlayerMeters, Portal.SourceMeters) < 2.6f)
			{
				return;
			}
		}
		bPortalTriggersArmed = true;
		return;
	}

	for (const FRuntimePortal& Portal : RuntimePortals)
	{
		if ((!ActiveMapId.IsEmpty() && Portal.MapId != ActiveMapId) || FVector2D::Distance(PlayerMeters, Portal.SourceMeters) > 1.25f)
		{
			continue;
		}
		constexpr float DestinationCollisionRadiusMeters = 260.0f;
		const auto PrimeDestinationCollision = [this, &Portal, DestinationCollisionRadiusMeters](TArray<FRuntimeChunk>& Chunks)
		{
			for (FRuntimeChunk& Chunk : Chunks)
			{
				if (FVector2D::Distance(Portal.TargetMeters, Chunk.CenterMeters) <= DestinationCollisionRadiusMeters)
				{
					if (Chunk.Mesh != nullptr)
					{
						Chunk.Mesh->bUseAsyncCooking = false;
					}
					SetChunkCollision(Chunk, true);
				}
			}
		};
		PrimeDestinationCollision(TerrainChunks);
		PrimeDestinationCollision(WorldObjectChunks);
		PrimeDestinationCollision(MappedPlaceChunks);
		const float GroundZ = SampleRenderedTerrainHeightMeters(Portal.TargetMeters.X, Portal.TargetMeters.Y);
		const FVector Destination(
			Portal.TargetMeters.X * MousecatWorldGeometry::CentimetersPerMeter,
			Portal.TargetMeters.Y * MousecatWorldGeometry::CentimetersPerMeter,
			(GroundZ + 1.65f) * MousecatWorldGeometry::CentimetersPerMeter);
		bPortalTriggersArmed = false;
		ActiveMapId = Portal.TargetMapId;
		PlayerPawn->TeleportTo(Destination, PlayerPawn->GetActorRotation(), false, true);
		UE_LOG(LogMousecatWorld, Display, TEXT("Traversed source portal %s -> %s"), *Portal.Id, *Portal.TargetId);
		break;
	}
}

void AMousecatWorldBootstrap::ApplyRuntimeMaterial()
{
	const bool bUseExperimentalLitMaterials = FParse::Param(FCommandLine::Get(), TEXT("MousecatWorldUseExperimentalLitMaterials"));
	VertexColorMaterial = LoadObject<UMaterialInterface>(
		nullptr,
		bUseExperimentalLitMaterials
			? TEXT("/Game/MousecatWorld/Materials/M_VoxelSurface.M_VoxelSurface")
			: TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"));
	if (VertexColorMaterial == nullptr)
	{
		VertexColorMaterial = LoadObject<UMaterialInterface>(
			nullptr,
			TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"));
		if (VertexColorMaterial == nullptr)
		{
			VertexColorMaterial = UMaterial::GetDefaultMaterial(MD_Surface);
		}
		UE_LOG(LogMousecatWorld, Warning, TEXT("Mousecat lit voxel material unavailable; using a fallback surface material."));
	}
	WaterMaterial = LoadObject<UMaterialInterface>(
		nullptr,
		TEXT("/Game/MousecatWorld/Materials/M_VoxelWater.M_VoxelWater"));
	if (WaterMaterial == nullptr)
	{
		WaterMaterial = VertexColorMaterial;
		UE_LOG(LogMousecatWorld, Warning, TEXT("Mousecat voxel-water material unavailable; using the surface material."));
	}

	for (int32 SectionIndex = 0; SectionIndex < WaterMesh->GetNumSections(); ++SectionIndex)
	{
		WaterMesh->SetMaterial(SectionIndex, WaterMaterial);
	}
	for (const FRuntimeChunk& Chunk : TerrainChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->SetMaterial(0, VertexColorMaterial);
		}
	}
	for (const FRuntimeChunk& Chunk : WorldObjectChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->SetMaterial(0, VertexColorMaterial);
		}
	}
	for (const FRuntimeChunk& Chunk : DecorativeObjectChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->SetMaterial(0, VertexColorMaterial);
		}
	}
	for (const FRuntimeChunk& Chunk : MappedPlaceChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->SetMaterial(0, VertexColorMaterial);
		}
	}
	for (const FRuntimeChunk& Chunk : MappedWaterChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->SetMaterial(0, WaterMaterial);
		}
	}
	for (const FRuntimeChunk& Chunk : SemanticMarkerChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->SetMaterial(0, VertexColorMaterial);
		}
	}
}

UProceduralMeshComponent* AMousecatWorldBootstrap::CreateChunkComponent(
	const TCHAR* Prefix,
	const FIntPoint& Coordinate,
	bool bEnableCollision,
	bool bSynchronousInitialCollision)
{
	const FName ComponentName(*FString::Printf(TEXT("%s_%d_%d"), Prefix, Coordinate.X, Coordinate.Y));
	UProceduralMeshComponent* Component = NewObject<UProceduralMeshComponent>(this, ComponentName);
	if (Component == nullptr)
	{
		return nullptr;
	}

	Component->SetupAttachment(SceneRoot);
	Component->bUseAsyncCooking = !(bEnableCollision && bSynchronousInitialCollision);
	Component->bUseComplexAsSimpleCollision = true;
	Component->SetCollisionObjectType(ECC_WorldStatic);
	Component->SetCollisionResponseToAllChannels(ECR_Block);
	Component->SetCollisionEnabled(bEnableCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	Component->ComponentTags.Add(FName(*FString::Printf(TEXT("chunk:%d:%d"), Coordinate.X, Coordinate.Y)));
	AddInstanceComponent(Component);
	Component->RegisterComponent();
	return Component;
}

void AMousecatWorldBootstrap::SetChunkCollision(FRuntimeChunk& Chunk, bool bEnableCollision)
{
	if (Chunk.Mesh == nullptr || Chunk.bCollisionEnabled == bEnableCollision)
	{
		return;
	}

	FProcMeshSection* ExistingSection = Chunk.Mesh->GetProcMeshSection(0);
	if (ExistingSection == nullptr)
	{
		return;
	}

	FProcMeshSection UpdatedSection = *ExistingSection;
	UpdatedSection.bEnableCollision = bEnableCollision;
	Chunk.Mesh->SetProcMeshSection(0, UpdatedSection);
	Chunk.Mesh->SetCollisionEnabled(bEnableCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	Chunk.bCollisionEnabled = bEnableCollision;
}

void AMousecatWorldBootstrap::RefreshCollisionEnvelope()
{
	FVector2D FocusMeters(Manifest.PlayerSpawnMeters.X, Manifest.PlayerSpawnMeters.Y);
	if (const APawn* PlayerPawn = UGameplayStatics::GetPlayerPawn(this, 0))
	{
		FocusMeters = FVector2D(PlayerPawn->GetActorLocation().X, PlayerPawn->GetActorLocation().Y) /
			MousecatWorldGeometry::CentimetersPerMeter;
	}

	constexpr int32 ChunkCells = 32;
	const double ChunkRadius = Manifest.Terrain.CellSizeMeters * ChunkCells * 0.5 * FMath::Sqrt(2.0);
	const double ActivationRadius = Manifest.Terrain.CollisionRadiusMeters + ChunkRadius;
	for (FRuntimeChunk& Chunk : TerrainChunks)
	{
		SetChunkCollision(Chunk, FVector2D::Distance(FocusMeters, Chunk.CenterMeters) <= ActivationRadius);
	}
	for (FRuntimeChunk& Chunk : WorldObjectChunks)
	{
		SetChunkCollision(Chunk, FVector2D::Distance(FocusMeters, Chunk.CenterMeters) <= ActivationRadius);
	}
	for (FRuntimeChunk& Chunk : MappedPlaceChunks)
	{
		SetChunkCollision(Chunk, FVector2D::Distance(FocusMeters, Chunk.CenterMeters) <= ActivationRadius);
	}
}

void AMousecatWorldBootstrap::ResetRuntimeChunks()
{
	for (FRuntimeChunk& Chunk : TerrainChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->DestroyComponent();
		}
	}
	for (FRuntimeChunk& Chunk : MappedWaterChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->DestroyComponent();
		}
	}
	for (FRuntimeChunk& Chunk : WorldObjectChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->DestroyComponent();
		}
	}
	for (FRuntimeChunk& Chunk : DecorativeObjectChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->DestroyComponent();
		}
	}
	for (FRuntimeChunk& Chunk : MappedPlaceChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->DestroyComponent();
		}
	}
	for (FRuntimeChunk& Chunk : SemanticMarkerChunks)
	{
		if (Chunk.Mesh != nullptr)
		{
			Chunk.Mesh->DestroyComponent();
		}
	}
	TerrainChunks.Reset();
	WorldObjectChunks.Reset();
	DecorativeObjectChunks.Reset();
	MappedPlaceChunks.Reset();
	MappedWaterChunks.Reset();
	SemanticMarkerChunks.Reset();
	RuntimePortals.Reset();
	ActiveMapId.Reset();
	bPortalTriggersArmed = true;
}

void AMousecatWorldBootstrap::BuildLighting()
{
	UWorld* World = GetWorld();
	if (World == nullptr)
	{
		return;
	}

	ADirectionalLight* Sun = World->SpawnActor<ADirectionalLight>(
		FVector::ZeroVector,
		FRotator(-42.0f, -28.0f, 0.0f));
	if (Sun != nullptr && Sun->GetLightComponent() != nullptr)
	{
		Sun->SetMobility(EComponentMobility::Movable);
		Sun->GetLightComponent()->SetIntensity(8.0f);
		Sun->GetLightComponent()->SetLightColor(FLinearColor(1.0f, 0.91f, 0.78f));
		if (UDirectionalLightComponent* DirectionalComponent = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
		{
			DirectionalComponent->SetAtmosphereSunLight(true);
			DirectionalComponent->SetLightSourceAngle(1.2f);
		}
	}

	ASkyAtmosphere* Atmosphere = World->SpawnActor<ASkyAtmosphere>();
	(void)Atmosphere;

	ASkyLight* Sky = World->SpawnActor<ASkyLight>();
	if (Sky != nullptr && Sky->GetLightComponent() != nullptr)
	{
		USkyLightComponent* SkyComponent = Sky->GetLightComponent();
		SkyComponent->SetMobility(EComponentMobility::Movable);
		SkyComponent->SetIntensity(1.65f);
		SkyComponent->SetRealTimeCapture(true);
		SkyComponent->bLowerHemisphereIsBlack = false;
		SkyComponent->LowerHemisphereColor = FLinearColor(0.08f, 0.11f, 0.09f).ToFColorSRGB();
		SkyComponent->MarkRenderStateDirty();
	}

	AExponentialHeightFog* Fog = World->SpawnActor<AExponentialHeightFog>();
	if (Fog != nullptr)
	{
		Fog->SetActorLocation(FVector(0.0, 0.0, -300.0));
		if (UExponentialHeightFogComponent* FogComponent = Fog->GetComponent())
		{
			FogComponent->SetFogDensity(0.0014f);
			FogComponent->SetFogHeightFalloff(0.28f);
			FogComponent->SetFogInscatteringColor(FLinearColor(0.50f, 0.62f, 0.58f));
			FogComponent->SetVolumetricFog(true);
		}
	}

	APostProcessVolume* PostProcess = World->SpawnActor<APostProcessVolume>();
	if (PostProcess != nullptr)
	{
		PostProcess->bUnbound = true;
		PostProcess->BlendWeight = 1.0f;
		PostProcess->Settings.bOverride_AutoExposureBias = true;
		PostProcess->Settings.AutoExposureBias = 0.0f;
		PostProcess->Settings.bOverride_ColorSaturation = true;
		PostProcess->Settings.ColorSaturation = FVector4(1.08f, 1.06f, 1.02f, 1.0f);
		PostProcess->Settings.bOverride_ColorContrast = true;
		PostProcess->Settings.ColorContrast = FVector4(1.04f, 1.04f, 1.04f, 1.0f);
		PostProcess->Settings.bOverride_BloomIntensity = true;
		PostProcess->Settings.BloomIntensity = 0.18f;
		PostProcess->Settings.bOverride_VignetteIntensity = true;
		PostProcess->Settings.VignetteIntensity = 0.05f;
	}
}

FVector AMousecatWorldBootstrap::GetPlayerSpawnWorldLocation() const
{
	if (!bWorldReady && Manifest.WorldId.IsEmpty())
	{
		return FVector::ZeroVector;
	}
	return FVector(
		Manifest.PlayerSpawnMeters.X * MousecatWorldGeometry::CentimetersPerMeter,
		Manifest.PlayerSpawnMeters.Y * MousecatWorldGeometry::CentimetersPerMeter,
		Manifest.PlayerSpawnMeters.Z * MousecatWorldGeometry::CentimetersPerMeter);
}

int32 AMousecatWorldBootstrap::GetTreeCount() const
{
	int32 Total = 0;
	for (const FMousecatGroveSpec& Grove : Manifest.Groves)
	{
		Total += Grove.Count;
	}
	return Total;
}
