# Garment Models

Place `.glb` or `.gltf` files in this folder. They are served at `/garments/<filename>.glb`, then referenced from product data as `model_url = "/garments/<filename>.glb"`.

## Runtime Contract

The current AR runtime supports two asset paths:

- `fallback-static`: non-rigged or incomplete assets still track the torso as a whole group and receive the existing width-based deformation.
- `rigged-ready`: skinned GLBs with the required skeleton contract can receive bone driving for torso, shoulders, upper arms, and forearms.

To be considered `rigged-ready`, an asset should satisfy all of the following:

- Format: GLB/GLTF 2.0
- Meshes: at least one skinned mesh with valid skin weights
- Rest pose: neutral A-pose or T-pose, facing forward in a Y-up scene
- Origin: centered near the torso / hip anchor in rest pose
- Scale: roughly human-sized, about `1.7m` in Blender units before export

## Required Bones

These roles must be present for the runtime to leave fallback mode:

- `hips`
- `spine`
- `chest`
- `neck`
- `leftShoulder`
- `rightShoulder`
- `leftUpperArm`
- `rightUpperArm`

## Optional Bones

These improve sleeve realism but are not required yet:

- `leftForearm`
- `rightForearm`

Hand channels are placeholders in the current runtime and do not require finger bones yet.

## Supported Bone Aliases

Generic aliases already supported include names like `hips`, `spine`, `spine1`, `spine2`, `chest`, `neck`, `leftShoulder`, `rightShoulder`, `leftArm`, `rightArm`, `leftForearm`, and `rightForearm`.

Mixamo-style aliases supported by the adapter include:

- `mixamorigHips`
- `mixamorigSpine`
- `mixamorigSpine1`
- `mixamorigSpine2`
- `mixamorigNeck`
- `mixamorigLeftShoulder`
- `mixamorigRightShoulder`
- `mixamorigLeftArm`
- `mixamorigRightArm`
- `mixamorigLeftForeArm`
- `mixamorigRightForeArm`

## Mesh Role Naming

Mesh-role classification is name/material based and intentionally conservative. If you want deterministic runtime roles, include one of these naming hints in the mesh or material name:

- `upper`: `shirt`, `jacket`, `coat`, `hoodie`, `sleeve`, `upper`, `torso`, `collar`
- `lower`: `pants`, `trouser`, `skirt`, `shorts`, `leg`, `lower`
- `ghost`: `ghost`, `proxy`, `guide`
- `occluder`: `occluder`, `occlude`, `depth`, `mask`, `hiddenBody`, `bodyProxy`

`occluder` meshes are for future depth-only hidden-occluder rendering, and `ghost` meshes are for non-primary diagnostic or helper geometry.

## Blender Export Notes

If the source model is not rigged:

1. Open the asset in Blender.
2. Add or retarget to a humanoid armature.
3. Weight the garment mesh to the armature.
4. Export as GLB with armature, skinned mesh, and skin weights included.

For rigged assets, verify that the exported GLB still contains the bone hierarchy and that the skinned mesh keeps its weights after export.

## Included Test Assets

- `top01.glb`: static top placeholder, not rigged-ready. Source: "Top01" by lil_lunamoth on Sketchfab, licensed CC-BY-4.0. Credit is required if used in a shared demo.
- `meshy-white-shirt-a-pose.glb`: Meshy Text to 3D preview output. Valid static GLB, but not rigged-ready: no skins, no animations, no `JOINTS_0`, no `WEIGHTS_0`.
- `meshy-white-shirt-a-pose.fbx`: Meshy FBX export of the same candidate, kept for Blender rigging/retargeting.
