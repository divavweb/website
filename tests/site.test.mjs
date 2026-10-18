import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPreviewHandler, readVariants } from "../tools/design-preview.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index.html", "pages/omne.html", "pages/sluzby.html", "pages/cenik.html", "pages/kontakt.html"];
const read = (file) => readFile(path.join(root, file), "utf8");
const tagAttributes = (tag) => Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]])
);

function resolveLocalTarget(page, target) {
    const decoded = decodeURIComponent(target);
    const url = new URL(decoded, `https://site.test/${page}`);
    if (url.origin !== "https://site.test") return null;
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    return {
        file: path.resolve(root, `.${pathname}`),
        fragment: url.hash.slice(1)
    };
}

function luminance(hex) {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

test("public pages have unique metadata, canonical URLs, language and valid heading progression", async () => {
    const titles = new Set();
    const descriptions = new Set();
    const canonicals = new Set();
    const expectedPaths = {
        "index.html": "https://divav.cz/",
        "pages/omne.html": "https://divav.cz/pages/omne.html",
        "pages/sluzby.html": "https://divav.cz/pages/sluzby.html",
        "pages/cenik.html": "https://divav.cz/pages/cenik.html",
        "pages/kontakt.html": "https://divav.cz/pages/kontakt.html"
    };
    for (const page of pages) {
        const html = await read(page);
        const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
        const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1];
        const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
        assert.ok(title, `${page}: title`);
        assert.ok(description?.trim(), `${page}: meta description`);
        assert.ok(description.length >= 120 && description.length <= 160, `${page}: concise description length`);
        assert.ok(canonical && new URL(canonical).origin === "https://divav.cz", `${page}: absolute canonical`);
        assert.equal(canonical, expectedPaths[page], `${page}: canonical preserves its public URL`);
        assert.equal(html.match(/<meta\s+name="robots"\s+content="([^"]+)"/i)?.[1], "index, follow, max-image-preview:large");
        assert.equal(html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1], canonical);
        assert.match(html, /<html lang="cs">/i);
        assert.equal((html.match(/<h1(?:\s|>)/gi) || []).length, 1, `${page}: one H1`);
        let previous = 0;
        for (const [, rawLevel] of html.matchAll(/<h([1-6])(?:\s|>)/gi)) {
            const level = Number(rawLevel);
            assert.ok(level <= previous + 1, `${page}: heading level ${level} skips from ${previous}`);
            previous = level;
        }
        assert.ok(!titles.has(title), `duplicate title: ${title}`);
        assert.ok(!descriptions.has(description), `duplicate description: ${description}`);
        assert.ok(!canonicals.has(canonical), `duplicate canonical: ${canonical}`);
        titles.add(title);
        descriptions.add(description);
        canonicals.add(canonical);
    }
});

test("sitemap URLs exactly match page canonicals and robots references the sitemap", async () => {
    const canonicalUrls = [];
    for (const page of pages) {
        const html = await read(page);
        canonicalUrls.push(html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)[1]);
    }
    const sitemap = await read("sitemap.xml");
    const robots = await read("robots.txt");
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.deepEqual(sitemapUrls, canonicalUrls);
    assert.equal(new Set(sitemapUrls).size, sitemapUrls.length);
    assert.match(robots, /Sitemap:\s+https:\/\/divav\.cz\/sitemap\.xml/);
});

test("all local links, fragments, images, stylesheets and scripts resolve", async () => {
    const htmlByPage = new Map(await Promise.all(pages.map(async (page) => [page, await read(page)])));
    for (const [page, html] of htmlByPage) {
        for (const [tag] of html.matchAll(/<(?:a|link|script|img|iframe)\b[^>]*>/gi)) {
            const attrs = tagAttributes(tag);
            const target = attrs.href ?? attrs.src;
            if (!target || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(target)) continue;
            const resolved = resolveLocalTarget(page, target);
            assert.ok(resolved, `${page}: local target ${target}`);
            assert.ok(resolved.file.startsWith(`${root}${path.sep}`), `${page}: target stays in repository`);
            assert.ok(existsSync(resolved.file), `${page}: missing target ${target}`);
            if (resolved.fragment) {
                const targetPage = path.relative(root, resolved.file);
                const targetHtml = htmlByPage.get(targetPage) ?? await read(targetPage);
                assert.match(targetHtml, new RegExp(`\\bid=["']${resolved.fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`),
                    `${page}: missing fragment ${target}`);
            }
        }
    }
});

