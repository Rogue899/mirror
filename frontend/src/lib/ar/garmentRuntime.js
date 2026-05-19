import * as THREE from 'three'
import { computeBodyRigFrame } from './bodyRig'
import { getGarmentRuntimeBinding } from './garmentAdapter'

const DEFAULT_UP = new THREE.Vector3(0, 1, 0)
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, 1)
const DEFAULT_LEFT = new THREE.Vector3(-1, 0, 0)
const DEFAULT_RIGHT = new THREE.Vector3(1, 0, 0)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function vectorFromPlain(point, fallback = null) {
  if (!point) return fallback ? fallback.clone() : null
  return new THREE.Vector3(point.x, point.y, point.z)
}

function toPlainVector(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  }
}

function normalizeOrFallback(vector, fallback) {
  if (!vector || vector.lengthSq() < 1e-6) return fallback.clone()
  return vector.normalize()
}

function solveDirectionalChannel({ position, direction, up, forward, length = 0, start = null, end = null }) {
  return {
    position: toPlainVector(position),
    direction: toPlainVector(direction),
    up: toPlainVector(up),
    forward: toPlainVector(forward),
    length,
    start: start ? toPlainVector(start) : null,
    end: end ? toPlainVector(end) : null,
  }
}

function solveSegmentChannel(start, end, fallbackDirection, up, forward) {
  if (!start) return null

  const resolvedEnd = end || start.clone().add(fallbackDirection.clone().multiplyScalar(0.3))
  const direction = normalizeOrFallback(resolvedEnd.clone().sub(start), fallbackDirection)
  const length = resolvedEnd.distanceTo(start)

  return solveDirectionalChannel({
    position: start,
    direction,
    up,
    forward,
    length,
    start,
    end: resolvedEnd,
  })
}

function buildBoneRuntimeState(binding, bone) {
  if (!binding.boneRuntimeState) {
    binding.boneRuntimeState = new Map()
  }

  const cached = binding.boneRuntimeState.get(bone.uuid)
  if (cached) return cached

  const childBone = bone.children.find(
    (child) => child.isBone && child.position.lengthSq() > 1e-6
  )
  const childDirectionLocal = childBone
    ? childBone.position.clone().normalize()
    : DEFAULT_UP.clone()
  const restQuaternion = bone.quaternion.clone()
  const restDirectionParent = childDirectionLocal.clone().applyQuaternion(restQuaternion).normalize()

  const runtimeState = {
    restQuaternion,
    restDirectionParent,
  }

  binding.boneRuntimeState.set(bone.uuid, runtimeState)
  return runtimeState
}

function applyBoneDirectionTarget(binding, bone, targetDirection, rotationLerp) {
  if (!bone || !targetDirection || targetDirection.lengthSq() < 1e-6) return false

  bone.parent?.updateWorldMatrix(true, false)

  const runtimeState = buildBoneRuntimeState(binding, bone)
  const parentWorldQuaternion = bone.parent
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion()
  const desiredDirectionParent = targetDirection.clone().applyQuaternion(parentWorldQuaternion.invert())

  if (desiredDirectionParent.lengthSq() < 1e-6) return false

  desiredDirectionParent.normalize()

  const alignment = new THREE.Quaternion().setFromUnitVectors(
    runtimeState.restDirectionParent,
    desiredDirectionParent
  )
  const targetQuaternion = alignment.multiply(runtimeState.restQuaternion.clone())

  bone.quaternion.slerp(targetQuaternion, rotationLerp)
  return true
}

function getChannelDirection(channel) {
  return vectorFromPlain(channel?.direction)
}

export function solveBodyFrame({ bodyRigFrame = null, landmarks = null, options = {} } = {}) {
  if (bodyRigFrame?.contractVersion === 'body-rig-frame/v1') {
    return bodyRigFrame
  }

  return computeBodyRigFrame(landmarks, options)
}

