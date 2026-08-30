// Realtime transport is optional in this frontend. The dashboard and notifications
// already have their own API refresh/fallback paths, so expose a complete stable
// no-op socket interface instead of importing a browser socket client that can
// throw during startup when no realtime endpoint is configured on production.
const noop = () => undefined;

const createNoopSocket = () => ({
  id: undefined,
  connected: false,
  on: noop,
  once: noop,
  off: noop,
  emit: noop,
  onAny: noop,
  offAny: noop,
  prependAny: noop,
  prependAnyOutgoing: noop,
  offAnyOutgoing: noop,
  onAnyOutgoing: noop,
  connect: noop,
  disconnect: noop,
  close: noop,
  removeAllListeners: noop,
  listeners: () => [],
  hasListeners: () => false,
});

export const socket = createNoopSocket();
export default socket;
