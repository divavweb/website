// Serves the static website to Playwright from the local files without a web server.
// Requests to the fake origin are fulfilled from disk; all other requests are recorded
// and never reach the network, which keeps the browser tests fast and deterministic.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentTypes, createPreviewHandler } from "../../tools/design-preview.mjs";

export const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const siteOrigin = "https://divav.test";
export const localPreviewOrigin = "http://localhost:4173";

const designKeys = ["dayPalette", "nightPalette", "tulipAnimation", "tulipAppearance", "themeToggleVariant", "themeToggleHillVariant"];
const previewHandler = createPreviewHandler({ port: 4173 });

/** Returns js/design.js with the given configuration values, exactly as the owner would edit it. */
export function withDesignConfig(source, config) {
    let result = source;
    for (const key of designKeys) {
        if (config[key] === undefined) continue;
        const pattern = new RegExp(`(^\\s*${key}:\\s*)\\d+`, "m");
        if (!pattern.test(result)) throw new Error(`js/design.js does not define ${key}`);
        result = result.replace(pattern, `$1${config[key]}`);
    }
    if (config.themeToggleAppearance !== undefined) {
        if (config.themeToggleAppearance !== "illustrated" && config.themeToggleAppearance !== "botanical") {
            throw new Error(`Invalid themeToggleAppearance: ${config.themeToggleAppearance}`);
        }
        const pattern = /^(\s*themeToggleAppearance:\s*)"[^"]+"/m;
        if (!pattern.test(result)) throw new Error("js/design.js does not define themeToggleAppearance");
        result = result.replace(pattern, `$1"${config.themeToggleAppearance}"`);
    }
    return result;
}

/**
 * Routes every request of a browser context.
 * @returns {{ external: string[], missing: string[] }} third-party URLs and missing local files
 */
export async function serveStaticSite(context, { origins = [siteOrigin], design } = {}) {
    const external = [];
    const missing = [];
    await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === localPreviewOrigin && origins.includes(localPreviewOrigin)) {
            const result = await previewHandler({
                method: request.method(),
                url: `${url.pathname}${url.search}`,
                host: url.host
            });
            return route.fulfill({ status: result.status, headers: result.headers, body: result.body });
        }
        if (!origins.includes(url.origin)) {
            external.push(url.href);
            if (request.resourceType() === "document") {
                return route.fulfill({
                    status: 200,
                    contentType: "text/html; charset=utf-8",
                    body: "<!doctype html><html lang=\"cs\"><title>Externí obsah</title><p>Externí obsah je v testech blokován.</p></html>"
                });
            }
            return route.abort("blockedbyclient");
        }

        let pathname;
        try {
            pathname = decodeURIComponent(url.pathname);
        } catch {
            return route.fulfill({ status: 400, body: "Bad request" });
        }
        if (pathname.endsWith("/")) pathname += "index.html";
        const filePath = path.resolve(siteRoot, `.${pathname}`);
        const hidden = pathname.split("/").some((part) => part.startsWith("."));
        if (!filePath.startsWith(`${siteRoot}${path.sep}`) || hidden || pathname.startsWith("/node_modules/")) {
            missing.push(pathname);
            return route.fulfill({ status: 404, body: "Not found" });
        }
        try {
            let body = await readFile(filePath);
            if (design && pathname === "/js/design.js") body = withDesignConfig(body.toString("utf8"), design);
            return route.fulfill({
                status: 200,
                contentType: contentTypes[path.extname(filePath)] || "application/octet-stream",
                body
            });
        } catch {
            missing.push(pathname);
            return route.fulfill({ status: 404, body: "Not found" });
        }
    });
    return { external, missing };
}
