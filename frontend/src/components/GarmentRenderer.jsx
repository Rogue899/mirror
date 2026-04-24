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

// Convert user-provided anthropometry into per-axis scale multipliers so
// the shirt matches real body proportions rather than landmark-estimated
// ones. Baselines (ref*) correspond to a "typical M" body; user numbers
// scale the shirt relative to those. Returns a multiplier in [0.85, 1.25].
function fitProfileAxisMultipliers(profile) {
  if (!profile || profile.skipped) return { width: 1, height: 1 }
  const refChest  = 96   // cm
  const refHeight = 170  // cm
  const w = Math.max(0.85, Math.min(1.25, (profile.chest  || refChest)  / refChest))
  const h = Math.max(0.85, Math.min(1.25, (profile.height || refHeight) / refHeight))
  return { width: w, height: h }
}

/** Shared landmark tracking logic — used by both placeholder and real garment */
function useLandmarkTracking(landmarks, group, posOffset = { x: 0, y: 0, z: 0 }, rotOffset = { x: 0, y: 0, z: 0 }, scaleMult = 1, fitProfile = null) {
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
    // Bias the anchor 25% toward the shoulder line so the shirt's neck
    // lands near LS/RS, not stuck at the navel.
    const anchor = {
      x: torsoCenter.x * 0.75 + shoulderMid.x * 0.25,
      y: torsoCenter.y * 0.75 + shoulderMid.y * 0.25,
      z: torsoCenter.z * 0.75 + shoulderMid.z * 0.25,
    }

    const lsV          = lmToVec3(ls)
    const rsV          = lmToVec3(rs)
    const shoulderMidV = lmToVec3(shoulderMid)
    const hipMidV      = lmToVec3(hipMid)
    const shoulderWidth = lsV.distanceTo(rsV)
    const torsoHeight   = shoulderMidV.distanceTo(hipMidV)

    // GLB is pre-normalised (centred at origin, natural height = 1 unit).
    // Anchor + torsoHeight scale ⇒ shirt sits naturally on the torso.
    targetPos.current.copy(lmToVec3(anchor))
    // Apply debug offset from sliders
    targetPos.current.x += posOffset.x
    targetPos.current.y += posOffset.y
    targetPos.current.z += posOffset.z
    group.current.position.lerp(targetPos.current, 0.3)

    // Fit-profile multipliers: if the user entered real measurements,
    // nudge the garment's width/height by how they compare to a typical
    // "M" baseline (chest ≈ 96 cm, height ≈ 170 cm). The camera-estimated
    // scale stays dominant; profile just corrects the baseline.
    const fp = fitProfileAxisMultipliers(fitProfile)
    targetScale.current.set(
      shoulderWidth * 1.30 * scaleMult * fp.width,
      torsoHeight   * 1.15 * scaleMult * fp.height,
      shoulderWidth * 0.65 * scaleMult * fp.width
    )
    group.current.scale.lerp(targetScale.current, 0.25)

    // ── Robust rotation from shoulder geometry ──
    // Z-axis (lean left/right): derived from the shoulder-line angle in
    // screen space. Clamp to ±35° so a MediaPipe x-swap (body turned
    // past ~70°) can't flip the shirt upside down.
    const shouldersCrossed = rsV.x < lsV.x
    let shoulderAngleZ = 0
    if (!shouldersCrossed) {
      const rawAngle = Math.atan2(rsV.y - lsV.y, rsV.x - lsV.x)
      shoulderAngleZ = Math.max(-0.6, Math.min(0.6, rawAngle))
    }

    // Y-axis (body turn / twist): use the Z-difference between shoulders
    // (MediaPipe's z is relative depth) — this stays stable even when
    // the body rotates past 90°. Fall back to hip/shoulder X-shift.
    const shoulderTwist = (rs.z - ls.z) * 1.8
    const lateralShift  = hipMidV.x - shoulderMidV.x

    targetQuat.current.setFromEuler(
      new THREE.Euler(
        rotOffset.x,
        shoulderTwist + lateralShift * 0.4 + rotOffset.y,
        shoulderAngleZ + rotOffset.z,
        'YXZ'
      )
    )
    // Snappier slerp so tilts track visibly — previous 0.2 was sluggish.
    group.current.quaternion.slerp(targetQuat.current, 0.35)

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
function PlaceholderGarment({ landmarks, posOffset, rotOffset, scaleMult, fitProfile }) {
  const group = useRef()
  useLandmarkTracking(landmarks, group, posOffset, rotOffset, scaleMult, fitProfile)

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
function GarmentModel({ modelUrl, landmarks, posOffset, rotOffset, scaleMult, fitProfile }) {
  const gltf  = useLoader(GLTFLoader, modelUrl)
  const group = useRef()

  // Prepare scene once per GLB: bake front-face rotation, then measure
  // the resulting bounding box so we know the model's natural centre
  // and height. We normalise via nested groups (no vertex math) so the
  // GLTF loader's own parent transforms stay intact.
  // Also build a `sceneBack` — the same mesh rotated 180° around Y —
  // rendered as a second pass so the shirt stays visible when the user
  // turns sideways (otherwise a flat-ish front panel goes edge-on).
  const { scene, sceneBack, center, invHeight } = useMemo(() => {
    const prepareClone = (flipped) => {
      const clone = gltf.scene.clone(true)
      const angle = flipped ? 0 : Math.PI
      const rotMatrix = new THREE.Matrix4().makeRotationY(angle)
      clone.traverse((node) => {
        if (node.isMesh) {
          if (node.geometry) node.geometry.applyMatrix4(rotMatrix)
          node.castShadow    = true
          node.receiveShadow = true
          if (node.material) {
            // Clone material so the back pass can be tinted/rendered
            // differently without affecting the front pass.
            node.material = node.material.clone()
            node.material.side = THREE.DoubleSide
          }
        }
      })
      return clone
    }

    const front = prepareClone(false)
    const back  = prepareClone(true)   // rotated 0° (default) so it faces +Z

    front.updateMatrixWorld(true)
    const box  = new THREE.Box3().setFromObject(front)
    const size = new THREE.Vector3(); box.getSize(size)
    const c    = new THREE.Vector3(); box.getCenter(c)
    console.log('[GLB] natural size:', size.toArray(), 'centre:', c.toArray())
    return { scene: front, sceneBack: back, center: c, invHeight: 1 / (size.y || 1) }
  }, [gltf])

  useLandmarkTracking(landmarks, group, posOffset, rotOffset, scaleMult, fitProfile)

  return (
    <group ref={group}>
      {/* normalise the GLB to unit height, centred on origin, via pure
          group transforms so we don't clobber anything the GLTF loader
          may have set on the scene root itself. */}
      <group scale={[invHeight, invHeight, invHeight]}>
        <group position={[-center.x, -center.y, -center.z]}>
          <primitive object={scene} />
        </group>
        {/* Back-facing copy: becomes visible when body rotates sideways */}
        <group position={[-center.x, -center.y, -center.z]}>
          <primitive object={sceneBack} />
        </group>
      </group>
    </group>
  )
}

function GarmentRenderer({ modelUrl, landmarks, posOffset, rotOffset, scaleMult, fitProfile }) {
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
      {/* Softer ambient + stronger key directional gives the shirt visible
          shading and a slight AO feel, rather than the flat floodlit look
          that makes it read as a sticker. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 4, 2]}   intensity={1.15} castShadow />
      <directionalLight position={[-2, 2, -2]} intensity={0.35} />
      <hemisphereLight args={[0xf0f0ff, 0x303030, 0.35]} />

      <Suspense fallback={null}>
        {modelUrl
          ? <GarmentModel modelUrl={modelUrl} landmarks={landmarks} posOffset={posOffset} rotOffset={rotOffset} scaleMult={scaleMult} fitProfile={fitProfile} />
          : <PlaceholderGarment landmarks={landmarks} posOffset={posOffset} rotOffset={rotOffset} scaleMult={scaleMult} fitProfile={fitProfile} />
        }
      </Suspense>
    </Canvas>
  )
}

export default GarmentRenderer
