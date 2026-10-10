import type { AddrOption, Device, Field, Reg } from './types'

const seq = (...names: string[]): Record<number, string> => Object.fromEntries(names.map((n, i) => [i, n]))
const f = (name: string, msb: number, lsb: number, values?: Record<number, string>, desc?: string): Field => ({ name, msb, lsb, values, desc })
const bit = (name: string, n: number, desc?: string, values?: Record<number, string>): Field => ({ name, msb: n, lsb: n, desc, values })
const r = (addr: number, name: string, access: Reg['access'], reset: number | undefined, desc: string, fields: Field[] = [], width = 8): Reg => ({ addr, name, width, access, reset, desc, fields })
const range = (from: number, to: number, how: (a: number) => string): AddrOption[] => Array.from({ length: to - from + 1 }, (_, i) => ({ addr: from + i, how: how(from + i) }))
const one = (addr: number, how = 'fixed'): AddrOption[] => [{ addr, how }]
const OS = seq('Skipped (output disabled)', 'x1', 'x2', 'x4', 'x8', 'x16', 'x16', 'x16')

const bme280Common = (id: number, humidity: boolean): Reg[] => [
  r(0xd0, 'id', 'R', id, 'Chip ID', [f('chip_id', 7, 0, undefined, id === 0x60 ? '0x60 = BME280' : '0x58 = BMP280')]),
  r(0xe0, 'reset', 'W', 0x00, 'Write 0xB6 for a soft reset', [f('reset', 7, 0, { 0xb6: 'Soft reset command' })]),
  ...(humidity ? [r(0xf2, 'ctrl_hum', 'RW', 0x00, 'Humidity oversampling (write ctrl_meas afterwards to apply)', [f('osrs_h', 2, 0, OS)])] : []),
  r(0xf3, 'status', 'R', 0x00, 'Device status', [bit('measuring', 3, '1 while a conversion runs'), bit('im_update', 0, '1 while NVM data is copied to registers')]),
  r(0xf4, 'ctrl_meas', 'RW', 0x00, 'Pressure and temperature oversampling and power mode', [
    f('osrs_t', 7, 5, OS, 'Temperature oversampling'),
    f('osrs_p', 4, 2, OS, 'Pressure oversampling'),
    f('mode', 1, 0, { 0: 'Sleep', 1: 'Forced', 2: 'Forced', 3: 'Normal' }),
  ]),
  r(0xf5, 'config', 'RW', 0x00, 'Standby time, IIR filter, SPI 3-wire', [
    f('t_sb', 7, 5, humidity ? { 0: '0.5 ms', 1: '62.5 ms', 2: '125 ms', 3: '250 ms', 4: '500 ms', 5: '1000 ms', 6: '10 ms', 7: '20 ms' } : { 0: '0.5 ms', 1: '62.5 ms', 2: '125 ms', 3: '250 ms', 4: '500 ms', 5: '1000 ms', 6: '2000 ms', 7: '4000 ms' }, 'Standby time in normal mode'),
    f('filter', 4, 2, { 0: 'Off', 1: 'Coefficient 2', 2: 'Coefficient 4', 3: 'Coefficient 8', 4: 'Coefficient 16', 5: 'Coefficient 16', 6: 'Coefficient 16', 7: 'Coefficient 16' }, 'IIR filter'),
    bit('spi3w_en', 0, 'Enable 3-wire SPI'),
  ]),
  r(0xf7, 'press_msb', 'R', 0x80, 'Pressure raw data [19:12]', [f('press_msb', 7, 0)]),
  r(0xf8, 'press_lsb', 'R', 0x00, 'Pressure raw data [11:4]', [f('press_lsb', 7, 0)]),
  r(0xf9, 'press_xlsb', 'R', 0x00, 'Pressure raw data [3:0] in bits 7:4', [f('press_xlsb', 7, 4)]),
  r(0xfa, 'temp_msb', 'R', 0x80, 'Temperature raw data [19:12]', [f('temp_msb', 7, 0)]),
  r(0xfb, 'temp_lsb', 'R', 0x00, 'Temperature raw data [11:4]', [f('temp_lsb', 7, 0)]),
  r(0xfc, 'temp_xlsb', 'R', 0x00, 'Temperature raw data [3:0] in bits 7:4', [f('temp_xlsb', 7, 4)]),
  ...(humidity ? [r(0xfd, 'hum_msb', 'R', 0x80, 'Humidity raw data [15:8]', [f('hum_msb', 7, 0)]), r(0xfe, 'hum_lsb', 'R', 0x00, 'Humidity raw data [7:0]', [f('hum_lsb', 7, 0)])] : []),
]

