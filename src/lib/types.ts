export interface Field {
  name: string
  msb: number
  lsb: number
  desc?: string
  /** Meaning of each value, keyed by the field value. */
  values?: Record<number, string>
}

export interface Reg {
  /** Register address (or command opcode for command-based devices). */
  addr: number
  name: string
  /** Width in bits (8, 16 or 24). */
  width: number
  access: 'R' | 'W' | 'RW'
  reset?: number
  desc?: string
  fields: Field[]
}

export interface AddrOption {
  addr: number
  /** How the address is selected, e.g. "SDO = GND". */
  how: string
}

export type Bus = 'I2C' | 'SPI'

export interface Device {
  id: string
  name: string
  category: string
  buses: Bus[]
  summary: string
  /** 7-bit I2C addresses the part can use. Empty for SPI-only parts. */
  addresses: AddrOption[]
  registers: Reg[]
  /** True when the part is configured with command bytes rather than a register file. */
  commandBased?: boolean
  notes?: string[]
}
