using UnrealBuildTool;

public class MousecatWorldEditorTarget : TargetRules
{
	public MousecatWorldEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V7;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
		ExtraModuleNames.Add("MousecatWorld");
	}
}
