import { useEffect, useState } from 'react'
import logoImg from '../assets/logo.png'

interface SplashScreenProps {
  onDone: () => void
}

// The logo PNG is proportional to 1728×1296 viewBox.
// Fruit illustration occupies the top ~58%, text the bottom ~42%.
// We use two overlapping copies clipped to each section so they can animate independently.
const SPLIT = 58 // % where fruits end / text begins

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 1200)
    const t2 = setTimeout(() => setPhase('exit'), 2600)
    const t3 = setTimeout(() => onDone(), 3300)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
      animation: phase === 'exit' ? 'spl-out 0.7s ease-in forwards' : undefined,
    }}>
      <style>{`
        /* Fruits section: drops down from above */
        @keyframes spl-fruits {
          0%   { opacity: 0; transform: translateY(-90px) scale(0.88); }
          55%  { opacity: 1; transform: translateY(8px) scale(1.03); }
          75%  { transform: translateY(-4px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Text section: rises from below */
        @keyframes spl-text {
          0%   { opacity: 0; transform: translateY(80px) scale(0.92); }
          55%  { opacity: 1; transform: translateY(-6px) scale(1.02); }
          75%  { transform: translateY(3px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Shine sweep across assembled logo */
        @keyframes spl-shine {
          0%   { left: -100%; }
          100% { left: 160%; }
        }
        /* Loading dot pulse */
        @keyframes spl-dot {
          0%, 100% { opacity: 0.25; transform: scale(0.7); }
          50%       { opacity: 1;    transform: scale(1); }
        }
        /* Dot bar fade in */
        @keyframes spl-dots-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Exit */
        @keyframes spl-out {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        /* Subtle ring expand on white */
        @keyframes spl-ring {
          0%   { transform: scale(0.5); opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* Decorative rings */}
      <div style={{
        position: 'absolute',
        width: 300, height: 300,
        borderRadius: '50%',
        border: '1.5px solid rgba(9,163,115,0.3)',
        animation: 'spl-ring 1.8s ease-out 0.3s forwards',
        opacity: 0,
      }} />
      <div style={{
        position: 'absolute',
        width: 300, height: 300,
        borderRadius: '50%',
        border: '1px solid rgba(9,163,115,0.15)',
        animation: 'spl-ring 1.8s ease-out 0.6s forwards',
        opacity: 0,
      }} />

      {/* Single column wrapper — absolutely centered so logo + dots share the exact same axis */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Logo assembly container */}
        <div style={{
          position: 'relative',
          width: 280,
          height: 210,
          overflow: 'visible',
        }}>
          {/* ── FRUITS (top SPLIT%) ── */}
          <div style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            clipPath: `inset(0 0 ${100 - SPLIT}% 0)`,
            animation: 'spl-fruits 0.85s cubic-bezier(0.34,1.4,0.64,1) 0.1s both',
          }}>
            <img
              src={logoImg}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.18))' }}
            />
          </div>

          {/* ── TEXT (bottom (100-SPLIT)%) ── */}
          <div style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            clipPath: `inset(${SPLIT}% 0 0 0)`,
            animation: 'spl-text 0.85s cubic-bezier(0.34,1.4,0.64,1) 0.35s both',
          }}>
            <img
              src={logoImg}
              alt="Henrique Hortifruti"
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.12))' }}
            />
          </div>

          {/* Shine sweep after both parts land */}
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0,
            width: '55%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
            animation: 'spl-shine 0.8s ease-in-out 1.1s both',
            zIndex: 3,
            pointerEvents: 'none',
          }} />
        </div>

        {/* Loading dots — offset left to align with logo's visual center */}
        <div style={{
          display: 'flex',
          gap: 9,
          marginTop: 28,
          position: 'relative',
          left: -14,
          animation: 'spl-dots-in 0.4s ease-out 1.2s both',
        }}>
          {(['#09a373', '#ff8a00', '#5e2f95'] as const).map((color, i) => (
            <div key={i} style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: color,
              animation: `spl-dot 1.1s ease-in-out ${1.2 + i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}
