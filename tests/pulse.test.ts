import assert from 'node:assert/strict';
import test from 'node:test';
import { MockAdapter } from '../adapters/mock/index.ts';
import type { Action } from '../core/action.ts';
import type { Adapter } from '../core/adapter.ts';
import type { Capability } from '../core/capability.ts';
import type { PulseEntity } from '../core/entity.ts';
import { projectEvents, type PulseEvent } from '../core/event.ts';
import { Registry } from '../core/registry.ts';

async function setup() {
  const registry = new Registry([new MockAdapter()]);
  await registry.discover();
  const id = (name: string) => {
    const entity = registry.list().find((candidate) => candidate.name === name);
    assert.ok(entity, `Missing mock entity: ${name}`);
    return entity.id;
  };
  return { registry, id };
}

test('discovers the five devices and systems with their supported capabilities', async (context) => {
  const { registry, id } = await setup();
  context.after(() => registry.dispose());
  assert.deepEqual(registry.list().map((entity) => entity.name), [
    'Living Light', 'Kitchen Light', 'Bedroom Blind', 'Living Thermostat', 'Home Alarm',
  ]);
  assert.deepEqual(registry.list().map((entity) => entity.domain), [
    'lighting', 'lighting', 'openings', 'climate', 'security',
  ]);
  assert.equal(new Set(registry.list().map((entity) => entity.id)).size, 5);
  assert.equal(registry.list().find((entity) => entity.id === id('Home Alarm'))?.kind, 'system');
  assert.ok(registry.list().filter((entity) => entity.name !== 'Home Alarm').every((entity) => entity.kind === 'device'));
  assert.deepEqual(registry.getCapabilities(id('Living Light')), ['onOff', 'brightness']);
  assert.deepEqual(registry.getCapabilities(id('Bedroom Blind')), ['position']);
  assert.deepEqual(registry.getCapabilities(id('Living Thermostat')), ['temperature', 'targetTemperature', 'hvacMode']);
  assert.deepEqual(registry.getCapabilities(id('Home Alarm')), ['alarmMode']);
  assert.ok(registry.list().every((entity) => entity.source.adapter === 'mock' && entity.source.local));
  assert.equal(registry.getEvents().length, 5);
  assert.deepEqual(projectEvents(registry.getEvents()), registry.list());
});

test('executes basic actions and can reconstruct every resulting state from events', async (context) => {
  const { registry, id } = await setup();
  context.after(() => registry.dispose());
  const cases: Array<[string, Action, string, unknown]> = [
    ['Living Light', { type: 'turnOff' }, 'on', false],
    ['Living Light', { type: 'turnOn' }, 'on', true],
    ['Living Light', { type: 'setBrightness', value: 37 }, 'brightness', 37],
    ['Kitchen Light', { type: 'turnOn' }, 'on', true],
    ['Kitchen Light', { type: 'setBrightness', value: 0 }, 'brightness', 0],
    ['Kitchen Light', { type: 'setBrightness', value: 100 }, 'brightness', 100],
    ['Kitchen Light', { type: 'turnOff' }, 'on', false],
    ['Bedroom Blind', { type: 'setPosition', value: 100 }, 'position', 100],
    ['Bedroom Blind', { type: 'setPosition', value: 0 }, 'position', 0],
    ['Bedroom Blind', { type: 'setPosition', value: 45 }, 'position', 45],
    ['Living Thermostat', { type: 'setTargetTemperature', value: 23.5 }, 'targetTemperature', 23.5],
    ['Living Thermostat', { type: 'setTargetTemperature', value: 5 }, 'targetTemperature', 5],
    ['Living Thermostat', { type: 'setTargetTemperature', value: 35 }, 'targetTemperature', 35],
    ['Living Thermostat', { type: 'setHvacMode', value: 'off' }, 'hvacMode', 'off'],
    ['Living Thermostat', { type: 'setHvacMode', value: 'heat' }, 'hvacMode', 'heat'],
    ['Living Thermostat', { type: 'setHvacMode', value: 'cool' }, 'hvacMode', 'cool'],
    ['Living Thermostat', { type: 'setHvacMode', value: 'auto' }, 'hvacMode', 'auto'],
    ['Home Alarm', { type: 'armHome' }, 'alarmMode', 'armedHome'],
    ['Home Alarm', { type: 'armAway' }, 'alarmMode', 'armedAway'],
    ['Home Alarm', { type: 'disarm' }, 'alarmMode', 'disarmed'],
  ];
  const received: PulseEvent[] = [];
  registry.subscribe((event) => received.push(event));
  const measuredTemperature = registry.getState(id('Living Thermostat')).temperature;
  for (const [name, action, key, value] of cases) {
    await registry.execute(id(name), action);
    assert.equal(registry.getState(id(name))[key], value, `${name}: ${action.type}`);
    assert.deepEqual(projectEvents(registry.getEvents()), registry.list());
  }
  assert.equal(registry.getState(id('Living Thermostat')).temperature, measuredTemperature);
  assert.ok(received.length > 0);
  assert.ok(received.every((event) => event.type === 'stateChanged'));
  assert.deepEqual(received, registry.getEvents().slice(5));
});

