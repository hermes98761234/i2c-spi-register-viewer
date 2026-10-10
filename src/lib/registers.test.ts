import { describe, expect, it } from 'vitest'
import { DEVICES } from './devices'
import { binary, decode, extract, fieldLine, hex, insert, parseValue } from './decode'
import { identify, instances, parseAddressList, planAddresses, sharedAddresses, write8 } from './addresses'

const dev = (id: string) => DEVICES.find((d) => d.id === id)!
const reg = (id: string, name: string) => dev(id).registers.find((r) => r.name === name)!
const field = (id: string, rn: string, fn: string) => reg(id, rn).fields.find((f) => f.name === fn)!

describe('parseValue', () => {
  it('accepts hex by default, prefixes and separators', () => {
    expect(parseValue('27')).toBe(0x27)
    expect(parseValue('0x27')).toBe(0x27)
    expect(parseValue('0b0010_0111')).toBe(0x27)
    expect(parseValue('0010 0111')).toBe(0x00100111)
    expect(parseValue('%101')).toBe(5)
    expect(parseValue('39d')).toBe(39)
    expect(parseValue('0d39')).toBe(39)
  })
  it('rejects junk', () => {
    expect(parseValue('')).toBeNull()
    expect(parseValue('0xZZ')).toBeNull()
    expect(parseValue('hello')).toBeNull()
  })
})

describe('bit helpers', () => {
  it('extracts and inserts fields', () => {
    const f = { name: 'x', msb: 4, lsb: 2 }
    expect(extract(0b0001_1100, f)).toBe(7)
    expect(insert(0, f, 5)).toBe(0b0001_0100)
    expect(insert(0xff, f, 0)).toBe(0b1110_0011)
    expect(extract(0x8000, { name: 'top', msb: 15, lsb: 15 })).toBe(1)
  })
  it('formats', () => {
    expect(binary(0x27, 8)).toBe('0010 0111')
    expect(hex(0x5, 16)).toBe('0x0005')
  })
})

