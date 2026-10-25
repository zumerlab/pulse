import type { Capability } from './capability.ts';

export type Action =
  | { type: 'turnOn' }
  | { type: 'turnOff' }
  | { type: 'setBrightness'; value: number }
  | { type: 'setPosition'; value: number }
  | { type: 'setTargetTemperature'; value: number }
  | { type: 'setHvacMode'; value: 'off' | 'heat' | 'cool' | 'auto' }
  | { type: 'armHome' }
  | { type: 'armAway' }
  | { type: 'disarm' }
  | { type: 'setVolume'; value: number }
  | { type: 'setMute'; value: boolean };

const requiredCapability: Record<Action['type'], Capability> = {
  turnOn: 'onOff', turnOff: 'onOff', setBrightness: 'brightness',
  setPosition: 'position', setTargetTemperature: 'targetTemperature',
  setHvacMode: 'hvacMode', armHome: 'alarmMode', armAway: 'alarmMode', disarm: 'alarmMode',
  setVolume: 'volume', setMute: 'mute',
};

export function validateAction(capabilities: readonly Capability[], action: Action): void {
  if (!capabilities.includes(requiredCapability[action.type])) {
    throw new Error(`Unsupported action: ${action.type}`);
  }
  if (action.type === 'setBrightness' || action.type === 'setPosition' || action.type === 'setTargetTemperature' || action.type === 'setVolume') {
    if (!Number.isFinite(action.value)) throw new Error('Action value must be a finite number');
    if (action.type !== 'setTargetTemperature' && (action.value < 0 || action.value > 100)) {
      throw new Error('Action value must be between 0 and 100');
    }
  }
  if (action.type === 'setMute' && typeof action.value !== 'boolean') throw new Error('Mute value must be boolean');
  if (action.type === 'setHvacMode' && !['off', 'heat', 'cool', 'auto'].includes(action.value)) {
    throw new Error(`Unsupported HVAC mode: ${action.value}`);
  }
}