test('rejects unsupported actions and invalid values without changing state or history', async (context) => {
  const { registry, id } = await setup();
  context.after(() => registry.dispose());
  const cases: Array<[string, Action]> = [
    ['Living Light', { type: 'armAway' }],
    ['Living Thermostat', { type: 'turnOn' }],
    ['Home Alarm', { type: 'setPosition', value: 50 }],
    ['Living Light', { type: 'setBrightness', value: -1 }],
    ['Living Light', { type: 'setBrightness', value: 101 }],
    ['Living Light', { type: 'setBrightness', value: Number.NaN }],
    ['Living Light', { type: 'setBrightness', value: Number.POSITIVE_INFINITY }],
    ['Bedroom Blind', { type: 'setPosition', value: -1 }],
    ['Bedroom Blind', { type: 'setPosition', value: 101 }],
    ['Living Thermostat', { type: 'setTargetTemperature', value: 4 }],
    ['Living Thermostat', { type: 'setTargetTemperature', value: 36 }],
    ['Living Thermostat', { type: 'setTargetTemperature', value: Number.NaN }],
    ['Living Thermostat', { type: 'setHvacMode', value: 'invalid' } as unknown as Action],
    ['Living Light', { type: 'unknownAction' } as unknown as Action],
  ];
  const state = registry.list();
  const events = registry.getEvents();
  for (const [name, action] of cases) {
    await assert.rejects(registry.execute(id(name), action));
    assert.deepEqual(registry.list(), state);
    assert.deepEqual(registry.getEvents(), events);
  }
  await assert.rejects(registry.execute('missing', { type: 'turnOn' }));
  assert.throws(() => registry.getState('missing'));
  assert.throws(() => registry.getCapabilities('missing'));
  assert.deepEqual(registry.getEvents(), events);
});

class ReportingAdapter implements Adapter {
  readonly id = 'reporting';
  readonly listeners = new Set<(event: PulseEvent) => void>();
  readonly calls: Action[] = [];
  readonly entity: PulseEntity = {
    kind: 'device', id: 'reporting:light', name: 'Reporting Light', domain: 'lighting',
    source: { adapter: 'reporting', local: true }, capabilities: ['onOff'], state: { on: false },
  };
  async discover(): Promise<PulseEntity[]> { return [structuredClone(this.entity)]; }
  async getState(): Promise<Record<string, unknown>> { return structuredClone(this.entity.state); }
  async getCapabilities(): Promise<Capability[]> { return [...this.entity.capabilities]; }
  async execute(_id: string, action: Action): Promise<void> { this.calls.push(action); }
  subscribe(handler: (event: PulseEvent) => void): () => void {
    this.listeners.add(handler);
    return () => { this.listeners.delete(handler); };
  }
  emit(value: Record<string, unknown>) {
    Object.assign(this.entity.state, value);
    const event: PulseEvent = {
      type: 'stateChanged', entityId: this.entity.id, timestamp: Date.now(), value,
    };
    for (const listener of this.listeners) listener(event);
    return event;
  }
}

