import { useEffect, useRef, useState } from 'react'
import { evalMath } from '../../utils/mathEval'

interface QuantidadeInputProps {
  qty: number | null
  unidade: string
  onQuantidadeChange: (value: string) => void
  onCellBlur: (e?: React.FocusEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  className?: string
  dataCellId?: string
}

// Enter detection is defensive: e.key should be "Enter" on both Return and
// NumpadEnter across platforms, but some IME/keyboard layouts on macOS have
// reported inconsistent behavior, so we also accept e.code and legacy keyCode.
function isEnterKey(e: React.KeyboardEvent<HTMLInputElement>): boolean {
  return (
    e.key === 'Enter' ||
    e.code === 'Enter' ||
    e.code === 'NumpadEnter' ||
    // eslint-disable-next-line deprecation/deprecation
    e.keyCode === 13
  )
}

function fmtInitial(qty: number | null): string {
  if (qty == null) return ''
  return String(qty)
}

export function QuantidadeInput({
  qty, onQuantidadeChange, onCellBlur, onKeyDown,
  className, dataCellId,
}: QuantidadeInputProps) {
  const [text, setText] = useState<string>(fmtInitial(qty))
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync qty → text only when the user is NOT actively editing this input
  // (prevents overwriting a math expression they are in the middle of typing).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(fmtInitial(qty))
    }
  }, [qty])

  // Evaluate whatever is in the DOM right now, propagate the number, and update
  // the visible text. Reads e.currentTarget.value directly to sidestep React's
  // async batching — the input's actual value is the ground truth.
  const commitFromValue = (raw: string) => {
    const result = evalMath(raw)
    if (result === null) {
      if (raw.trim() === '') onQuantidadeChange('')
      return
    }
    const asStr = String(result)
    setText(asStr)
    onQuantidadeChange(asStr)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      data-cell-id={dataCellId}
      className={className}
      value={text}
      onChange={e => {
        const raw = e.target.value
        setText(raw)
        // Propagate plain numbers immediately so the auto-save timer in the
        // parent still fires while typing straight numeric values. A math
        // expression only propagates on Enter/Blur through commitFromValue.
        if (/^-?\d*[.,]?\d*$/.test(raw)) onQuantidadeChange(raw.replace(',', '.'))
      }}
      onBlur={e => {
        commitFromValue(e.currentTarget.value)
        onCellBlur(e)
      }}
      onKeyDown={e => {
        if (isEnterKey(e)) {
          e.preventDefault()
          e.stopPropagation()
          commitFromValue(e.currentTarget.value)
          e.currentTarget.blur()
          return
        }
        onKeyDown?.(e)
      }}
    />
  )
}
