const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"]);

function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase(); } catch { return ""; }
}

function isGoogleHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "share.google" || host.endsWith(".share.google") || host === "photos.google.com" || host === "drive.google.com" || host === "docs.google.com" || host.endsWith(".googleusercontent.com");
}

function isUnsafeHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local");
}

function isFetchableUrl(value) {
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) && !isUnsafeHost(url.hostname);
  } catch { return false; }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/\\u003d/gi, "=").replace(/\\u0026/gi, "&").replace(/\\u002f/gi, "/")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function extractImageCandidates(html) {
  const text = decodeHtml(html);
  const candidates = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    /["'](?:image|imageUrl|image_url|imgurl|thumbnailUrl|thumbnail_url)["']\s*:\s*["'](https?:\\/\\/[^"']+)["']/gi,
    /(https?:\\/\\/[^\s"'<>\\]+\.(?:jpe?g|png|webp|gif|avif|bmp)(?:\?[^\s"'<>\\]*)?)/gi,
    /(https?:\\/\\/(?:lh[35]\.googleusercontent\.com|encrypted-tbn[^/]*\.gstatic\.com)\\/[^\s"'<>\\]+)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = String(match[1] || "").replace(/\\\//g, "/");
      if (value && !candidates.includes(value)) candidates.push(value);
    }
  }
  return candidates;
}

function extractRedirectTarget(location, current) {
  if (!location) return "";
  try {
    const absolute = new URL(location, current);
    const keys = ["url", "q", "imgurl", "image", "image_url", "img_url", "mediaurl", "u"];
    for (const key of keys) {
      const value = absolute.searchParams.get(key);
      if (value && isFetchableUrl(value)) return value;
    }
    return absolute.toString();
  } catch { return ""; }
}

async function fetchResolvedImage(startUrl) {
  let current = startUrl;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!isFetchableUrl(current)) return null;
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PowerHouseImageProxy/2.0)",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const target = extractRedirectTarget(response.headers.get("location"), current);
      if (!target || target === current) return null;
      current = target;
      continue;
    }

    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (response.ok && ALLOWED_IMAGE_TYPES.has(contentType)) return { response, contentType };
    if (!response.ok || !contentType.includes("text/html")) return null;

    const html = await response.text();
    const candidates = extractImageCandidates(html);
    let next = "";
    for (const candidate of candidates) {
      try {
        const absolute = new URL(candidate, current).toString();
        if (isFetchableUrl(absolute)) { next = absolute; break; }
      } catch {}
    }
    if (!next) return null;
    current = next;
  }
  return null;
}

function driveId(value) {
  const url = new URL(value);
  const byPath = url.pathname.match(/\/file\/d\/([^/]+)/i);
  return byPath?.[1] || url.searchParams.get("id") || "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const raw = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    if (!raw) return res.status(400).json({ error: "Missing image URL" });
    const source = new URL(String(raw));
    if (!/^https?:$/.test(source.protocol) || (!isGoogleHost(source.hostname) && !isFetchableUrl(source.toString()))) {
      return res.status(400).json({ error: "Unsupported image host" });
    }

    if (source.hostname === "drive.google.com") {
      const id = driveId(source.toString());
      if (id) {
        const direct = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; PowerHouseImageProxy/2.0)" } });
        const type = String(direct.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (direct.ok && ALLOWED_IMAGE_TYPES.has(type)) return sendImage(res, direct, type);
      }
    }

    const resolved = await fetchResolvedImage(source.toString());
    if (!resolved) return res.status(404).json({ error: "Image could not be resolved. Make sure the shared image is publicly viewable." });
    return sendImage(res, resolved.response, resolved.contentType);
  } catch (error) {
    return res.status(502).json({ error: "Unable to resolve image URL", detail: error?.message || "Unknown error" });
  }
}

async function sendImage(res, response, contentType) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Image is larger than 12 MB" });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Image is larger than 12 MB" });
  res.setHeader("Content-Type", ALLOWED_IMAGE_TYPES.has(contentType) ? contentType : "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(buffer);
}
