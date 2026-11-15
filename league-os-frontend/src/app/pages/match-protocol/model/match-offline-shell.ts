export async function cacheMatchShell(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.register(
        '/match-offline-worker.js',
    );
    await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return;
    const urls = [
        ...Array.from(
            document.querySelectorAll<HTMLScriptElement>('script[src]'),
        ).map((s) => s.src),
        ...performance.getEntriesByType('resource').map((r) => r.name),
    ];
    worker.postMessage({ type: 'CACHE_MATCH_SHELL', urls });
}
