#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "MousecatWorldGameMode.generated.h"

class AMousecatWorldBootstrap;

UCLASS()
class MOUSECATWORLD_API AMousecatWorldGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AMousecatWorldGameMode();
	virtual void StartPlay() override;

private:
	UPROPERTY(Transient)
	TObjectPtr<AMousecatWorldBootstrap> WorldBootstrap;
};
