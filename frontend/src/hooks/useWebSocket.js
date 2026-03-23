import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:8000/ws/vision'

export function useWebSocket() {
  const [landmarks, setLandmarks]           = useState([])
  const [cameraFrame, setCameraFrame]       = useState(null)
  const [segMask, setSegMask]               = useState(null)
  const [measurements, setMeasurements]     = useState(null)
  const [recommendedSize, setRecommendedSize] = useState(null)
  const [connected, setConnected]           = useState(false)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const frameCountRef = useRef(0)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    console.log('[WS] Attempting connection to', WS_URL)
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('[WS] ✅ Connected to backend')
      setConnected(true)
      ws.send(JSON.stringify({ action: 'start' }))
      console.log('[WS] Sent {action: start}')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        frameCountRef.current += 1

        // Throttle: only process every 3rd frame (~10 fps) to prevent GPU overload
        // Landmarks update every frame for smooth tracking, but heavy canvas ops throttled
        if (frameCountRef.current % 3 !== 0) {
          // Always update landmarks (lightweight, needed for smooth tracking)
          if (data.landmarks) setLandmarks(data.landmarks)
          return
        }

        // Log every 30th frame so console isn't flooded
        if (frameCountRef.current % 30 === 0) {
          console.log(`[WS] Frame #${frameCountRef.current}`, {
            hasFrame: !!data.frame,
            frameSize: data.frame?.length,
            landmarkCount: data.landmarks?.length,
            hasMask: !!data.mask,
          })
        }

        if (data.landmarks)        setLandmarks(data.landmarks)
        if (data.frame)            setCameraFrame(data.frame)
        if (data.mask)             setSegMask(data.mask)
        if (data.measurements)     setMeasurements(data.measurements)
        if (data.recommended_size) setRecommendedSize(data.recommended_size)
      } catch (e) {
        console.error('[WS] Parse error:', e)
      }
    }

    ws.onclose = (e) => {
      console.warn('[WS] ❌ Disconnected. Code:', e.code, '— retrying in 2s')
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = (e) => {
      console.error('[WS] Socket error:', e)
      ws.close()
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }))
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
    setLandmarks([])
    setCameraFrame(null)
    setSegMask(null)
    setMeasurements(null)
    setRecommendedSize(null)
  }, [])

  return { landmarks, cameraFrame, segMask, measurements, recommendedSize, connected, disconnect }
}
