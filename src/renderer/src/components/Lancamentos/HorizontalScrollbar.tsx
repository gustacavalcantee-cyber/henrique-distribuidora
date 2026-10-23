import { useEffect, useRef, useState, type RefObject } from 'react'

interface HorizontalScrollbarProps {
  /** The scrollable element whose scrollLeft this bar drives. */
  targetRef: RefObject<HTMLElement | null>
}

/**
 * A custom horizontal scrollbar rendered as a plain React div.
 *
 * Why not just use the native browser scrollbar?
 *   - macOS Chromium hides overlay scrollbars until the user already scrolls,
 *     and `-webkit-appearance: none` toggles that unreliably across versions.
 *   - Users of this app repeatedly reported "no scrollbar visible" even with
 *     overflow-x: scroll and aggressive !important CSS.
 *
 * This component sidesteps browser scrollbar rendering entirely:
 *   - Always-visible 14px track + draggable thumb (plain divs with colors)
 *   - Thumb width is proportional to the viewport ratio
 *   - Dragging updates targetRef.scrollLeft; the target's own scroll events
 *     update the thumb position (so trackpad/wheel scrolling stays in sync)
 */
export function HorizontalScrollbar({ targetRef }: HorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [thumbLeft, setThumbLeft] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const dragStateRef = useRef<{ startX: number; startScrollLeft: number } | null>(null)

  const measure = () => {
    const el = targetRef.current
    const track = trackRef.current
    if (!el || !track) return
    const trackWidth = track.clientWidth
    const scrollable = el.scrollWidth > el.clientWidth
    setVisible(scrollable)
    if (!scrollable) { setThumbWidth(0); setThumbLeft(0); return }
    const ratio = el.clientWidth / el.scrollWidth
    const tw = Math.max(40, trackWidth * ratio)
    setThumbWidth(tw)
    const maxScroll = el.scrollWidth - el.clientWidth
    const scrollRatio = maxScroll > 0 ? el.scrollLeft / maxScroll : 0
    setThumbLeft(scrollRatio * (trackWidth - tw))
  }

  // Keep the thumb synced whenever the target scrolls or resizes.
  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    measure()
    const onScroll = () => measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Table rows render async — remeasure a few times during startup
    const t1 = setTimeout(measure, 200)
    const t2 = setTimeout(measure, 800)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      clearTimeout(t1); clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef.current])

  const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const el = targetRef.current
    if (!el) return
    dragStateRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current
    const el = targetRef.current
    const track = trackRef.current
    if (!st || !el || !track) return
    const dx = e.clientX - st.startX
    const trackWidth = track.clientWidth
    const maxScroll = el.scrollWidth - el.clientWidth
    const scrollPerPx = maxScroll / (trackWidth - thumbWidth || 1)
    el.scrollLeft = st.startScrollLeft + dx * scrollPerPx
  }

  const onThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // Clicking the empty track jumps the thumb to that spot.
  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = targetRef.current
    const track = trackRef.current
    if (!el || !track) return
    const trackRect = track.getBoundingClientRect()
    const clickX = e.clientX - trackRect.left
    const maxScroll = el.scrollWidth - el.clientWidth
    const targetScroll = ((clickX - thumbWidth / 2) / (trackRect.width - thumbWidth)) * maxScroll
    el.scrollLeft = Math.max(0, Math.min(maxScroll, targetScroll))
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
        opacity: visible ? 1 : 0.4,
        flexShrink: 0,
        marginTop: 4,
      }}
    >
      <div
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
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
        }}
      />
    </div>
  )
}