const mpu6050: Reg[] = [
  r(0x19, 'SMPLRT_DIV', 'RW', 0x00, 'Sample rate = gyro output rate / (1 + SMPLRT_DIV)', [f('SMPLRT_DIV', 7, 0)]),
  r(0x1a, 'CONFIG', 'RW', 0x00, 'FSYNC and digital low-pass filter', [
    f('EXT_SYNC_SET', 5, 3, seq('Disabled', 'TEMP_OUT_L[0]', 'GYRO_XOUT_L[0]', 'GYRO_YOUT_L[0]', 'GYRO_ZOUT_L[0]', 'ACCEL_XOUT_L[0]', 'ACCEL_YOUT_L[0]', 'ACCEL_ZOUT_L[0]')),
    f('DLPF_CFG', 2, 0, { 0: 'Accel 260 Hz / Gyro 256 Hz', 1: 'Accel 184 Hz / Gyro 188 Hz', 2: 'Accel 94 Hz / Gyro 98 Hz', 3: 'Accel 44 Hz / Gyro 42 Hz', 4: 'Accel 21 Hz / Gyro 20 Hz', 5: 'Accel 10 Hz / Gyro 10 Hz', 6: 'Accel 5 Hz / Gyro 5 Hz', 7: 'Reserved' }),
  ]),
  r(0x1b, 'GYRO_CONFIG', 'RW', 0x00, 'Gyroscope full-scale range and self test', [bit('XG_ST', 7), bit('YG_ST', 6), bit('ZG_ST', 5), f('FS_SEL', 4, 3, { 0: '±250 °/s', 1: '±500 °/s', 2: '±1000 °/s', 3: '±2000 °/s' })]),
  r(0x1c, 'ACCEL_CONFIG', 'RW', 0x00, 'Accelerometer full-scale range and self test', [bit('XA_ST', 7), bit('YA_ST', 6), bit('ZA_ST', 5), f('AFS_SEL', 4, 3, { 0: '±2 g', 1: '±4 g', 2: '±8 g', 3: '±16 g' })]),
  r(0x23, 'FIFO_EN', 'RW', 0x00, 'Which sensors are written to the FIFO', [bit('TEMP_FIFO_EN', 7), bit('XG_FIFO_EN', 6), bit('YG_FIFO_EN', 5), bit('ZG_FIFO_EN', 4), bit('ACCEL_FIFO_EN', 3), bit('SLV2_FIFO_EN', 2), bit('SLV1_FIFO_EN', 1), bit('SLV0_FIFO_EN', 0)]),
  r(0x37, 'INT_PIN_CFG', 'RW', 0x00, 'INT pin and I2C bypass configuration', [bit('INT_LEVEL', 7, '1 = INT active low'), bit('INT_OPEN', 6, '1 = open drain'), bit('LATCH_INT_EN', 5), bit('INT_RD_CLEAR', 4), bit('FSYNC_INT_LEVEL', 3), bit('FSYNC_INT_EN', 2), bit('I2C_BYPASS_EN', 1, 'Aux I2C master pins connect directly to the host bus')]),
  r(0x38, 'INT_ENABLE', 'RW', 0x00, 'Interrupt enables', [bit('FIFO_OFLOW_EN', 4), bit('I2C_MST_INT_EN', 3), bit('DATA_RDY_EN', 0)]),
  r(0x3a, 'INT_STATUS', 'R', 0x00, 'Interrupt status (cleared on read)', [bit('FIFO_OFLOW_INT', 4), bit('I2C_MST_INT', 3), bit('DATA_RDY_INT', 0)]),
  r(0x3b, 'ACCEL_XOUT_H', 'R', 0x00, 'Accelerometer X high byte (16-bit signed with ACCEL_XOUT_L)', [f('ACCEL_XOUT[15:8]', 7, 0)]),
  r(0x3d, 'ACCEL_YOUT_H', 'R', 0x00, 'Accelerometer Y high byte', [f('ACCEL_YOUT[15:8]', 7, 0)]),
  r(0x3f, 'ACCEL_ZOUT_H', 'R', 0x00, 'Accelerometer Z high byte', [f('ACCEL_ZOUT[15:8]', 7, 0)]),
  r(0x41, 'TEMP_OUT_H', 'R', 0x00, 'Temperature high byte. °C = raw / 340 + 36.53', [f('TEMP_OUT[15:8]', 7, 0)]),
  r(0x43, 'GYRO_XOUT_H', 'R', 0x00, 'Gyroscope X high byte', [f('GYRO_XOUT[15:8]', 7, 0)]),
  r(0x45, 'GYRO_YOUT_H', 'R', 0x00, 'Gyroscope Y high byte', [f('GYRO_YOUT[15:8]', 7, 0)]),
  r(0x47, 'GYRO_ZOUT_H', 'R', 0x00, 'Gyroscope Z high byte', [f('GYRO_ZOUT[15:8]', 7, 0)]),
  r(0x6a, 'USER_CTRL', 'RW', 0x00, 'FIFO and I2C master control', [bit('FIFO_EN', 6), bit('I2C_MST_EN', 5), bit('I2C_IF_DIS', 4), bit('FIFO_RESET', 2), bit('I2C_MST_RESET', 1), bit('SIG_COND_RESET', 0)]),
  r(0x6b, 'PWR_MGMT_1', 'RW', 0x40, 'Power management 1. The chip starts asleep: clear SLEEP first', [
    bit('DEVICE_RESET', 7, 'Reset all registers to defaults'), bit('SLEEP', 6, '1 = sleep mode'), bit('CYCLE', 5, 'Cycle between sleep and wake-ups'), bit('TEMP_DIS', 3, '1 = temperature sensor disabled'),
    f('CLKSEL', 2, 0, { 0: 'Internal 8 MHz oscillator', 1: 'PLL with X gyro reference', 2: 'PLL with Y gyro reference', 3: 'PLL with Z gyro reference', 4: 'PLL with external 32.768 kHz', 5: 'PLL with external 19.2 MHz', 6: 'Reserved', 7: 'Stops the clock' }),
  ]),
  r(0x6c, 'PWR_MGMT_2', 'RW', 0x00, 'Wake-up frequency and axis standby', [f('LP_WAKE_CTRL', 7, 6, { 0: '1.25 Hz', 1: '5 Hz', 2: '20 Hz', 3: '40 Hz' }), bit('STBY_XA', 5), bit('STBY_YA', 4), bit('STBY_ZA', 3), bit('STBY_XG', 2), bit('STBY_YG', 1), bit('STBY_ZG', 0)]),
  r(0x75, 'WHO_AM_I', 'R', 0x68, 'Device ID (upper bits of the I2C address)', [f('WHO_AM_I', 6, 1, { 0x34: '0x68' })]),
]

