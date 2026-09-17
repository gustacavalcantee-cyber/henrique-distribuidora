// Safely evaluate a simple arithmetic expression the user typed in a quantity
// field. Supports +, -, *, /, parentheses, and both . and , as decimals.
// Returns null when the expression is empty or invalid.
//
// Implemented as a hand-written recursive descent parser because the Electron
// renderer has a strict Content-Security-Policy (`script-src 'self'`) that
// blocks `eval` and the Function constructor — using them silently throws.

export function evalMath(expr: string): number | null {
  const trimmed = expr.trim()
  if (trimmed === '') return null
  // Portuguese decimal comma → dot, drop whitespace so the parser sees a clean stream.
  const normalized = trimmed.replace(/,/g, '.').replace(/\s+/g, '')
  if (!/^[\d.+\-*/()]+$/.test(normalized)) return null

  let pos = 0

  const peek = (): string => normalized[pos]

  const parseNumber = (): number => {
    const start = pos
    while (pos < normalized.length && /[\d.]/.test(normalized[pos])) pos++
    if (pos === start) throw new Error('expected number')
    const n = Number(normalized.slice(start, pos))
    if (!isFinite(n)) throw new Error('bad number')
    return n
  }

  // Factor: unary +/-, parenthesized expr, or number.
  const parseFactor = (): number => {
    const c = peek()
    if (c === '+') { pos++; return parseFactor() }
    if (c === '-') { pos++; return -parseFactor() }
    if (c === '(') {
      pos++
      const value = parseExpr()
      if (peek() !== ')') throw new Error('missing )')
      pos++
      return value
    }
    return parseNumber()
  }

  // Term: multiplication and division (left-associative).
  const parseTerm = (): number => {
    let left = parseFactor()
    while (pos < normalized.length) {
      const op = peek()
      if (op !== '*' && op !== '/') break
      pos++
      const right = parseFactor()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  // Expression: addition and subtraction (left-associative).
  const parseExpr = (): number => {
    let left = parseTerm()
    while (pos < normalized.length) {
      const op = peek()
      if (op !== '+' && op !== '-') break
      pos++
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  try {
    const result = parseExpr()
    if (pos !== normalized.length) return null // trailing garbage
    if (typeof result !== 'number' || !isFinite(result)) return null
    // Round to trim floating-point noise
    return Math.round(result * 1e6) / 1e6
  } catch {
    return null
  }
}
