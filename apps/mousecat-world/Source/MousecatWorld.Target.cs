using UnrealBuildTool;

public class MousecatWorldTarget : TargetRules
{
	public MousecatWorldTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V7;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
		ExtraModuleNames.Add("MousecatWorld");
	}
}