const ina219: Reg[] = [
  r(0x00, 'Configuration', 'RW', 0x399f, 'Range, gain, ADC resolution/averaging and mode', [
    bit('RST', 15, 'Reset'), bit('BRNG', 13, 'Bus voltage range', { 0: '16 V FSR', 1: '32 V FSR' }),
    f('PG', 12, 11, { 0: '±40 mV (gain /1)', 1: '±80 mV (gain /2)', 2: '±160 mV (gain /4)', 3: '±320 mV (gain /8)' }, 'Shunt PGA'),
    f('BADC', 10, 7, { 0: '9 bit', 1: '10 bit', 2: '11 bit', 3: '12 bit', 8: '12 bit', 9: '2 samples', 10: '4 samples', 11: '8 samples', 12: '16 samples', 13: '32 samples', 14: '64 samples', 15: '128 samples' }, 'Bus ADC'),
    f('SADC', 6, 3, { 0: '9 bit', 1: '10 bit', 2: '11 bit', 3: '12 bit', 8: '12 bit', 9: '2 samples', 10: '4 samples', 11: '8 samples', 12: '16 samples', 13: '32 samples', 14: '64 samples', 15: '128 samples' }, 'Shunt ADC'),
    f('MODE', 2, 0, { 0: 'Power-down', 1: 'Shunt voltage, triggered', 2: 'Bus voltage, triggered', 3: 'Shunt and bus, triggered', 4: 'ADC off', 5: 'Shunt voltage, continuous', 6: 'Bus voltage, continuous', 7: 'Shunt and bus, continuous' }),
  ], 16),
  r(0x01, 'Shunt Voltage', 'R', 0x0000, 'Shunt voltage, signed, LSB = 10 µV', [f('SD', 15, 0)], 16),
  r(0x02, 'Bus Voltage', 'R', 0x0000, 'Bus voltage: BD in bits 15:3, LSB = 4 mV', [f('BD', 15, 3, undefined, 'Bus voltage = BD × 4 mV'), bit('CNVR', 1, 'Conversion ready'), bit('OVF', 0, 'Math overflow')], 16),
  r(0x03, 'Power', 'R', 0x0000, 'Power, LSB = 20 × Current_LSB', [f('POWER', 15, 0)], 16),
  r(0x04, 'Current', 'R', 0x0000, 'Current, signed, LSB = Current_LSB', [f('CURRENT', 15, 0)], 16),
  r(0x05, 'Calibration', 'RW', 0x0000, 'Cal = trunc(0.04096 / (Current_LSB × R_shunt))', [f('FS', 15, 1, undefined, 'Calibration value (bit 0 is always 0)')], 16),
]

const ads1115: Reg[] = [
  r(0x00, 'Conversion', 'R', 0x0000, 'Conversion result, signed 16 bit', [f('CONV', 15, 0)], 16),
  r(0x01, 'Config', 'RW', 0x8583, 'Input mux, gain, mode, data rate and comparator', [
    bit('OS', 15, 'Write 1: start single conversion. Read: 1 = idle', { 0: 'Converting (read) / no effect (write)', 1: 'Idle (read) / start conversion (write)' }),
    f('MUX', 14, 12, { 0: 'AIN0 − AIN1', 1: 'AIN0 − AIN3', 2: 'AIN1 − AIN3', 3: 'AIN2 − AIN3', 4: 'AIN0 − GND', 5: 'AIN1 − GND', 6: 'AIN2 − GND', 7: 'AIN3 − GND' }),
    f('PGA', 11, 9, { 0: '±6.144 V', 1: '±4.096 V', 2: '±2.048 V', 3: '±1.024 V', 4: '±0.512 V', 5: '±0.256 V', 6: '±0.256 V', 7: '±0.256 V' }),
    bit('MODE', 8, 'Operating mode', { 0: 'Continuous', 1: 'Single-shot / power-down' }),
    f('DR', 7, 5, { 0: '8 SPS', 1: '16 SPS', 2: '32 SPS', 3: '64 SPS', 4: '128 SPS', 5: '250 SPS', 6: '475 SPS', 7: '860 SPS' }),
    bit('COMP_MODE', 4, undefined, { 0: 'Traditional', 1: 'Window' }), bit('COMP_POL', 3, 'ALERT/RDY polarity', { 0: 'Active low', 1: 'Active high' }), bit('COMP_LAT', 2, undefined, { 0: 'Non-latching', 1: 'Latching' }),
    f('COMP_QUE', 1, 0, { 0: 'Assert after 1 conversion', 1: 'Assert after 2 conversions', 2: 'Assert after 4 conversions', 3: 'Comparator disabled, ALERT/RDY high-Z' }),
  ], 16),
  r(0x02, 'Lo_thresh', 'RW', 0x8000, 'Comparator low threshold', [f('Lo_thresh', 15, 0)], 16),
  r(0x03, 'Hi_thresh', 'RW', 0x7fff, 'Comparator high threshold (MSB = 1 turns on conversion-ready mode)', [f('Hi_thresh', 15, 0)], 16),
]

const ds3231: Reg[] = [
  r(0x00, 'Seconds', 'RW', undefined, 'BCD seconds 00-59', [f('10 Seconds', 6, 4), f('Seconds', 3, 0)]),
  r(0x01, 'Minutes', 'RW', undefined, 'BCD minutes 00-59', [f('10 Minutes', 6, 4), f('Minutes', 3, 0)]),
  r(0x02, 'Hours', 'RW', undefined, 'BCD hours', [bit('12/24', 6, undefined, { 0: '24-hour mode', 1: '12-hour mode' }), bit('20 Hour / AM-PM', 5, 'In 24-hour mode: 20 hours. In 12-hour mode: 1 = PM'), bit('10 Hour', 4), f('Hours', 3, 0)]),
  r(0x03, 'Day', 'RW', undefined, 'Day of week 1-7', [f('Day', 2, 0)]),
  r(0x04, 'Date', 'RW', undefined, 'BCD date 01-31', [f('10 Date', 5, 4), f('Date', 3, 0)]),
  r(0x05, 'Month/Century', 'RW', undefined, 'BCD month and century flag', [bit('Century', 7), bit('10 Month', 4), f('Month', 3, 0)]),
  r(0x06, 'Year', 'RW', undefined, 'BCD year 00-99', [f('10 Year', 7, 4), f('Year', 3, 0)]),
  r(0x0e, 'Control', 'RW', 0x1c, 'Oscillator, square wave and alarm interrupts', [
    bit('EOSC', 7, 'Enable oscillator (active low) when on battery', { 0: 'Oscillator running', 1: 'Stopped on battery' }), bit('BBSQW', 6, 'Battery-backed square wave'), bit('CONV', 5, 'Start temperature conversion'),
    f('RS', 4, 3, { 0: '1 Hz', 1: '1.024 kHz', 2: '4.096 kHz', 3: '8.192 kHz' }, 'Square-wave rate'), bit('INTCN', 2, undefined, { 0: 'Square wave on INT/SQW', 1: 'Alarm interrupts on INT/SQW' }), bit('A2IE', 1), bit('A1IE', 0),
  ]),
  r(0x0f, 'Status', 'RW', 0x88, 'Status flags', [bit('OSF', 7, 'Oscillator stopped: time may be invalid'), bit('EN32kHz', 3), bit('BSY', 2, 'Busy with TCXO conversion'), bit('A2F', 1), bit('A1F', 0)]),
  r(0x10, 'Aging Offset', 'RW', 0x00, 'Signed crystal aging trim', [f('AGE', 7, 0)]),
  r(0x11, 'Temp MSB', 'R', 0x00, 'Temperature integer part, signed °C', [f('Temp', 7, 0)]),
  r(0x12, 'Temp LSB', 'R', 0x00, 'Fraction in bits 7:6, 0.25 °C steps', [f('Fraction', 7, 6)]),
]

