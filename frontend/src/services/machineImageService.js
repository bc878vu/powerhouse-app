const API_URL = String(import.meta.env.VITE_API_URL || "http://localhost:5000/api").trim().replace(/\/+$/, "");

const GOOGLE_SHARE_HOSTS = new Set([
  "share.google",
  "photos.google.com",
  "drive.google.com",
  "docs.google.com",
  "lh3.googleusercontent.com",
  "lh5.googleusercontent.com"
]);

const getUrl = (value) => {
  try { return new URL(String(value || "").trim()); } catch { return null; }
};

const isGoogleShareUrl = (value) => {
  const url = getUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return [...GOOGLE_SHARE_HOSTS].some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) || host.endsWith(".googleusercontent.com");
};

export const getMachineImageUrl = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (!isGoogleShareUrl(clean)) return clean;

  // Production uses the Vercel serverless proxy, so machine images do not depend
  // on the Railway API being online. Local development keeps the existing API path.
  if (typeof window !== "undefined" && window.location?.hostname && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return `${window.location.origin}/api/machine-image?url=${encodeURIComponent(clean)}`;
  }
  return `${API_URL}/machine-image?url=${encodeURIComponent(clean)}`;
};

export const isMachineImageShareUrl = isGoogleShareUrl;
