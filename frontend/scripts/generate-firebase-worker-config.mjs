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

if (!values.apiKey || !values.projectId || !values.appId) {
  console.warn("Firebase worker config is incomplete; the main app will report the missing VITE_FIREBASE_* values.");
}

const publicDir = resolve(process.cwd(), "public");
await mkdir(publicDir, { recursive: true });

const output = `self.POWERHOUSE_FIREBASE_CONFIG = ${JSON.stringify(values)};\n`;
await writeFile(resolve(publicDir, "firebase-config.js"), output, "utf8");
console.log("Generated public/firebase-config.js from VITE_FIREBASE_* deployment variables.");
