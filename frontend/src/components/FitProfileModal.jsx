import { useState, useEffect } from 'react'

/**
 * FitProfileModal — collects anthropometric measurements the camera can't
 * infer (height, chest/waist girth, habitual EU size) and persists them
 * to localStorage. The measurements power:
 *   - Deterministic size recommendation (overrides the ML guess)
 *   - Pixel-to-cm calibration (height / shoulder-to-ankle pixel span)
 *   - Correct capsule radii for the cloth simulation (Saturday work)
 *   - Body-mesh scaling (Monday-Tuesday work)
 *
 * Exposed imperative API via the `open` prop: parent controls visibility.
 * Parent receives a `profile` object via `onSave({ height, chest, waist,
 * euSize, heightUnit, unit })` or `onSkip()` to keep camera-only mode.
 */

export const LS_KEY = 'sfai_fit_profile_v1'

const DEFAULTS = {
  height: 170,   // cm
  chest: 92,     // cm
  waist: 78,     // cm
  euSize: 'M',
  unit: 'cm',
}

const EU_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

// Rough EU size → chest-cm mapping (men's t-shirt, standard fit).
// Used only when the user skips measurements but still provides a size.
export const EU_SIZE_TO_CHEST_CM = {
  XS: 84, S: 90, M: 96, L: 102, XL: 108, XXL: 114,
}

export function loadFitProfile() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    // Sanity check: allow null for fields the user skipped
    if (p && typeof p === 'object') return p
  } catch {}
  return null
}

export function saveFitProfile(profile) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(profile)) } catch {}
}

function Slider({ label, value, min, max, step = 1, unit = 'cm', onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#ddd' }}>
        <span>{label}</span>
        <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#7c3aed' }}
      />
    </label>
  )
}

function FitProfileModal({ open, onSave, onSkip, initial = null }) {
  const [height, setHeight] = useState(initial?.height ?? DEFAULTS.height)
  const [chest,  setChest]  = useState(initial?.chest  ?? DEFAULTS.chest)
  const [waist,  setWaist]  = useState(initial?.waist  ?? DEFAULTS.waist)
  const [euSize, setEuSize] = useState(initial?.euSize ?? DEFAULTS.euSize)

  useEffect(() => {
    if (!initial) return
    if (initial.height) setHeight(initial.height)
    if (initial.chest)  setChest(initial.chest)
    if (initial.waist)  setWaist(initial.waist)
    if (initial.euSize) setEuSize(initial.euSize)
  }, [initial])

  if (!open) return null

  const handleSave = () => {
    const profile = { height, chest, waist, euSize, unit: 'cm', savedAt: Date.now() }
    saveFitProfile(profile)
    onSave(profile)
  }

  const handleSkip = () => {
    // Persist a "skipped" marker so we don't re-prompt every open.
    // The camera-only fallback path continues to work.
    saveFitProfile({ skipped: true, savedAt: Date.now() })
    onSkip()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 30000,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14,
        padding: 28, width: 'min(440px, 100%)', color: '#fff',
        boxShadow: '0 30px 80px rgba(124,58,237,0.25)',
      }}>
        <div style={{ fontSize: 12, color: '#a78bfa', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
          Quick Fit Profile
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          For a more accurate try-on
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 22, lineHeight: 1.5 }}>
          A camera can see your shape but not your size. Give us a few numbers
          and we'll calibrate the preview and recommend the right size
          deterministically — no guessing.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 22 }}>
          <Slider label="Height"           value={height} min={140} max={210} onChange={setHeight} />
          <Slider label="Chest (around)"   value={chest}  min={70}  max={150} onChange={setChest} />
          <Slider label="Waist (around)"   value={waist}  min={55}  max={130} onChange={setWaist} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#ddd', flex: 1 }}>Usual EU size</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {EU_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setEuSize(s)}
                  style={{
                    padding: '6px 10px', fontSize: 12, fontWeight: 600,
                    background: euSize === s ? '#7c3aed' : 'transparent',
                    color: euSize === s ? '#fff' : '#888',
                    border: `1px solid ${euSize === s ? '#7c3aed' : '#333'}`,
                    borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSkip}
            style={{
              flex: 1, padding: '12px 14px', fontSize: 13,
              background: 'transparent', color: '#888',
              border: '1px solid #333', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Skip — estimate from camera
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 2, padding: '12px 14px', fontSize: 14, fontWeight: 600,
              background: '#7c3aed', color: '#fff',
              border: '1px solid #7c3aed', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Save &amp; Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export default FitProfileModal
