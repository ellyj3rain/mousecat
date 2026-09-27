#include "MousecatWorldCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Controller.h"
#include "GameFramework/SpringArmComponent.h"
#include "Materials/Material.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"

namespace MousecatWorldCharacterGeometry
{
	struct FBodyMeshBuffer
	{
		TArray<FVector> Vertices;
		TArray<int32> Triangles;
		TArray<FVector> Normals;
		TArray<FVector2D> UV0;
		TArray<FLinearColor> Colors;
		TArray<FProcMeshTangent> Tangents;
	};

	void AppendFace(
		FBodyMeshBuffer& Buffer,
		const FVector& A,
		const FVector& B,
		const FVector& C,
		const FVector& D,
		const FVector& Normal,
		const FLinearColor& Color)
	{
		const int32 Base = Buffer.Vertices.Num();
		Buffer.Vertices.Append({A, B, C, D});
		Buffer.Triangles.Append({Base, Base + 1, Base + 2, Base, Base + 2, Base + 3});
		Buffer.Normals.Append({Normal, Normal, Normal, Normal});
		Buffer.UV0.Append({FVector2D(0.0, 1.0), FVector2D(1.0, 1.0), FVector2D(1.0, 0.0), FVector2D(0.0, 0.0)});
		Buffer.Colors.Append({Color, Color, Color, Color});
		const FProcMeshTangent Tangent(FVector::ForwardVector, false);
		Buffer.Tangents.Append({Tangent, Tangent, Tangent, Tangent});
	}

	void AppendBox(FBodyMeshBuffer& Buffer, const FVector& Center, const FVector& HalfExtent, const FLinearColor& Color)
	{
		const double X0 = Center.X - HalfExtent.X;
		const double X1 = Center.X + HalfExtent.X;
		const double Y0 = Center.Y - HalfExtent.Y;
		const double Y1 = Center.Y + HalfExtent.Y;
		const double Z0 = Center.Z - HalfExtent.Z;
		const double Z1 = Center.Z + HalfExtent.Z;
		AppendFace(Buffer, FVector(X1, Y0, Z0), FVector(X1, Y1, Z0), FVector(X1, Y1, Z1), FVector(X1, Y0, Z1), FVector::ForwardVector, Color);
		AppendFace(Buffer, FVector(X0, Y1, Z0), FVector(X0, Y0, Z0), FVector(X0, Y0, Z1), FVector(X0, Y1, Z1), -FVector::ForwardVector, Color);
		AppendFace(Buffer, FVector(X1, Y1, Z0), FVector(X0, Y1, Z0), FVector(X0, Y1, Z1), FVector(X1, Y1, Z1), FVector::RightVector, Color);
		AppendFace(Buffer, FVector(X0, Y0, Z0), FVector(X1, Y0, Z0), FVector(X1, Y0, Z1), FVector(X0, Y0, Z1), -FVector::RightVector, Color);
		AppendFace(Buffer, FVector(X0, Y0, Z1), FVector(X1, Y0, Z1), FVector(X1, Y1, Z1), FVector(X0, Y1, Z1), FVector::UpVector, Color);
		AppendFace(Buffer, FVector(X0, Y1, Z0), FVector(X1, Y1, Z0), FVector(X1, Y0, Z0), FVector(X0, Y0, Z0), -FVector::UpVector, Color);
	}

	void AppendOrientedBox(
		FBodyMeshBuffer& Buffer,
		const FVector& Center,
		const FVector& HalfExtent,
		const FRotator& Rotation,
		const FLinearColor& Color)
	{
		const FTransform Transform(Rotation, Center);
		const double X = HalfExtent.X;
		const double Y = HalfExtent.Y;
		const double Z = HalfExtent.Z;
		const auto AddFace = [&Buffer, &Transform, &Color](
			const FVector& A,
			const FVector& B,
			const FVector& C,
			const FVector& D,
			const FVector& LocalNormal)
		{
			AppendFace(
				Buffer,
				Transform.TransformPosition(A),
				Transform.TransformPosition(B),
				Transform.TransformPosition(C),
				Transform.TransformPosition(D),
				Transform.TransformVectorNoScale(LocalNormal).GetSafeNormal(),
				Color);
		};

		AddFace(FVector(X, -Y, -Z), FVector(X, Y, -Z), FVector(X, Y, Z), FVector(X, -Y, Z), FVector::ForwardVector);
		AddFace(FVector(-X, Y, -Z), FVector(-X, -Y, -Z), FVector(-X, -Y, Z), FVector(-X, Y, Z), -FVector::ForwardVector);
		AddFace(FVector(X, Y, -Z), FVector(-X, Y, -Z), FVector(-X, Y, Z), FVector(X, Y, Z), FVector::RightVector);
		AddFace(FVector(-X, -Y, -Z), FVector(X, -Y, -Z), FVector(X, -Y, Z), FVector(-X, -Y, Z), -FVector::RightVector);
		AddFace(FVector(-X, -Y, Z), FVector(X, -Y, Z), FVector(X, Y, Z), FVector(-X, Y, Z), FVector::UpVector);
		AddFace(FVector(-X, Y, -Z), FVector(X, Y, -Z), FVector(X, -Y, -Z), FVector(-X, -Y, -Z), -FVector::UpVector);
	}
}

