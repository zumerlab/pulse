// The ISS's public telemetry, the part of it this app reads: NASA streams a
// few hundred of the station's parameters through Lightstreamer (adapter set
// ISSLIVE), each a PUI with a value and the time it last changed. The names,
// units and states come from the ISS Mimic project's table of the public
// PUIs (ISS_Public_Telemetry.xlsx); the units are what the stream really
// sends, which is not always what that table says (the cabin pressure comes
// in mmHg, not psi).

export type Pui = { name: string; unit?: string; states?: Record<number, string> };

const MDM = { 0: 'off', 1: 'on', 3: 'failed' };
const CCAA = { 0: 'reset', 1: 'drain', 2: 'dry out', 3: 'EIB off', 4: 'off', 5: 'on', 6: 'starting', 7: 'test' };
const SARJ = { 1: 'standby', 2: 'restart', 3: 'checkout', 4: 'directed position', 5: 'autotrack', 6: 'blind', 7: 'shutdown', 8: 'switchover' };
const YES = { 0: 'no', 1: 'yes' };
// The solar array wings, each a pair of blankets on a truss: its drive voltage and current, and the beta gimbal that tilts it.
export const WINGS: { wing: string; volts: string; amps: string; bga: string }[] = [
  { wing: '1A', volts: 'S4000001', amps: 'S4000002', bga: 'S4000007' },
  { wing: '3A', volts: 'S4000004', amps: 'S4000005', bga: 'S4000008' },
  { wing: '1B', volts: 'S6000004', amps: 'S6000005', bga: 'S6000008' },
  { wing: '3B', volts: 'S6000001', amps: 'S6000002', bga: 'S6000007' },
  { wing: '2A', volts: 'P4000001', amps: 'P4000002', bga: 'P4000007' },
  { wing: '4A', volts: 'P4000004', amps: 'P4000005', bga: 'P4000008' },
  { wing: '2B', volts: 'P6000004', amps: 'P6000005', bga: 'P6000008' },
  { wing: '4B', volts: 'P6000001', amps: 'P6000002', bga: 'P6000007' },
];

