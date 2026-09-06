const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp"
]);

function isAllowedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "share.google" || host.endsWith(".share.google") || host === "photos.google.com" || host === "drive.google.com" || host === "docs.google.com" || host === "lh3.googleusercontent.com" || host === "lh5.googleusercontent.com" || host === "googleusercontent.com" || host.endsWith(".googleusercontent.com");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractMetaImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function driveId(value) {
  const url = new URL(value);
  const byPath = url.pathname.match(/\/file\/d\/([^/]+)/i);
  if (byPath?.[1]) return byPath[1];
  return url.searchParams.get("id") || "";
}

async function fetchFollowedImage(startUrl) {
  let current = startUrl;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(current, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PowerHouseImageProxy/1.0)",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (ALLOWED_IMAGE_TYPES.has(contentType)) return response;
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    const imageUrl = extractMetaImage(html);
    if (!imageUrl) return null;
    const absolute = new URL(imageUrl, current).toString();
    if (!isAllowedHost(new URL(absolute).hostname)) return null;
    current = absolute;
  }
  return null;
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
    if (!/^https?:$/.test(source.protocol) || !isAllowedHost(source.hostname)) {
      return res.status(400).json({ error: "Unsupported image host" });
    }

    // Public Google Drive files can be fetched directly when an ID is available.
    if (source.hostname === "drive.google.com") {
      const id = driveId(source.toString());
      if (id) {
        const direct = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PowerHouseImageProxy/1.0)" }
        });
        const type = String(direct.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (direct.ok && ALLOWED_IMAGE_TYPES.has(type)) return sendImage(res, direct, type);
      }
    }

    const response = await fetchFollowedImage(source.toString());
    if (!response || !response.ok) return res.status(404).json({ error: "Image could not be resolved. Make sure the Google image is publicly viewable." });
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    return sendImage(res, response, contentType);
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