test("contact details are consistent and JSON-LD parses with supported local entities", async () => {
    for (const page of pages) {
        const html = await read(page);
        assert.match(html, /psycholog\.divav@gmail\.com/, `${page}: email`);
        assert.match(html, /tel:\+420606096129/, `${page}: linked phone`);
        assert.match(html, /Nová 707\/1/, `${page}: address`);
    }
    const homepage = await read("index.html");
    const raw = homepage.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
    assert.ok(raw, "homepage JSON-LD exists");
    const graph = JSON.parse(raw)["@graph"];
    assert.ok(Array.isArray(graph));
    const types = graph.flatMap((node) => Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]);
    assert.ok(types.includes("WebSite"));
    assert.ok(types.includes("LocalBusiness"));
    assert.ok(types.includes("Person"));
    const business = graph.find((node) => node["@type"] === "LocalBusiness");
    const footer = homepage.slice(homepage.indexOf("<footer"));
    assert.equal(business.address.addressLocality, "Valašské Meziříčí");
    assert.equal(business.telephone, "+420606096129");
    assert.equal(business.email, "psycholog.divav@gmail.com");
    assert.ok(footer.includes(business.name), "structured business name matches footer");
    assert.ok(footer.includes(business.address.streetAddress), "structured street address matches footer");
    assert.ok(footer.includes(business.telephone), "structured phone matches footer");
    assert.ok(footer.includes(business.email), "structured email matches footer");
    assert.doesNotMatch(raw, /aggregateRating|review|openingHours|memberOf|priceRange/i);
});

