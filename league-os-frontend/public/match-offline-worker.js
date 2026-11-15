/* Offline shell for an already opened match protocol. Never caches API,
   authorization headers, uploads, or private server responses. */
const CACHE = "league-match-shell-v1";
const assets = (url) =>
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/uploads/") &&
    /\.(?:js|css|woff2?|ttf)$/.test(url.pathname);
self.addEventListener("install", (event) =>
    event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
    event.waitUntil(self.clients.claim()),
);
self.addEventListener("message", (event) => {
    if (event.data?.type !== "CACHE_MATCH_SHELL") return;
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE);
            const shell = await fetch("/", {
                cache: "no-store",
                credentials: "omit",
            });
            if (!shell.ok || !shell.headers.get("content-type")?.includes("text/html"))
                throw new Error("Offline page shell unavailable");
            await cache.put("/__match_shell__", shell);
            await Promise.all(
                (event.data.urls ?? []).slice(0, 250).map(async (value) => {
                    const url = new URL(value, self.location.origin);
                    if (!assets(url)) return;
                    const response = await fetch(url.href, {
                        credentials: "omit",
                    });
                    if (!response.ok)
                        throw new Error("Required asset unavailable");
                    await cache.put(url.href, response);
                }),
            );
            event.source?.postMessage({ type: "MATCH_SHELL_CACHED" });
        })(),
    );
});
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET") return;
    const protocol =
        event.request.mode === "navigate" &&
        url.origin === self.location.origin &&
        /^\/dashboard\/match-service\/\d+\/protocol\/?$/.test(url.pathname);
    if (!assets(url) && !protocol) return;
    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE);
            try {
                const response = await fetch(event.request);
                if (!response.ok) throw new Error("Server unavailable");
                if (!protocol) await cache.put(event.request, response.clone());
                return response;
            } catch (error) {
                const saved = await cache.match(
                    protocol ? "/__match_shell__" : event.request,
                );
                if (saved) return saved;
                throw error;
            }
        })(),
    );
});
