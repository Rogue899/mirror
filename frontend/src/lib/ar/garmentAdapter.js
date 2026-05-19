const REQUIRED_BONE_ROLES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
]

const OPTIONAL_BONE_ROLES = ['leftForearm', 'rightForearm']

const MESH_ROLE_NAMES = ['upper', 'lower', 'ghost', 'occluder', 'unknown']

const runtimeBindingStore = new WeakMap()

const BONE_ALIASES = {
  hips: ['hips', 'pelvis', 'root', 'spine_root', 'mixamorigHips'],
  spine: ['spine', 'spine1', 'spine_01', 'lowerchest', 'mixamorigSpine'],
  chest: [
    'chest',
    'spine2',
    'spine_02',
    'spine_03',
    'upperchest',
    'spine3',
    'mixamorigSpine1',
    'mixamorigSpine2',
  ],
  neck: ['neck', 'neck1', 'neck_01', 'mixamorigNeck'],
  leftShoulder: [
    'leftshoulder',
    'shoulder_l',
    'lshoulder',
    'clavicle_l',
    'mixamorigLeftShoulder',
  ],
  rightShoulder: [
    'rightshoulder',
    'shoulder_r',
    'rshoulder',
    'clavicle_r',
    'mixamorigRightShoulder',
  ],
  leftUpperArm: ['leftarm', 'upperarm_l', 'leftupperarm', 'arm_l', 'mixamorigLeftArm'],
  rightUpperArm: ['rightarm', 'upperarm_r', 'rightupperarm', 'arm_r', 'mixamorigRightArm'],
  leftForearm: ['leftforearm', 'lowerarm_l', 'forearm_l', 'mixamorigLeftForeArm'],
  rightForearm: ['rightforearm', 'lowerarm_r', 'forearm_r', 'mixamorigRightForeArm'],
}

export const GARMENT_ASSET_CONTRACT = {
  version: 'garment-asset-contract/v1',
  format: 'GLB/GLTF 2.0',
  coordinateSystem: 'Y-up, forward-facing in rest pose, centered near torso origin',
  skeleton: {
    requiredRoles: REQUIRED_BONE_ROLES,
    optionalRoles: OPTIONAL_BONE_ROLES,
    notes:
      'Use a neutral A-pose or T-pose. Mixamo-style names are supported when they map to the adapter aliases.',
  },
  meshes: {
    requiresSkinnedMesh: true,
    requiresSkinWeights: true,
    recommendedMaterialSlots: ['torso', 'sleeves', 'collar', 'hem'],
    optionalMorphTargets: ['size', 'fit', 'sleeveLength'],
    roleNames: MESH_ROLE_NAMES,
  },
  runtimeBinding: {
    bodyRigFrameVersion: 'body-rig-frame/v1',
    anchorPins: ['collar', 'leftShoulder', 'rightShoulder', 'leftArmpit', 'rightArmpit', 'waistHem'],
    expectedInputs: ['anchor', 'axes.forward', 'axes.up', 'widths.shoulder', 'widths.hip', 'lengths.torso'],
  },
}

export function createPendingGarmentAdapter(modelUrl = null) {
  return {
    contract: GARMENT_ASSET_CONTRACT,
    mode: modelUrl ? 'loading-asset' : 'awaiting-asset',
    capabilities: null,
    boneMap: {},
    bonePaths: {},
    missingRequiredRoles: [...REQUIRED_BONE_ROLES],
    optionalRoleCoverage: {
      leftForearm: false,
      rightForearm: false,
      forearmPair: false,
    },
    meshRoleCounts: Object.fromEntries(MESH_ROLE_NAMES.map((role) => [role, 0])),
    riggedReady: false,
    modelUrl,
  }
}

function normalizeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pickBoneByAlias(boneNames, aliases) {
  const normalized = boneNames.map((name) => ({
    raw: name,
    normalized: normalizeName(name),
  }))

  for (const alias of aliases) {
    const wanted = normalizeName(alias)
    const exact = normalized.find((entry) => entry.normalized === wanted)
    if (exact) return exact.raw
  }

  for (const alias of aliases) {
    const wanted = normalizeName(alias)
    const partial = normalized.find((entry) => entry.normalized.includes(wanted))
    if (partial) return partial.raw
  }

  return null
}

function buildNodePath(node) {
  const parts = []
  let current = node

  while (current) {
    parts.unshift(current.name || current.type || 'node')
    current = current.parent
  }

  return parts.join('/')
}