const mcp23017: Reg[] = [
  ...(['A', 'B'] as const).flatMap((p, i) => [
    r(0x00 + i, `IODIR${p}`, 'RW', 0xff, `Port ${p} direction: 1 = input, 0 = output`, Array.from({ length: 8 }, (_, k) => bit(`IO${p}${7 - k}`, 7 - k, undefined, { 0: 'Output', 1: 'Input' }))),
    r(0x02 + i, `IPOL${p}`, 'RW', 0x00, `Port ${p} input polarity: 1 = inverted`, [f('IP', 7, 0)]),
    r(0x04 + i, `GPINTEN${p}`, 'RW', 0x00, `Port ${p} interrupt-on-change enable`, [f('GPINT', 7, 0)]),
    r(0x06 + i, `DEFVAL${p}`, 'RW', 0x00, `Port ${p} default compare value`, [f('DEF', 7, 0)]),
    r(0x08 + i, `INTCON${p}`, 'RW', 0x00, `Port ${p} interrupt control: 1 = compare to DEFVAL`, [f('IOC', 7, 0)]),
  ]),
  r(0x0a, 'IOCON', 'RW', 0x00, 'Configuration (shared by both ports; same register at 0x0B)', [
    bit('BANK', 7, undefined, { 0: 'Registers paired (A,B alternate)', 1: 'Registers in separate banks' }), bit('MIRROR', 6, 'INT pins connected together'), bit('SEQOP', 5, undefined, { 0: 'Sequential operation enabled', 1: 'Disabled' }), bit('DISSLW', 4, 'SDA slew rate disabled'),
    bit('HAEN', 3, 'Hardware address enable (SPI MCP23S17)'), bit('ODR', 2, 'INT as open drain'), bit('INTPOL', 1, 'INT polarity', { 0: 'Active low', 1: 'Active high' }),
  ]),
  ...(['A', 'B'] as const).flatMap((p, i) => [
    r(0x0c + i, `GPPU${p}`, 'RW', 0x00, `Port ${p} 100 kΩ pull-up enable`, [f('PU', 7, 0)]),
    r(0x0e + i, `INTF${p}`, 'R', 0x00, `Port ${p} interrupt flag`, [f('INT', 7, 0)]),
    r(0x10 + i, `INTCAP${p}`, 'R', 0x00, `Port ${p} value captured at interrupt`, [f('ICP', 7, 0)]),
    r(0x12 + i, `GPIO${p}`, 'RW', 0x00, `Port ${p} pin levels`, [f('GP', 7, 0)]),
    r(0x14 + i, `OLAT${p}`, 'RW', 0x00, `Port ${p} output latch`, [f('OL', 7, 0)]),
  ]),
].sort((a, b) => a.addr - b.addr)

const ssd1306: Reg[] = [
  r(0x81, 'Set Contrast Control', 'W', 0x7f, 'Two-byte command: 0x81, then contrast 0-255', [f('contrast', 7, 0)]),
  r(0xa4, 'Entire Display ON (resume)', 'W', undefined, 'Output follows RAM contents'),
  r(0xa5, 'Entire Display ON (ignore RAM)', 'W', undefined, 'All pixels on, RAM ignored'),
  r(0xa6, 'Normal Display', 'W', undefined, '1 in RAM = pixel on'),
  r(0xa7, 'Inverse Display', 'W', undefined, '0 in RAM = pixel on'),
  r(0xae, 'Display OFF (sleep)', 'W', undefined, 'Display off'),
  r(0xaf, 'Display ON', 'W', undefined, 'Display on'),
  r(0x20, 'Set Memory Addressing Mode', 'W', 0x02, 'Two-byte command: 0x20, then mode', [f('mode', 1, 0, { 0: 'Horizontal', 1: 'Vertical', 2: 'Page (reset default)', 3: 'Invalid' })]),
  r(0x21, 'Set Column Address', 'W', undefined, 'Three bytes: 0x21, start (0-127), end (0-127)'),
  r(0x22, 'Set Page Address', 'W', undefined, 'Three bytes: 0x22, start (0-7), end (0-7)'),
  r(0x8d, 'Charge Pump Setting', 'W', 0x10, 'Two-byte command: 0x8D, then 0x14 enables the internal charge pump (needed for most modules)', [bit('enable', 2, 'Charge pump', { 0: 'Disabled', 1: 'Enabled' })]),
  r(0xa0, 'Segment Re-map (normal)', 'W', undefined, 'Column 0 mapped to SEG0'),
  r(0xa1, 'Segment Re-map (flipped)', 'W', undefined, 'Column 127 mapped to SEG0 (mirror horizontally)'),
  r(0xc0, 'COM Scan Direction (normal)', 'W', undefined, 'Scan from COM0 to COM[N-1]'),
  r(0xc8, 'COM Scan Direction (remapped)', 'W', undefined, 'Scan from COM[N-1] to COM0 (flip vertically)'),
  r(0xa8, 'Set Multiplex Ratio', 'W', 0x3f, 'Two-byte command: 0xA8, then rows-1 (0x3F for 64 rows, 0x1F for 32)', [f('MUX', 5, 0)]),
  r(0xd3, 'Set Display Offset', 'W', 0x00, 'Two-byte command: 0xD3, then vertical shift 0-63', [f('offset', 5, 0)]),
  r(0xd5, 'Set Display Clock Divide / Oscillator Frequency', 'W', 0x80, 'Two-byte command: 0xD5, then value', [f('osc_freq', 7, 4), f('divide', 3, 0, undefined, 'Divide ratio = value + 1')]),
  r(0xd9, 'Set Pre-charge Period', 'W', 0x22, 'Two-byte command: 0xD9, then value', [f('phase2', 7, 4), f('phase1', 3, 0)]),
  r(0xda, 'Set COM Pins Hardware Configuration', 'W', 0x12, 'Two-byte command: 0xDA (0x12 for 128x64, 0x02 for 128x32)', [bit('alt_com', 4, undefined, { 0: 'Sequential', 1: 'Alternative' }), bit('remap', 5, 'COM left/right remap')]),
  r(0xdb, 'Set VCOMH Deselect Level', 'W', 0x20, 'Two-byte command: 0xDB, then level', [f('vcomh', 6, 4, { 0: '~0.65 × VCC', 2: '~0.77 × VCC (reset)', 3: '~0.83 × VCC' })]),
]

