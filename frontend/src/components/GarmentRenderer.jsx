import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { useRef, useMemo, Suspense } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

// MediaPipe Pose landmark indices
const LM = {
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
  LEFT_HIP:       23,
  RIGHT_HIP:      24,
  LEFT_KNEE:      25,
  RIGHT_KNEE:     26,
}

function lmToVec3(lm) {
  return new THREE.Vector3(
    (lm.x - 0.5) * 4,
    -(lm.y - 0.5) * 3,
    lm.z * -1.5
  )
}

function midpointLm(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: 1 }
}

/** Shared landmark tracking logic — used by both placeholder and real garment */
function useLandmarkTracking(landmarks, group, posOffset = { x: 0, y: 0, z: 0 }, rotOffset = { x: 0, y: 0, z: 0 }, scaleMult = 1) {
  const targetPos   = useRef(new THREE.Vector3())
  const targetScale = useRef(new THREE.Vector3(1, 1, 1))
  const targetQuat  = useRef(new THREE.Quaternion())
  const logCounter  = useRef(0)

  useFrame(() => {
    if (!group.current || landmarks.length < 29) return

    const ls = landmarks[LM.LEFT_SHOULDER]
    const rs = landmarks[LM.RIGHT_SHOULDER]
    const lh = landmarks[LM.LEFT_HIP]
    const rh = landmarks[LM.RIGHT_HIP]

    // 0.65 threshold — matches backend min_tracking_confidence=0.6,
    // gives reliable garment binding without false positives.
    // Per MediaPipe docs: stand 2-4 metres from camera, front-facing.
    if (
      ls.visibility < 0.65 ||
      rs.visibility < 0.65 ||
      lh.visibility < 0.65 ||
      rh.visibility < 0.65
    ) return

    const shoulderMid = midpointLm(ls, rs)
    const hipMid      = midpointLm(lh, rh)
    const torsoCenter = midpointLm(shoulderMid, hipMid)

    const lsV          = lmToVec3(ls)
    const rsV          = lmToVec3(rs)
    const shoulderMidV = lmToVec3(shoulderMid)
    const hipMidV      = lmToVec3(hipMid)
    const shoulderWidth = lsV.distanceTo(rsV)
    const torsoHeight   = shoulderMidV.distanceTo(hipMidV)

    targetPos.current.copy(lmToVec3(torsoCenter))
    // Apply debug offset from sliders
    targetPos.current.x += posOffset.x
    targetPos.current.y += posOffset.y
    targetPos.current.z += posOffset.z
    group.current.position.lerp(targetPos.current, 0.3)

    targetScale.current.set(
      shoulderWidth * 1.15 * scaleMult,
      torsoHeight   * 1.05 * scaleMult,
      shoulderWidth * 0.6  * scaleMult
    )
    group.current.scale.lerp(targetScale.current, 0.25)

    // Use quaternion slerp to avoid gimbal lock
    const shoulderAngleZ = Math.atan2(rsV.y - lsV.y, rsV.x - lsV.x)
    const lateralShift = hipMidV.x - shoulderMidV.x
    targetQuat.current.setFromEuler(
      new THREE.Euler(rotOffset.x, lateralShift * 0.4 + rotOffset.y, shoulderAngleZ + rotOffset.z, 'YXZ')
    )
    group.current.quaternion.slerp(targetQuat.current, 0.2)

    // ── DIAGNOSTIC LOG (every 60 frames ≈ once per second) ──
    logCounter.current++
    if (logCounter.current % 60 === 0) {
      console.log('[TRACK]', JSON.stringify({
        // Raw MediaPipe landmarks (normalised 0-1)
        raw: {
          ls: { x: ls.x, y: ls.y, z: ls.z, vis: ls.visibility },
          rs: { x: rs.x, y: rs.y, z: rs.z, vis: rs.visibility },
          lh: { x: lh.x, y: lh.y, z: lh.z, vis: lh.visibility },
          rh: { x: rh.x, y: rh.y, z: rh.z, vis: rh.visibility },
        },
        // Computed THREE.js values
        computed: {
          shoulderWidth: +shoulderWidth.toFixed(3),
          torsoHeight: +torsoHeight.toFixed(3),
          shoulderAngleZ: +(shoulderAngleZ * 180 / Math.PI).toFixed(1),
          lateralShift: +lateralShift.toFixed(3),
          shoulderZdiff: +(rs.z - ls.z).toFixed(4),
        },
        // Final applied transform
        applied: {
          pos: { x: +group.current.position.x.toFixed(3), y: +group.current.position.y.toFixed(3), z: +group.current.position.z.toFixed(3) },
          scale: { x: +group.current.scale.x.toFixed(3), y: +group.current.scale.y.toFixed(3), z: +group.current.scale.z.toFixed(3) },
        },
        // Debug slider offsets
        sliders: { posOffset, rotOffset, scaleMult },
      }))
    }
  })
}