test('only reported events change the projection; an action acknowledgement does not', async (context) => {
  const adapter = new ReportingAdapter();
  const registry = new Registry([adapter]);
  context.after(() => registry.dispose());
  await registry.discover();
  const before = registry.getEvents();
  await registry.execute(adapter.entity.id, { type: 'turnOn' });
  assert.deepEqual(adapter.calls, [{ type: 'turnOn' }]);
  assert.equal(registry.getState(adapter.entity.id).on, false);
  assert.deepEqual(registry.getEvents(), before);
  adapter.emit({ on: true });
  assert.equal(registry.getState(adapter.entity.id).on, true);
  assert.equal(registry.getEvents().length, before.length + 1);
  adapter.emit({ observed: 'outside the app' });
  assert.deepEqual(registry.getState(adapter.entity.id), { on: true, observed: 'outside the app' });
  assert.deepEqual(projectEvents(registry.getEvents()), registry.list());
});

test('repeated and concurrent discovery keep one subscription and one discovery per entity', async (context) => {
  const adapter = new ReportingAdapter();
  const registry = new Registry([adapter]);
  context.after(() => registry.dispose());
  await Promise.all([registry.discover(), registry.discover()]);
  await registry.discover();
  assert.equal(registry.list().length, 1);
  assert.equal(registry.getEvents().length, 1);
  assert.equal(adapter.listeners.size, 1);
  adapter.emit({ on: true });
  assert.equal(registry.getEvents().length, 2);
  await registry.discover();
  assert.equal(registry.getEvents().length, 2);
  assert.equal(registry.getState(adapter.entity.id).on, true);
});

test('unsubscribe and dispose remove listeners without rewriting recorded history', async () => {
  const adapter = new ReportingAdapter();
  const registry = new Registry([adapter]);
  await registry.discover();
  const received: PulseEvent[] = [];
  const unsubscribe = registry.subscribe((event) => received.push(event));
  adapter.emit({ on: true });
  assert.equal(received.length, 1);
  unsubscribe();
  unsubscribe();
  adapter.emit({ on: false });
  assert.equal(received.length, 1);
  const events = registry.getEvents();
  registry.dispose();
  registry.dispose();
  assert.equal(adapter.listeners.size, 0);
  adapter.emit({ on: true });
  assert.deepEqual(registry.getEvents(), events);
  assert.equal(registry.getState(adapter.entity.id).on, false);
});

function tryMutation(mutate: () => void) {
  try { mutate(); } catch (error) { assert.ok(error instanceof TypeError); }
}

test('callers cannot mutate the event log or state projection through returned objects', async (context) => {
  const { registry, id } = await setup();
  context.after(() => registry.dispose());
  const original = registry.list();
  const originalEvents = registry.getEvents();
  const entities = registry.list();
  const first = entities[0]!;
  tryMutation(() => { first.name = 'Changed outside Pulse'; });
  tryMutation(() => { first.source.adapter = 'changed'; });
  tryMutation(() => { first.capabilities.length = 0; });
  tryMutation(() => { first.state.on = 'changed'; });
  tryMutation(() => { entities.length = 0; });
  const state = registry.getState(id('Living Light'));
  tryMutation(() => { state.on = 'changed'; });
  const capabilities = registry.getCapabilities(id('Living Light'));
  tryMutation(() => { capabilities.length = 0; });
  const events = registry.getEvents();
  const discovery = events[0]!;
  assert.equal(discovery.type, 'discovered');
  if (discovery.type === 'discovered') {
    tryMutation(() => { discovery.value.state.on = 'changed'; });
    tryMutation(() => { discovery.value.name = 'Changed in history'; });
  }
  tryMutation(() => { events.length = 0; });
  const replay = projectEvents(registry.getEvents());
  tryMutation(() => { replay[0]!.state.on = 'changed'; });
  assert.deepEqual(registry.list(), original);
  assert.deepEqual(registry.getEvents(), originalEvents);
});

test('incoming event objects and subscriber payloads cannot corrupt stored events', async (context) => {
  const adapter = new ReportingAdapter();
  const registry = new Registry([adapter]);
  context.after(() => registry.dispose());
  await registry.discover();
  registry.subscribe((event) => {
    if (event.type === 'stateChanged') {
      tryMutation(() => { event.value.on = false; });
    }
  });
  const received: PulseEvent[] = [];
  registry.subscribe((event) => received.push(event));
  const incoming = adapter.emit({ on: true });
  tryMutation(() => { incoming.value.on = false; });
  assert.equal(registry.getState(adapter.entity.id).on, true);
  const saved = registry.getEvents().at(-1)!;
  assert.equal(saved.type, 'stateChanged');
  assert.deepEqual(saved.value, { on: true });
  assert.deepEqual(received.at(-1)?.value, { on: true });
  assert.deepEqual(projectEvents(registry.getEvents()), registry.list());
});


