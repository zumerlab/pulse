import {
  Crypto, Entropy, Environment, Filesystem, MockStorageService, Network, NetworkSimulator,
  ServerNode, StorageService, VendorId,
} from '@matter/main';
import { OnOffLightDevice } from '@matter/main/devices/on-off-light';
import { FileStorageDriver, FlatFileBlobStorageDriver, NodeJsCrypto, NodeJsFilesystem } from '@matter/nodejs';

/** Real Matter messages and crypto over an in-process network; never joins the household LAN. */
export function simulatorEnvironment(network: NetworkSimulator, hostId: number, storagePath?: string): Environment {
  const environment = new Environment(`pulse-simulator-${hostId}`);
  const crypto = new NodeJsCrypto();
  environment.set(Crypto, crypto);
  environment.set(Entropy, crypto);
  environment.set(Network, network.addHost(hostId));
  environment.vars.set('mdns.networkInterface', 'fake0');
  if (storagePath) {
    environment.set(Filesystem, new NodeJsFilesystem(storagePath));
    const storage = new StorageService(environment);
    storage.registerDriver(FileStorageDriver);
    storage.registerBlobDriver(FlatFileBlobStorageDriver);
    storage.defaultDriver = FileStorageDriver.id;
    storage.defaultBlobDriver = FlatFileBlobStorageDriver.id;
    environment.set(StorageService, storage);
  } else {
    environment.set(StorageService, new MockStorageService(environment));
  }
  return environment;
}

export async function createMatterSimulator() {
  const network = new NetworkSimulator();
  const environment = simulatorEnvironment(network, 1);
  const node = await ServerNode.create({
    id: 'pulse-test-light', environment,
    network: { port: 5540, ble: false },
    commissioning: { passcode: 20202021, discriminator: 3840 },
    basicInformation: {
      vendorId: VendorId(0xfff1), vendorName: 'Pulse simulator', productId: 0x8000,
      productName: 'Test light', nodeLabel: 'Matter test light', hardwareVersion: 1, softwareVersion: 1,
    },
  });
  const light = await node.add(OnOffLightDevice, { id: 'light', onOff: { onOff: false } });
  await node.start();
  return {
    network, node, light,
    target: { addresses: ['abcd::1'], port: 5540, discriminator: 3840 },
    code: node.state.commissioning.pairingCodes.manualPairingCode,
    async close() {
      await node.close();
      await environment.close(Network);
      environment[Symbol.dispose]();
    },
  };
}
