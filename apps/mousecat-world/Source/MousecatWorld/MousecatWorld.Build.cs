using UnrealBuildTool;

public class MousecatWorld : ModuleRules
{
	public MousecatWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"ProceduralMeshComponent"
		});

		PrivateDependencyModuleNames.AddRange(new[]
		{
			"Json",
			"ImageWrapper",
			"RenderCore",
			"RHI"
		});
	}
}