export function solveGarmentPoseTargets(bodyRigFrame) {
  if (!bodyRigFrame) return null

  const up = normalizeOrFallback(vectorFromPlain(bodyRigFrame.axes?.up), DEFAULT_UP)
  const forward = normalizeOrFallback(vectorFromPlain(bodyRigFrame.axes?.forward), DEFAULT_FORWARD)
  const leftShoulder = vectorFromPlain(bodyRigFrame.points?.leftShoulder)
  const rightShoulder = vectorFromPlain(bodyRigFrame.points?.rightShoulder)
  const leftElbow = vectorFromPlain(bodyRigFrame.points?.leftElbow)
  const rightElbow = vectorFromPlain(bodyRigFrame.points?.rightElbow)
  const leftWrist = vectorFromPlain(bodyRigFrame.points?.leftWrist)
  const rightWrist = vectorFromPlain(bodyRigFrame.points?.rightWrist)
  const shoulderMid = vectorFromPlain(bodyRigFrame.points?.shoulderMid)
  const hipMid = vectorFromPlain(bodyRigFrame.points?.hipMid)
  const torsoCenter = vectorFromPlain(bodyRigFrame.points?.torsoCenter)
  const anchor = vectorFromPlain(bodyRigFrame.anchor)

  if (!leftShoulder || !rightShoulder || !shoulderMid || !hipMid || !torsoCenter || !anchor) {
    return null
  }

  const torsoLength = Math.max(shoulderMid.distanceTo(hipMid), 1e-4)
  const shoulderWidth = leftShoulder.distanceTo(rightShoulder)
  const rootPosition = hipMid.clone().lerp(torsoCenter, 0.2)
  const spinePosition = hipMid.clone().lerp(shoulderMid, 0.4)
  const chestPosition = hipMid.clone().lerp(shoulderMid, 0.78)
  const neckPosition = shoulderMid.clone().addScaledVector(up, torsoLength * 0.16)
  const leftShoulderDirection = normalizeOrFallback(
    leftShoulder.clone().sub(shoulderMid),
    DEFAULT_LEFT
  )
  const rightShoulderDirection = normalizeOrFallback(
    rightShoulder.clone().sub(shoulderMid),
    DEFAULT_RIGHT
  )

  const leftUpperArm = solveSegmentChannel(
    leftShoulder,
    leftElbow,
    leftShoulderDirection,
    up,
    forward
  )
  const rightUpperArm = solveSegmentChannel(
    rightShoulder,
    rightElbow,
    rightShoulderDirection,
    up,
    forward
  )
  const leftForearm = leftElbow
    ? solveSegmentChannel(
        leftElbow,
        leftWrist,
        getChannelDirection(leftUpperArm) || leftShoulderDirection,
        up,
        forward
      )
    : null
  const rightForearm = rightElbow
    ? solveSegmentChannel(
        rightElbow,
        rightWrist,
        getChannelDirection(rightUpperArm) || rightShoulderDirection,
        up,
        forward
      )
    : null

  return {
    contractVersion: 'garment-pose-targets/v1',
    bodyRigFrameVersion: bodyRigFrame.contractVersion,
    confidence: bodyRigFrame.confidence ?? 0,
    measurements: {
      shoulderWidth,
      torsoLength,
    },
    root: solveDirectionalChannel({
      position: rootPosition,
      direction: up,
      up,
      forward,
      length: torsoLength,
    }),
    spine: solveDirectionalChannel({
      position: spinePosition,
      direction: up,
      up,
      forward,
      length: torsoLength * 0.4,
    }),
    chest: solveDirectionalChannel({
      position: chestPosition,
      direction: up,
      up,
      forward,
      length: torsoLength * 0.3,
    }),
    neck: solveDirectionalChannel({
      position: neckPosition,
      direction: up,
      up,
      forward,
      length: torsoLength * 0.18,
    }),
    leftShoulder: solveDirectionalChannel({
      position: leftShoulder,
      direction: leftShoulderDirection,
      up,
      forward,
      length: shoulderWidth * 0.25,
    }),
    rightShoulder: solveDirectionalChannel({
      position: rightShoulder,
      direction: rightShoulderDirection,
      up,
      forward,
      length: shoulderWidth * 0.25,
    }),
    leftUpperArm,
    rightUpperArm,
    leftForearm,
    rightForearm,
    leftHand: {
      active: false,
      position: leftWrist ? toPlainVector(leftWrist) : null,
    },
    rightHand: {
      active: false,
      position: rightWrist ? toPlainVector(rightWrist) : null,
    },
  }
}

export function applyFallbackStaticTransform(target, bodyRigFrame, options = {}) {
  if (!target || !bodyRigFrame) return false

  const {
    positionLerp = 0.3,
    scaleLerp = 0.25,
    rotationLerp = 0.35,
    scaleEase = { x: 1, y: 1, z: 1 },
    anchorOffset = { right: 0, up: 0, forward: 0 },
  } = options

  const nextPosition = new THREE.Vector3(
    bodyRigFrame.anchor.x,
    bodyRigFrame.anchor.y,
    bodyRigFrame.anchor.z
  )
  const rightAxis = vectorFromPlain(bodyRigFrame.axes?.right, DEFAULT_RIGHT)
  const upAxis = vectorFromPlain(bodyRigFrame.axes?.up, DEFAULT_UP)
  const forwardAxis = vectorFromPlain(bodyRigFrame.axes?.forward, DEFAULT_FORWARD)
  const shoulderUnit = bodyRigFrame.widths?.shoulder ?? 1
  const torsoUnit = bodyRigFrame.lengths?.torso ?? 1

  nextPosition
    .addScaledVector(rightAxis, (anchorOffset.right ?? 0) * shoulderUnit)
    .addScaledVector(upAxis, (anchorOffset.up ?? 0) * torsoUnit)
    .addScaledVector(forwardAxis, (anchorOffset.forward ?? 0) * shoulderUnit)

  const nextScale = new THREE.Vector3(
    bodyRigFrame.garmentScale.x * (scaleEase.x ?? 1),
    bodyRigFrame.garmentScale.y * (scaleEase.y ?? 1),
    bodyRigFrame.garmentScale.z * (scaleEase.z ?? 1)
  )
  const nextQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      bodyRigFrame.rotation.pitchWithOffset,
      bodyRigFrame.rotation.yawWithOffset,
      bodyRigFrame.rotation.rollWithOffset,
      'YXZ'
    )
  )

  target.position.lerp(nextPosition, positionLerp)
  target.scale.lerp(nextScale, scaleLerp)
  target.quaternion.slerp(nextQuaternion, rotationLerp)
  return true
}