const ina = range(0x40, 0x4f, (a) => `A1/A0 = ${['GND', 'VS+', 'SDA', 'SCL'][(a >> 2) & 3]} / ${['GND', 'VS+', 'SDA', 'SCL'][a & 3]}`)

const lis3dh: Reg[] = [
  r(0x0f, 'WHO_AM_I', 'R', 0x33, 'Device ID', [f('WHO_AM_I', 7, 0, { 0x33: 'LIS3DH' })]),
  r(0x20, 'CTRL_REG1', 'RW', 0x07, 'Data rate and axis enables', [
    f('ODR', 7, 4, { 0: 'Power-down', 1: '1 Hz', 2: '10 Hz', 3: '25 Hz', 4: '50 Hz', 5: '100 Hz', 6: '200 Hz', 7: '400 Hz', 8: '1.6 kHz (low power)', 9: '1.344 kHz / 5.376 kHz (low power)' }),
    bit('LPen', 3, 'Low-power mode'), bit('Zen', 2), bit('Yen', 1), bit('Xen', 0),
  ]),
  r(0x23, 'CTRL_REG4', 'RW', 0x00, 'Block data update, full scale, high resolution', [
    bit('BDU', 7, 'Block data update', { 0: 'Continuous', 1: 'Output registers not updated until MSB and LSB read' }), bit('BLE', 6, undefined, { 0: 'Little endian', 1: 'Big endian' }),
    f('FS', 5, 4, { 0: '±2 g', 1: '±4 g', 2: '±8 g', 3: '±16 g' }), bit('HR', 3, 'High-resolution mode'), f('ST', 2, 1, { 0: 'Normal', 1: 'Self test 0', 2: 'Self test 1', 3: 'Not allowed' }), bit('SIM', 0, 'SPI mode', { 0: '4-wire', 1: '3-wire' }),
  ]),
  r(0x27, 'STATUS_REG', 'R', 0x00, 'Data status', [bit('ZYXOR', 7), bit('ZOR', 6), bit('YOR', 5), bit('XOR', 4), bit('ZYXDA', 3, 'New data on all axes'), bit('ZDA', 2), bit('YDA', 1), bit('XDA', 0)]),
  r(0x28, 'OUT_X_L', 'R', 0x00, 'X-axis output, low byte (16-bit left-justified, signed)', [f('OUT_X_L', 7, 0)]),
  r(0x2a, 'OUT_Y_L', 'R', 0x00, 'Y-axis output, low byte', [f('OUT_Y_L', 7, 0)]),
  r(0x2c, 'OUT_Z_L', 'R', 0x00, 'Z-axis output, low byte', [f('OUT_Z_L', 7, 0)]),
]

const adxl345: Reg[] = [
  r(0x00, 'DEVID', 'R', 0xe5, 'Device ID', [f('DEVID', 7, 0, { 0xe5: 'ADXL345' })]),
  r(0x2c, 'BW_RATE', 'RW', 0x0a, 'Output data rate and power mode', [bit('LOW_POWER', 4), f('Rate', 3, 0, { 6: '6.25 Hz', 7: '12.5 Hz', 8: '25 Hz', 9: '50 Hz', 10: '100 Hz', 11: '200 Hz', 12: '400 Hz', 13: '800 Hz', 14: '1600 Hz', 15: '3200 Hz' })]),
  r(0x2d, 'POWER_CTL', 'RW', 0x00, 'Power-saving features', [bit('Link', 5), bit('AUTO_SLEEP', 4), bit('Measure', 3, '1 = measurement mode, 0 = standby'), bit('Sleep', 2), f('Wakeup', 1, 0, { 0: '8 Hz', 1: '4 Hz', 2: '2 Hz', 3: '1 Hz' })]),
  r(0x2e, 'INT_ENABLE', 'RW', 0x00, 'Interrupt enables', [bit('DATA_READY', 7), bit('SINGLE_TAP', 6), bit('DOUBLE_TAP', 5), bit('Activity', 4), bit('Inactivity', 3), bit('FREE_FALL', 2), bit('Watermark', 1), bit('Overrun', 0)]),
  r(0x30, 'INT_SOURCE', 'R', 0x02, 'Interrupt source flags', [bit('DATA_READY', 7), bit('SINGLE_TAP', 6), bit('DOUBLE_TAP', 5), bit('Activity', 4), bit('Inactivity', 3), bit('FREE_FALL', 2), bit('Watermark', 1), bit('Overrun', 0)]),
  r(0x31, 'DATA_FORMAT', 'RW', 0x00, 'Data format', [bit('SELF_TEST', 7), bit('SPI', 6, undefined, { 0: '4-wire', 1: '3-wire' }), bit('INT_INVERT', 5, undefined, { 0: 'Interrupts active high', 1: 'Active low' }), bit('FULL_RES', 3, undefined, { 0: '10-bit mode', 1: 'Full resolution (4 mg/LSB)' }), bit('Justify', 2, undefined, { 0: 'Right-justified', 1: 'Left-justified (MSB)' }), f('Range', 1, 0, { 0: '±2 g', 1: '±4 g', 2: '±8 g', 3: '±16 g' })]),
  r(0x32, 'DATAX0', 'R', 0x00, 'X-axis data low byte (DATAX1 at 0x33)', [f('DATAX0', 7, 0)]),
  r(0x34, 'DATAY0', 'R', 0x00, 'Y-axis data low byte', [f('DATAY0', 7, 0)]),
  r(0x36, 'DATAZ0', 'R', 0x00, 'Z-axis data low byte', [f('DATAZ0', 7, 0)]),
]

