# Garment Models

Place .glb or .gltf files here.

They will be served at:
  http://localhost:3000/garments/<filename>.glb

Then update the product in the DB:
  model_url = "/garments/<filename>.glb"

## Sketchfab Download Tips

1. Search: "rigged shirt glb" / "rigged hoodie gltf" / "rigged dress"
2. Filter: Downloadable ✓, Animated ✓ (means it's rigged)
3. Download format: GLB (preferred) or GLTF
4. Place the .glb file directly in this folder

## Blender Processing (if model needs rigging)

If the downloaded model is NOT rigged:
1. Open in Blender
2. Add Armature > Human (Meta-Rig)
3. Weight paint the mesh to the armature
4. Export as GLB with Armature included

## Model Requirements for Best Results

- Format: GLB or GLTF
- Rigged: Yes (humanoid skeleton)
- Scale: ~1.7m tall in Blender units
- Origin: At hip/waist centre
- Materials: PBR textures preferred