export function applyFallbackStaticDeformation(deformation, bodyRigFrame, options = {}) {
  if (!deformation || !bodyRigFrame) return false

  const shoulderBias = options.shoulderBias ?? 1.22
  const ratio = clamp(
    bodyRigFrame.widths.hip / Math.max(bodyRigFrame.widths.shoulder, 1e-4),
    0.55,
    1.1
  )

  for (const { mesh, original } of deformation.meshData) {
    const position = mesh.geometry.attributes.position
    const array = position.array

    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3
      const yNorm = (original[offset + 1] - deformation.yMin) / deformation.yRange
      const xScale = ratio + (shoulderBias - ratio) * yNorm
      array[offset] = original[offset] * xScale
      array[offset + 1] = original[offset + 1]
      array[offset + 2] = original[offset + 2]
    }

    position.needsUpdate = true
  }

  return true
}

export function applyRiggedSkeletonDriving(adapter, poseTargets, options = {}) {
  if (!adapter?.riggedReady || !poseTargets) return false

  const binding = getGarmentRuntimeBinding(adapter)
  if (!binding?.boneRefs) return false

  const rotationLerp = options.rotationLerp ?? 0.28
  const targetByRole = {
    hips: getChannelDirection(poseTargets.root),
    spine: getChannelDirection(poseTargets.spine),
    chest: getChannelDirection(poseTargets.chest),
    neck: getChannelDirection(poseTargets.neck),
    leftShoulder: getChannelDirection(poseTargets.leftShoulder),
    rightShoulder: getChannelDirection(poseTargets.rightShoulder),
    leftUpperArm: getChannelDirection(poseTargets.leftUpperArm),
    rightUpperArm: getChannelDirection(poseTargets.rightUpperArm),
    leftForearm: getChannelDirection(poseTargets.leftForearm),
    rightForearm: getChannelDirection(poseTargets.rightForearm),
  }

  let applied = 0

  for (const [role, targetDirection] of Object.entries(targetByRole)) {
    const bone = binding.boneRefs[role]
    if (!bone || !targetDirection) continue

    if (applyBoneDirectionTarget(binding, bone, targetDirection, rotationLerp)) {
      applied += 1
    }
  }

  return applied > 0
}

export function summarizeGarmentRuntime({
  adapter = null,
  bodyRigFrame = null,
  poseTargets = null,
  hasAsset = false,
  mockRig = false,
} = {}) {
  const hasBodyFrame = Boolean(bodyRigFrame)
  const poseTargetsReady = Boolean(poseTargets)
  const forearmsReady = Boolean(poseTargets?.leftForearm && poseTargets?.rightForearm)

  let mode = 'awaiting-asset'
  if (adapter?.riggedReady) {
    mode = 'rigged-ready'
  } else if (mockRig && poseTargetsReady) {
    mode = 'mock-rig'
  } else if (hasAsset) {
    mode = 'fallback-static'
  }

  return {
    mode,
    driver:
      mode === 'rigged-ready'
        ? 'skeleton-driving'
        : mode === 'mock-rig'
          ? 'mock-rig'
          : mode === 'fallback-static'
            ? 'static-transform'
            : 'awaiting-asset',
    hasBodyFrame,
    poseTargetsReady,
    forearmsReady,
    confidence: bodyRigFrame?.confidence ?? 0,
    channelCount: poseTargetsReady
      ? [
          poseTargets.root,
          poseTargets.spine,
          poseTargets.chest,
          poseTargets.neck,
          poseTargets.leftShoulder,
          poseTargets.rightShoulder,
          poseTargets.leftUpperArm,
          poseTargets.rightUpperArm,
          poseTargets.leftForearm,
          poseTargets.rightForearm,
        ].filter(Boolean).length
      : 0,
  }
}