#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MousecatWorldCharacter.generated.h"

class UCameraComponent;
class UProceduralMeshComponent;
class USpringArmComponent;

UCLASS()
class MOUSECATWORLD_API AMousecatWorldCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AMousecatWorldCharacter();

	virtual void BeginPlay() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

private:
	UPROPERTY(VisibleAnywhere, Category = "Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, Category = "Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	UPROPERTY(VisibleAnywhere, Category = "Presentation")
	TObjectPtr<UProceduralMeshComponent> BodyMesh;

	float WalkSpeed = 550.0f;
	float SprintSpeed = 900.0f;
	float GamepadTurnRateDegrees = 105.0f;

	void MoveForward(float Value);
	void MoveRight(float Value);
	void TurnAtRate(float Value);
	void LookUpAtRate(float Value);
	void BeginSprint();
	void EndSprint();
	void BuildProceduralHuman();
};
