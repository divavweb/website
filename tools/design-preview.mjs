// Lokální náhled webu a porovnání všech variant designu (není součástí veřejného webu).
//
//   npm run preview   →   http://127.0.0.1:4173/__design-preview   (celé stránky)
//                         http://127.0.0.1:4173/__design-matrix    (všechny tulipány vedle sebe)
//
// Server poslouchá jen na 127.0.0.1, přijímá jen požadavky s hlavičkou Host 127.0.0.1/localhost
// a neposkytuje skryté soubory (.git) ani node_modules. Seznam variant čte přímo z CSS,
// takže nově přidaná paleta, animace nebo vzhled se v náhledu objeví automaticky.
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const siteRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const defaultPort = 4173;

export const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".xml": "application/xml; charset=utf-8"
};

// Doporučená politika Content-Security-Policy pro web (viz README). Lokální náhled ji
// posílá u každé stránky, aby se případný inline skript nebo styl odhalil už při vývoji.
export const siteContentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "frame-src https://calendly.com https://frame.mapy.cz",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'"
].join("; ");

const toolContentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
].join("; ");

const commonHeaders = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
};

const pages = [
    ["/", "Vítejte"],
    ["/pages/omne.html", "O mně"],
    ["/pages/sluzby.html", "Služby"],
    ["/pages/cenik.html", "Ceník"],
    ["/pages/kontakt.html", "Kontakt"]
];

const widths = [
    ["", "Celá šířka"],
    ["320", "320 px"],
    ["375", "375 px"],
    ["430", "430 px"],
    ["768", "768 px"],
    ["1024", "1024 px"]
];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function response(status, body, headers = {}) {
    return { status, headers: { ...commonHeaders, ...headers }, body };
}

function textResponse(status, message) {
    return response(status, message, { "Content-Type": "text/plain; charset=utf-8" });
}

function toolResponse(html) {
    return response(200, html, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": toolContentSecurityPolicy
    });
}

/** Čísla a názvy variant podle CSS, např. [{ id: 1, name: "Warm Tulip" }]. */
export function readVariants(css, attribute, namePattern) {
    const names = new Map();
    for (const match of css.matchAll(namePattern)) names.set(Number(match[1]), match[2].trim());
    // Čísla variant se berou jen z pravidel, ne z komentářů (ty uvádějí i příklady budoucích variant).
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const ids = new Set();
    for (const match of rules.matchAll(new RegExp(`\\[data-${attribute}="(\\d+)"\\]`, "g"))) ids.add(Number(match[1]));
    return [...ids].sort((a, b) => a - b).map((id) => ({ id, name: names.get(id) ?? "" }));
}

