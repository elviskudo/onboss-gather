# Cozy village 3D visual target

Reference: the welcoming farming-village feeling of Harvest Moon. Original models and textures; no franchise artwork, characters, names or logos are imported.

Engine: Three.js r186.1. Perspective follow camera, 36 degree field of view, 29-unit starting distance; desktop and mobile. Keep gameplay footprints, portals, mosque, interiors and profile interactions.

Shape family: smooth rounded tree crowns, beveled timber/plaster houses, detailed curved characters, softened terrain and mountain silhouettes. No faceted foliage, flat-shaded domes or polygon-cone mountains.

Palette: rich meadow greens, ochre paths, terracotta roof tiles, cream plaster, walnut timber, turquoise water; warm daylight with cooler sky fill. Use textured PBR surfaces and contact shadows to separate shapes.

Asset families: procedural grass/stone/wood/plaster/roof textures, smooth orchard trees and crops, flower beds and picket fences, rounded village architecture and human characters. Texture budget: five shared 256px CanvasTextures in sRGB with mipmaps; geometry batches retain UVs. Reuse materials and instancing for repeated small props. Simplified collision stays separate from render geometry.

Technical provenance: geometry and deterministic procedural texture source in this repository. No external art or raster image-generation outputs. Camera framing and desktop/mobile in-engine screenshots are the acceptance target; final approval requires visual inspection at game scale.