AMousecatWorldCharacter::AMousecatWorldCharacter()
{
	PrimaryActorTick.bCanEverTick = false;
	GetCapsuleComponent()->InitCapsuleSize(42.0f, 96.0f);

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.0f, 620.0f, 0.0f);
	Movement->JumpZVelocity = 650.0f;
	Movement->AirControl = 0.45f;
	Movement->MaxWalkSpeed = WalkSpeed;
	Movement->BrakingDecelerationWalking = 1800.0f;
	Movement->MaxStepHeight = 55.0f;
	Movement->SetWalkableFloorAngle(52.0f);

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = 500.0f;
	CameraBoom->SocketOffset = FVector(0.0f, 72.0f, 74.0f);
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bEnableCameraLag = true;
	CameraBoom->CameraLagSpeed = 12.0f;
	CameraBoom->CameraLagMaxDistance = 120.0f;
	CameraBoom->ProbeSize = 14.0f;
	CameraBoom->ProbeChannel = ECC_Camera;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->FieldOfView = 78.0f;

	BodyMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("ProceduralHuman"));
	BodyMesh->SetupAttachment(RootComponent);
	BodyMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	BodyMesh->SetGenerateOverlapEvents(false);
}

void AMousecatWorldCharacter::BeginPlay()
{
	Super::BeginPlay();
	BuildProceduralHuman();
}

void AMousecatWorldCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	check(PlayerInputComponent);
	PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &AMousecatWorldCharacter::MoveForward);
	PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &AMousecatWorldCharacter::MoveRight);
	PlayerInputComponent->BindAxis(TEXT("Turn"), this, &APawn::AddControllerYawInput);
	PlayerInputComponent->BindAxis(TEXT("LookUp"), this, &APawn::AddControllerPitchInput);
	PlayerInputComponent->BindAxis(TEXT("TurnRate"), this, &AMousecatWorldCharacter::TurnAtRate);
	PlayerInputComponent->BindAxis(TEXT("LookUpRate"), this, &AMousecatWorldCharacter::LookUpAtRate);
	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Pressed, this, &ACharacter::Jump);
	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
	PlayerInputComponent->BindAction(TEXT("Sprint"), IE_Pressed, this, &AMousecatWorldCharacter::BeginSprint);
	PlayerInputComponent->BindAction(TEXT("Sprint"), IE_Released, this, &AMousecatWorldCharacter::EndSprint);
}

void AMousecatWorldCharacter::MoveForward(float Value)
{
	if (Controller != nullptr && !FMath::IsNearlyZero(Value))
	{
		const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		AddMovementInput(FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X), Value);
	}
}

void AMousecatWorldCharacter::MoveRight(float Value)
{
	if (Controller != nullptr && !FMath::IsNearlyZero(Value))
	{
		const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		AddMovementInput(FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y), Value);
	}
}

void AMousecatWorldCharacter::TurnAtRate(float Value)
{
	AddControllerYawInput(Value * GamepadTurnRateDegrees * GetWorld()->GetDeltaSeconds());
}

void AMousecatWorldCharacter::LookUpAtRate(float Value)
{
	AddControllerPitchInput(Value * GamepadTurnRateDegrees * GetWorld()->GetDeltaSeconds());
}

void AMousecatWorldCharacter::BeginSprint()
{
	GetCharacterMovement()->MaxWalkSpeed = SprintSpeed;
}

void AMousecatWorldCharacter::EndSprint()
{
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}

