// Isolated browser smoke test. All /api requests are fulfilled in memory: no DB writes.
// Requires Playwright available to Node, installed Edge, and `ng build`.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");

(async () => {
    let origin = process.env.VIDEO_TEST_ORIGIN;
    let server;
    if (!origin) {
        const root = path.resolve("dist/arman/browser");
        const mime = {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".jpg": "image/jpeg",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ttf": "font/ttf",
            ".webp": "image/webp",
        };
        server = http.createServer(async (req, res) => {
            try {
                let file = path.resolve(
                    root,
                    "." +
                        decodeURIComponent(
                            new URL(req.url, "http://localhost").pathname,
                        ),
                );
                if (file !== root && !file.startsWith(root + path.sep)) {
                    res.writeHead(403).end();
                    return;
                }
                if (!path.extname(file)) file = path.join(root, "index.html");
                const body = await fs.readFile(file);
                res.writeHead(200, {
                    "Content-Type":
                        mime[path.extname(file)] || "application/octet-stream",
                }).end(body);
            } catch {
                res.writeHead(404).end();
            }
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        server.unref();
        origin = `http://127.0.0.1:${server.address().port}`;
    }
    if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
        throw new Error("Only a local test server is allowed");
    const output = path.resolve(
        process.env.VIDEO_TEST_OUTPUT || "test-results/videos",
    );
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
    });
    try {
        await context.addInitScript(() =>
            localStorage.setItem("access_token", "local-video-ui-fixture"),
        );
        const photos = [
            "match-action",
            "match-duel",
            "match-strike",
            "team-emotion",
        ];
        const titles = [
            "Водоканал — КРИКС · Обзор матча",
            "Наш район. Наш футбол.",
            "Голы тура: игра до свистка",
            "По одну сторону поля",
            "Соляное — Голд · Все голы",
            "ЧЭТК — ЧТСиГХ · Лучшие моменты",
            "Вечерний футбол Дворовой лиги",
            "Герои нашего двора",
        ];
        let videos = titles.map((title, i) => ({
            id: i + 1,
            title,
            communityId: 1,
            coverUrl: `/brand/photos/${photos[i % photos.length]}.jpg`,
            embedUrl: "https://vkvideo.ru/video_ext.php?oid=-1&id=2&autoplay=0",
            status: "published",
            showOnHome: true,
            sortOrder: i,
            publishedAt: "2026-10-25T12:00:00Z",
            tournamentId: null,
            matchId: null,
        }));
        const calls = [];
        await context.route("**/api/**", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const endpoint = url.pathname;
            calls.push(`${request.method()} ${endpoint}`);
            const json = (data) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(data),
                });
            if (endpoint === "/api/auth/me")
                return json({
                    id: 99,
                    username: "fixture",
                    firstName: "Тест",
                    lastName: "Организатор",
                    email: null,
                    roles: [],
                    communities: [
                        {
                            id: 1,
                            name: "Дворовая лига",
                            slug: "yard",
                            role: "admin",
                        },
                    ],
                });
            if (endpoint === "/api/communities")
                return json([
                    {
                        id: 1,
                        name: "Дворовая лига",
                        slug: "yard",
                        role: "admin",
                        canManageMembers: false,
                        canManageTournaments: true,
                    },
                ]);
            if (endpoint === "/api/communities/1/videos/options")
                return json({
                    tournaments: [{ id: 8, name: "Осенний кубок 2026" }],
                    matches: [],
                });
            if (endpoint === "/api/communities/1/videos") {
                if (request.method() === "POST") {
                    const payload = request.postDataJSON();
                    const saved = {
                        ...payload,
                        id: 100,
                        communityId: 1,
                        embedUrl:
                            "https://vkvideo.ru/video_ext.php?oid=-1&id=2&autoplay=0",
                        publishedAt: null,
                    };
                    videos.push(saved);
                    return json(saved);
                }
                return json({
                    items: videos,
                    total: videos.length,
                    homeCount: videos.filter(
                        (v) => v.status === "published" && v.showOnHome,
                    ).length,
                    page: 1,
                    limit: 20,
                });
            }
            if (endpoint === "/api/videos")
                return json(
                    videos
                        .filter((v) => v.status === "published" && v.showOnHome)
                        .slice(0, 8),
                );
            if (endpoint === "/api/tournaments/active") return json(null);
            if (endpoint === "/api/players/ticker") return json({ players: [], birthdays: [] });
            if (endpoint === "/api/feature-flags")
                return json({
                    tournamentBuilder: false,
                    multiStagePublicView: true,
                });
            return json([]);
        });
        // Never contact VK during a fixture test, but retain a real iframe DOM for lifecycle checks.
        await context.route("https://vkvideo.ru/**", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                body: '<html><body style="background:#111;color:white">Тестовый плеер (без обращения к ВК)</body></html>',
            }),
        );
        const page = await context.newPage();
        const browserErrors = [];
        page.on("pageerror", (error) =>
            browserErrors.push(error.message),
        );
        page.on('console', message => {
            // Angular's ErrorHandler reports caught template failures via console.
            // Asset-network denials in a restricted test runner are not JS errors.
            if (message.type() === 'error' && /^(ERROR|TypeError|ReferenceError|RangeError)/.test(message.text())) browserErrors.push(message.text());
        });
        await page.goto(`${origin}/`);
        await page.locator("#videos").scrollIntoViewIfNeeded();
        try {
            await page
                .locator(".video-card")
                .first()
                .waitFor({ timeout: 12000 });
        } catch (error) {
            console.error("API calls:", calls);
            console.error(
                (await page.locator("body").innerText()).slice(-1500),
            );
            throw error;
        }
        assert.equal(await page.locator(".video-card").count(), 8);
        assert.equal(await page.locator("iframe").count(), 0);
        await page.locator("#videos").scrollIntoViewIfNeeded();
        await page
            .locator("#videos img")
            .evaluateAll((images) =>
                Promise.all(images.map((img) => img.decode().catch(() => {}))),
            );
        await page
            .locator("#videos")
            .screenshot({ path: path.join(output, "videos-desktop.png") });
        const originalUrl = page.url();
        await page.locator(".video-card").first().click();
        try {
            await page
                .locator("app-video-player iframe")
                .waitFor({ timeout: 12000 });
        } catch (error) {
            console.error(
                "Dialog DOM:",
                await page.locator(".cdk-overlay-container").innerHTML(),
            );
            await page.screenshot({
                path: path.join(output, "dialog-failure.png"),
            });
            throw error;
        }
        assert.equal(page.url(), originalUrl);
        assert.equal(await page.locator("iframe").count(), 1);
        await page
            .getByRole("button", { name: "Закрыть видео", exact: true })
            .click();
        await page.locator("app-video-player").waitFor({ state: "detached" });
        assert.equal(await page.locator("iframe").count(), 0);
        assert.equal(
            await page
                .locator(".video-card")
                .first()
                .evaluate((el) => el === document.activeElement),
            true,
        );
        await page.locator(".video-card").first().press("Enter");
        await page.locator("app-video-player iframe").waitFor();
        await page.keyboard.press("Escape");
        await page.locator("app-video-player").waitFor({ state: "detached" });
        for (const width of [768, 375]) {
            await page.setViewportSize({ width, height: 900 });
            await page.locator("#videos").scrollIntoViewIfNeeded();
            assert.equal(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
                true,
                `Home overflow at ${width}`,
            );
            await page
                .locator("#videos")
                .screenshot({ path: path.join(output, `videos-${width}.png`) });
        }
        await page.locator(".video-card").first().click();
        await page.locator("app-video-player iframe").waitFor();
        assert.equal(
            await page
                .locator("app-video-player")
                .evaluate(
                    (el) => el.getBoundingClientRect().width <= innerWidth,
                ),
            true,
        );
        await page
            .locator("app-video-player")
            .screenshot({ path: path.join(output, "player-mobile.png") });
        await page
            .getByRole("button", { name: "Закрыть видео", exact: true })
            .click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${origin}/dashboard/videos`);
        await page
            .getByRole("button", { name: "+ Добавить видео", exact: true })
            .waitFor();
        await page
            .getByRole("button", { name: "+ Добавить видео", exact: true })
            .click();
        await page
            .getByRole("button", { name: "Сохранить черновик", exact: true })
            .click();
        await page
            .getByRole("alert")
            .filter({ hasText: "Проверьте название" })
            .waitFor();
        assert.equal(
            calls.some((call) => call === "POST /api/communities/1/videos"),
            false,
        );
        await page
            .getByLabel("Название *", { exact: true })
            .fill("Обзор матча · Тестовый черновик");
        await page
            .getByLabel("Ссылка ВК или код вставки *", { exact: true })
            .fill("https://vkvideo.ru/video-1_2");
        await page
            .locator(".editor")
            .screenshot({ path: path.join(output, "editor-desktop.png") });
        await page.setViewportSize({ width: 375, height: 900 });
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            "Editor mobile overflow",
        );
        await page
            .locator(".editor")
            .screenshot({ path: path.join(output, "editor-mobile.png") });
        await page
            .getByRole("button", { name: "Сохранить черновик", exact: true })
            .click();
        await page
            .getByRole("status")
            .filter({ hasText: "Черновик сохранён" })
            .waitFor();
        assert.equal(videos.length, 9);
        assert.equal(videos[8].status, "draft");
        assert.deepEqual(browserErrors, [], 'Unexpected browser errors');
        console.log(
            JSON.stringify(
                {
                    result: "PASS",
                    screenshots: output,
                    checks: [
                        "eight cards",
                        "no initial iframe",
                        "modal stays on site",
                        "one player",
                        "close removes iframe",
                        "focus restored",
                        "keyboard Escape",
                        "375/768/1440 layout",
                        "form validation",
                        "draft save (mock API only)",
                    ],
                },
                null,
                2,
            ),
        );
    } finally {
        await context.close();
        await browser.close();
        if (server) await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
