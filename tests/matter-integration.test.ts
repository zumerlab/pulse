import assert from 'node:assert/strict';
import { EventEmitter, on } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Logger, LogLevel, Network } from '@matter/main';
import { NativeMatterDriver } from '../adapters/matter/driver.ts';
import type { State } from '../core/entity.ts';
import { createMatterSimulator, simulatorEnvironment } from '../scripts/matter-simulator.ts';

test('real Matter pairing, commands, subscription reports and fresh-controller restore stay on a simulated network', { timeout: 60000 }, async () => {
  Logger.level = LogLevel.ERROR;
  const storagePath = await mkdtemp(join(tmpdir(), 'pulse-matter-integration-'));
  const simulator = await createMatterSimulator();
  const environments = [simulatorEnvironment(simulator.network, 2, storagePath)];
  const reports = new EventEmitter();
  const report = (entityId: string, state: State) => reports.emit('state', entityId, state);
  const nextOnReport = async (id: string, value: boolean) => {
    for await (const [entityId, state] of on(reports, 'state', { signal: AbortSignal.timeout(10000) })) {
      if (entityId === id && (state as State).on === value) return state as State;
    }
    throw new Error('Matter report stream ended');
  };
  let driver = new NativeMatterDriver({ storagePath, interfaceName: 'fake0', environment: environments[0] });
  try {
    assert.deepEqual(await driver.start(report), []);
    const entities = await driver.commission(simulator.target, simulator.code);
    assert.equal(entities.length, 1);
    const light = entities[0];
    assert.equal(light.domain, 'lighting');
    assert.ok(light.capabilities.includes('onOff'));
    assert.equal(light.state.on, false);
    assert.equal(simulator.node.state.commissioning.commissioned, true);

    await Promise.all([nextOnReport(light.id, true), driver.execute(light.id, { type: 'turnOn' })]);
    assert.equal(simulator.light.state.onOff.onOff, true);

    // An external device change must arrive through the actual Matter subscription.
    await Promise.all([nextOnReport(light.id, false), simulator.light.set({ onOff: { onOff: false } })]);
    await driver.close();
    assert.ok((await readdir(storagePath)).length > 0);

    // No shared environment or client object survives this controller restart.
    environments.push(simulatorEnvironment(simulator.network, 3, storagePath));
    driver = new NativeMatterDriver({ storagePath, interfaceName: 'fake0', environment: environments[1] });
    const restored = await driver.start(report);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].id, light.id);
    assert.equal(restored[0].state.on, false);
    await Promise.all([nextOnReport(light.id, true), driver.execute(light.id, { type: 'turnOn' })]);
    assert.equal(simulator.light.state.onOff.onOff, true);
  } finally {
    await driver.close();
    await simulator.close();
    for (const environment of environments) {
      await environment.close(Network);
      environment[Symbol.dispose]();
    }
    await rm(storagePath, { recursive: true, force: true });
  }
});
