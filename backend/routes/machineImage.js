const express = require("express");
const router = express.Router();

const ALLOWED_HOSTS = [
  "share.google",
  "photos.google.com",
  "drive.google.com",
  "docs.google.com",
  "lh3.googleusercontent.com",
  "googleusercontent.com"
];

const isAllowedHost = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const googleDriveDirectUrl = (url) => {
  const match = String(url.pathname || "").match(/\/file\/d\/([^/]+)/i);
  if (!match) return null;
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(match[1])}`;
};

const extractImageFromHtml = (html, baseUrl) => {
  const source = String(html || "");
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    try { return new URL(match[1], baseUrl).toString(); } catch { return null; }
  }
  return null;
};

const fetchImageResponse = async (targetUrl, depth = 0) => {
  if (depth > 2) throw new Error("Too many image redirects.");
  const url = new URL(targetUrl);
  if (!isAllowedHost(url.hostname)) throw new Error("Only supported Google image/share links can be resolved.");

  const driveUrl = googleDriveDirectUrl(url);
  const requestUrl = driveUrl || url.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(requestUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "PowerHouse-MachineImage/1.0", Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }
    });
    if (!response.ok) throw new Error(`Image source returned HTTP ${response.status}.`);
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (contentType.startsWith("image/")) return { response, contentType };

    const html = await response.text();
    const imageUrl = extractImageFromHtml(html, response.url || requestUrl);
    if (!imageUrl) throw new Error("The Google share page did not expose a direct image.");
    return fetchImageResponse(imageUrl, depth + 1);
  } finally {
    clearTimeout(timeout);
  }
};

router.get("/", async (req, res) => {
  const rawUrl = String(req.query.url || "").trim();
  if (!isHttpUrl(rawUrl)) return res.status(400).json({ success: false, message: "A valid image/share URL is required." });

  try {
    const url = new URL(rawUrl);
    if (!isAllowedHost(url.hostname)) return res.status(400).json({ success: false, message: "This image host is not supported. Use Google share/Drive/Photos links or a direct image URL." });
    const { response, contentType } = await fetchImageResponse(url.toString());
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("The image source returned an empty file.");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Machine image proxy error:", error?.message || error);
    return res.status(422).json({ success: false, message: error?.message || "Unable to resolve the machine image." });
  }
});

module.exports = router;
