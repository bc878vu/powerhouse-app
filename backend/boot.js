// Simple production entrypoint.
// The task compatibility router is mounted directly in server.js,
// so the backend no longer depends on NODE_OPTIONS or Express monkey-patching.
require("./server.js");