test('events reported during discovery are applied after the discovery snapshot', async (context) => {
  class DiscoveringAdapter extends ReportingAdapter {
    override async discover() {
      const snapshot = await super.discover();
      this.emit({ on: true });
      return snapshot;
    }
  }
  const adapter = new DiscoveringAdapter();
  const registry = new Registry([adapter]);
  context.after(() => registry.dispose());
  await registry.discover();
  assert.equal(registry.getState(adapter.entity.id).on, true);
  assert.deepEqual(registry.getEvents().map((event) => event.type), ['discovered', 'stateChanged']);
  assert.deepEqual(projectEvents(registry.getEvents()), registry.list());
});

test('disposal from a discovery subscriber stops discovery and releases adapter subscriptions', async () => {
  const adapter = new ReportingAdapter();
  const registry = new Registry([adapter]);
  registry.subscribe(() => registry.dispose());
  await assert.rejects(registry.discover(), /disposed/i);
  assert.equal(adapter.listeners.size, 0);
  const events = registry.getEvents();
  adapter.emit({ on: true });
  assert.deepEqual(registry.getEvents(), events);
});

test('an invalid event during discovery leaves no partial history and permits a clean retry', async (context) => {
  class RetryingAdapter extends ReportingAdapter {
    firstAttempt = true;
    override async discover() {
      if (this.firstAttempt) {
        this.firstAttempt = false;
        for (const listener of this.listeners) {
          listener({ type: 'stateChanged', entityId: 'unknown', timestamp: Date.now(), value: { on: true } });
        }
      }
      return super.discover();
    }
  }
  const adapter = new RetryingAdapter();
  const registry = new Registry([adapter]);
  context.after(() => registry.dispose());
  await assert.rejects(registry.discover());
  assert.deepEqual(registry.getEvents(), []);
  assert.deepEqual(registry.list(), []);
  assert.equal(adapter.listeners.size, 0);
  await registry.discover();
  assert.equal(registry.list().length, 1);
  assert.equal(registry.getEvents().length, 1);
  assert.equal(adapter.listeners.size, 1);
  adapter.emit({ on: true });
  assert.equal(registry.getState(adapter.entity.id).on, true);
});


test('an action inside a discovery subscriber preserves notification and event-log order', async (context) => {
  const registry = new Registry([new MockAdapter()]);
  context.after(() => registry.dispose());
  const received: PulseEvent[] = [];
  let reentrantAction: Promise<void> | undefined;
  registry.subscribe((event) => {
    received.push(event);
    if (event.type === 'discovered' && !reentrantAction) {
      const kitchen = registry.list().find((entity) => entity.name === 'Kitchen Light');
      assert.ok(kitchen);
      reentrantAction = registry.execute(kitchen.id, { type: 'turnOn' });
    }
  });
  await registry.discover();
  assert.ok(reentrantAction);
  await reentrantAction;
  assert.deepEqual(received.map((event) => event.type), [
    'discovered', 'discovered', 'discovered', 'discovered', 'discovered', 'stateChanged',
  ]);
  assert.deepEqual(received, registry.getEvents());
  assert.deepEqual(projectEvents(received), registry.list());
});

test('later discoveries join the event projection without allowing duplicate identities or foreign owners', async () => {
  const adapter = new ReportingAdapter();
  const registry = new Registry([adapter]);
  await registry.discover();
  const entity = { ...structuredClone(adapter.entity), id: 'reporting:second', name: 'Second light' };
  const event: PulseEvent = { type: 'discovered', entityId: entity.id, timestamp: 100, value: entity };
  const listener = [...adapter.listeners][0]!;
  listener(event);
  assert.equal(registry.list().length, 2);
  assert.deepEqual(projectEvents(registry.getEvents()), registry.list());
  const before = registry.getEvents();
  assert.throws(() => listener(event), /Invalid discovery/);
  assert.throws(() => listener({ ...event, entityId: 'foreign', value: { ...entity, id: 'foreign', source: { adapter: 'other', local: true } } }), /Invalid adapter/);
  assert.deepEqual(registry.getEvents(), before);
  registry.dispose();
});
