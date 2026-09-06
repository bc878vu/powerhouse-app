const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 12;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"]);

function isGoogleHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "share.google" || host.endsWith(".share.google") || host === "photos.google.com" || host === "drive.google.com" || host === "docs.google.com" || host.endsWith(".googleusercontent.com") || host.endsWith(".gstatic.com");
}

function isUnsafeHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal");
}

function isFetchableUrl(value) {
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) && !isUnsafeHost(url.hostname);
  } catch { return false; }
}

function decodeHtml(value) {
  let text = String(value || "");
  text = text
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  return text;
}

function addCandidate(list, value) {
  const raw = String(value || "").trim();
  if (!raw) return;
  const variants = [raw, decodeHtml(raw)];
  for (const variant of variants) {
    let decoded = variant;
    for (let i = 0; i < 2; i += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch { break; }
    }
    decoded = decoded.replace(/^\s+|\s+$/g, "").replace(/[),.;]+$/g, "");
    if (isFetchableUrl(decoded) && !list.includes(decoded)) list.push(decoded);
  }
}

function extractImageFromQuery(value) {
  try {
    const url = new URL(String(value));
    const keys = ["imgurl", "img_url", "image_url", "image", "mediaurl", "media_url", "src", "source", "url", "u"];
    for (const key of keys) {
      const candidate = url.searchParams.get(key);
      if (candidate && isFetchableUrl(candidate)) return candidate;
    }
  } catch {}
  return "";
}

function googleLandingCandidates(startUrl) {
  const candidates = [];
  try {
    const source = new URL(startUrl);
    const host = source.hostname.toLowerCase();
    if (host === "share.google" || host.endsWith(".share.google")) {
      const token = source.pathname.replace(/^\/+/, "");
      if (token) {
        addCandidate(candidates, `https://www.google.com/share.google?q=${encodeURIComponent(token)}`);
        addCandidate(candidates, `https://www.google.com/share.google?q=${encodeURIComponent(token.split("/")[0])}`);
      }
    }
  } catch {}
  return candidates;
}

