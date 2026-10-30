// The little of Home Assistant's `hass` object a card needs, typed here so the
// card does not depend on the frontend's own types.
import type { Connection, HassEntities, HassServiceTarget } from 'home-assistant-js-websocket';

export type HomeAssistant = {
  states: HassEntities;
  connected: boolean;
  connection: Connection;
  config: { version: string; unit_system: { temperature: string } };
  callService(domain: string, service: string, data?: Record<string, unknown>, target?: HassServiceTarget): Promise<unknown>;
  hassUrl(path?: string): string;
};

export type CardConfig = { type: string };

// A form the dashboard editor renders for the card: the subset of HA's
// `LovelaceConfigForm` / `HaFormSchema` the card uses.
export type FormSchema =
  | { name: string; required?: boolean; default?: unknown; selector: Selector }
  | { name: string; type: 'grid'; schema: FormSchema[] };
export type Selector =
  | { select: { multiple?: boolean; mode?: 'list' | 'dropdown' | 'box'; options: { value: string; label: string }[] } }
  | { boolean: Record<string, never> };
export type ConfigForm = {
  schema: FormSchema[];
  assertConfig?(config: CardConfig): void;
  computeLabel?(schema: FormSchema): string | undefined;
  computeHelper?(schema: FormSchema): string | undefined;
};

export type LovelaceCard = HTMLElement & {
  hass?: HomeAssistant;
  setConfig(config: CardConfig): void;
  getCardSize?(): number | Promise<number>;
  getGridOptions?(): { columns?: number | 'full'; rows?: number | 'auto'; min_columns?: number; min_rows?: number };
};

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean; documentationURL?: string }[];
    customStrategies?: { type: string; strategyType: 'dashboard' | 'view' | 'section'; name: string; description: string; documentationURL?: string }[];
  }
}
