import type { Field, Reg } from './types'

/** Parses user input: `0x1F`, `1F` (hex by default), `0b0101`, `%0101`, `0d31` or `31d`. Returns null when invalid. */
export function parseValue(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[_\s]/g, '')
  if (!s) return null
  let n: number
  if (/^0x[0-9a-f]+$/.test(s)) n = parseInt(s.slice(2), 16)
  else if (/^(0b|%)[01]+$/.test(s)) n = parseInt(s.replace(/^(0b|%)/, ''), 2)
  else if (/^0d\d+$/.test(s)) n = parseInt(s.slice(2), 10)
  else if (/^\d+d$/.test(s)) n = parseInt(s.slice(0, -1), 10)
  else if (/^[0-9a-f]+$/.test(s)) n = parseInt(s, 16)
  else return null
  return Number.isSafeInteger(n) ? n : null
}

export const maskOf = (f: Field): number => (2 ** (f.msb - f.lsb + 1) - 1)

/** Value of the bits msb..lsb. */
export function extract(value: number, f: Field): number {
  return Math.floor(value / 2 ** f.lsb) % 2 ** (f.msb - f.lsb + 1)
}

/** Returns `value` with the field replaced by `v`. */
export function insert(value: number, f: Field, v: number): number {
  const w = f.msb - f.lsb + 1
  const cur = Math.floor(value / 2 ** f.lsb) % 2 ** w
  return value + (Math.min(v, 2 ** w - 1) - cur) * 2 ** f.lsb
}

export interface DecodedField {
  field: Field
  value: number
  /** Meaning from the lookup table, if any. */
  text?: string
  /** Bits as a binary string, MSB first. */
  bits: string
}

export interface Decoded {
  fields: DecodedField[]
  /** Bits of the register not covered by any documented field. */
  undocumented: number[]
  /** True when the value does not fit in the register width. */
  overflow: boolean
}

export function decode(reg: Reg, value: number): Decoded {
  const covered = new Set<number>()
  const fields = [...reg.fields]
    .sort((a, b) => b.msb - a.msb)
    .map((field) => {
      for (let b = field.lsb; b <= field.msb; b++) covered.add(b)
      const v = extract(value, field)
      return { field, value: v, text: field.values?.[v], bits: v.toString(2).padStart(field.msb - field.lsb + 1, '0') }
    })
  const undocumented: number[] = []
  for (let b = reg.width - 1; b >= 0; b--) if (!covered.has(b)) undocumented.push(b)
  return { fields, undocumented, overflow: value >= 2 ** reg.width || value < 0 }
}

/** Binary string in nibbles: 0b0010 0111. */
export function binary(value: number, width: number): string {
  return value.toString(2).padStart(width, '0').replace(/(.{4})(?=.)/g, '$1 ')
}

export const hex = (value: number, width: number): string => '0x' + value.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0')

/** One-line description for a decoded field: "osrs_t = 1 (x1)". */
export function fieldLine(d: DecodedField): string {
  const w = d.field.msb - d.field.lsb + 1
  const range = w === 1 ? `[${d.field.msb}]` : `[${d.field.msb}:${d.field.lsb}]`
  const val = w === 1 ? String(d.value) : `${d.value} (0x${d.value.toString(16).toUpperCase()})`
  return `${d.field.name}${range} = ${val}${d.text ? ` → ${d.text}` : ''}`
}
