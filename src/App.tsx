import { useEffect, useMemo, useState } from 'react'
import { DEVICES } from './lib/devices'
import { binary, decode, extract, fieldLine, hex, insert, parseValue } from './lib/decode'
import { hex7, identify, instances, isReserved, parseAddressList, planAddresses, sharedAddresses, write8 } from './lib/addresses'
import type { Device, Field, Reg } from './lib/types'
import { tr, type T } from './i18n'
import { useSettings, useStored } from './settings'
import { Shell, Tabs } from './ui'

type Tab = 'regs' | 'plan' | 'scan'

interface Sel { dev: string; reg: number; value: number | null }

const hashSel = (): Partial<Sel> & { tab?: Tab } => {
  const p = new URLSearchParams(location.hash.slice(1))
  const out: Partial<Sel> & { tab?: Tab } = {}
  if (p.get('d')) out.dev = p.get('d')!
  if (p.get('r')) out.reg = parseInt(p.get('r')!, 16)
  if (p.get('v')) out.value = parseValue(p.get('v')!)
  if (p.get('t') === 'plan' || p.get('t') === 'scan' || p.get('t') === 'regs') out.tab = p.get('t') as Tab
  return out
}

function Bits({ reg, value, onToggle }: { reg: Reg; value: number; onToggle: (bit: number) => void }) {
  const fieldAt = (b: number) => reg.fields.find((f) => b >= f.lsb && b <= f.msb)
  return (
    <div className="bits" role="group" aria-label="bits">
      {Array.from({ length: reg.width }, (_, i) => reg.width - 1 - i).map((b) => {
        const f = fieldAt(b)
        const on = Math.floor(value / 2 ** b) % 2 === 1
        return (
          <button key={b} className={`bit ${on ? 'on' : ''} ${f ? '' : 'undoc'}`} title={f ? `${f.name} [${b}]` : `bit ${b}`} onClick={() => onToggle(b)} aria-pressed={on}>
            <span className="bn">{b}</span>
            <span className="bv">{on ? 1 : 0}</span>
            <span className="bf">{f ? f.name : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

function FieldEditor({ field, value, onChange }: { field: Field; value: number; onChange: (v: number) => void }) {
  const w = field.msb - field.lsb + 1
  const entries = field.values ? Object.entries(field.values).map(([k, v]) => [+k, v] as const) : []
  const full = w <= 4 && entries.length === 2 ** w
  if (full || (entries.length > 0 && w <= 4)) {
    const known = new Set(entries.map(([k]) => k))
    return (
      <select value={value} onChange={(e) => onChange(+e.target.value)} aria-label={field.name}>
        {entries.map(([k, v]) => <option key={k} value={k}>{`${k}: ${v}`}</option>)}
        {!known.has(value) && <option value={value}>{`${value}: ?`}</option>}
      </select>
    )
  }
  return <input type="number" min={0} max={2 ** w - 1} value={value} aria-label={field.name} onChange={(e) => onChange(Math.max(0, Math.min(2 ** w - 1, +e.target.value || 0)))} style={{ width: 90 }} />
}

export default function App() {
  const [settings, setSettings] = useSettings()
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const [init] = useState(hashSel)
  const [tab, setTab] = useState<Tab>(init.tab ?? 'regs')
  const [sel, setSel] = useStored<Sel>('sel', { dev: 'bme280', reg: 0xf4, value: 0x27 })
  const [q, setQ] = useState('')
  const [plan, setPlan] = useStored<string[]>('plan', ['mpu6050', 'ds3231', 'bme280', 'ssd1306', 'ina219', 'ads1115'])
  const [scan, setScan] = useStored<string>('scan', '0x3c 0x40 0x48 0x68 0x76')
  const [input, setInput] = useState<string | null>(null)

  useEffect(() => {
    if (init.dev || init.reg !== undefined || init.value !== undefined) {
      setSel((s) => ({ dev: init.dev ?? s.dev, reg: init.reg ?? s.reg, value: init.value ?? s.value }))
    }
  }, [init, setSel])
  useEffect(() => {
    const p = new URLSearchParams()
    p.set('t', tab)
    if (tab === 'regs') { p.set('d', sel.dev); p.set('r', sel.reg.toString(16)); if (sel.value !== null) p.set('v', '0x' + sel.value.toString(16)) }
    history.replaceState(null, '', '#' + p.toString())
  }, [tab, sel])

  const device: Device = DEVICES.find((d) => d.id === sel.dev) ?? DEVICES[0]
  const reg: Reg | undefined = device.registers.find((r) => r.addr === sel.reg) ?? device.registers[0]
  const value = sel.value ?? reg?.reset ?? 0

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return DEVICES.filter((d) => !s || [d.name, d.category, d.summary, ...d.addresses.map((a) => hex7(a.addr))].join(' ').toLowerCase().includes(s))
  }, [q])

  const pickDevice = (d: Device) => setSel({ dev: d.id, reg: d.registers[0]?.addr ?? 0, value: d.registers[0]?.reset ?? null })
  const pickReg = (r: Reg) => { setSel((s) => ({ ...s, reg: r.addr, value: r.reset ?? 0 })); setInput(null) }
  const setValue = (v: number) => { setSel((s) => ({ ...s, value: v })); setInput(null) }

  const decoded = reg ? decode(reg, value) : null
  const parsed = input !== null ? parseValue(input) : value
  const inputBad = input !== null && parsed === null

  // address planner
  const inst = useMemo(() => instances(plan), [plan])
  const result = useMemo(() => planAddresses(inst), [inst])
  const shared = useMemo(() => sharedAddresses(inst), [inst])
  const assigned = new Map<number, string[]>()
  for (const i of inst) { const a = result.assignment.get(i.key); if (a) assigned.set(a.addr, [...(assigned.get(a.addr) ?? []), i.device.name]) }
  const canUse = new Map<number, number>()
  for (const i of inst) for (const a of i.device.addresses) canUse.set(a.addr, (canUse.get(a.addr) ?? 0) + 1)
  const i2cDevices = DEVICES.filter((d) => d.addresses.length > 0)

  const scanAddrs = parseAddressList(scan)

  return (
    <Shell title="I2C / SPI Register Viewer" subtitle="Device addresses, register maps, address conflicts and a hex-to-bitfield decoder." settings={settings} onSettings={setSettings} t={t}>
      <Tabs<Tab> value={tab} onChange={setTab} options={[['regs', t('Registers')], ['plan', t('Address planner')], ['scan', t('Identify scanned addresses')]]} />

      {tab === 'regs' && (
        <div className="cols">
          <div className="box">
            <input type="search" placeholder={t('Search device, category or address')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} aria-label={t('Search')} />
            <div className="devlist">
              {list.map((d) => (
                <button key={d.id} className={`devbtn ${d.id === device.id ? 'active' : ''}`} onClick={() => pickDevice(d)}>
                  <b>{d.name}</b>
                  <span className="hint">{d.category} · {d.buses.join('/')}{d.addresses.length ? ` · ${d.addresses.length === 1 ? hex7(d.addresses[0].addr) : `${hex7(d.addresses[0].addr)}…${hex7(d.addresses[d.addresses.length - 1].addr)}`}` : ''}</span>
                </button>
              ))}
              {list.length === 0 && <p className="hint">{t('No device matches.')}</p>}
            </div>
          </div>
          <div className="main-col">
            <div className="box">
              <h3>{device.name} <span className="hint">{device.category}</span></h3>
              <p>{device.summary}</p>
              <div className="row">
                {device.buses.map((b) => <span key={b} className="chip">{b}</span>)}
                {device.addresses.map((a) => <span key={a.addr} className="chip mono" title={`8-bit write address ${write8(a.addr)}`}>{hex7(a.addr)} <span className="hint">{a.how}</span></span>)}
              </div>
              {device.commandBased && <p className="hint">{t('Command based: the table lists command opcodes rather than a register file.')}</p>}
              {(device.notes ?? []).map((n) => <p key={n} className="hint">• {n}</p>)}
            </div>
            {device.registers.length === 0 ? (
              <div className="box"><p className="hint">{t('No register map in this database yet; address information only.')}</p></div>
            ) : (
              <div className="cols2">
                <div className="box">
                  <h3>{device.commandBased ? t('Commands') : t('Registers')}</h3>
                  <div className="scroll" style={{ maxHeight: 520 }}>
                    <table className="data">
                      <thead><tr><th>{t('Addr')}</th><th>{t('Name')}</th><th>R/W</th><th>{t('Reset')}</th></tr></thead>
                      <tbody>
                        {device.registers.map((r) => (
                          <tr key={r.addr + r.name} className={r === reg ? 'active' : ''} onClick={() => pickReg(r)} style={{ cursor: 'pointer' }}>
                            <td className="mono">{hex(r.addr, 8)}</td>
                            <td>{r.name}</td>
                            <td className="mono">{r.access}</td>
                            <td className="mono">{r.reset !== undefined ? hex(r.reset, r.width) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {reg && decoded && (
                  <div className="box">
                    <h3>{reg.name} <span className="hint mono">{hex(reg.addr, 8)} · {reg.width} {t('bit')}</span></h3>
                    <p className="hint">{reg.desc}</p>
                    <div className="row">
                      <label htmlFor="hexin">{t('Value (hex, 0x, 0b)')}</label>
                      <input id="hexin" className={`mono ${inputBad ? 'bad' : ''}`} type="text" value={input ?? '0x' + value.toString(16).toUpperCase().padStart(reg.width / 4, '0')} onChange={(e) => { setInput(e.target.value); const p = parseValue(e.target.value); if (p !== null) setSel((s) => ({ ...s, value: p })) }} style={{ width: 130 }} />
                      {reg.reset !== undefined && <button className="small" onClick={() => setValue(reg.reset!)}>{t('Reset value')}</button>}
                      <button className="small" onClick={() => setValue(0)}>0</button>
                    </div>
                    {inputBad && <p className="err-text">{t('Not a valid number.')}</p>}
                    {decoded.overflow && <p className="warn-text">{t('The value does not fit in {0} bits.', reg.width)}</p>}
                    <p className="mono hint">{binary(value % 2 ** reg.width, reg.width)} · {value} </p>
                    <Bits reg={reg} value={value} onToggle={(b) => setValue(value + (Math.floor(value / 2 ** b) % 2 ? -(2 ** b) : 2 ** b))} />
                    <table className="data">
                      <thead><tr><th>{t('Field')}</th><th>{t('Value')}</th><th /></tr></thead>
                      <tbody>
                        {decoded.fields.map((d) => (
                          <tr key={d.field.name + d.field.msb}>
                            <td title={d.field.desc}><b>{d.field.name}</b> <span className="hint mono">{d.field.msb === d.field.lsb ? `[${d.field.msb}]` : `[${d.field.msb}:${d.field.lsb}]`}</span>{d.field.desc && <div className="hint">{d.field.desc}</div>}</td>
                            <td className="mono">{d.bits}</td>
                            <td>
                              <FieldEditor field={d.field} value={d.value} onChange={(v) => setValue(insert(value, d.field, v))} />
                              {!(d.field.values && d.field.msb - d.field.lsb < 4) && <div className="hint" aria-label={fieldLine(d)}>{d.text ?? `${d.value} (0x${d.value.toString(16).toUpperCase()})`}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {decoded.undocumented.length > 0 && <p className="hint">{t('Reserved / undocumented bits: {0}', decoded.undocumented.join(', '))}</p>}
                    <p className="hint">{t('Field extraction: (value >> lsb) & mask. Example: {0}', reg.fields[0] ? `(${hex(value, reg.width)} >> ${reg.fields[0].lsb}) & 0x${(2 ** (reg.fields[0].msb - reg.fields[0].lsb + 1) - 1).toString(16)} = ${extract(value, reg.fields[0])}` : '-')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <>
          <div className="box">
            <h3>{t('Devices on your I2C bus')}</h3>
            <div className="row">
              <select value="" onChange={(e) => e.target.value && setPlan((p) => [...p, e.target.value])} aria-label={t('Add device')}>
                <option value="">{t('Add device…')}</option>
                {i2cDevices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="small" onClick={() => setPlan([])}>{t('Clear')}</button>
            </div>
            <div className="row">
              {plan.map((id, idx) => (
                <span key={`${idx}-${id}`} className="chip">
                  {DEVICES.find((d) => d.id === id)?.name ?? id}
                  <button className="link-x" aria-label={t('Remove')} onClick={() => setPlan((p) => p.filter((_, k) => k !== idx))}>×</button>
                </span>
              ))}
              {inst.length === 0 && <span className="hint">{t('Add the I2C parts you plan to use.')}</span>}
            </div>
            {inst.length > 0 && (
              result.ok
                ? <p className="ok-text">{t('A conflict-free address assignment exists.')}</p>
                : <p className="err-text">{t('Unavoidable address clash: {0}', result.clashes.map(([a, b]) => `${a.split('#')[0]} / ${b.split('#')[0]}`).join(', '))}. {t('Use an I2C multiplexer such as the TCA9548A (0x70-0x77), a second bus, or software-changeable addresses.')}</p>
            )}
          </div>
          <div className="cols2">
            <div className="box">
              <h3>{t('Suggested assignment')}</h3>
              <table className="data">
                <thead><tr><th>{t('Device')}</th><th>{t('Address')}</th><th>{t('Set by')}</th><th>8-bit</th></tr></thead>
                <tbody>
                  {inst.map((i) => {
                    const a = result.assignment.get(i.key)!
                    const clash = result.clashes.some(([x, y]) => x === i.key || y === i.key)
                    return (
                      <tr key={i.key} className={clash ? 'clash' : ''}>
                        <td>{i.device.name}</td>
                        <td className="mono"><b>{hex7(a.addr)}</b></td>
                        <td>{a.how}</td>
                        <td className="mono hint">{write8(a.addr)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {shared.length > 0 && (
                <>
                  <h3 style={{ marginTop: 12 }}>{t('Addresses claimed by several parts')}</h3>
                  {shared.map((c) => <p key={c.addr} className="hint"><b className="mono">{hex7(c.addr)}</b>: {c.keys.map((k) => inst.find((i) => i.key === k)!.device.name).join(', ')}</p>)}
                </>
              )}
            </div>
            <div className="box">
              <h3>{t('Address map')}</h3>
              <div className="amap" role="grid">
                {Array.from({ length: 128 }, (_, a) => {
                  const who = assigned.get(a)
                  const n = canUse.get(a) ?? 0
                  const cls = isReserved(a) ? 'res' : who ? (who.length > 1 ? 'clash' : 'taken') : n ? 'maybe' : ''
                  return <div key={a} className={`acell ${cls}`} title={`${hex7(a)}${who ? ': ' + who.join(' + ') : n ? ': ' + t('possible') : isReserved(a) ? ': ' + t('reserved') : ''}`}>{a.toString(16).toUpperCase().padStart(2, '0')}</div>
                })}
              </div>
              <p className="hint"><span className="legend taken" /> {t('assigned')} <span className="legend maybe" /> {t('possible for a selected part')} <span className="legend clash" /> {t('clash')} <span className="legend res" /> {t('reserved')}</p>
            </div>
          </div>
        </>
      )}

      {tab === 'scan' && (
        <div className="cols">
          <div className="box">
            <h3>{t('Scanner output')}</h3>
            <p className="hint">{t('Paste addresses from an I2C scanner or i2cdetect (hex).')}</p>
            <textarea className="mono" rows={8} value={scan} onChange={(e) => setScan(e.target.value)} style={{ width: '100%' }} aria-label={t('Scanner output')} />
          </div>
          <div className="box">
            <h3>{t('Which parts could these be?')}</h3>
            <table className="data">
              <thead><tr><th>{t('Address')}</th><th>{t('Candidates')}</th></tr></thead>
              <tbody>
                {scanAddrs.map((a) => {
                  const c = identify(a)
                  return (
                    <tr key={a}>
                      <td className="mono"><b>{hex7(a)}</b> <span className="hint">{write8(a)}</span></td>
                      <td>
                        {c.map((x) => <span key={x.device.id} className="chip" title={x.how}>{x.device.name}</span>)}
                        {c.length === 0 && <span className="hint">{isReserved(a) ? t('reserved address') : t('not in the database')}</span>}
                        {c.length > 1 && <span className="warn-text"> {t('ambiguous: check the ID register')}</span>}
                      </td>
                    </tr>
                  )
                })}
                {scanAddrs.length === 0 && <tr><td colSpan={2} className="hint">{t('No valid addresses.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  )
}