describe('register decoding', () => {
  it('BME280 ctrl_meas 0x27 = x1 temp, x1 pressure, normal mode', () => {
    const d = decode(reg('bme280', 'ctrl_meas'), 0x27)
    const by = Object.fromEntries(d.fields.map((x) => [x.field.name, x]))
    expect(by.osrs_t.text).toBe('x1')
    expect(by.osrs_p.text).toBe('x1')
    expect(by.mode.text).toBe('Normal')
    expect(d.undocumented).toEqual([])
  })
  it('BME280 ctrl_meas 0xB7 = x16 temperature and x16 pressure', () => {
    const d = decode(reg('bme280', 'ctrl_meas'), 0xb7)
    expect(d.fields.find((x) => x.field.name === 'osrs_t')!.text).toBe('x16')
    expect(d.fields.find((x) => x.field.name === 'osrs_p')!.text).toBe('x16')
  })
  it('ADS1115 reset value 0x8583', () => {
    const r = reg('ads1115', 'Config')
    expect(r.reset).toBe(0x8583)
    const d = decode(r, 0x8583)
    const t = (n: string) => d.fields.find((x) => x.field.name === n)!
    expect(t('OS').value).toBe(1)
    expect(t('MUX').text).toBe('AIN0 − AIN1')
    expect(t('PGA').text).toBe('±2.048 V')
    expect(t('MODE').text).toBe('Single-shot / power-down')
    expect(t('DR').text).toBe('128 SPS')
    expect(t('COMP_QUE').text).toContain('disabled')
    expect(d.undocumented).toEqual([])
  })
  it('INA219 reset value 0x399F', () => {
    const d = decode(reg('ina219', 'Configuration'), 0x399f)
    const t = (n: string) => d.fields.find((x) => x.field.name === n)!
    expect(t('BRNG').text).toBe('32 V FSR')
    expect(t('PG').text).toContain('±320 mV')
    expect(t('BADC').text).toBe('12 bit')
    expect(t('SADC').text).toBe('12 bit')
    expect(t('MODE').text).toBe('Shunt and bus, continuous')
  })
  it('MPU-6050 PWR_MGMT_1 reset 0x40 is asleep; fieldLine formats', () => {
    const d = decode(reg('mpu6050', 'PWR_MGMT_1'), 0x40)
    expect(d.fields.find((x) => x.field.name === 'SLEEP')!.value).toBe(1)
    expect(fieldLine(d.fields.find((x) => x.field.name === 'CLKSEL')!)).toBe('CLKSEL[2:0] = 0 (0x0) → Internal 8 MHz oscillator')
  })
  it('flags undocumented bits and overflow', () => {
    const d = decode(reg('mpu6050', 'GYRO_CONFIG'), 0x100)
    expect(d.overflow).toBe(true)
    expect(decode(reg('mpu6050', 'INT_ENABLE'), 0).undocumented).toEqual([7, 6, 5, 2, 1])
  })
  it('every register field fits inside its register width and values are in range', () => {
    for (const d of DEVICES) {
      for (const r of d.registers) {
        for (const f of r.fields) {
          expect(f.msb, `${d.name}.${r.name}.${f.name}`).toBeLessThan(r.width)
          expect(f.lsb).toBeLessThanOrEqual(f.msb)
          for (const k of Object.keys(f.values ?? {})) expect(+k, `${d.name}.${r.name}.${f.name}`).toBeLessThan(2 ** (f.msb - f.lsb + 1))
        }
        // fields must not overlap
        const seen = new Set<number>()
        for (const f of r.fields) for (let b = f.lsb; b <= f.msb; b++) { expect(seen.has(b), `${d.name}.${r.name} bit ${b}`).toBe(false); seen.add(b) }
        if (r.reset !== undefined) expect(r.reset).toBeLessThan(2 ** r.width)
      }
      // addresses are unique within a device and valid 7-bit
      expect(new Set(d.addresses.map((a) => a.addr)).size).toBe(d.addresses.length)
      for (const a of d.addresses) expect(a.addr).toBeLessThanOrEqual(0x77)
    }
    expect(field('bme280', 'config', 't_sb').values![6]).toBe('10 ms')
  })
})

describe('addresses', () => {
  it('knows classic collisions', () => {
    expect(identify(0x68).map((x) => x.device.id).sort()).toEqual(['ds3231', 'mpu6050', 'pca9685'])
    expect(identify(0x3c).map((x) => x.device.id).sort()).toEqual(['pcf8574a', 'ssd1306'])
    expect(write8(0x3c)).toBe('0x78')
  })
  it('finds shared addresses and a conflict-free plan for MPU6050 + DS3231', () => {
    const list = instances(['mpu6050', 'ds3231'])
    expect(sharedAddresses(list).map((c) => c.addr)).toEqual([0x68])
    const plan = planAddresses(list)
    expect(plan.ok).toBe(true)
    expect(plan.assignment.get('ds3231#1')!.addr).toBe(0x68)
    expect(plan.assignment.get('mpu6050#1')!.addr).toBe(0x69)
  })
  it('two ADS1115 + TMP102 + LM75A fit on 0x48-0x4F', () => {
    const plan = planAddresses(instances(['ads1115', 'ads1115', 'tmp102', 'lm75']))
    expect(plan.ok).toBe(true)
    expect(new Set([...plan.assignment.values()].map((a) => a.addr)).size).toBe(4)
  })
  it('reports unavoidable clashes: three BME280', () => {
    const plan = planAddresses(instances(['bme280', 'bme280', 'bme280']))
    expect(plan.ok).toBe(false)
    expect(plan.clashes).toHaveLength(1)
  })
  it('skips SPI-only parts and unknown ids', () => {
    expect(instances(['w25q32', 'nope', 'bme280'])).toHaveLength(1)
  })
  it('parses i2cdetect output', () => {
    expect(parseAddressList('3c 0x68, 76 -- UU zz 0x200')).toEqual([0x3c, 0x68, 0x76])
  })
})
