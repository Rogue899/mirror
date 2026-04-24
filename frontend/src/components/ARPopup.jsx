import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import GarmentRenderer from './GarmentRenderer'

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

  // Auto-select recommended size
  useEffect(() => {
    if (!recommendedSize || sizeAutoSelected) return
    if (product.sizes?.includes(recommendedSize)) {
      setSelectedSize(recommendedSize)
      setSizeAutoSelected(true)
    }
  }, [recommendedSize, sizeAutoSelected, product.sizes])

  // Canvas refs
  const bgCanvasRef   = useRef(null)
  const maskCanvasRef = useRef(null)
  const skelCanvasRef = useRef(null)
  const camImgRef     = useRef(new Image())
  const maskImgRef    = useRef(new Image())
  // Layer 1: camera frame (throttled at WS source to ~10 fps)
  useEffect(() => {
    if (!cameraFrame || !bgCanvasRef.current) return
    const canvas = bgCanvasRef.current
    const ctx = canvas.getContext('2d')
    camImgRef.current.onload = () => ctx.drawImage(camImgRef.current, 0, 0, canvas.width, canvas.height)
    camImgRef.current.src = `data:image/jpeg;base64,${cameraFrame}`
  }, [cameraFrame])

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

  return (
    <>
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
              {recommendedSize && (
                <div className="ar-measurement-item ar-measurement-size">
                  <span className="ar-measurement-label">Best Fit</span>
                  <span className="ar-measurement-value ar-measurement-size-value">{recommendedSize}</span>
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
                className={`size-btn ${selectedSize === size ? 'active' : ''} ${recommendedSize === size ? 'recommended' : ''}`}
                onClick={() => setSelectedSize(size)}
                title={recommendedSize === size ? 'Recommended for your body' : ''}
              >
                {size}
                {recommendedSize === size && <span className="size-rec-dot" />}
              </button>
            ))}
          </div>
          <div className="ar-actions">
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
            <button className="btn btn-primary" onClick={() => onAddToCart(selectedSize)}>
              Add to Cart — {selectedSize}
            </button>
          </div>
        </div>
      </div>
    </div>

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
