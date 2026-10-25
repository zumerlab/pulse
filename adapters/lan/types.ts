export interface NetworkInfo {
  name: string;
  address: string;
  netmask: string;
  ipv6?: Array<{ address: string; prefixLength: number; scopeId?: number }>;
}

/** Advertised services, not a controllable Pulse entity or proof of liveness. */
export interface DiscoveredDevice {
  id: string;
  name: string;
  host?: string;
  addresses: string[];
  protocols: string[];
  services: string[];
  model?: string;
  /** Description advertised by a renderer on this scan's network; not yet verified capabilities. */
  upnp?: { descriptionUrl: string; deviceType: string };
  matter?: {
    commissioning?: 'open' | 'closed' | 'unknown';
    operational?: true;
    commissioner?: true;
    pairing?: { port: number; discriminator?: number };
  };
  lastSeen: number;
}

export interface DiscoveryResult {
  status: 'idle' | 'scanning' | 'complete' | 'error';
  network?: NetworkInfo;
  startedAt?: number;
  completedAt?: number;
  devices: DiscoveredDevice[];
  warnings: string[];
  error?: string;
}
