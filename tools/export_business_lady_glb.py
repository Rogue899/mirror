import argparse
import sys
from pathlib import Path

import bpy


DEFAULT_GARMENT_KEYWORDS = [
    "blouse",
    "sweater",
    "shirt",
    "coat",
    "jacket",
    "upper",
    "sleeve",
    "torso",
]

EXCLUDE_KEYWORDS = [
    "body",
    "head",
    "hair",
    "eye",
    "teeth",
    "tongue",
    "lash",
    "brow",
    "shoe",
    "pant",
    "skirt",
    "belt",
    "glasses",
    "earring",
]

UE5_BONE_RENAMES = {
    "pelvis": "hips",
    "spine_01": "spine",
    "spine_02": "spine1",
    "spine_03": "chest",
    "neck_01": "neck",
    "clavicle_l": "leftShoulder",
    "clavicle_r": "rightShoulder",
    "upperarm_l": "leftUpperArm",
    "upperarm_r": "rightUpperArm",
    "lowerarm_l": "leftForearm",
    "lowerarm_r": "rightForearm",
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    parser = argparse.ArgumentParser(
        description="Import a Business Lady FBX into Blender and export a garment-only GLB."
    )
    parser.add_argument("--input", required=True, help="Path to the source FBX file")
    parser.add_argument("--output", required=True, help="Path to the GLB to export")
    parser.add_argument(
        "--garment-keywords",
        default=",".join(DEFAULT_GARMENT_KEYWORDS),
        help="Comma-separated substrings used to keep garment meshes",
    )
    parser.add_argument(
        "--include-full-rig",
        action="store_true",
        help="Keep all meshes except obvious body/accessory exclusions",
    )
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for collection in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.actions,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def import_fbx(input_path: Path) -> None:
    bpy.ops.import_scene.fbx(filepath=str(input_path), automatic_bone_orientation=True)


def normalize_bone_names() -> None:
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    for armature in armatures:
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode="EDIT")
        for bone in armature.data.edit_bones:
            mapped_name = UE5_BONE_RENAMES.get(bone.name.lower())
            if mapped_name:
                bone.name = mapped_name
        bpy.ops.object.mode_set(mode="OBJECT")


def should_keep_mesh(name: str, garment_keywords: list[str], include_full_rig: bool) -> bool:
    lowered = name.lower()
    if any(token in lowered for token in EXCLUDE_KEYWORDS):
        return False
    if include_full_rig:
        return True
    return any(token in lowered for token in garment_keywords)


def collect_export_objects(
    garment_keywords: list[str], include_full_rig: bool
) -> tuple[list[bpy.types.Object], list[str], list[str]]:
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    kept_meshes = []
    removed_mesh_names = []

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue

        if should_keep_mesh(obj.name, garment_keywords, include_full_rig):
            kept_meshes.append(obj)
        else:
            removed_mesh_names.append(obj.name)
            obj.hide_set(True)
            obj.hide_render = True

    return armatures + kept_meshes, [obj.name for obj in kept_meshes], removed_mesh_names


def export_glb(output_path: Path, export_objects: list[bpy.types.Object]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    garment_keywords = [
        token.strip().lower()
        for token in args.garment_keywords.split(",")
        if token.strip()
    ]

    if not input_path.exists():
        print(f"Input FBX not found: {input_path}")
        return 1

    reset_scene()
    import_fbx(input_path)
    normalize_bone_names()
    export_objects, kept_mesh_names, removed_mesh_names = collect_export_objects(
        garment_keywords, args.include_full_rig
    )

    if not kept_mesh_names:
        print("No garment meshes matched the provided keywords.")
        return 2

    export_glb(output_path, export_objects)

    print(f"Exported: {output_path}")
    print(f"Kept meshes: {', '.join(kept_mesh_names)}")
    if removed_mesh_names:
        print(f"Hidden meshes: {', '.join(removed_mesh_names)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())