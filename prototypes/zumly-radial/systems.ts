export type Channel = {
  name: string;
  glyph: string;
  type: 'p' | 's';
  segs?: number;
  level: 1 | 2;
  // Controles directos desde el objeto. dial: el anillo de adelante se
  // arrastra y fija un valor de min a max. toggles: un nombre por segmento,
  // cada uno se prende o se apaga con un toque.
  dial?: { min: number; max: number; step: number; unit: string; label: string };
  toggles?: string[];
  ok: { v?: number; on?: number; big: string; label: string };
  al: { v?: number; on?: number; seg?: number; big: string; label: string; why: string; verb: string };
};

export type PulseSystem = { title: string; front: string[]; ch: Record<string, Channel> };

const shield = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4';
const drop = 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z';
const bulb = 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z';
const cam = 'M4 7h11v10H4z M15 10l5-3v10l-5-3';
const bolt = 'M13 3L5 14h6l-1 7 8-11h-6z';
const heart = 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z';
const disk = 'M4 6h16v5H4z M4 13h16v5H4z M7 8.5h.01 M7 15.5h.01';
const paw = 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M16 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M12 20c-3 0-5-2-5-4s2-4 5-4 5 2 5 4-2 4-5 4z';

export const systems: Record<string, PulseSystem> = {
  casa: {
    title: 'Casa', front: ['clima', 'luces', 'sec', 'cam'],
    ch: {
      clima: { name: 'Clima', glyph: drop, type: 'p', level: 1,
        dial: { min: 16, max: 30, step: 0.5, unit: '°', label: 'objetivo' },
        ok: { v: 0.5, big: '21,5°', label: 'objetivo 23°' },
        al: { v: 0.95, big: '28°', label: 'rinde 30% menos', why: 'El filtro del aire está sucio', verb: 'Pedir filtro' } },
      luces: { name: 'Luces', glyph: bulb, type: 's', segs: 5, level: 1,
        toggles: ['Living', 'Cocina', 'Dormitorio', 'Baño', 'Patio'],
        ok: { on: 2, big: '2 de 5', label: 'living y cocina' },
        al: { on: 5, seg: 4, big: 'Patio', label: 'encendida de día', why: 'Quedó prendida desde anoche', verb: 'Apagar' } },
      sec: { name: 'Seguridad', glyph: shield, type: 's', segs: 6, level: 2,
        ok: { on: 6, big: 'Cerrada', label: '6 de 6 aberturas' },
        al: { on: 6, seg: 3, big: 'Abierta', label: 'ventana del baño', why: 'Se abrió con la alarma armada', verb: 'Ya la cerré' } },
      cam: { name: 'Cámaras', glyph: cam, type: 's', segs: 3, level: 2,
        ok: { on: 3, big: 'Sin movimiento', label: '3 cámaras' },
        al: { on: 3, seg: 1, big: 'Movimiento', label: 'patio', why: 'Alguien en el patio', verb: 'Ver cámara' } },
    },
  },
  auto: {
    title: 'Auto', front: ['bat', 'cubiertas'],
    ch: {
      bat: { name: 'Batería', glyph: bolt, type: 'p', level: 1,
        ok: { v: 0.74, big: '74%', label: '310 km' },
        al: { v: 0.12, big: '12%', label: '45 km', why: 'Carga baja para el viaje de mañana', verb: 'Programar carga' } },
      cubiertas: { name: 'Cubiertas', glyph: disk, type: 's', segs: 4, level: 2,
        ok: { on: 4, big: '32 psi', label: '4 de 4' },
        al: { on: 4, seg: 2, big: '21 psi', label: 'trasera izquierda', why: 'Pierde presión', verb: 'Buscar gomería' } },
    },
  },
  mascota: {
    title: 'Mascota', front: ['comida', 'paseo'],
    ch: {
      comida: { name: 'Comida', glyph: paw, type: 'p', level: 1,
        ok: { v: 0.6, big: '60%', label: 'dispensador' },
        al: { v: 0.08, big: '8%', label: 'queda 1 ración', why: 'El dispensador está casi vacío', verb: 'Recargar' } },
      paseo: { name: 'Paseo', glyph: paw, type: 's', segs: 3, level: 1,
        ok: { on: 2, big: '2 de 3', label: 'hoy' },
        al: { on: 1, seg: 1, big: '1 de 3', label: 'hoy', why: 'Faltan paseos', verb: 'Agendar' } },
    },
  },
  salud: {
    title: 'Salud', front: ['pulso', 'sueno'],
    ch: {
      pulso: { name: 'Pulso', glyph: heart, type: 'p', level: 2,
        ok: { v: 0.5, big: '68', label: 'en reposo' },
        al: { v: 0.9, big: '118', label: 'en reposo', why: 'Pulso alto sin actividad', verb: 'Registrar' } },
      sueno: { name: 'Sueño', glyph: heart, type: 'p', level: 1,
        ok: { v: 0.88, big: '7 h', label: 'anoche' },
        al: { v: 0.5, big: '4 h', label: 'anoche', why: 'Dormiste poco', verb: 'Recordatorio' } },
    },
  },
  servidor: {
    title: 'Servidor', front: ['nodos', 'disco', 'red'],
    ch: {
      nodos: { name: 'Nodos', glyph: disk, type: 's', segs: 4, level: 2,
        ok: { on: 4, big: '4 de 4', label: 'en línea' },
        al: { on: 4, seg: 3, big: '3 de 4', label: 'nodo-3 caído', why: 'nodo-3 no responde', verb: 'Reiniciar' } },
      disco: { name: 'Disco', glyph: disk, type: 'p', level: 1,
        ok: { v: 0.41, big: '41%', label: 'usado' },
        al: { v: 0.93, big: '93%', label: 'usado', why: 'Los logs crecen rápido', verb: 'Rotar logs' } },
      red: { name: 'Red', glyph: bolt, type: 'p', level: 1,
        ok: { v: 0.3, big: '120 Mb/s', label: 'salida' },
        al: { v: 0.97, big: '960 Mb/s', label: 'salida', why: 'Tráfico inusual', verb: 'Ver conexiones' } },
    },
  },
};