export const PUIS: Record<string, Pui> = {
  // Air: the US Lab's and Node 3's major constituents analyzers, the Lab's cabin.
  USLAB000058: { name: 'Cabin pressure', unit: 'mmHg' },
  USLAB000059: { name: 'Cabin temperature', unit: '°C' },
  USLAB000053: { name: 'Lab ppO₂', unit: 'mmHg' },
  USLAB000054: { name: 'Lab ppN₂', unit: 'mmHg' },
  USLAB000055: { name: 'Lab ppCO₂', unit: 'mmHg' },
  NODE3000001: { name: 'Node 3 ppO₂', unit: 'mmHg' },
  NODE3000002: { name: 'Node 3 ppN₂', unit: 'mmHg' },
  NODE3000003: { name: 'Node 3 ppCO₂', unit: 'mmHg' },
  AIRLOCK000054: { name: 'Airlock pressure', unit: 'mmHg' },
  USLAB000064: { name: 'Lab port air conditioner', states: CCAA },
  USLAB000065: { name: 'Lab starboard air conditioner', states: CCAA },
  NODE2000003: { name: 'Node 2 air conditioner', states: CCAA },
  NODE3000018: { name: 'Node 3 air conditioner', states: CCAA },
  AIRLOCK000053: { name: 'Airlock air conditioner', states: CCAA },
  // Water and oxygen: Node 3's recycling.
  NODE3000005: { name: 'Urine tank', unit: '%' },
  NODE3000008: { name: 'Waste water tank', unit: '%' },
  NODE3000009: { name: 'Clean water tank', unit: '%' },
  NODE3000004: { name: 'Urine processor', states: { 2: 'stop', 4: 'shutdown', 8: 'maintenance', 16: 'normal', 32: 'standby', 64: 'idle', 128: 'initialized' } },
  NODE3000006: { name: 'Water processor', states: { 1: 'stop', 2: 'shutdown', 3: 'standby', 4: 'process', 5: 'hot service', 6: 'flush', 7: 'warm shutdown' } },
  NODE3000010: { name: 'Oxygen generator', states: { 1: 'process', 2: 'standby', 3: 'shutdown', 4: 'stop', 5: 'vent dome', 6: 'inert dome', 7: 'fast shutdown', 8: 'N₂ purge shutdown' } },
  NODE3000011: { name: 'O₂ production', unit: 'lb/day' },
  // Power: the wings, and the alpha joints that turn the trusses to the sun.
  ...Object.fromEntries(WINGS.flatMap((w) => [
    [w.volts, { name: `Array ${w.wing} voltage`, unit: 'V' }],
    [w.amps, { name: `Array ${w.wing} current`, unit: 'A' }],
    [w.bga, { name: `Array ${w.wing} beta gimbal`, unit: '°' }],
  ])),
  S0000003: { name: 'Starboard alpha joint', unit: '°' },
  S0000004: { name: 'Port alpha joint', unit: '°' },
  S0000008: { name: 'Port alpha joint mode', states: SARJ },
  S0000009: { name: 'Starboard alpha joint mode', states: SARJ },
  USLAB000040: { name: 'Solar beta angle', unit: '°' },
  // Thermal: the two external ammonia loops, and the radiators' joints.
  S1000001: { name: 'Loop A flow', unit: 'kg/h' },
  S1000003: { name: 'Loop A temperature', unit: '°C' },
  P1000001: { name: 'Loop B flow', unit: 'kg/h' },
  P1000003: { name: 'Loop B temperature', unit: '°C' },
  S0000001: { name: 'Starboard radiator joint', unit: '°' },
  S0000002: { name: 'Port radiator joint', unit: '°' },
  // Attitude: the four control moment gyroscopes, their momentum, the mode.
  USLAB000001: { name: 'CMG 1', states: { 0: 'not in use', 1: 'in use' } },
  USLAB000002: { name: 'CMG 2', states: { 0: 'not in use', 1: 'in use' } },
  USLAB000003: { name: 'CMG 3', states: { 0: 'not in use', 1: 'in use' } },
  USLAB000004: { name: 'CMG 4', states: { 0: 'not in use', 1: 'in use' } },
  Z1000009: { name: 'CMG 1 wheel speed', unit: 'rpm' },
  Z1000010: { name: 'CMG 2 wheel speed', unit: 'rpm' },
  Z1000011: { name: 'CMG 3 wheel speed', unit: 'rpm' },
  Z1000012: { name: 'CMG 4 wheel speed', unit: 'rpm' },
  USLAB000010: { name: 'CMG momentum', unit: '%' },
  USLAB000012: { name: 'Attitude control', states: { 0: 'default', 1: 'wait', 2: 'reserved', 3: 'standby', 4: 'CMG control', 5: 'CMG and thrusters', 6: 'user data generation', 7: 'free drift' } },
  USLAB000017: { name: 'Attitude frame', states: { 0: 'LVLH', 1: 'inertial', 2: 'XPOP' } },
  USLAB000041: { name: 'Loss of CMG attitude control', states: YES },
  USLAB000042: { name: 'Loss of station attitude control', states: YES },
  USLAB000081: { name: 'Attitude maneuver', states: { 0: 'none', 1: 'in progress' } },
  USLAB000022: { name: 'Roll error', unit: '°' },
  USLAB000023: { name: 'Pitch error', unit: '°' },
  USLAB000024: { name: 'Yaw error', unit: '°' },
  // The station: its mode, its mass, the computers.
  USLAB000086: { name: 'Station mode', states: { 1: 'standard', 2: 'microgravity', 4: 'reboost', 8: 'proximity operations', 16: 'external operations', 32: 'survival', 64: 'assured safe crew return' } },
  USLAB000039: { name: 'Station mass', unit: 'kg' },
  USLAB000066: { name: 'C&C computer 1', states: MDM },
  USLAB000067: { name: 'C&C computer 2', states: MDM },
  USLAB000068: { name: 'C&C computer 3', states: MDM },
  // Links: the Ku-band video channels, the S-band string.
  USLAB000088: { name: 'Ku-band video 1', states: { 0: 'inactive', 1: 'active' } },
  USLAB000089: { name: 'Ku-band video 2', states: { 0: 'inactive', 1: 'active' } },
  USLAB000090: { name: 'Ku-band video 3', states: { 0: 'inactive', 1: 'active' } },
  USLAB000091: { name: 'Ku-band video 4', states: { 0: 'inactive', 1: 'active' } },
  Z1000013: { name: 'Ku-band transmit', states: { 0: 'reset', 1: 'normal' } },
  USLAB000092: { name: 'S-band string', states: { 1: 'string 1', 2: 'string 2' } },
  // The clock: its Status.Class says whether the ground hears the station.
  TIME_000001: { name: 'Station time' },
  TIME_000002: { name: 'Year' },
};
export const ITEMS = Object.keys(PUIS);
export const FIELDS = ['TimeStamp', 'Value', 'Status.Class'];

// A PUI as the app keeps it: its value as a number when it is one, as the stream sent it, and when it last changed.
export type Sample = { id: string; value: number | null; raw: string; at: number };

// The stream's time stamps are hours since the start of the year, counted from
// its day 1 (so from midnight of December 31 before): 7431.8 is November 5 at 15:48.
export const atOf = (hours: number, year = new Date().getUTCFullYear()) => Date.UTC(year, 0, 0) + hours * 3_600_000;

// An update as a sample. The clock is the exception: its value is the station's
// time and its class is the signal (24: the ground hears it).
export function sampleOf(id: string, f: Record<string, string | null>, year?: number): Sample | null {
  const stamp = Number(f.TimeStamp);
  if (!f.Value || !Number.isFinite(stamp) || stamp <= 0) return null;
  const v = Number(f.Value);
  return { id, value: Number.isFinite(v) ? v : null, raw: f.Value, at: atOf(stamp, year) };
}
// A sample in words: its state when it has states, else the number with its unit.
export function textOf(s: Sample | undefined, digits = 1) {
  if (!s) return '';
  const p = PUIS[s.id];
  if (p?.states && s.value != null) return p.states[s.value] ?? String(s.value);
  if (s.value == null) return s.raw;
  return `${s.value.toLocaleString('en-US', { maximumFractionDigits: digits })}${p?.unit ? `${p.unit === '%' || p.unit === '°' || p.unit === '°C' ? '' : ' '}${p.unit}` : ''}`;
}
