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

// Regex for a "plain number" being typed — no operators. When the input matches
// this we propagate to the parent immediately so the existing auto-save timer
// keeps working exactly like before. When the input contains + - * / we hold
// off and only commit on Enter/Blur (after evaluating).
const PLAIN_NUMBER = /^-?\d*[.,]?\d*$/

// Enter detection is defensive: `e.key` should be "Enter" on both Return and
// NumpadEnter across platforms, but some IME/keyboard layouts on macOS have
// reported inconsistent behavior, so we also accept e.code and the legacy
// keyCode/which as fallbacks.
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
  const dirtyRef = useRef(false)
  // Latest text kept in a ref so commit() sees the most recent value even when
  // Enter fires in the same tick as the last onChange (React batches the state
  // update, so the closure over `text` could otherwise be one keystroke behind).
  const textRef = useRef(text)
  textRef.current = text

  // Sync external qty changes (e.g., server pull) into the visible text — but
  // only when the user is not in the middle of editing.
  useEffect(() => {
    if (!dirtyRef.current) {
      const next = fmtInitial(qty)
      setText(next)
      textRef.current = next
    }
  }, [qty])

  const commit = () => {
    const current = textRef.current
    if (!dirtyRef.current) return
    const result = evalMath(current)
    if (result === null) {
      // Invalid or empty: if the field was cleared, propagate that; otherwise
      // leave the raw text visible so the user can fix it.
      if (current.trim() === '') onQuantidadeChange('')
      dirtyRef.current = false
      return
    }
    const asStr = String(result)
    setText(asStr)
    textRef.current = asStr
    onQuantidadeChange(asStr)
    dirtyRef.current = false
  }

  return (
    <input
      type="text"
      // NOTE: `inputMode="decimal"` was removed — in some Electron/Chromium
      // builds on macOS it filters out `+ - * / (` so the math expression
      // never reaches the input. Plain "text" accepts every character.
      data-cell-id={dataCellId}
      className={className}
      value={text}
      onChange={e => {
        const raw = e.target.value
        setText(raw)
        textRef.current = raw
        dirtyRef.current = true
        // Plain number → propagate immediately so auto-save timer still works.
        // Math expression (has an operator) → wait for Enter/Blur.
        if (PLAIN_NUMBER.test(raw)) onQuantidadeChange(raw.replace(',', '.'))
      }}
      onBlur={e => {
        commit()
        onCellBlur(e)
      }}
      onKeyDown={e => {
        if (isEnterKey(e)) {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
          return
        }
        onKeyDown?.(e)
      }}
    />
  )
}