const pca9685: Reg[] = [
  r(0x00, 'MODE1', 'RW', 0x11, 'Mode register 1', [bit('RESTART', 7), bit('EXTCLK', 6), bit('AI', 5, 'Auto-increment'), bit('SLEEP', 4, 'Low-power mode, oscillator off'), bit('SUB1', 3), bit('SUB2', 2), bit('SUB3', 1), bit('ALLCALL', 0, 'Responds to LED All Call address 0x70')]),
  r(0x01, 'MODE2', 'RW', 0x04, 'Mode register 2', [bit('INVRT', 4, 'Output logic inverted'), bit('OCH', 3, 'Outputs change on', { 0: 'STOP', 1: 'ACK' }), bit('OUTDRV', 2, undefined, { 0: 'Open-drain', 1: 'Totem pole' }), f('OUTNE', 1, 0)]),
  r(0x06, 'LED0_ON_L', 'RW', 0x00, 'LED0 output ON time, low byte (4 registers per channel, LED15 ends at 0x45)', [f('LED0_ON_L', 7, 0)]),
  r(0xfa, 'ALL_LED_ON_L', 'W', 0x00, 'Load all LEDx_ON registers, low byte', [f('ALL_LED_ON_L', 7, 0)]),
  r(0xfe, 'PRE_SCALE', 'RW', 0x1e, 'PWM frequency prescale = round(25 MHz / (4096 × rate)) − 1. Writable only while SLEEP = 1', [f('PRE_SCALE', 7, 0)]),
]

const tmp102: Reg[] = [
  r(0x00, 'Temperature', 'R', 0x0000, '12-bit two\'s complement in bits 15:4, 0.0625 °C per LSB', [f('T', 15, 4), bit('EM', 0, undefined, { 0: 'Normal 12-bit mode', 1: 'Extended 13-bit mode' })], 16),
  r(0x01, 'Configuration', 'RW', 0x60a0, 'Shutdown, conversion rate, alert', [bit('OS', 15, 'One-shot (when shutdown)'), f('R', 14, 13, undefined, 'Converter resolution (read-only, 3)'), f('F', 12, 11, { 0: '1 fault', 1: '2 faults', 2: '4 faults', 3: '6 faults' }), bit('POL', 10, 'Alert polarity'), bit('TM', 9, undefined, { 0: 'Comparator mode', 1: 'Interrupt mode' }), bit('SD', 8, 'Shutdown mode'), f('CR', 7, 6, { 0: '0.25 Hz', 1: '1 Hz', 2: '4 Hz', 3: '8 Hz' }), bit('AL', 5, 'Alert flag'), bit('EM', 4, 'Extended mode')], 16),
  r(0x02, 'T_LOW', 'RW', 0x4b00, 'Low temperature threshold (75 °C)', [f('T_LOW', 15, 4)], 16),
  r(0x03, 'T_HIGH', 'RW', 0x5000, 'High temperature threshold (80 °C)', [f('T_HIGH', 15, 4)], 16),
]

const w25q: Reg[] = [
  r(0x9f, 'JEDEC ID', 'R', 0xef4016, 'Manufacturer EFh (Winbond), memory type 40h, capacity 16h = 32 Mbit (W25Q32)', [f('Manufacturer', 23, 16, { 0xef: 'Winbond' }), f('Memory type', 15, 8), f('Capacity', 7, 0, { 0x15: '16 Mbit', 0x16: '32 Mbit', 0x17: '64 Mbit', 0x18: '128 Mbit' })], 24),
  r(0x05, 'Read Status Register-1', 'R', 0x00, 'Opcode 05h returns SR1', [bit('SRP', 7, 'Status register protect'), bit('SEC', 6, 'Sector protect'), bit('TB', 5, 'Top/bottom protect'), f('BP', 4, 2, undefined, 'Block protect bits'), bit('WEL', 1, 'Write enable latch'), bit('BUSY', 0, 'Erase/program/write in progress')]),
  r(0x35, 'Read Status Register-2', 'R', 0x00, 'Opcode 35h returns SR2', [bit('SUS', 7, 'Suspend status'), bit('CMP', 6), f('LB', 5, 3, undefined, 'Security register lock bits'), bit('QE', 1, 'Quad enable'), bit('SRL', 0, 'Status register lock')]),
  r(0x06, 'Write Enable', 'W', undefined, 'Opcode 06h: set WEL before program, erase or status writes'),
  r(0x03, 'Read Data', 'W', undefined, 'Opcode 03h + 24-bit address, then clock out data'),
  r(0x02, 'Page Program', 'W', undefined, 'Opcode 02h + 24-bit address + up to 256 bytes'),
  r(0x20, 'Sector Erase (4 KB)', 'W', undefined, 'Opcode 20h + 24-bit address'),
  r(0xc7, 'Chip Erase', 'W', undefined, 'Opcode C7h (or 60h)'),
  r(0xb9, 'Power-down', 'W', undefined, 'Opcode B9h'),
  r(0xab, 'Release Power-down / Device ID', 'W', undefined, 'Opcode ABh'),
]

