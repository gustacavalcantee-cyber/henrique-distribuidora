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

  // Sync external qty changes (e.g., server pull) into the visible text — but
  // only when the user is not in the middle of editing.
  useEffect(() => {
    if (!dirtyRef.current) setText(fmtInitial(qty))
  }, [qty])

  const commit = () => {
    if (!dirtyRef.current) return
    const result = evalMath(text)
    if (result === null) {
      // Invalid or empty: if the field was cleared, propagate that; otherwise
      // leave the raw text visible so the user can fix it.
      if (text.trim() === '') onQuantidadeChange('')
      dirtyRef.current = false
      return
    }
    const asStr = String(result)
    setText(asStr)
    onQuantidadeChange(asStr)
    dirtyRef.current = false
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      data-cell-id={dataCellId}
      className={className}
      value={text}
      onChange={e => {
        const raw = e.target.value
        setText(raw)
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
        if (e.key === 'Enter') {
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
