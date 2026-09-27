#include "MousecatWorldGameMode.h"

#include "MousecatWorld.h"
#include "MousecatWorldBootstrap.h"
#include "MousecatWorldCharacter.h"
#include "MousecatWorldHUD.h"
#include "MousecatWorldReplay.h"
#include "MousecatNativeView.h"

#include "Camera/CameraActor.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/SpectatorPawn.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

AMousecatWorldGameMode::AMousecatWorldGameMode()
{
	DefaultPawnClass = nullptr;
	HUDClass = AMousecatWorldHUD::StaticClass();
}

void AMousecatWorldGameMode::StartPlay()
{
	Super::StartPlay();

	if (GetNetMode() == NM_Client)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (World == nullptr)
	{
		UE_LOG(LogMousecatWorld, Error, TEXT("No UWorld was available during native Mousecat startup."));
		return;
	}

	FActorSpawnParameters BootstrapParameters;
	FString NativeDirectory;
	if (FParse::Value(FCommandLine::Get(), TEXT("MousecatNativeView="), NativeDirectory))
	{
		World->SpawnActor<AMousecatNativeView>();
		if (APlayerController* Controller = UGameplayStatics::GetPlayerController(World, 0))
		{
			Controller->bShowMouseCursor = false;
			Controller->SetInputMode(FInputModeGameOnly());
		}
		return;
	}
	FString ReplayFile;
	if (FParse::Value(FCommandLine::Get(), TEXT("MousecatWorldReplay="), ReplayFile))
	{
		AMousecatWorldReplay* Replay = World->SpawnActor<AMousecatWorldReplay>();
		APlayerController* Controller = UGameplayStatics::GetPlayerController(World, 0);
		if (Replay && Replay->IsReady() && Controller)
		{
			ASpectatorPawn* Camera = World->SpawnActor<ASpectatorPawn>(Replay->GetCameraStart(), FRotator(-35,45,0));
			if (Camera) { Controller->Possess(Camera); Controller->SetControlRotation(FRotator(-35,45,0)); }
		}
		return;
	}
	BootstrapParameters.Name = TEXT("MousecatWorldBootstrap");
	BootstrapParameters.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	WorldBootstrap = World->SpawnActor<AMousecatWorldBootstrap>(
		AMousecatWorldBootstrap::StaticClass(),
		FTransform::Identity,
		BootstrapParameters);

	APlayerController* PlayerController = UGameplayStatics::GetPlayerController(World, 0);
	if (WorldBootstrap == nullptr || !WorldBootstrap->IsWorldReady())
	{
		UE_LOG(LogMousecatWorld, Error, TEXT("Native world startup stopped because manifest ingestion did not produce a valid world."));
		if (PlayerController != nullptr)
		{
			ACameraActor* FailureCamera = World->SpawnActor<ACameraActor>(
				FVector(0.0, 0.0, 300.0),
				FRotator(-15.0f, 0.0f, 0.0f));
			if (FailureCamera != nullptr)
			{
				PlayerController->SetViewTarget(FailureCamera);
			}
		}
		return;
	}

	FActorSpawnParameters CharacterParameters;
	CharacterParameters.Name = TEXT("MousecatOperatorPawn");
	CharacterParameters.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
	AMousecatWorldCharacter* Character = World->SpawnActor<AMousecatWorldCharacter>(
		AMousecatWorldCharacter::StaticClass(),
		WorldBootstrap->GetPlayerSpawnWorldLocation(),
		FRotator::ZeroRotator,
		CharacterParameters);
	if (Character == nullptr)
	{
		UE_LOG(LogMousecatWorld, Error, TEXT("World loaded, but the native player character could not be spawned."));
		return;
	}

	if (PlayerController != nullptr)
	{
		PlayerController->Possess(Character);
		PlayerController->SetControlRotation(FRotator(-12.0f, 30.0f, 0.0f));
		PlayerController->bShowMouseCursor = false;
		PlayerController->SetInputMode(FInputModeGameOnly());
	}
}
