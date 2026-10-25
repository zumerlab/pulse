import assert from 'node:assert/strict';
import test from 'node:test';
import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@matter/main/types';
import { decodeMatterCode, projectMatterEndpoint } from '../adapters/matter/driver.ts';

test('Matter codes validate the selected discriminator and never expose entered payloads in errors', () => {
  const manual = ManualPairingCodeCodec.encode({ discriminator: 3840, passcode: 20202021 });
  assert.deepEqual(decodeMatterCode(manual, 3840), { discriminator: 3840, passcode: 20202021 });
  assert.deepEqual(decodeMatterCode(`${manual.slice(0, 4)}-${manual.slice(4)}`), { passcode: 20202021 });
  const qr = QrPairingCodeCodec.encode([{
    version: 0, vendorId: 0xfff1, productId: 0x8000, flowType: 0,
    discoveryCapabilities: 4, discriminator: 3840, passcode: 20202021,
  }]);
  assert.deepEqual(decodeMatterCode(qr, 3840), { discriminator: 3840, passcode: 20202021 });
  for (const [code, discriminator] of [[manual, 256], [qr, 3839], ['private invalid payload', 3840]] as const) {
    assert.throws(() => decodeMatterCode(code, discriminator), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no es válido/);
      assert.ok(!error.message.includes(code));
      return true;
    });
  }
});

test('lighting capabilities require supported commands and convert reported levels', () => {
  assert.equal(projectMatterEndpoint('light', 'Light', { onOff: { onOff: false } }, true, () => false), undefined);
  const light = projectMatterEndpoint('light', 'Light', {
    onOff: { onOff: false }, levelControl: { currentLevel: 127 },
  }, true, () => true)!;
  assert.deepEqual(light.capabilities, ['onOff', 'brightness']);
  assert.deepEqual(light.state, { online: true, on: false, brightness: 50 });
});

test('Matter closed-position percentage becomes Pulse open-position percentage, including unknown positions', () => {
  const blind = projectMatterEndpoint('blind', 'Blind', {
    windowCovering: { currentPositionLiftPercent100ths: 2500 },
  }, true, () => true)!;
  assert.equal(blind.domain, 'openings');
  assert.equal(blind.state.position, 75);
  assert.equal(projectMatterEndpoint('blind', 'Blind', {
    windowCovering: { currentPositionLiftPercent100ths: null },
  }, false, () => true)!.state.position, null);
});

test('thermostats use reported mode, limits and hundredths without inventing an auto-mode setpoint', () => {
  const thermostat = {
    localTemperature: 2175, occupiedHeatingSetpoint: 2200, occupiedCoolingSetpoint: 2500,
    minHeatSetpointLimit: 1000, maxHeatSetpointLimit: 3000, systemMode: 4,
  };
  const heat = projectMatterEndpoint('thermostat', 'Thermostat', { thermostat }, true, () => true)!;
  assert.equal(heat.domain, 'climate');
  assert.equal(heat.state.temperature, 21.75);
  assert.equal(heat.state.targetTemperature, 22);
  assert.equal(heat.state.minTargetTemperature, 10);
  assert.equal(heat.state.maxTargetTemperature, 30);
  assert.deepEqual(heat.state.hvacModes, ['off', 'heat', 'cool']);
  const auto = projectMatterEndpoint('thermostat', 'Thermostat', {
    thermostat: { ...thermostat, systemMode: 1, localTemperature: null },
  }, true, () => true)!;
  assert.equal(auto.state.temperature, null);
  assert.equal(auto.state.targetTemperature, null);
  assert.equal(auto.state.targetTemperatureWritable, false);
  assert.equal(auto.state.hvacMode, 'auto');
});