/**
 * Placeholder garment — a simple T-shirt shaped mesh rendered when no
 * GLB model is available. Proves the full AR pipeline works.
 * Replace with a real GLB by setting model_url on the product.
 */
function PlaceholderGarment({ landmarks, posOffset, rotOffset, scaleMult }) {
  const group = useRef()
  useLandmarkTracking(landmarks, group, posOffset, rotOffset, scaleMult)

  return (
    <group ref={group}>
      {/* Torso body */}
      <mesh>
        <boxGeometry args={[1, 1.2, 0.25]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.75} />
      </mesh>
      {/* Left sleeve */}
      <mesh position={[-0.7, 0.35, 0]}>
        <boxGeometry args={[0.4, 0.35, 0.22]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.75} />
      </mesh>
      {/* Right sleeve */}
      <mesh position={[0.7, 0.35, 0]}>
        <boxGeometry args={[0.4, 0.35, 0.22]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.75} />
      </mesh>
      {/* Collar */}
      <mesh position={[0, 0.65, 0]}>
        <torusGeometry args={[0.18, 0.06, 8, 16]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
    </group>
  )
}

/** Real garment loaded from a GLB/GLTF file */
function GarmentModel({ modelUrl, landmarks, posOffset, rotOffset, scaleMult }) {
  const gltf  = useLoader(GLTFLoader, modelUrl)
  const group = useRef()

  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    // Bake 180° Y rotation into geometry vertices so it doesn't
    // conflict with the tracking quaternion on the parent group
    const rotMatrix = new THREE.Matrix4().makeRotationY(Math.PI)
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 })
    clone.traverse((node) => {
      if (node.isMesh) {
        if (node.geometry) {
          node.geometry.applyMatrix4(rotMatrix)
          // Wireframe overlay for debug — shows mesh edges in green
          const edges = new THREE.EdgesGeometry(node.geometry)
          const lines = new THREE.LineSegments(edges, wireframeMat)
          node.add(lines)
        }
        node.castShadow    = true
        node.receiveShadow = true
        if (node.material) node.material.side = THREE.DoubleSide
      }
    })
    return clone
  }, [gltf])

  useLandmarkTracking(landmarks, group, posOffset, rotOffset, scaleMult)

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  )
}

function GarmentRenderer({ modelUrl, landmarks, posOffset, rotOffset, scaleMult }) {
  return (
    <Canvas
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
      camera={{ position: [0, 0, 3], fov: 55 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 2]}   intensity={0.7} castShadow />
      <directionalLight position={[-2, 2, -2]}  intensity={0.3} />

      <Suspense fallback={null}>
        {modelUrl
          ? <GarmentModel modelUrl={modelUrl} landmarks={landmarks} posOffset={posOffset} rotOffset={rotOffset} scaleMult={scaleMult} />
          : <PlaceholderGarment landmarks={landmarks} posOffset={posOffset} rotOffset={rotOffset} scaleMult={scaleMult} />
        }
      </Suspense>
    </Canvas>
  )
}

export default GarmentRenderer
