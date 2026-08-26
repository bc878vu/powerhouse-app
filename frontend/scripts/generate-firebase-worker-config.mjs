import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const values = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.VITE_FIREBASE_APP_ID || ""
};

if (!values.apiKey || !values.projectId || !values.appId || !values.messagingSenderId) {
  console.warn("Firebase worker config is incomplete; the main app will report the missing VITE_FIREBASE_* values.");
}

const publicDir = resolve(process.cwd(), "public");
await mkdir(publicDir, { recursive: true });

const workerOutput = `self.POWERHOUSE_FIREBASE_CONFIG = ${JSON.stringify(values)};\n`;
await writeFile(resolve(publicDir, "firebase-config.js"), workerOutput, "utf8");

const manifest = {
  id: "/",
  name: "PowerHouse Management Portal",
  short_name: "PowerHouse",
  description: "PowerHouse management, fuel, machines, panels, staff and task monitoring portal.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  display_override: ["window-controls-overlay", "standalone"],
  orientation: "any",
  background_color: "#020617",
  theme_color: "#eab308",
  prefer_related_applications: false,
  launch_handler: { client_mode: "navigate-existing" },
  gcm_sender_id: values.messagingSenderId,
  gcm_user_visible_only: true,
  icons: [
    { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
    { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
  ],
  shortcuts: [
    { name: "My Tasks", short_name: "My Tasks", url: "/my-tasks", icons: [{ src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }] },
    { name: "Notifications", short_name: "Notifications", url: "/notifications", icons: [{ src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }] }
  ]
};
await writeFile(resolve(publicDir, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("Generated Firebase worker config and full PWA manifest from VITE_FIREBASE_* deployment variables.");
