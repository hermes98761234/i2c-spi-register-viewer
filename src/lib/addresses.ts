import { DEVICES } from './devices'
import type { AddrOption, Device } from './types'

/** 7-bit I2C addresses reserved by the specification. */
export const isReserved = (addr: number): boolean => addr < 0x08 || addr > 0x77

export const hex7 = (a: number): string => '0x' + a.toString(16).toUpperCase().padStart(2, '0')
/** 8-bit write address as printed on many boards and in some datasheets. */
export const write8 = (a: number): string => hex7(a << 1)

export interface Instance {
  /** Unique id of this instance in the plan, e.g. "bme280#2". */
  key: string
  device: Device
}

/** Expands a list of device ids into instances (the same part can appear several times). */
export function instances(ids: string[], devices: Device[] = DEVICES): Instance[] {
  const count = new Map<string, number>()
  const out: Instance[] = []
  for (const id of ids) {
    const device = devices.find((d) => d.id === id)
    if (!device || device.addresses.length === 0) continue
    const n = (count.get(id) ?? 0) + 1
    count.set(id, n)
    out.push({ key: `${id}#${n}`, device })
  }
  return out
}

export interface Conflict {
  addr: number
  /** Instances that can sit on this address. */
  keys: string[]
}

/** Addresses that more than one selected device can use (potential conflicts). */
export function sharedAddresses(list: Instance[]): Conflict[] {
  const by = new Map<number, string[]>()
  for (const i of list) for (const a of i.device.addresses) by.set(a.addr, [...(by.get(a.addr) ?? []), i.key])
  return [...by.entries()].filter(([, k]) => k.length > 1).map(([addr, keys]) => ({ addr, keys })).sort((a, b) => a.addr - b.addr)
}

export interface Plan {
  assignment: Map<string, AddrOption>
  /** Instance keys that still share an address after the best assignment. */
  clashes: [string, string][]
  /** True when every instance has its own address. */
  ok: boolean
}

/**
 * Chooses one address per instance, minimising the number of clashing pairs, then preferring each device's first
 * (default) address. Exhaustive branch and bound with a node limit.
 */
export function planAddresses(list: Instance[], nodeLimit = 200000): Plan {
  // Most constrained first.
  const order = [...list].sort((a, b) => a.device.addresses.length - b.device.addresses.length)
  let best: AddrOption[] | null = null
  let bestClash = Infinity
  let bestPref = Infinity
  const cur: AddrOption[] = new Array(order.length)
  const used = new Map<number, number>()
  let nodes = 0
  const rec = (i: number, clash: number, pref: number): void => {
    if (nodes++ > nodeLimit) return
    if (clash > bestClash || (clash === bestClash && pref >= bestPref)) return
    if (i === order.length) {
      best = [...cur]
      bestClash = clash
      bestPref = pref
      return
    }
    order[i].device.addresses.forEach((opt, idx) => {
      const taken = used.get(opt.addr) ?? 0
      cur[i] = opt
      used.set(opt.addr, taken + 1)
      rec(i + 1, clash + taken, pref + idx)
      used.set(opt.addr, taken)
    })
  }
  rec(0, 0, 0)
  const assignment = new Map<string, AddrOption>()
  const chosen: AddrOption[] = best ?? order.map((o) => o.device.addresses[0])
  order.forEach((o, i) => assignment.set(o.key, chosen[i]))
  const clashes: [string, string][] = []
  for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) if (chosen[a].addr === chosen[b].addr) clashes.push([order[a].key, order[b].key])
  return { assignment, clashes, ok: clashes.length === 0 }
}

/** Devices in the database that can answer at this address. */
export function identify(addr: number, devices: Device[] = DEVICES): { device: Device; how: string }[] {
  return devices.flatMap((d) => d.addresses.filter((a) => a.addr === addr).map((a) => ({ device: d, how: a.how })))
}

/** Parses an i2cdetect-style or comma separated list of addresses: "0x3c 76 0x68" (hex assumed unless 0x/`d`). */
export function parseAddressList(s: string): number[] {
  const out = new Set<number>()
  for (const tok of s.split(/[\s,;]+/)) {
    if (!tok || tok === '--' || tok === 'UU') continue
    const t = tok.toLowerCase()
    const n = /^0x[0-9a-f]+$/.test(t) ? parseInt(t.slice(2), 16) : /^[0-9a-f]{1,2}$/.test(t) ? parseInt(t, 16) : NaN
    if (Number.isInteger(n) && n >= 0 && n <= 0x7f) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}
