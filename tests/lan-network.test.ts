import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalIPv6, isOnNetwork, isOwnAddress, scopedIPv6Address } from '../adapters/lan/network.ts';

const network = {
  name: 'en0', address: '192.168.1.10', netmask: '255.255.255.0',
  ipv6: [
    { address: 'fe80::10', prefixLength: 64, scopeId: 12 },
    { address: '2001:db8:1234:5678::10', prefixLength: 64 },
  ],
};

test('canonical IPv6 rejects scopes and special addresses while normalizing equivalent forms', () => {
  assert.equal(canonicalIPv6('FE80:0000:0:0:0:0:0:0020'), 'fe80::20');
  for (const value of ['::', '::1', 'ff02::fb', '::ffff:192.168.1.20', 'fe80::20%en0', 'invalid']) {
    assert.equal(canonicalIPv6(value), undefined, value);
  }
  assert.equal(isOwnAddress('2001:0DB8:1234:5678:0:0:0:10', network), true);
});

test('IPv6 scope does not authorize addresses outside the selected prefix', () => {
  assert.equal(isOnNetwork('2001:db8:1234:5678::20', network), true);
  assert.equal(isOnNetwork('2001:db8:1234:5679::20%en0', network), false);
  assert.equal(isOnNetwork('2001:db8:1234:5678::20%en1', network), false);
  assert.equal(isOnNetwork('fe80::20%en0', network), true);
  assert.equal(isOnNetwork('fe80::20', network), false);
  assert.equal(isOnNetwork('fe80::20%en0', { ...network, ipv6: [] }), false);
});

test('AAAA link-local targets receive only the selected interface scope', () => {
  assert.equal(scopedIPv6Address('fe80:0:0:0:0:0:0:20', network), 'fe80::20%en0');
  assert.equal(scopedIPv6Address('2001:db8:1234:5678::20', network), '2001:db8:1234:5678::20');
  assert.equal(scopedIPv6Address('fe80::20%en1', network), undefined);
  assert.equal(scopedIPv6Address('2001:db8:1234:5679::20', network), undefined);
});

test('IPv4 subnet boundaries remain enforced alongside IPv6 discovery', () => {
  assert.equal(isOnNetwork('192.168.1.20', network), true);
  for (const value of ['192.168.1.0', '192.168.1.255', '192.168.2.20', '192.168.1.020']) {
    assert.equal(isOnNetwork(value, network), false, value);
  }
});
