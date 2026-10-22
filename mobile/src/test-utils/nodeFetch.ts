import vm from 'node:vm';

/**
 * jest-expo replaces the fetch globals with Expo's native-backed stubs, which
 * cannot be driven by msw. Import this module first in a node-environment test
 * to restore Node's own fetch, Request, Response and Headers.
 */
const nodeGlobal = vm.runInThisContext('globalThis') as Record<string, unknown>;

for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData']) {
  Object.defineProperty(globalThis, name, {
    value: nodeGlobal[name],
    configurable: true,
    writable: true,
  });
}
