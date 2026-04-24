import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import GarmentRenderer from './GarmentRenderer'
import FitProfileModal, { loadFitProfile, EU_SIZE_TO_CHEST_CM } from './FitProfileModal'

// MediaPipe skeleton connections to draw
const SKELETON_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
]

// Key landmark indices we care about for the debug panel
const KEY_LM = [
  { idx: 11, label: 'L Shoulder' },
  { idx: 12, label: 'R Shoulder' },
  { idx: 23, label: 'L Hip' },
  { idx: 24, label: 'R Hip' },
  { idx: 0,  label: 'Nose' },
  { idx: 15, label: 'L Wrist' },
  { idx: 16, label: 'R Wrist' },
]

// Reusable collapsible panel
function DebugPanel({ title, color = '#00ff88', open, onToggle, children }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.82)', borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${color}33`, minWidth: 240,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '5px 10px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color, fontWeight: 'bold', fontSize: 12,
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 10 }}>{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 10px 8px', color: '#fff', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function SliderRow({ label, value, min, max, step = 0.01, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 96, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: 'right', fontFamily: 'monospace' }}>{value.toFixed(2)}</span>
    </label>
  )
}

function ARPopup({ product, onClose, onAddToCart }) {
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || 'M')
  const [sizeAutoSelected, setSizeAutoSelected] = useState(false)

  // Fit profile: user-provided anthropometry (height, chest, waist, EU size).
  // Loaded from localStorage on mount; if absent, the profile modal is shown.
  const [fitProfile, setFitProfile] = useState(() => loadFitProfile())
  const [profileModalOpen, setProfileModalOpen] = useState(() => !loadFitProfile())

  // "See Real Fit" (diffusion try-on) state
  const [tryonState, setTryonState] = useState('idle') // idle | loading | result | error
  const [tryonImage, setTryonImage] = useState(null)
  const [tryonError, setTryonError] = useState(null)
  const [tryonElapsed, setTryonElapsed] = useState(0)

  // Debug state
  const [debugMode, setDebugMode] = useState(false)
  const [posOffset, setPosOffset] = useState({ x: 0, y: 0, z: 0 })
  const [rotOffset, setRotOffset] = useState({ x: 0, y: 0, z: 0 })
  const [scaleMult, setScaleMult] = useState(1.0)
  const [showGarmentPanel, setShowGarmentPanel] = useState(true)
  const [showLandmarkPanel, setShowLandmarkPanel] = useState(true)

  const {
    landmarks, cameraFrame, segMask,
    measurements, recommendedSize,
    connected, disconnect,
  } = useWebSocket()

  // The "Best Fit" the UI will highlight. Prefer the user's self-reported
  // EU size when available (deterministic, no guessing), fall back to
  // MediaPipe's shoulder-width heuristic otherwise.
  const profileSize    = fitProfile && !fitProfile.skipped ? fitProfile.euSize : null
  const effectiveRecommendedSize = profileSize || recommendedSize

  // Auto-select recommended size
  useEffect(() => {
    if (!effectiveRecommendedSize || sizeAutoSelected) return
    if (product.sizes?.includes(effectiveRecommendedSize)) {
      setSelectedSize(effectiveRecommendedSize)
      setSizeAutoSelected(true)
    }
  }, [effectiveRecommendedSize, sizeAutoSelected, product.sizes])

  // Canvas refs
  const bgCanvasRef   = useRef(null)
  const maskCanvasRef = useRef(null)
  const skelCanvasRef = useRef(null)
  const camImgRef     = useRef(new Image())
  const maskImgRef    = useRef(new Image())
  // Layer 1: camera frame (throttled at WS source to ~10 fps)
  // After drawing the camera frame we paint a semi-transparent dark polygon
  // over the torso quad (LS/RS/LH/RH) so the user's own clothing doesn't
  // visually compete with the 3D garment rendered on top. This is the
  // "torso masking" trick from Snap's Lens Studio cloth-try-on pattern.
  useEffect(() => {
    if (!cameraFrame || !bgCanvasRef.current) return
    const canvas = bgCanvasRef.current
    const ctx = canvas.getContext('2d')
    const drawScene = () => {
      ctx.drawImage(camImgRef.current, 0, 0, canvas.width, canvas.height)
      if (!landmarks || landmarks.length < 29) return
      const ls = landmarks[11], rs = landmarks[12]
      const lh = landmarks[23], rh = landmarks[24]
      if (!ls || !rs || !lh || !rh) return
      if (ls.visibility < 0.55 || rs.visibility < 0.55 ||
          lh.visibility < 0.55 || rh.visibility < 0.55) return
      const W = canvas.width, H = canvas.height
      // Expand the quad slightly outward so the darkening extends to the
      // garment's silhouette, not just the landmark points themselves.
      const padX = 0.06, padYTop = 0.05, padYBottom = 0.03
      const poly = [
        { x: (rs.x - padX) * W, y: (rs.y - padYTop)    * H }, // top-right
        { x: (ls.x + padX) * W, y: (ls.y - padYTop)    * H }, // top-left
        { x: (lh.x + padX) * W, y: (lh.y + padYBottom) * H }, // bottom-left
        { x: (rh.x - padX) * W, y: (rh.y + padYBottom) * H }, // bottom-right
      ]
      ctx.save()
      ctx.fillStyle = 'rgba(30, 30, 35, 0.72)'
      ctx.beginPath()
      ctx.moveTo(poly[0].x, poly[0].y)
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
      ctx.closePath()
      ctx.filter = 'blur(8px)'
      ctx.fill()
      ctx.restore()
    }
    camImgRef.current.onload = drawScene
    camImgRef.current.src = `data:image/jpeg;base64,${cameraFrame}`
    // If the image is already loaded (cached data URL), onload won't fire —
    // fall back to drawing immediately when it's complete.
    if (camImgRef.current.complete) drawScene()
  }, [cameraFrame, landmarks])

  // Layer 3: person occlusion mask — DISABLED for now
  // MediaPipe's full-body mask covers the torso where the shirt should be visible.
  // TODO: implement arm-only occlusion for proper depth layering.
  // const drawPersonLayer = useCallback(() => { ... }, [])
  // useEffect(() => { ... }, [segMask])

  // Layer 4: skeleton overlay
  useEffect(() => {
    if (!skelCanvasRef.current) return
    const canvas = skelCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!landmarks || landmarks.length < 29) return
    const W = canvas.width, H = canvas.height

    ctx.strokeStyle = 'rgba(0,255,136,0.85)'
    ctx.lineWidth = 2
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const lmA = landmarks[a], lmB = landmarks[b]
      if (!lmA || !lmB || lmA.visibility < 0.4 || lmB.visibility < 0.4) continue
      ctx.beginPath()
      ctx.moveTo(lmA.x * W, lmA.y * H)
      ctx.lineTo(lmB.x * W, lmB.y * H)
      ctx.stroke()
    }
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i]
      if (!lm || lm.visibility < 0.4) continue
      ctx.beginPath()
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,80,80,0.9)'
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '10px monospace'
    const labels = { 11: 'LS', 12: 'RS', 23: 'LH', 24: 'RH' }
    for (const [idx, label] of Object.entries(labels)) {
      const lm = landmarks[idx]
      if (lm && lm.visibility > 0.4) ctx.fillText(label, lm.x * W + 6, lm.y * H - 4)
    }
  }, [landmarks])

  const handleClose = () => { disconnect(); onClose() }

  // Tick an elapsed-time counter while the AI try-on runs so the user
  // isn't staring at a frozen spinner for 60+ seconds.
  useEffect(() => {
    if (tryonState !== 'loading') return
    setTryonElapsed(0)
    const t0 = Date.now()
    const id = setInterval(() => setTryonElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    return () => clearInterval(id)
  }, [tryonState])

  const handleSeeRealFit = async () => {
    if (!bgCanvasRef.current) return
    // Snapshot the current camera frame as JPEG data URL
    const snapshot = bgCanvasRef.current.toDataURL('image/jpeg', 0.92)
    setTryonState('loading')
    setTryonError(null)
    setTryonImage(null)
    try {
      const resp = await fetch('/api/virtual-tryon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_image: snapshot, product_id: product.id }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setTryonImage(data.image)
      setTryonState('result')
    } catch (e) {
      setTryonError(String(e.message || e))
      setTryonState('error')
    }
  }

  return (
    <>
    <FitProfileModal
      open={profileModalOpen}
      initial={fitProfile}
      onSave={(profile) => { setFitProfile(profile); setProfileModalOpen(false) }}
      onSkip={() => { setFitProfile({ skipped: true }); setProfileModalOpen(false) }}
    />
    <div className="ar-overlay">
      <div className="ar-popup">
        <button className="ar-close" onClick={handleClose}>&times;</button>

        {/* ── VIEWPORT ─────────────────────────────────────────── */}
        <div className="ar-viewport">
          <canvas ref={bgCanvasRef} className="ar-layer ar-layer--bg" width={640} height={480} />
          <div className="ar-layer ar-layer--garment">
            <GarmentRenderer
              modelUrl={product.model_url}
              landmarks={landmarks}
              posOffset={posOffset}
              rotOffset={rotOffset}
              scaleMult={scaleMult}
              fitProfile={fitProfile}
            />
          </div>
          <canvas ref={maskCanvasRef} className="ar-layer ar-layer--person" width={640} height={480} />
          <canvas ref={skelCanvasRef} className="ar-layer" width={640} height={480}
            style={{ zIndex: 10, pointerEvents: 'none' }} />

          {measurements && (
            <div className="ar-measurements">
              <div className="ar-measurement-item">
                <span className="ar-measurement-label">Shoulders</span>
                <span className="ar-measurement-value">{(measurements.shoulder_width * 100).toFixed(0)} u</span>
              </div>
              <div className="ar-measurement-item">
                <span className="ar-measurement-label">Torso</span>
                <span className="ar-measurement-value">{(measurements.torso_length * 100).toFixed(0)} u</span>
              </div>
              <div className="ar-measurement-item">
                <span className="ar-measurement-label">Hips</span>
                <span className="ar-measurement-value">{(measurements.hip_width * 100).toFixed(0)} u</span>
              </div>
              {effectiveRecommendedSize && (
                <div className="ar-measurement-item ar-measurement-size">
                  <span className="ar-measurement-label">
                    Best Fit {profileSize ? '(your profile)' : '(est.)'}
                  </span>
                  <span className="ar-measurement-value ar-measurement-size-value">{effectiveRecommendedSize}</span>
                </div>
              )}
            </div>
          )}

          {connected && cameraFrame && landmarks.length === 0 && (
            <div className="ar-position-guide">
              <div className="ar-position-silhouette">
                <svg viewBox="0 0 80 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="16" r="12" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 3"/>
                  <line x1="40" y1="28" x2="40" y2="90" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 3"/>
                  <line x1="40" y1="45" x2="12" y2="75" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 3"/>
                  <line x1="40" y1="45" x2="68" y2="75" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 3"/>
                  <line x1="40" y1="90" x2="24" y2="145" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 3"/>
                  <line x1="40" y1="90" x2="56" y2="145" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 3"/>
                </svg>
              </div>
              <p className="ar-position-text">Stand <strong>2–4 metres</strong> away</p>
              <p className="ar-position-sub">Face the camera directly · Full body in frame</p>
            </div>
          )}
          {!connected && <div className="ar-status"><span className="ar-status-dot" />Connecting to camera...</div>}
          {connected && !cameraFrame && <div className="ar-status">Initializing pose detection...</div>}
        </div>

        {/* ── AR CONTROLS ──────────────────────────────────────── */}
        <div className="ar-controls">
          <div className="ar-size-toggle">
            <span className="ar-controls-label">Size</span>
            {product.sizes?.map((size) => (
              <button
                key={size}
                className={`size-btn ${selectedSize === size ? 'active' : ''} ${effectiveRecommendedSize === size ? 'recommended' : ''}`}
                onClick={() => setSelectedSize(size)}
                title={effectiveRecommendedSize === size
                  ? (profileSize ? 'From your fit profile' : 'Recommended based on body shape')
                  : ''}
              >
                {size}
                {effectiveRecommendedSize === size && <span className="size-rec-dot" />}
              </button>
            ))}
          </div>
          <div className="ar-actions">
            <button
              onClick={() => setProfileModalOpen(true)}
              style={{
                background: fitProfile && !fitProfile.skipped ? '#7c3aed22' : 'transparent',
                border: `1px solid ${fitProfile && !fitProfile.skipped ? '#7c3aed' : '#444'}`,
                color: fitProfile && !fitProfile.skipped ? '#c4b5fd' : '#888',
                borderRadius: 6, padding: '6px 10px', fontSize: 11,
                cursor: 'pointer', fontFamily: 'monospace',
              }}
              title="Edit your fit profile (height, chest, waist, EU size)"
            >
              {fitProfile && !fitProfile.skipped
                ? `PROFILE · ${fitProfile.euSize}`
                : 'FIT PROFILE'}
            </button>
            <button
              onClick={() => setDebugMode(v => !v)}
              style={{
                background: debugMode ? '#00ff8822' : 'transparent',
                border: `1px solid ${debugMode ? '#00ff88' : '#444'}`,
                color: debugMode ? '#00ff88' : '#888',
                borderRadius: 6, padding: '6px 10px', fontSize: 11,
                cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {debugMode ? 'DEBUG ON' : 'DEBUG'}
            </button>
            <button className="btn btn-secondary" onClick={handleClose}>Switch Item</button>
            <button
              className="btn btn-primary"
              onClick={handleSeeRealFit}
              disabled={tryonState === 'loading' || !connected || landmarks.length === 0}
              style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
              title="Generate a photorealistic preview of you wearing this item"
            >
              {tryonState === 'loading' ? `Generating… ${tryonElapsed}s` : '✨ See Real Fit'}
            </button>
            <button className="btn btn-primary" onClick={() => onAddToCart(selectedSize)}>
              Add to Cart — {selectedSize}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* ── REAL-FIT RESULT MODAL ──────────────────────────────────── */}
    {(tryonState === 'loading' || tryonState === 'result' || tryonState === 'error') && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 20000,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
        onClick={() => tryonState !== 'loading' && setTryonState('idle')}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#111', borderRadius: 12, padding: 20, maxWidth: 720,
            color: '#fff', textAlign: 'center', border: '1px solid #333',
            boxShadow: '0 20px 60px rgba(124,58,237,0.25)',
          }}
        >
          <div style={{ fontSize: 14, color: '#a78bfa', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>
            AI Real Fit
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
            {product.name}
          </div>

          {tryonState === 'loading' && (
            <div style={{ padding: '48px 24px' }}>
              <div style={{
                width: 56, height: 56, margin: '0 auto 24px',
                border: '4px solid #333', borderTopColor: '#7c3aed',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
              }} />
              <div style={{ fontSize: 16, marginBottom: 8 }}>
                Generating your real fit preview…
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>
                {tryonElapsed}s elapsed · typical 45–90s · AI try-on via HuggingFace
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {tryonState === 'result' && tryonImage && (
            <>
              <img
                src={tryonImage}
                alt="AI try-on result"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block', margin: '0 auto' }}
              />
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setTryonState('idle')}>Close</button>
                <button
                  className="btn btn-primary"
                  onClick={() => { onAddToCart(selectedSize); setTryonState('idle') }}
                >
                  Add to Cart — {selectedSize}
                </button>
              </div>
            </>
          )}

          {tryonState === 'error' && (
            <div style={{ padding: 24 }}>
              <div style={{ color: '#f87171', fontSize: 16, marginBottom: 12 }}>
                Couldn't generate preview
              </div>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 20, wordBreak: 'break-word' }}>
                {tryonError}
              </div>
              <button className="btn btn-secondary" onClick={() => setTryonState('idle')}>Close</button>
              <button
                className="btn btn-primary"
                style={{ marginLeft: 8, background: '#7c3aed', borderColor: '#7c3aed' }}
                onClick={handleSeeRealFit}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    {/* ── DEBUG SIDEBAR (fixed right panel, outside popup) ─────── */}
    {debugMode && <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 10000,
      width: 280, overflowY: 'auto', overflowX: 'hidden',
      background: 'rgba(10,10,10,0.92)', borderLeft: '1px solid #222',
      display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 6px',
    }}>
      <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 4, borderBottom: '1px solid #222' }}>
        Debug Controls
      </div>

      {/* Garment Transform Panel */}
      <DebugPanel
        title="Garment Transform"
        color="#00ff88"
        open={showGarmentPanel}
        onToggle={() => setShowGarmentPanel(v => !v)}
      >
        <div style={{ color: '#00ff88', fontSize: 11, marginBottom: 2 }}>Position</div>
        <SliderRow label="Y (up/down)" value={posOffset.y} min={-2} max={2}
          onChange={v => setPosOffset(p => ({ ...p, y: v }))} />
        <SliderRow label="X (left/right)" value={posOffset.x} min={-2} max={2}
          onChange={v => setPosOffset(p => ({ ...p, x: v }))} />
        <SliderRow label="Z (depth)" value={posOffset.z} min={-2} max={2}
          onChange={v => setPosOffset(p => ({ ...p, z: v }))} />
        <div style={{ color: '#00ff88', fontSize: 11, margin: '4px 0 2px' }}>Scale</div>
        <SliderRow label="Scale x" value={scaleMult} min={0.3} max={3}
          onChange={v => setScaleMult(v)} />
        <div style={{ color: '#ff88aa', fontSize: 11, margin: '4px 0 2px' }}>Rotation (rad)</div>
        <SliderRow label="Rot X (tilt)" value={rotOffset.x} min={-Math.PI} max={Math.PI}
          onChange={v => setRotOffset(r => ({ ...r, x: v }))} />
        <SliderRow label="Rot Y (turn)" value={rotOffset.y} min={-Math.PI} max={Math.PI}
          onChange={v => setRotOffset(r => ({ ...r, y: v }))} />
        <SliderRow label="Rot Z (lean)" value={rotOffset.z} min={-Math.PI} max={Math.PI}
          onChange={v => setRotOffset(r => ({ ...r, z: v }))} />
        <div style={{ color: '#555', fontSize: 10, marginTop: 4, wordBreak: 'break-all' }}>
          pos:{JSON.stringify(posOffset)} rot:{JSON.stringify(rotOffset)} sc:{scaleMult.toFixed(2)}
        </div>
      </DebugPanel>

      {/* Landmark Values Panel */}
      <DebugPanel
        title="Body Landmarks (0-1)"
        color="#ffaa00"
        open={showLandmarkPanel}
        onToggle={() => setShowLandmarkPanel(v => !v)}
      >
        {landmarks.length === 0 ? (
          <div style={{ color: '#888' }}>No landmarks detected yet</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace', width: '100%' }}>
            <thead>
              <tr style={{ color: '#ffaa00' }}>
                <th style={{ textAlign: 'left', paddingRight: 6 }}>Joint</th>
                <th style={{ paddingRight: 4 }}>x</th>
                <th style={{ paddingRight: 4 }}>y</th>
                <th style={{ paddingRight: 4 }}>vis</th>
              </tr>
            </thead>
            <tbody>
              {KEY_LM.map(({ idx, label }) => {
                const lm = landmarks[idx]
                if (!lm) return null
                const dim = lm.visibility < 0.5
                return (
                  <tr key={idx} style={{ color: dim ? '#555' : '#eee' }}>
                    <td style={{ paddingRight: 6 }}>{label}</td>
                    <td style={{ paddingRight: 4 }}>{lm.x.toFixed(3)}</td>
                    <td style={{ paddingRight: 4 }}>{lm.y.toFixed(3)}</td>
                    <td style={{ color: lm.visibility > 0.7 ? '#4f4' : '#f84' }}>
                      {lm.visibility.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
              {landmarks[11] && landmarks[12] && landmarks[23] && landmarks[24] && (() => {
                const ls = landmarks[11], rs = landmarks[12]
                const lh = landmarks[23], rh = landmarks[24]
                const cx = ((ls.x + rs.x) / 2 + (lh.x + rh.x) / 2) / 2
                const cy = ((ls.y + rs.y) / 2 + (lh.y + rh.y) / 2) / 2
                return (
                  <tr style={{ color: '#0af', borderTop: '1px solid #333' }}>
                    <td style={{ paddingRight: 6 }}>TorsoCenter</td>
                    <td>{cx.toFixed(3)}</td>
                    <td>{cy.toFixed(3)}</td>
                    <td>—</td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        )}
      </DebugPanel>
    </div>}
    </>
  )
}

export default ARPopup
