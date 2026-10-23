import { useEffect, useRef, useState, type RefObject } from 'react'

interface HorizontalScrollbarProps {
  /** The scrollable element whose scrollLeft this bar drives. */
  targetRef: RefObject<HTMLElement | null>
}

/**
 * A custom horizontal scrollbar rendered as a plain React div.
 *
 * Window-level pointer listeners (not setPointerCapture on the thumb) are
 * used for the drag — more reliable in Electron where pointer capture can
 * silently fail and leave the thumb unresponsive after the first mousedown.
 */
export function HorizontalScrollbar({ targetRef }: HorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [thumbLeft, setThumbLeft] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(40)
  const [visible, setVisible] = useState(false)

  // Measure target vs track and recompute thumb geometry.
  const measure = () => {
    const el = targetRef.current
    const track = trackRef.current
    if (!el || !track) return
    const trackWidth = track.clientWidth
    const scrollable = el.scrollWidth > el.clientWidth + 1
    setVisible(scrollable)
    if (!scrollable) { setThumbWidth(0); setThumbLeft(0); return }
    const ratio = el.clientWidth / el.scrollWidth
    const tw = Math.max(40, trackWidth * ratio)
    setThumbWidth(tw)
    const maxScroll = el.scrollWidth - el.clientWidth
    const scrollRatio = maxScroll > 0 ? el.scrollLeft / maxScroll : 0
    setThumbLeft(scrollRatio * (trackWidth - tw))
  }

  // Keep in sync with target scroll + resize. Also poll a few times at mount
  // because tables render asynchronously and initial scrollWidth is wrong.
  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    measure()
    const onScroll = () => measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const timers = [100, 300, 600, 1200].map(d => setTimeout(measure, d))
    const winResize = () => measure()
    window.addEventListener('resize', winResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', winResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Begin drag. Attaches pointermove/pointerup to the WINDOW so the drag
  // keeps working even if the cursor leaves the thumb mid-drag.
  const beginDrag = (startX: number) => {
    const el = targetRef.current
    const track = trackRef.current
    if (!el || !track) return
    const startScrollLeft = el.scrollLeft
    const trackWidth = track.clientWidth
    const maxScroll = el.scrollWidth - el.clientWidth
    const effectiveTrack = Math.max(1, trackWidth - thumbWidth)
    const scrollPerPx = maxScroll / effectiveTrack

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      el.scrollLeft = startScrollLeft + dx * scrollPerPx
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
  }

  const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    beginDrag(e.clientX)
  }

  // Clicking the empty track centers the thumb on the click position and
  // immediately starts a drag (so the user can keep scrubbing).
  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = targetRef.current
    const track = trackRef.current
    if (!el || !track) return
    const trackRect = track.getBoundingClientRect()
    const clickX = e.clientX - trackRect.left
    const maxScroll = el.scrollWidth - el.clientWidth
    const effectiveTrack = Math.max(1, trackRect.width - thumbWidth)
    const targetScroll = ((clickX - thumbWidth / 2) / effectiveTrack) * maxScroll
    el.scrollLeft = Math.max(0, Math.min(maxScroll, targetScroll))
    beginDrag(e.clientX)
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      style={{
        height: 14,
        width: '100%',
        background: '#e2e8f0',
        borderRadius: 7,
        position: 'relative',
        cursor: visible ? 'pointer' : 'default',
        opacity: visible ? 1 : 0.35,
        flexShrink: 0,
        marginTop: 4,
        touchAction: 'none',
      }}
    >
      <div
        onPointerDown={onThumbPointerDown}
        style={{
          position: 'absolute',
          left: thumbLeft,
          top: 0,
          width: thumbWidth,
          height: 14,
          background: '#64748b',
          borderRadius: 7,
          cursor: 'grab',
          touchAction: 'none',
          display: visible ? 'block' : 'none',
          userSelect: 'none',
        }}
      />
    </div>
  )
}