void AMousecatWorldCharacter::BuildProceduralHuman()
{
	using namespace MousecatWorldCharacterGeometry;

	FBodyMeshBuffer Buffer;
	Buffer.Vertices.Reserve(1200);
	Buffer.Triangles.Reserve(1800);
	Buffer.Normals.Reserve(1200);
	Buffer.UV0.Reserve(1200);
	Buffer.Colors.Reserve(1200);
	Buffer.Tangents.Reserve(1200);

	// Neutral ceramic presentation avoids implying a real ethnicity before character creation exists.
	const FLinearColor Ceramic(0.62f, 0.64f, 0.65f);
	const FLinearColor CeramicShade(0.48f, 0.50f, 0.51f);
	const FLinearColor Hair(0.075f, 0.085f, 0.095f);
	const FLinearColor Eye(0.10f, 0.16f, 0.19f);
	const FLinearColor Mouth(0.29f, 0.20f, 0.20f);
	const FLinearColor Jacket(0.10f, 0.23f, 0.31f);
	const FLinearColor JacketShade(0.065f, 0.15f, 0.21f);
	const FLinearColor Shirt(0.77f, 0.75f, 0.66f);
	const FLinearColor Accent(0.72f, 0.30f, 0.16f);
	const FLinearColor Trousers(0.095f, 0.115f, 0.14f);
	const FLinearColor Shoe(0.045f, 0.052f, 0.058f);
	const FLinearColor Sole(0.018f, 0.021f, 0.024f);

	// Feet and separated leg segments. All geometry remains inside the 192 cm capsule envelope.
	AppendBox(Buffer, FVector(6.0, -9.0, -86.5), FVector(12.0, 7.0, 5.5), Shoe);
	AppendBox(Buffer, FVector(6.0, 9.0, -86.5), FVector(12.0, 7.0, 5.5), Shoe);
	AppendBox(Buffer, FVector(7.5, -9.0, -92.5), FVector(13.5, 7.5, 1.0), Sole);
	AppendBox(Buffer, FVector(7.5, 9.0, -92.5), FVector(13.5, 7.5, 1.0), Sole);
	AppendBox(Buffer, FVector(0.0, -9.0, -65.0), FVector(6.1, 6.4, 15.5), Trousers * 0.88f);
	AppendBox(Buffer, FVector(0.0, 9.0, -65.0), FVector(6.1, 6.4, 15.5), Trousers * 0.88f);
	AppendBox(Buffer, FVector(0.0, -9.0, -48.5), FVector(6.6, 6.8, 2.0), Trousers * 0.72f);
	AppendBox(Buffer, FVector(0.0, 9.0, -48.5), FVector(6.6, 6.8, 2.0), Trousers * 0.72f);
	AppendBox(Buffer, FVector(0.0, -9.0, -34.0), FVector(7.0, 7.2, 13.0), Trousers);
	AppendBox(Buffer, FVector(0.0, 9.0, -34.0), FVector(7.0, 7.2, 13.0), Trousers);

	// Pelvis, waist, shirt core, jacket shell, shoulders, lapels, belt, and a small accent tab.
	AppendBox(Buffer, FVector(0.0, 0.0, -17.5), FVector(10.0, 16.0, 5.5), Trousers);
	AppendBox(Buffer, FVector(0.0, 0.0, -10.5), FVector(10.7, 16.4, 1.7), Shoe * 1.25f);
	AppendBox(Buffer, FVector(0.0, 0.0, 7.0), FVector(10.2, 15.2, 16.0), Shirt);
	AppendBox(Buffer, FVector(-2.0, 0.0, 13.0), FVector(10.5, 17.2, 17.0), JacketShade);
	AppendBox(Buffer, FVector(8.9, -11.0, 13.5), FVector(2.2, 5.2, 15.5), Jacket);
	AppendBox(Buffer, FVector(8.9, 11.0, 13.5), FVector(2.2, 5.2, 15.5), Jacket);
	AppendBox(Buffer, FVector(0.0, 0.0, 30.5), FVector(11.8, 20.5, 4.0), Jacket);
	AppendOrientedBox(Buffer, FVector(10.8, -5.7, 22.0), FVector(1.1, 4.2, 9.0), FRotator(0.0, 0.0, -12.0f), Jacket * 0.82f);
	AppendOrientedBox(Buffer, FVector(10.8, 5.7, 22.0), FVector(1.1, 4.2, 9.0), FRotator(0.0, 0.0, 12.0f), Jacket * 0.82f);
	AppendBox(Buffer, FVector(11.5, 0.0, 8.0), FVector(0.75, 2.1, 2.1), Accent);

	// Segmented sleeves and hands read as shoulders, elbows, forearms, cuffs, and palms.
	AppendOrientedBox(Buffer, FVector(0.0, -22.5, 18.0), FVector(6.3, 6.5, 11.5), FRotator(0.0, 0.0, -7.0f), Jacket);
	AppendOrientedBox(Buffer, FVector(0.0, 22.5, 18.0), FVector(6.3, 6.5, 11.5), FRotator(0.0, 0.0, 7.0f), Jacket);
	AppendBox(Buffer, FVector(0.0, -24.0, 5.0), FVector(6.0, 6.0, 2.2), JacketShade);
	AppendBox(Buffer, FVector(0.0, 24.0, 5.0), FVector(6.0, 6.0, 2.2), JacketShade);
	AppendOrientedBox(Buffer, FVector(1.0, -24.0, -5.5), FVector(5.5, 5.7, 9.5), FRotator(0.0, 0.0, 3.0f), Jacket * 0.92f);
	AppendOrientedBox(Buffer, FVector(1.0, 24.0, -5.5), FVector(5.5, 5.7, 9.5), FRotator(0.0, 0.0, -3.0f), Jacket * 0.92f);
	AppendBox(Buffer, FVector(1.5, -24.0, -15.8), FVector(5.8, 6.0, 1.8), Shirt * 0.82f);
	AppendBox(Buffer, FVector(1.5, 24.0, -15.8), FVector(5.8, 6.0, 1.8), Shirt * 0.82f);
	AppendBox(Buffer, FVector(3.0, -24.0, -21.0), FVector(5.4, 5.6, 4.2), Ceramic);
	AppendBox(Buffer, FVector(3.0, 24.0, -21.0), FVector(5.4, 5.6, 4.2), Ceramic);

	// Neck, stepped cranium and jaw, ears, nose, eyes, brows, mouth, and layered voxel hair.
	AppendBox(Buffer, FVector(-0.5, 0.0, 41.0), FVector(5.3, 5.8, 6.0), CeramicShade);
	AppendBox(Buffer, FVector(-1.0, 0.0, 62.0), FVector(9.3, 10.0, 10.5), Ceramic);
	AppendBox(Buffer, FVector(1.0, 0.0, 52.7), FVector(7.8, 8.5, 5.0), Ceramic);
	AppendBox(Buffer, FVector(-0.5, -10.8, 61.0), FVector(2.5, 1.6, 4.0), CeramicShade);
	AppendBox(Buffer, FVector(-0.5, 10.8, 61.0), FVector(2.5, 1.6, 4.0), CeramicShade);
	AppendBox(Buffer, FVector(8.9, -3.6, 64.5), FVector(0.7, 2.2, 1.1), Eye);
	AppendBox(Buffer, FVector(8.9, 3.6, 64.5), FVector(0.7, 2.2, 1.1), Eye);
	AppendBox(Buffer, FVector(9.0, -3.6, 67.3), FVector(0.65, 2.6, 0.55), Hair * 1.35f);
	AppendBox(Buffer, FVector(9.0, 3.6, 67.3), FVector(0.65, 2.6, 0.55), Hair * 1.35f);
	AppendBox(Buffer, FVector(10.1, 0.0, 60.5), FVector(1.1, 1.8, 2.5), CeramicShade);
	AppendBox(Buffer, FVector(9.1, 0.0, 56.7), FVector(0.7, 3.2, 0.55), Mouth);
	AppendBox(Buffer, FVector(-1.4, 0.0, 74.5), FVector(9.8, 10.6, 2.6), Hair);
	AppendBox(Buffer, FVector(-9.1, 0.0, 68.5), FVector(2.0, 10.5, 5.0), Hair * 0.88f);
	AppendBox(Buffer, FVector(-2.0, -9.7, 70.0), FVector(7.8, 1.8, 3.5), Hair * 0.92f);
	AppendBox(Buffer, FVector(-2.0, 9.7, 70.0), FVector(7.8, 1.8, 3.5), Hair * 0.92f);
	AppendBox(Buffer, FVector(6.5, -5.5, 73.0), FVector(3.4, 4.8, 2.4), Hair * 1.08f);

	BodyMesh->ClearAllMeshSections();

	BodyMesh->CreateMeshSection_LinearColor(
		0,
		Buffer.Vertices,
		Buffer.Triangles,
		Buffer.Normals,
		Buffer.UV0,
		Buffer.Colors,
		Buffer.Tangents,
		false);

	UMaterialInterface* Material = LoadObject<UMaterialInterface>(
		nullptr,
		TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"));
	if (Material == nullptr)
	{
		Material = UMaterial::GetDefaultMaterial(MD_Surface);
	}
	BodyMesh->SetMaterial(0, Material);
}
