// Safely evaluate a simple arithmetic expression the user typed in a quantity
// field. Supports +, -, *, /, parentheses, and both . and , as decimals.
// Returns null when the expression is empty or invalid.
//
// Character whitelist is enforced before evaluation, so `new Function` can only
// see digits, operators and parens — no way to reach globals or props.

export function evalMath(expr: string): number | null {
  const trimmed = expr.trim()
  if (trimmed === '') return null
  const normalized = trimmed.replace(/,/g, '.')
  if (!/^[\d.+\-*/() \t]+$/.test(normalized)) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const result = new Function(`"use strict"; return (${normalized});`)()
    if (typeof result !== 'number' || !isFinite(result)) return null
    // Trim floating-point noise
    return Math.round(result * 1e6) / 1e6
  } catch {
    return null
  }
}