function extractImageCandidates(text) {
  const source = decodeHtml(text);
  const candidates = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/gi,
    /["'](?:image|imageUrl|image_url|imgurl|thumbnailUrl|thumbnail_url|contentUrl|content_url)["']\s*[:=]\s*["']([^"']+)["']/gi,
    /(?:[?&]imgurl=|["']imgurl["']\s*[:=]\s*["'])(https?(?:%3A|:)[^&"'<>\\\s]+)/gi,
    /https?:\/\/www\.google\.[^\s"'<>\\]+\/imgres\?[^\s"'<>\\]+/gi,
    /\[!?[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi,
    /(https?:\/\/[^\s"'<>\\]+\.(?:jpe?g|png|webp|gif|avif|bmp)(?:\?[^\s"'<>\\]*)?)/gi,
    /(https?:\/\/(?:lh[35]\.googleusercontent\.com|encrypted-tbn[^/]*\.gstatic\.com)\/[^\s"'<>\\]+)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const value = match[1] || match[0];
      const imgresTarget = extractImageFromQuery(value);
      if (imgresTarget) addCandidate(candidates, imgresTarget);
      else addCandidate(candidates, value);
    }
  }

  // Reader can return JSON/Markdown containing image URLs without a file extension.
  // Keep absolute URLs as lower-priority candidates; the resolver verifies them.
  const absoluteUrls = source.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];
  for (const url of absoluteUrls) {
    const imgresTarget = extractImageFromQuery(url);
    if (imgresTarget) addCandidate(candidates, imgresTarget);
    else addCandidate(candidates, url);
  }
  return [...new Set(candidates)];
}

function extractRedirectTarget(location, current) {
  if (!location) return "";
  try {
    const absolute = new URL(location, current);
    return extractImageFromQuery(absolute.toString()) || absolute.toString();
  } catch { return ""; }
}

async function readLimitedText(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_HTML_BYTES) throw new Error("Remote page is too large");
  const text = await response.text();
  return text.slice(0, MAX_HTML_BYTES);
}

async function fetchResolvedImage(startUrl, state = { seen: new Set(), depth: 0 }) {
  if (!isFetchableUrl(startUrl) || state.depth > MAX_REDIRECTS) return null;
  const current = String(startUrl);
  if (state.seen.has(current)) return null;
  state.seen.add(current);

  const queryImage = extractImageFromQuery(current);
  if (queryImage && queryImage !== current) return fetchResolvedImage(queryImage, { ...state, depth: state.depth + 1 });

  let response;
  try {
    response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });
  } catch { return null; }

  if (response.status >= 300 && response.status < 400) {
    const target = extractRedirectTarget(response.headers.get("location"), current);
    if (target && target !== current) return fetchResolvedImage(target, { ...state, depth: state.depth + 1 });
    return null;
  }

  const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (response.ok && ALLOWED_IMAGE_TYPES.has(contentType)) return { response, contentType };
  if (!response.ok || !contentType.includes("text/html")) return null;

  let html;
  try { html = await readLimitedText(response); } catch { return null; }
  const candidates = extractImageCandidates(html);
  for (const candidate of candidates.slice(0, 25)) {
    const resolved = await fetchResolvedImage(candidate, { seen: new Set(state.seen), depth: state.depth + 1 });
    if (resolved) return resolved;
  }
  return null;
}

async function fetchViaReader(startUrl) {
  try {
    const readerUrl = `https://r.jina.ai/${startUrl}`;
    const response = await fetch(readerUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PowerHouseImageProxy/6.0)",
        "Accept": "text/plain,text/markdown,application/json,*/*;q=0.8",
        "X-Engine": "browser",
        "X-With-Images-Summary": "true",
        "X-Retain-Images": "true",
        "X-Base": "true",
        "X-Timeout": "30",
        "X-No-Cache": "true"
      }
    });
    if (!response.ok) return null;
    const raw = await response.text();
    let text = raw;
    try {
      const parsed = JSON.parse(raw);
      const chunks = [];
      const collect = value => {
        if (typeof value === "string") chunks.push(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === "object") Object.values(value).forEach(collect);
      };
      collect(parsed);
      text = chunks.join("\n");
    } catch {}
    const candidates = extractImageCandidates(text);
    for (const candidate of candidates.slice(0, 40)) {
      const resolved = await fetchResolvedImage(candidate);
      if (resolved) return resolved;
    }
  } catch {}
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
    if (!/^https?:$/.test(source.protocol) || isUnsafeHost(source.hostname)) return res.status(400).json({ error: "Unsupported image host" });

    if (source.hostname.toLowerCase() === "drive.google.com") {
      const id = driveId(source.toString());
      if (id) {
        try {
          const direct = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; PowerHouseImageProxy/6.0)" } });
          const type = String(direct.headers.get("content-type") || "").split(";")[0].toLowerCase();
          if (direct.ok && ALLOWED_IMAGE_TYPES.has(type)) return sendImage(res, direct, type);
        } catch {}
      }
    }

    const candidates = [source.toString(), ...googleLandingCandidates(source.toString())];
    for (const candidate of [...new Set(candidates)]) {
      const resolved = await fetchResolvedImage(candidate);
      if (resolved) return sendImage(res, resolved.response, resolved.contentType);
    }

    if (isGoogleHost(source.hostname)) {
      for (const candidate of [source.toString(), ...googleLandingCandidates(source.toString())]) {
        const resolved = await fetchViaReader(candidate);
        if (resolved) return sendImage(res, resolved.response, resolved.contentType);
      }
    }

    return res.status(404).json({ error: "Image could not be resolved. Upload the image directly to Firebase Storage if Google does not expose a public image target for this share link." });
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
