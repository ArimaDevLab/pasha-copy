// パシャコピー service worker: offline shell + receiving screenshots from the share sheet.
const SHELL = "pasha-shell-v2";
const SHARED = "pasha-shared";
const ASSETS = [
  "./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "ocr/tesseract.min.js", "ocr/worker.min.js",
  "ocr/tesseract-core-simd-lstm.wasm.js", "ocr/tesseract-core-lstm.wasm.js", "ocr/jpn.b64.txt"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("pasha-shell-") && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll("images").filter(f => f && f.size);
  const cache = await caches.open(SHARED);
  for (const k of await cache.keys()) await cache.delete(k);
  await Promise.all(files.map((f, i) => cache.put("shared/" + i, new Response(f, {
    headers: {
      "content-type": f.type || "image/png",
      "x-name": encodeURIComponent(f.name || "shared-" + i + ".png"),
      "x-time": String(f.lastModified || Date.now())
    }
  }))));
  return Response.redirect("./?shared=1", 303);
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method === "POST" && url.pathname.endsWith("/share")) { e.respondWith(receiveShare(e.request)); return; }
  if (e.request.method !== "GET") return;
  const heavy = url.pathname.includes("/ocr/") || url.pathname.includes("/icons/");
  if (heavy) {
    // Large engine files never change within a version: serve from the device.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
  } else {
    // The page itself: newest when online, saved copy when offline.
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match("./"))));
  }
});
