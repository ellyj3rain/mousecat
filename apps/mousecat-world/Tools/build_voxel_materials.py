import unreal


MATERIAL_ROOT = "/Game/MousecatWorld/Materials"


def create_or_replace_material(name: str) -> unreal.Material:
    package_path = f"{MATERIAL_ROOT}/{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(package_path):
        unreal.EditorAssetLibrary.delete_asset(package_path)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    material = asset_tools.create_asset(name, MATERIAL_ROOT, unreal.Material, unreal.MaterialFactoryNew())
    if not material:
        raise RuntimeError(f"Could not create {package_path}")
    return material


def add_constant(material: unreal.Material, value: float, property_name: unreal.MaterialProperty, x: int, y: int) -> None:
    expression = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, x, y
    )
    expression.set_editor_property("r", value)
    unreal.MaterialEditingLibrary.connect_material_property(expression, "", property_name)


def add_vertex_emissive_floor(material: unreal.Material, vertex_color, strength: float, x: int, y: int) -> None:
    """Retain authored voxel colour in deep shade without flattening direct-light response."""
    intensity = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, x, y + 90
    )
    intensity.set_editor_property("r", strength)
    multiply = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionMultiply, x + 170, y
    )
    unreal.MaterialEditingLibrary.connect_material_expressions(vertex_color, "RGB", multiply, "A")
    unreal.MaterialEditingLibrary.connect_material_expressions(intensity, "", multiply, "B")
    unreal.MaterialEditingLibrary.connect_material_property(
        multiply, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR
    )


def build_surface() -> None:
    material = create_or_replace_material("M_VoxelSurface")
    material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    material.set_editor_property("two_sided", False)
    vertex_color = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionVertexColor, -420, -60
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        vertex_color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR
    )
    add_vertex_emissive_floor(material, vertex_color, 1.35, -180, -80)
    add_constant(material, 0.82, unreal.MaterialProperty.MP_ROUGHNESS, -420, 90)
    add_constant(material, 0.24, unreal.MaterialProperty.MP_SPECULAR, -420, 170)
    add_constant(material, 1.0, unreal.MaterialProperty.MP_AMBIENT_OCCLUSION, -420, 250)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)


def build_water() -> None:
    material = create_or_replace_material("M_VoxelWater")
    material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    material.set_editor_property("two_sided", True)
    vertex_color = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionVertexColor, -420, -60
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        vertex_color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR
    )
    add_vertex_emissive_floor(material, vertex_color, 1.50, -180, -80)
    add_constant(material, 0.68, unreal.MaterialProperty.MP_OPACITY, -420, 40)
    add_constant(material, 0.12, unreal.MaterialProperty.MP_ROUGHNESS, -420, 120)
    add_constant(material, 0.62, unreal.MaterialProperty.MP_SPECULAR, -420, 200)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)


build_surface()
build_water()
unreal.EditorAssetLibrary.save_directory(MATERIAL_ROOT, only_if_is_dirty=False, recursive=True)
unreal.log("Mousecat voxel materials generated.")
