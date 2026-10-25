import { chmod, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { currentNetwork } from '../adapters/lan/network.ts';
import { MatterService } from './matter-service.ts';
import { createMatterMiddleware } from './matter.ts';
import { createDiscoveryMiddleware } from './discovery.ts';
import { MediaService } from './media-service.ts';
import { createMediaMiddleware } from './media.ts';

export function createLocalServices(root: string) {
  const discovery = createDiscoveryMiddleware();
  const service = new MatterService(async () => {
    const storagePath = resolve(root, '.pulse', 'matter');
    await mkdir(storagePath, { recursive: true, mode: 0o700 });
    await chmod(resolve(root, '.pulse'), 0o700);
    await chmod(storagePath, 0o700);
    const network = await currentNetwork();
    const { NativeMatterDriver } = await import('../adapters/matter/driver.ts');
    return new NativeMatterDriver({ storagePath, interfaceName: network.name });
  });
  const matter = createMatterMiddleware(service, discovery.snapshot);
  const mediaService = new MediaService(resolve(root, '.pulse', 'media.json'));
  const media = createMediaMiddleware(mediaService, discovery.snapshot);
  return { discovery, matter, media, close: async () => {
    matter.close(); media.close();
    await Promise.all([service.close(), mediaService.close()]);
  } };
}
