# Pulse drones

A swarm of drones as Pulse objects: ArduPilot vehicles, the simulator's or
the real ones, through [mavlink2rest](https://github.com/mavlink/mavlink2rest),
which serves the MAVLink stream as JSON over WebSocket and takes commands
over HTTP. Each vehicle on the stream is one drone by its system id.

A swarm is read two ways:

| Axis | Objects | Channels |
|---|---|---|
| Systems (the swarm by dimension) | Swarm, Power, Link, Flight | Around home (a radar in the face: a dot per drone at its bearing and range), modes; batteries (a tick per drone), voltage; heard from, GPS; altitude, speed |
| Groups (one object per drone, the types as the gear's groups) | Copter 1, … | Mode (a choice ring that sets it: loiter, guided, auto, return, land), armed (a switch; armed on the ground offers a takeoff), from home (a radar of itself), altitude, speed with the heading as a bearing, battery, link, GPS |

The radar is the core's `plots`: things around a point, in the face behind
the text, with range rings. The rim is 300 m from home.

Alerts and their actions: a drone under 20% battery calls softly, under 10%
loudly, and the action is **Bring it home** (RTL) when it is flying; on the
swarm, **Bring them home** sends every low one back at once. A drone not
heard from for ten seconds calls loudly. A drone without a 3D fix calls
softly on the ground and loudly in the air, where the action is **Land it**.
A drone past the radar's rim calls and is brought home. Armed on the ground
offers **Take off to 30 m**.

Commands are COMMAND_LONG from system 255: `MAV_CMD_COMPONENT_ARM_DISARM`,
`MAV_CMD_NAV_TAKEOFF`, `MAV_CMD_DO_SET_MODE` with ArduCopter's mode numbers.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:drones
```

Open [the app](http://127.0.0.1:5181). The connect panel asks where
mavlink2rest answers (`http://127.0.0.1:8088` by default). To explore
without a simulator, open [the recorded swarm](http://127.0.0.1:5181/?demo):
six copters on a survey around home, one running out of battery, one with a
poor fix, one armed on the ground.

## A simulated swarm

With ArduPilot's SITL and mavlink2rest installed:

```sh
sim_vehicle.py -v ArduCopter --count 4 --auto-sysid --out udp:127.0.0.1:14550
mavlink2rest --connect udpin:127.0.0.1:14550 --server 127.0.0.1:8088
```

Four copters with system ids 1 to 4 share one MAVLink stream; mavlink2rest
serves it at `/ws/mavlink` (filtered to the messages the readings use) and
takes commands at `POST /mavlink`. A real swarm goes through the same tool
on a companion computer, with the vehicles' telemetry radios as its inputs.

## Options

| Parameter | What it does |
|---|---|
| `?server=http://host:8088` | Where mavlink2rest answers |
| `?axis=groups` | Open on the drones, one object each |
| `?systems=swarm,power&mode=orbit&start=swarm` | What the page shows; the gear chooses within it |
| `?demo` | The recorded swarm instead of a simulator |

## What is read

`HEARTBEAT` (mode, armed, flying), `GLOBAL_POSITION_INT` (position,
altitude above home, heading), `VFR_HUD` (speed, climb), `SYS_STATUS` and
`BATTERY_STATUS` (battery share and volts), `GPS_RAW_INT` (fix, satellites),
`HOME_POSITION`, `STATUSTEXT`. Changes reach the board twice a second.