test("pages use semantic landmarks and avoid inline or remote executable code", async () => {
    for (const page of pages) {
        const html = await read(page);
        assert.match(html, /class="skip-link" href="#obsah"/, `${page}: skip link`);
        assert.match(html, /<nav[^>]+aria-label=/i, `${page}: named navigation`);
        assert.match(html, /<main[^>]+id="obsah"/i, `${page}: main landmark`);
        assert.doesNotMatch(html, /\sstyle\s*=/i, `${page}: no inline styles`);
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${page}: no inline event handlers`);
        for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
            const attrs = tagAttributes(tag);
            assert.ok(attrs.src || attrs.type === "application/ld+json", `${page}: only external files or JSON-LD script blocks`);
            if (attrs.src) assert.doesNotMatch(attrs.src, /^https?:/i, `${page}: no remote scripts`);
        }
        assert.doesNotMatch(html, /green_button\.css/);
        for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
            const attrs = tagAttributes(tag);
            assert.ok(Object.hasOwn(attrs, "alt"), `${page}: image has alt`);
            assert.ok(Number(attrs.width) > 0 && Number(attrs.height) > 0, `${page}: image dimensions`);
        }
        for (const [tag] of html.matchAll(/<iframe\b[^>]*>/gi)) {
            const attrs = tagAttributes(tag);
            assert.ok(attrs.title, `${page}: iframe title`);
            assert.equal(attrs.referrerpolicy, "strict-origin-when-cross-origin", `${page}: explicit referrer policy`);
        }
    }
});

test("all palette token sets are complete and contrast meets WCAG AA pairs", async () => {
    const css = await read("css/palettes.css");
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
        .filter((match) => /--color-ink:/.test(match[2]));
    assert.equal(blocks.length, 5);
    const palettes = blocks.map(([, selector, body]) => {
        const id = selector.match(/data-palette="(\d+)"/)?.[1] || "1";
        return [id, Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))];
    });
    const tokenKeys = Object.keys(palettes[0][1]).sort();
    for (const [id, tokens] of palettes) {
        assert.deepEqual(Object.keys(tokens).sort(), tokenKeys, `palette ${id} token set`);
        for (const background of ["color-page", "color-surface"]) {
            assert.ok(contrast(tokens["color-ink"], tokens[background]) >= 4.5, `palette ${id}: body text`);
            assert.ok(contrast(tokens["color-primary"], tokens[background]) >= 4.5, `palette ${id}: links`);
            assert.ok(contrast(tokens["color-muted"], tokens[background]) >= 4.5, `palette ${id}: secondary text`);
        }
        assert.ok(contrast(tokens["color-on-primary"], tokens["color-primary"]) >= 4.5, `palette ${id}: button text`);
        assert.ok(contrast(tokens["color-on-footer"], tokens["color-footer"]) >= 4.5, `palette ${id}: footer text`);
        assert.ok(contrast(tokens["color-footer-link"], tokens["color-footer"]) >= 4.5, `palette ${id}: footer links`);
    }
});

test("CSS custom properties are defined and every appearance/animation variant exists", async () => {
    const cssFiles = await readdir(path.join(root, "css"));
    const css = (await Promise.all(cssFiles.filter((name) => name.endsWith(".css")).map((name) => read(`css/${name}`)))).join("\n");
    assert.doesNotMatch(css, /@import\b|color-mix\s*\(/i);
    const defined = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const [, name] of css.matchAll(/var\(--([\w-]+)(?:\s*,[^)]*)?\)/g)) {
        assert.ok(defined.has(name), `CSS custom property --${name} is defined`);
    }
    const paletteCss = await read("css/palettes.css");
    const tulipsCss = await read("css/tulips.css");
    assert.deepEqual(readVariants(paletteCss, "palette", /\/\*\s*(\d+)\s*–\s*([^:*]+)/g).map((item) => item.id), [1, 2, 3, 4, 5]);
    assert.deepEqual(readVariants(tulipsCss, "animation", /\/\*\s*Animace\s+(\d+)\s*–\s*([^*]+?)\s*\*\//g).map((item) => item.id), [1, 2, 3, 4]);
    assert.deepEqual(readVariants(tulipsCss, "appearance", /(\d+)\s*=\s*([^,*\n]+)/g).map((item) => item.id), [1, 2]);
    const design = await read("js/design.js");
    for (const [key, available] of [
        ["colorPalette", [1, 2, 3, 4, 5]],
        ["tulipAnimation", [1, 2, 3, 4]],
        ["tulipAppearance", [1, 2]]
    ]) {
        const value = Number(design.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1]);
        assert.ok(available.includes(value), `configured ${key} ${value} exists`);
    }
});

test("service disclosure content is native, complete and linked from the homepage", async () => {
    const services = await read("pages/sluzby.html");
    const home = await read("index.html");
    const ids = [...services.matchAll(/<details class="tulip" id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
        assert.match(services, new RegExp(`<summary class="tulip-summary"[\\s\\S]*?<\\/summary>[\\s\\S]*?<div class="tulip-content">`));
        assert.ok(home.includes(`pages/sluzby.html#${id}`), `homepage links to ${id}`);
    }
    assert.match(await read("css/tulips.css"), /prefers-reduced-motion:\s*reduce/);
    assert.doesNotMatch(services, /rotateY|\.card:hover/);
});

test("GitHub Pages excludes private documents, tests and development tooling", async () => {
    const config = await read("_config.yml");
    for (const entry of ["README.md", "privateNotOnGitHub", "package.json", "package-lock.json", "node_modules", "vendor", "tests", "tools", "playwright.config.mjs", "test-results", "playwright-report"]) {
        assert.match(config, new RegExp(`^\\s+- ${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), `${entry} excluded`);
    }
    const ignore = await read(".gitignore");
    assert.match(ignore, /^privateNotOnGitHub\/\s*$/m, "private documents cannot be newly staged");
});

test("preview handler enforces local host, read-only methods, path containment and security headers", async () => {
    const handle = createPreviewHandler({ root, port: 4173 });
    const request = (url, overrides = {}) => handle({ method: "GET", url, host: "localhost:4173", ...overrides });
    const page = await request("/");
    assert.equal(page.status, 200);
    assert.match(page.headers["Content-Security-Policy"], /default-src 'self'/);
    assert.equal(page.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(page.headers["Cache-Control"], "no-store");
    assert.equal((await request("/", { host: "attacker.test:4173" })).status, 421);
    assert.equal((await request("/", { method: "POST" })).status, 405);
    assert.equal((await request("/%2e%2e/package.json")).status, 404);
    assert.equal((await request("/.git/config")).status, 404);
    assert.equal((await request("/node_modules/")).status, 404);
    assert.equal((await request("/%")).status, 400);
    assert.equal((await request("/__design-matrix")).status, 200);
    assert.equal((await request("/__design-preview")).status, 200);
});