async function loadVariants(root) {
    const [palettesCss, tulipsCss, stylesCss] = await Promise.all([
        readFile(resolve(root, "css/palettes.css"), "utf8"),
        readFile(resolve(root, "css/tulips.css"), "utf8"),
        readFile(resolve(root, "css/styles.css"), "utf8")
    ]);
    const toggleVariants = readVariants(
        stylesCss,
        "toggle-variant",
        /\/\*\s*Varianta\s+(\d+)\s*–\s*([^*]+?)\s*\*\//g
    );
    const hillVariants = readVariants(
        stylesCss,
        "hill-variant",
        /\/\*\s*Kopce\s+(\d+)\s*–\s*([^*]+?)\s*\*\//g
    );
    return {
        palette: readVariants(palettesCss, "palette", /\/\*\s*(\d+)\s*–\s*([^:*]+)/g),
        animation: readVariants(tulipsCss, "animation", /\/\*\s*Animace\s+(\d+)\s*–\s*([^*]+?)\s*\*\//g),
        appearance: readVariants(tulipsCss, "appearance", /(\d+)\s*=\s*([^,*\n]+)/g),
        toggleVariant: toggleVariants,
        hillVariant: hillVariants
    };
}

function label(variant) {
    return variant.name ? `${variant.id} – ${variant.name}` : String(variant.id);
}

function options(items) {
    return items.map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`).join("");
}

function previewPage(variants) {
    const select = (id, title, items) =>
        `<label>${title}<select id="${id}">${options(items)}</select></label>`;
    return `<!doctype html>
<html lang="cs">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Lokální náhled variant designu</title>
    <style>
        body { margin: 0; padding: 1rem; color: #2f2a26; background: #efe9df; font: 1rem/1.5 system-ui, sans-serif; }
        h1 { margin: 0 0 .25rem; font-family: Georgia, serif; }
        .controls { display: flex; flex-wrap: wrap; gap: .75rem 1rem; align-items: end; margin: 1rem 0; padding: 1rem; border-radius: 1rem; background: #fffdf8; }
        label { display: grid; gap: .25rem; font-weight: 700; }
        select { min-height: 2.75rem; padding: .3rem .5rem; font: inherit; }
        a { color: #1f5f8b; }
        .frame { overflow-x: auto; }
        iframe { display: block; width: 100%; height: 80vh; margin-inline: auto; border: 1px solid #c9bfae; border-radius: .75rem; background: #fff; }
        :focus-visible { outline: 3px solid #1f5f8b; outline-offset: 3px; }
    </style>
</head>
<body>
    <h1>Lokální náhled variant designu</h1>
    <p>Stránka existuje jen v lokálním náhledovém serveru. Trvalá změna se nastavuje v souboru <code>js/design.js</code>.
        Všechny tulipány vedle sebe: <a href="/__design-matrix">matice variant</a>.</p>
    <div class="controls">
        ${select("page", "Stránka", pages)}
        ${select("palette", "Barevná paleta", [["theme", "Automaticky podle režimu"], ...variants.palette.map((item) => [item.id, label(item)])])}
        ${select("animation", "Animace tulipánu", variants.animation.map((item) => [item.id, label(item)]))}
        ${select("appearance", "Vzhled tulipánu", variants.appearance.map((item) => [item.id, label(item)]))}
        ${select("toggleVariant", "Vzhled přepínače", variants.toggleVariant.map((item) => [item.id, label(item)]))}
        ${select("hillVariant", "Styl kopce pod tulipánem", variants.hillVariant.map((item) => [item.id, label(item)]))}
        ${select("theme", "Režim", [["day", "Den – Golden Calm"], ["night", "Noc – Evening Warmth"]])}
        ${select("width", "Šířka obrazovky", widths)}
        <label class="motion-option"><input id="reducedMotion" type="checkbox"> Omezit pohyb v náhledu</label>
    </div>
    <div class="frame"><iframe id="showcase" title="Náhled stránky s vybranou variantou"></iframe></div>
    <script>
        const page = document.getElementById("page");
        const width = document.getElementById("width");
        const variantControls = ["palette", "animation", "appearance", "toggleVariant", "hillVariant"].map((id) => document.getElementById(id));
        const theme = document.getElementById("theme");
        const reducedMotion = document.getElementById("reducedMotion");
        const showcase = document.getElementById("showcase");
        function updatePreview() {
            const params = new URLSearchParams({ preview: "1" });
            variantControls.forEach((control) => params.set(control.id, control.value));
            params.set("theme", theme.value);
            if (reducedMotion.checked) params.set("reducedMotion", "1");
            showcase.src = page.value + "?" + params.toString();
            showcase.style.width = width.value ? width.value + "px" : "100%";
        }
        [page, width, theme, reducedMotion, ...variantControls].forEach((control) => control.addEventListener("change", updatePreview));
        updatePreview();
    </script>
</body>
</html>`;
}

async function themeToggleMatrixPage(root, variants) {
    const homepage = await readFile(resolve(root, "index.html"), "utf8");
    const button = homepage.match(/<button class="theme-toggle"[\s\S]*?<\/button>/)?.[0];
    if (!button) throw new Error("index.html neobsahuje přepínač motivu.");
    const cells = variants.hillVariant.map((hill) => {
        const toggles = variants.toggleVariant.map((variant) => {
            const previewButton = button
                .replace(
                    'class="theme-toggle"',
                    `class="theme-toggle" data-theme="day" data-toggle-variant="${variant.id}" data-hill-variant="${hill.id}" data-toggle-appearance="illustrated"`
                )
                .replace(/\s+hidden(?=[\s>])/g, "");
            return `<section class="toggle-preview-card">
                <h3>Varianta ${variant.id}</h3>
                <p>${escapeHtml(variant.name)}</p>
                ${previewButton}
                <span class="toggle-state">Den</span>
            </section>`;
        }).join("");
        return `<section class="toggle-preview-group" data-hill-variant="${hill.id}">
            <h2>Kopce ${hill.id}: ${escapeHtml(hill.name)}</h2>
            <div class="toggle-preview-grid">${toggles}</div>
        </section>`;
    }).join("");

    return `<!doctype html>
<html lang="cs" data-theme="day" data-palette="4" data-toggle-variant="1" data-hill-variant="1" data-toggle-appearance="illustrated">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Náhled přepínačů denního a nočního režimu</title>
    <link rel="stylesheet" href="/css/palettes.css">
    <link rel="stylesheet" href="/css/styles.css">
    <style>
        body { display: block; padding: 1rem; }
        .toggle-matrix-tools { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; margin-bottom: 1rem; }
        .toggle-matrix-tools button { min-height: 44px; padding: .4rem .9rem; border: 1px solid var(--color-border); border-radius: 1rem; background: var(--color-surface); color: var(--color-ink); font: inherit; cursor: pointer; }
        .toggle-preview-group { margin-block: 1.5rem; }
        .toggle-preview-group > h2 { margin-bottom: .75rem; }
        .toggle-preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 1rem; }
        .toggle-preview-card { display: flex; min-height: 10rem; flex-direction: column; align-items: center; justify-content: center; gap: .35rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: 1.5rem; background: var(--color-surface); color: var(--color-ink); }
        .toggle-preview-card h2, .toggle-preview-card h3, .toggle-preview-card p { margin: 0; text-align: center; }
        .toggle-preview-card .theme-toggle { width: 64px; height: 64px; }
        .toggle-preview-card .theme-toggle-scene { width: 64px; height: 64px; }
        .toggle-state { color: var(--color-muted); font-size: .9rem; }
    </style>
</head>
<body>
    <h1>Varianty přepínače denního a nočního režimu</h1>
    <p>Kliknutím na krajinu v kartě přepnete mezi dnem a nocí; přechody lze porovnat opakovaným kliknutím.</p>
    <div class="toggle-matrix-tools">
        <button type="button" data-theme-all="day">Nastavit všechny na den</button>
        <button type="button" data-theme-all="night">Nastavit všechny na noc</button>
        <label><input id="previewReducedMotion" type="checkbox"> Omezit pohyb</label>
    </div>
    ${cells}
    <script>
        const toggles = document.querySelectorAll(".toggle-preview-card .theme-toggle");
        function setTheme(button, theme) {
            const night = theme === "night";
            button.dataset.theme = theme;
            button.setAttribute("aria-pressed", String(night));
            button.setAttribute("aria-label", night ? "Přepnout na denní režim" : "Přepnout na noční režim");
            button.nextElementSibling.textContent = night ? "Noc" : "Den";
        }
        toggles.forEach((button) => button.addEventListener("click", () =>
            setTheme(button, button.dataset.theme === "night" ? "day" : "night")
        ));
        document.querySelectorAll("[data-theme-all]").forEach((control) => control.addEventListener("click", () =>
            toggles.forEach((button) => setTheme(button, control.dataset.themeAll))
        ));
        document.getElementById("previewReducedMotion").addEventListener("change", (event) =>
            document.documentElement.setAttribute("data-preview-reduced-motion", String(event.target.checked))
        );
    </script>
</body>
</html>`;
}

async function matrixPage(root, variants) {
    const services = await readFile(resolve(root, "pages/sluzby.html"), "utf8");
    const sprite = services.match(/<svg class="tulip-sprite"[\s\S]*?<\/svg>/)?.[0];
    const tulip = services.match(/<details class="tulip"[\s\S]*?<\/details>/)?.[0];
    if (!sprite || !tulip) throw new Error("pages/sluzby.html neobsahuje SVG sprite nebo tulipán.");
    const sample = tulip.replace(/\s+id="[^"]*"/, "");

    const cells = variants.animation.flatMap((animation) =>
        variants.appearance.map((appearance) => `
            <div class="matrix-cell" data-animation="${animation.id}" data-appearance="${appearance.id}">
                <p class="matrix-label">Animace ${escapeHtml(label(animation))}<br>Vzhled ${escapeHtml(label(appearance))}</p>
                ${sample}
            </div>`)
    ).join("");
    const sections = variants.palette.map((palette) => `
        <section class="matrix-palette" data-palette="${palette.id}">
            <h2>Paleta ${escapeHtml(label(palette))}</h2>
            <div class="matrix-grid">${cells}</div>
        </section>`).join("");

    return `<!doctype html>
<html lang="cs">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Matice variant tulipánů</title>
    <link rel="stylesheet" href="/css/palettes.css">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/tulips.css">
    <style>
        body { display: block; padding: 1rem; color: #2f2a26; background: #e9e3d8; font-family: system-ui, sans-serif; }
        .matrix-tools { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; margin: 0 -1rem 1rem; padding: .75rem 1rem; background: #e9e3d8; }
        .matrix-tools button { min-height: 2.75rem; padding: .3rem 1rem; border: 2px solid #3b2c27; border-radius: 1rem; background: #fffdf8; font: inherit; font-weight: 700; cursor: pointer; }
        .matrix-palette { margin-bottom: 2rem; padding: 1.25rem; border-radius: 1.5rem; background: var(--color-page); color: var(--color-ink); }
        .matrix-palette > h2 { margin-bottom: 1rem; }
        .matrix-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1rem; align-items: start; }
        .matrix-cell { padding: .75rem; border: 1px solid var(--color-border); border-radius: 1rem; }
        .matrix-label { margin: 0 0 .25rem; font-size: .8rem; font-weight: 700; color: var(--color-muted); }
    </style>
</head>
<body>
    <h1>Všechny varianty tulipánů</h1>
    <p>Lokální vývojová stránka. Každý řádek je jedna barevná paleta, každá buňka jedna kombinace animace a vzhledu.</p>
    <div class="matrix-tools">
        <button type="button" data-action="open">Otevřít vše</button>
        <button type="button" data-action="close">Zavřít vše</button>
        <button type="button" data-action="replay">Přehrát znovu</button>
        <a href="/__design-preview">Náhled celých stránek</a>
    </div>
    ${sprite}
    ${sections}
    <script>
        const tulips = document.querySelectorAll("details.tulip");
        const setOpen = (open) => tulips.forEach((tulip) => { tulip.open = open; });
        document.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-action]");
            if (!button) return;
            if (button.dataset.action === "replay") {
                setOpen(false);
                requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
            } else {
                setOpen(button.dataset.action === "open");
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Vytvoří obsluhu požadavků náhledového serveru. Používá ji server níže
 * i prohlížečové testy (tests/browser), takže testy ověřují skutečný kód náhledu.
 */
export function createPreviewHandler({ root = siteRoot, port = defaultPort } = {}) {
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    let realRoot;

    return async function handle({ method, url, host }) {
        if (!allowedHosts.has(host)) return textResponse(421, "Neplatná hlavička Host.");
        if (method !== "GET" && method !== "HEAD") {
            return response(405, "", { Allow: "GET, HEAD" });
        }

        let pathname;
        try {
            const rawPath = String(url).split(/[?#]/, 1)[0];
            if (!rawPath.startsWith("/")) return textResponse(400, "Neplatná adresa.");
            pathname = decodeURIComponent(rawPath);
        } catch {
            return textResponse(400, "Neplatná adresa.");
        }

        if (pathname === "/__design-preview") return toolResponse(previewPage(await loadVariants(root)));
        if (pathname === "/__design-matrix") return toolResponse(await matrixPage(root, await loadVariants(root)));
        if (pathname === "/__theme-toggle-matrix") return toolResponse(await themeToggleMatrixPage(root, await loadVariants(root)));

        if (pathname.endsWith("/")) pathname += "index.html";
        const parts = pathname.split("/");
        if (pathname.includes("\0") || parts.some((part) => part.startsWith(".") || part === "node_modules")) {
            return textResponse(404, "Nenalezeno.");
        }

        realRoot ??= await realpath(root);
        let filePath;
        try {
            filePath = await realpath(resolve(root, `.${pathname}`));
        } catch {
            return textResponse(404, "Nenalezeno.");
        }
        if (!filePath.startsWith(`${realRoot}${sep}`) || !(await stat(filePath)).isFile()) {
            return textResponse(404, "Nenalezeno.");
        }

        const contentType = contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
        const headers = { "Content-Type": contentType };
        if (contentType.startsWith("text/html")) headers["Content-Security-Policy"] = siteContentSecurityPolicy;
        return response(200, await readFile(filePath), headers);
    };
}

export function startPreviewServer(port = Number(process.env.PORT ?? defaultPort)) {
    let handle;
    const server = createServer(async (request, reply) => {
        handle ??= createPreviewHandler({ port: server.address().port });
        let result;
        try {
            result = await handle({ method: request.method, url: request.url, host: request.headers.host ?? "" });
        } catch (error) {
            console.error(error);
            result = textResponse(500, "Chyba náhledového serveru.");
        }
        reply.writeHead(result.status, result.headers);
        reply.end(request.method === "HEAD" ? undefined : result.body);
    });
    server.listen(port, "127.0.0.1", () => {
        const { port: actualPort } = server.address();
        console.log(`Náhled stránek:  http://127.0.0.1:${actualPort}/__design-preview`);
        console.log(`Matice variant:  http://127.0.0.1:${actualPort}/__design-matrix`);
    });
    return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    startPreviewServer();
}