const bh1750: Reg[] = [
  r(0x00, 'Power Down', 'W', undefined, 'No active state'),
  r(0x01, 'Power On', 'W', undefined, 'Waiting for measurement command'),
  r(0x07, 'Reset', 'W', undefined, 'Reset data register (not allowed in power-down)'),
  r(0x10, 'Continuous H-Resolution Mode', 'W', undefined, '1 lx resolution, 120 ms'),
  r(0x11, 'Continuous H-Resolution Mode 2', 'W', undefined, '0.5 lx resolution, 120 ms'),
  r(0x13, 'Continuous L-Resolution Mode', 'W', undefined, '4 lx resolution, 16 ms'),
  r(0x20, 'One Time H-Resolution Mode', 'W', undefined, '1 lx resolution, then power down'),
  r(0x21, 'One Time H-Resolution Mode 2', 'W', undefined, '0.5 lx resolution, then power down'),
  r(0x23, 'One Time L-Resolution Mode', 'W', undefined, '4 lx resolution, then power down'),
]

export const DEVICES: Device[] = [
  { id: 'bme280', name: 'BME280', category: 'Environmental', buses: ['I2C', 'SPI'], summary: 'Bosch temperature, humidity and pressure sensor.', addresses: [{ addr: 0x76, how: 'SDO = GND' }, { addr: 0x77, how: 'SDO = VDDIO' }], registers: bme280Common(0x60, true), notes: ['Calibration trimming parameters live at 0x88-0xA1 and 0xE1-0xE7 and are needed for compensation.', 'In forced mode, write ctrl_meas for every measurement.'] },
  { id: 'bmp280', name: 'BMP280', category: 'Environmental', buses: ['I2C', 'SPI'], summary: 'Bosch temperature and pressure sensor (no humidity). Often sold as "BME280" by mistake: check the ID register.', addresses: [{ addr: 0x76, how: 'SDO = GND' }, { addr: 0x77, how: 'SDO = VDDIO' }], registers: bme280Common(0x58, false) },
  { id: 'mpu6050', name: 'MPU-6050', category: 'Motion', buses: ['I2C'], summary: 'InvenSense 6-axis accelerometer and gyroscope.', addresses: [{ addr: 0x68, how: 'AD0 = LOW' }, { addr: 0x69, how: 'AD0 = HIGH' }], registers: mpu6050, notes: ['Starts in sleep mode: write 0 to PWR_MGMT_1 before reading data.', 'Many MPU-6500/9250 clones report WHO_AM_I = 0x70/0x71.'] },
  { id: 'ssd1306', name: 'SSD1306', category: 'Display', buses: ['I2C', 'SPI'], summary: '128x64 / 128x32 monochrome OLED controller. Command based: the first byte is 0x00 for commands or 0x40 for display data.', addresses: [{ addr: 0x3c, how: 'SA0 = LOW (most modules)' }, { addr: 0x3d, how: 'SA0 = HIGH' }], registers: ssd1306, commandBased: true, notes: ['Many modules print 0x78 on the board: that is the 8-bit write address (0x3C << 1).'] },
  { id: 'ina219', name: 'INA219', category: 'Power', buses: ['I2C'], summary: 'TI high-side current and power monitor with 12-bit ADC.', addresses: ina, registers: ina219, notes: ['Current_LSB = max expected current / 2^15; Calibration = trunc(0.04096 / (Current_LSB × R_shunt)).', 'The default 0x40 collides with the PCA9685.'] },
  { id: 'ads1115', name: 'ADS1115', category: 'ADC / DAC', buses: ['I2C'], summary: 'TI 16-bit, 4-channel delta-sigma ADC with PGA and comparator.', addresses: [{ addr: 0x48, how: 'ADDR = GND' }, { addr: 0x49, how: 'ADDR = VDD' }, { addr: 0x4a, how: 'ADDR = SDA' }, { addr: 0x4b, how: 'ADDR = SCL' }], registers: ads1115, notes: ['Registers are 16 bits, transmitted MSB first.', 'Full scale input never exceeds VDD + 0.3 V, whatever the PGA range.'] },
  { id: 'ds3231', name: 'DS3231', category: 'Clock', buses: ['I2C'], summary: 'Maxim temperature-compensated real-time clock.', addresses: one(0x68), registers: ds3231, notes: ['Same address as the MPU-6050 (AD0 low): use the MPU\'s AD0 = HIGH (0x69).', 'Time registers are BCD.'] },
  { id: 'pcf8574', name: 'PCF8574', category: 'I/O expander', buses: ['I2C'], summary: 'NXP 8-bit quasi-bidirectional I/O expander. No registers: one data byte read or written is the port. Write 1 to use a pin as input.', addresses: range(0x20, 0x27, (a) => `A2..A0 = ${(a & 7).toString(2).padStart(3, '0')}`), registers: [r(0x00, 'Port', 'RW', 0xff, 'The single 8-bit port. Outputs are weak pull-ups after reset', [f('P', 7, 0)])], notes: ['The PCF8574A variant uses 0x38-0x3F instead.', 'Common on HD44780 LCD I2C backpacks (0x27 or 0x3F).'] },
  { id: 'pcf8574a', name: 'PCF8574A', category: 'I/O expander', buses: ['I2C'], summary: 'PCF8574 with a different address range (0x38-0x3F).', addresses: range(0x38, 0x3f, (a) => `A2..A0 = ${(a & 7).toString(2).padStart(3, '0')}`), registers: [r(0x00, 'Port', 'RW', 0xff, 'The single 8-bit port', [f('P', 7, 0)])] },
  { id: 'mcp23017', name: 'MCP23017', category: 'I/O expander', buses: ['I2C'], summary: 'Microchip 16-bit I/O expander with interrupts (MCP23S17 on SPI).', addresses: range(0x20, 0x27, (a) => `A2..A0 = ${(a & 7).toString(2).padStart(3, '0')}`), registers: mcp23017, notes: ['Shares 0x20-0x27 with the PCF8574.', 'Register addresses shown are for IOCON.BANK = 0.'] },
  { id: 'bh1750', name: 'BH1750', category: 'Environmental', buses: ['I2C'], summary: 'ROHM ambient light sensor, 1-65535 lx. Command based.', addresses: [{ addr: 0x23, how: 'ADDR = LOW' }, { addr: 0x5c, how: 'ADDR = HIGH' }], registers: bh1750, commandBased: true, notes: ['Result is 2 bytes, lux = raw / 1.2.'] },
  { id: 'tmp102', name: 'TMP102', category: 'Environmental', buses: ['I2C'], summary: 'TI 12-bit digital temperature sensor, ±0.5 °C.', addresses: [{ addr: 0x48, how: 'ADD0 = GND' }, { addr: 0x49, how: 'ADD0 = V+' }, { addr: 0x4a, how: 'ADD0 = SDA' }, { addr: 0x4b, how: 'ADD0 = SCL' }], registers: tmp102, notes: ['Default 0x48 collides with the ADS1115 and LM75.'] },
  { id: 'lm75', name: 'LM75A', category: 'Environmental', buses: ['I2C'], summary: 'NXP digital temperature sensor with thermal watchdog.', addresses: range(0x48, 0x4f, (a) => `A2..A0 = ${(a & 7).toString(2).padStart(3, '0')}`), registers: [r(0x00, 'Temp', 'R', 0x0000, '11-bit, 0.125 °C per LSB in bits 15:5', [f('T', 15, 5)], 16), r(0x01, 'Conf', 'RW', 0x00, 'Configuration', [bit('SHUTDOWN', 0), bit('OS_COMP_INT', 1), bit('OS_POL', 2), f('OS_F_QUE', 4, 3, { 0: '1', 1: '2', 2: '4', 3: '6' })]), r(0x02, 'Thyst', 'RW', 0x4b00, 'Hysteresis (75 °C)', [f('Thyst', 15, 7)], 16), r(0x03, 'Tos', 'RW', 0x5000, 'Overtemperature shutdown (80 °C)', [f('Tos', 15, 7)], 16)] },
  { id: 'lis3dh', name: 'LIS3DH', category: 'Motion', buses: ['I2C', 'SPI'], summary: 'ST 3-axis low-power accelerometer.', addresses: [{ addr: 0x18, how: 'SA0 = LOW' }, { addr: 0x19, how: 'SA0 = HIGH' }], registers: lis3dh, notes: ['Set bit 7 of the sub-address to auto-increment multi-byte reads.'] },
  { id: 'adxl345', name: 'ADXL345', category: 'Motion', buses: ['I2C', 'SPI'], summary: 'Analog Devices 3-axis accelerometer, ±16 g.', addresses: [{ addr: 0x53, how: 'ALT ADDRESS = LOW' }, { addr: 0x1d, how: 'ALT ADDRESS = HIGH' }], registers: adxl345, notes: ['Starts in standby: set Measure in POWER_CTL.'] },
  { id: 'pca9685', name: 'PCA9685', category: 'PWM / servo', buses: ['I2C'], summary: 'NXP 16-channel 12-bit PWM / servo driver.', addresses: range(0x40, 0x7f, (a) => `A5..A0 = ${(a & 0x3f).toString(2).padStart(6, '0')}`).filter((o) => o.addr <= 0x77 && o.addr !== 0x70), registers: pca9685, notes: ['Also answers to the All Call address 0x70 and software-reset address 0x00.', 'Default 0x40 collides with the INA219.'] },
  { id: 'vl53l0x', name: 'VL53L0X', category: 'Distance', buses: ['I2C'], summary: 'ST time-of-flight distance sensor, up to 2 m.', addresses: one(0x29, 'default, software-changeable'), registers: [], notes: ['The address can be changed in software after boot; use XSHUT pins to bring several up one by one.'] },
  { id: 'sht31', name: 'SHT31', category: 'Environmental', buses: ['I2C'], summary: 'Sensirion temperature and humidity sensor.', addresses: [{ addr: 0x44, how: 'ADDR = LOW' }, { addr: 0x45, how: 'ADDR = HIGH' }], registers: [] },
  { id: 'aht10', name: 'AHT10 / AHT20', category: 'Environmental', buses: ['I2C'], summary: 'Aosong temperature and humidity sensor.', addresses: one(0x38), registers: [], notes: ['Collides with the PCF8574A.'] },
  { id: 'hmc5883l', name: 'HMC5883L', category: 'Motion', buses: ['I2C'], summary: 'Honeywell 3-axis magnetometer (QMC5883L clones use 0x0D).', addresses: one(0x1e), registers: [] },
  { id: 'mlx90614', name: 'MLX90614', category: 'Environmental', buses: ['I2C'], summary: 'Melexis infrared thermometer (SMBus).', addresses: one(0x5a), registers: [] },
  { id: 'at24c02', name: '24C02 EEPROM', category: 'Memory', buses: ['I2C'], summary: 'Microchip/ST 2-kbit I2C EEPROM (24C02 to 24C16 vary).', addresses: range(0x50, 0x57, (a) => `A2..A0 = ${(a & 7).toString(2).padStart(3, '0')}`), registers: [], notes: ['Larger parts use the low address bits as memory page bits.'] },
  { id: 'w25q32', name: 'W25Q32 flash', category: 'Memory', buses: ['SPI'], summary: 'Winbond 32-Mbit serial NOR flash (SPI modes 0 and 3). Opcode driven.', addresses: [], registers: w25q, commandBased: true },
]
