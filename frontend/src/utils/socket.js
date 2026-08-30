// Realtime transport is optional in this frontend. The dashboard and notifications
// already have their own API refresh/fallback paths, so expose a stable no-op socket
// instead of importing a browser socket client that can throw during startup when no
// realtime endpoint is configured on the production deployment.
const createNoopSocket = () => ({
  id: undefined,
  connected: false,
  on: () => undefined,
  once: () => undefined,
  off: () => undefined,
  emit: () => undefined,
  connect: () => undefined,
  disconnect: () => undefined,
  removeAllListeners: () => undefined,
});

export const socket = createNoopSocket();
export default socket;