function classifyMeshRole(node, materialNames) {
  const haystack = normalizeName([node.name, ...materialNames].filter(Boolean).join(' '))

  if (!haystack) return 'unknown'

  if (
    haystack.includes('occluder') ||
    haystack.includes('occlude') ||
    haystack.includes('depth') ||
    haystack.includes('mask') ||
    haystack.includes('hiddenbody') ||
    haystack.includes('bodyproxy')
  ) {
    return 'occluder'
  }

  if (haystack.includes('ghost') || haystack.includes('proxy') || haystack.includes('guide')) {
    return 'ghost'
  }

  if (
    haystack.includes('pant') ||
    haystack.includes('trouser') ||
    haystack.includes('skirt') ||
    haystack.includes('short') ||
    haystack.includes('leg') ||
    haystack.includes('lower')
  ) {
    return 'lower'
  }

  if (
    haystack.includes('shirt') ||
    haystack.includes('blouse') ||
    haystack.includes('sweater') ||
    haystack.includes('jacket') ||
    haystack.includes('coat') ||
    haystack.includes('hoodie') ||
    haystack.includes('sleeve') ||
    haystack.includes('upper') ||
    haystack.includes('torso') ||
    haystack.includes('collar')
  ) {
    return 'upper'
  }

  return 'unknown'
}

function collectBoneRefs(root) {
  const refs = new Map()

  root.traverse((node) => {
    if (!node.isBone) return
    refs.set(node.name, node)
  })

  return refs
}

export function inspectGarmentAsset(root) {
  const boneNames = []
  const materialSlots = new Set()
  const meshRoleCounts = Object.fromEntries(MESH_ROLE_NAMES.map((role) => [role, 0]))
  const meshDetails = []
  let meshCount = 0
  let skinnedMeshCount = 0
  let morphTargetCount = 0
  let hasSkinWeights = false

  root.traverse((node) => {
    if (node.isBone) {
      boneNames.push(node.name)
    }

    if (!node.isMesh && !node.isSkinnedMesh) {
      return
    }

    meshCount += 1
    if (node.isSkinnedMesh) skinnedMeshCount += 1

    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const materialNames = materials.filter(Boolean).map((material, index) => {
      const materialName = material.name || `${node.name || 'mesh'}:${index}`
      materialSlots.add(materialName)
      return materialName
    })
    const role = classifyMeshRole(node, materialNames)
    meshRoleCounts[role] += 1
    meshDetails.push({
      name: node.name || `mesh-${meshCount}`,
      path: buildNodePath(node),
      role,
      skinned: Boolean(node.isSkinnedMesh),
      materialNames,
    })

    if (node.geometry?.attributes?.skinWeight) {
      hasSkinWeights = true
    }

    morphTargetCount += Object.keys(node.morphTargetDictionary || {}).length
  })

  return {
    meshCount,
    skinnedMeshCount,
    hasSkinWeights,
    boneNames,
    materialSlots: Array.from(materialSlots),
    morphTargetCount,
    meshRoleCounts,
    meshDetails,
  }
}

export function buildGarmentAdapter(root) {
  const capabilities = inspectGarmentAsset(root)
  const boneRefsByName = collectBoneRefs(root)
  const boneMap = Object.fromEntries(
    Object.entries(BONE_ALIASES).map(([role, aliases]) => [
      role,
      pickBoneByAlias(capabilities.boneNames, aliases),
    ])
  )

  const bonePaths = Object.fromEntries(
    Object.entries(boneMap).map(([role, boneName]) => [
      role,
      boneName ? buildNodePath(boneRefsByName.get(boneName)) : null,
    ])
  )

  const missingRequiredRoles = REQUIRED_BONE_ROLES.filter((role) => !boneMap[role])
  const riggedReady =
    capabilities.skinnedMeshCount > 0 &&
    capabilities.hasSkinWeights &&
    missingRequiredRoles.length === 0

  const optionalRoleCoverage = {
    leftForearm: Boolean(boneMap.leftForearm),
    rightForearm: Boolean(boneMap.rightForearm),
    forearmPair: Boolean(boneMap.leftForearm && boneMap.rightForearm),
  }

  const adapter = {
    contract: GARMENT_ASSET_CONTRACT,
    mode: riggedReady ? 'rigged-ready' : 'fallback-static',
    capabilities,
    boneMap,
    bonePaths,
    missingRequiredRoles,
    optionalRoleCoverage,
    meshRoleCounts: capabilities.meshRoleCounts,
    riggedReady,
  }

  runtimeBindingStore.set(adapter, {
    root,
    boneRefs: Object.fromEntries(
      Object.entries(boneMap).map(([role, boneName]) => [
        role,
        boneName ? boneRefsByName.get(boneName) || null : null,
      ])
    ),
  })

  return adapter
}

export function getGarmentRuntimeBinding(adapter) {
  return adapter ? runtimeBindingStore.get(adapter) ?? null : null
}