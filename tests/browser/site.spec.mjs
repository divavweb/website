import { expect, test } from "./fixtures.mjs";
import { localPreviewOrigin, serveStaticSite, siteOrigin } from "./static-site.mjs";

const pages = ["/", "/pages/omne.html", "/pages/sluzby.html", "/pages/cenik.html", "/pages/kontakt.html"];
const widths = [320, 375, 430, 768, 1024, 1440];
const servicePage = `${siteOrigin}/pages/sluzby.html`;
const localServicePage = `${localPreviewOrigin}/pages/sluzby.html`;

async function routeSite(context, origins = [siteOrigin], design) {
    return serveStaticSite(context, { origins, design });
}

test("all public pages render without local asset failures or browser errors", async ({ page }) => {
    const { external, missing } = await routeSite(page.context());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });

    for (const route of pages) {
        await page.goto(`${siteOrigin}${route}`);
        await expect(page.locator("main h1")).toBeVisible();
        for (const image of await page.locator("img").all()) {
            await image.scrollIntoViewIfNeeded();
            await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
        }
    }

    expect(missing).toEqual([]);
    expect(errors).toEqual([]);
    expect(external.map((url) => new URL(url).hostname).sort()).toEqual(["calendly.com", "frame.mapy.cz"]);
});

test("all pages fit target viewport widths, including with all service disclosures open", async ({ page }) => {
    const { missing } = await routeSite(page.context(), [siteOrigin, localPreviewOrigin]);
    for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of pages) {
            await page.goto(`${siteOrigin}${route}`);
            if (route === "/pages/sluzby.html") {
                await page.locator("details.tulip").evaluateAll((items) => items.forEach((item) => { item.open = true; }));
                await page.waitForTimeout(100);
            }
            const dimensions = await page.evaluate(() => ({
                client: document.documentElement.clientWidth,
                scroll: document.documentElement.scrollWidth
            }));
            expect(dimensions.scroll, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.client + 1);
        }
        await page.goto(`${localServicePage}?preview=1&animation=3`);
        const falling = page.locator("details.tulip").first();
        await falling.locator("summary").click();
        await falling.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))));
        const dimensions = await page.evaluate(() => ({
            client: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth
        }));
        expect(dimensions.scroll, `falling petals at ${width}px`).toBeLessThanOrEqual(dimensions.client + 1);
    }
    expect(missing).toEqual([]);
});

test("About page presents ČAP membership without the outdated training badge at desktop and mobile widths", async ({ page }) => {
    await routeSite(page.context());
    await page.addInitScript(() => localStorage.removeItem("divav-theme"));
    const link = page.locator(".membership-link");
    for (const width of [375, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${siteOrigin}/pages/omne.html`);
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", "https://www.czap.cz/");
        await expect(page.locator(".memberships img")).toHaveAttribute("src", "../images/CMPS_logo.webp");
        const box = await link.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(120);
        expect(box?.width).toBeLessThanOrEqual(width);
        expect(box?.height).toBeGreaterThanOrEqual(120);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
        await page.locator(".theme-toggle").click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
        await expect(link).toBeVisible();
    }
});

test("navigation and disclosure controls meet 44px touch target dimensions", async ({ page }) => {
    await routeSite(page.context());
    for (const width of [320, 375, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${siteOrigin}/pages/sluzby.html`);
        const targets = await page.locator(".site-nav a, .site-nav button, details.tulip summary, .button").evaluateAll((elements) =>
            elements.map((element) => {
                const box = element.getBoundingClientRect();
                return { name: element.textContent.trim(), width: box.width, height: box.height };
            })
        );
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) {
            expect(target.width, `${target.name} width at ${width}px`).toBeGreaterThanOrEqual(44);
            expect(target.height, `${target.name} height at ${width}px`).toBeGreaterThanOrEqual(44);
        }
    }
});

test("skip link, keyboard focus, headings, images and embedded-frame fallbacks are accessible", async ({ page }) => {
    const { missing } = await routeSite(page.context());
    for (const route of pages) {
        await page.goto(`${siteOrigin}${route}`);
        expect(await page.locator("h1").count(), `${route}: one H1`).toBe(1);
        const skip = page.locator(".skip-link");
        await skip.focus();
        await expect(skip).toBeVisible();
        await expect(skip).toHaveCSS("position", "absolute");
        await skip.press("Enter");
        await expect(page.locator("main#obsah")).toBeFocused();

        for (const selector of ["nav a", "main a", "button", "summary"]) {
            const target = page.locator(selector).first();
            if (await target.count()) {
                await target.focus();
                const focusStyle = await target.evaluate((element) => {
                    const style = getComputedStyle(element);
                    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 ||
                        style.boxShadow !== "none";
                });
                expect(focusStyle, `${route}: ${selector} focus style`).toBeTruthy();
            }
        }
        for (const image of await page.locator("img").all()) {
            const attributes = await image.evaluate((img) => ({
                alt: img.getAttribute("alt"),
                width: img.getAttribute("width"),
                height: img.getAttribute("height")
            }));
            expect(attributes.alt).not.toBeNull();
            expect(Number(attributes.width)).toBeGreaterThan(0);
            expect(Number(attributes.height)).toBeGreaterThan(0);
        }
        for (const frame of await page.locator("iframe").all()) {
            const title = await frame.getAttribute("title");
            expect(title).toBeTruthy();
            const fallbackVisible = await frame.evaluate((element) =>
                element.nextElementSibling?.classList.contains("embed-fallback") &&
                getComputedStyle(element.nextElementSibling).display !== "none"
            );
            expect(fallbackVisible).toBeTruthy();
        }
    }
    expect(missing).toEqual([]);
});

test("day/night mode defaults to Golden Calm and persists manual changes across pages and reloads", async ({ page }) => {
    await routeSite(page.context());
    await page.goto(`${siteOrigin}/`);
    const root = page.locator("html");
    const toggle = page.locator(".theme-toggle");
    await expect(root).toHaveAttribute("data-theme", "day");
    await expect(root).toHaveAttribute("data-palette", "4");
    await expect(toggle).toHaveAttribute("data-toggle-appearance", "illustrated");
    await expect(toggle).toHaveAttribute("data-hill-variant", "1");
    await expect(root).toHaveAttribute("data-animation", "1");
    await expect(root).toHaveAttribute("data-appearance", "1");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Přepnout na noční režim");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(root).toHaveAttribute("data-theme", "night");
    await expect(root).toHaveAttribute("data-palette", "5");
    await expect(root).toHaveAttribute("data-animation", "1");
    await expect(root).toHaveAttribute("data-appearance", "1");
    await expect(toggle).toHaveAttribute("aria-label", "Přepnout na denní režim");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("divav-theme"))).toBe("night");

    await page.goto(`${siteOrigin}/pages/sluzby.html`);
    await expect(root).toHaveAttribute("data-theme", "night");
    await expect(root).toHaveAttribute("data-palette", "5");
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "night");

    const nightButton = page.locator(".theme-toggle");
    await nightButton.focus();
    await nightButton.press("Space");
    await expect(root).toHaveAttribute("data-theme", "day");
    await expect(root).toHaveAttribute("data-palette", "4");
    await expect(nightButton).toHaveAttribute("aria-label", "Přepnout na noční režim");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("divav-theme"))).toBe("day");
    await page.goto(`${siteOrigin}/pages/kontakt.html`);
    await expect(root).toHaveAttribute("data-theme", "day");
    await expect(root).toHaveAttribute("data-palette", "4");
});

test("theme scene is a comfortable touch target on mobile", async ({ testBrowser }) => {
    const context = await testBrowser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    try {
        await routeSite(context);
        const page = await context.newPage();
        await page.goto(`${siteOrigin}/`);
        const toggle = page.locator(".theme-toggle");
        const size = await toggle.evaluate((button) => {
            const rect = button.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        });
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
        await toggle.tap();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
        await expect(page.locator("html")).toHaveAttribute("data-palette", "5");
    } finally {
        await context.close();
    }
});

test("service and header tulip appearances visibly switch independently in the local preview", async ({ page }) => {
    await routeSite(page.context(), [localPreviewOrigin, siteOrigin]);
    await page.setViewportSize({ width: 960, height: 900 });
    await page.goto(`${localPreviewOrigin}/__design-preview`);
    await page.locator("#page").selectOption("/pages/sluzby.html");
    const frame = page.frameLocator("#showcase");
    await expect(frame.locator("html")).toHaveAttribute("data-appearance", "1");
    await expect(frame.locator("html")).toHaveAttribute("data-toggle-appearance", "illustrated");
    await expect(frame.locator(".theme-toggle .toggle-botanical-art")).toHaveCSS("display", "none");

    const serviceIllustrated = await frame.locator(".tulip-art").first().screenshot({ animations: "disabled" });
    const headerIllustrated = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });

    await page.locator("#appearance").selectOption("2");
    await expect(frame.locator("html")).toHaveAttribute("data-appearance", "2");
    const serviceBotanical = await frame.locator(".tulip-art").first().screenshot({ animations: "disabled" });
    expect(serviceBotanical.equals(serviceIllustrated)).toBe(false);
    await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-appearance", "illustrated");
    expect((await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" })).equals(headerIllustrated)).toBe(true);

    await page.locator("#appearance").selectOption("1");
    const serviceRestored = await frame.locator(".tulip-art").first().screenshot({ animations: "disabled" });
    expect(serviceRestored.equals(serviceIllustrated)).toBe(true);

    await page.locator("#toggleAppearance").selectOption("botanical");
    await expect(frame.locator("html")).toHaveAttribute("data-toggle-appearance", "botanical");
    await expect(frame.locator(".theme-toggle .toggle-flower > :not(.toggle-botanical-art)").first()).toHaveCSS("display", "none");
    const headerBotanical = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });
    expect(headerBotanical.equals(headerIllustrated)).toBe(false);
    expect((await frame.locator(".tulip-art").first().screenshot({ animations: "disabled" })).equals(serviceIllustrated)).toBe(true);

    await page.locator("#toggleAppearance").selectOption("illustrated");
    const headerRestored = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });
    expect(headerRestored.equals(headerIllustrated)).toBe(true);

    for (let variant = 1; variant <= 7; variant += 1) {
        await page.locator("#toggleVariant").selectOption(String(variant));
        await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-variant", String(variant));
        await page.locator("#toggleAppearance").selectOption("illustrated");
        await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-appearance", "illustrated");
        const illustrated = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });
        await page.locator("#toggleAppearance").selectOption("botanical");
        await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-appearance", "botanical");
        const botanical = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });
        expect(botanical.equals(illustrated), `toggle variant ${variant} must visibly distinguish appearances`).toBe(false);
    }

    await page.locator("#theme").selectOption("night");
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "night");
    await page.locator("#reducedMotion").check();
    await expect(frame.locator("html")).toHaveAttribute("data-preview-reduced-motion", "true");
    for (let variant = 1; variant <= 7; variant += 1) {
        await page.locator("#toggleVariant").selectOption(String(variant));
        await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-variant", String(variant));
        await page.locator("#toggleAppearance").selectOption("illustrated");
        await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-appearance", "illustrated");
        const illustrated = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });
        await page.locator("#toggleAppearance").selectOption("botanical");
        await expect(frame.locator(".theme-toggle")).toHaveAttribute("data-toggle-appearance", "botanical");
        const botanical = await frame.locator(".theme-toggle-scene").screenshot({ animations: "disabled" });
        expect(botanical.equals(illustrated), `night toggle variant ${variant} must visibly distinguish appearances`).toBe(false);
    }
});

test("the owner can select the botanical header drawing in the shared design configuration", async ({ page }) => {
    await routeSite(page.context(), [siteOrigin], { themeToggleAppearance: "botanical" });
    await page.goto(`${siteOrigin}/pages/sluzby.html`);
    await expect(page.locator("html")).toHaveAttribute("data-toggle-appearance", "botanical");
    await expect(page.locator(".theme-toggle")).toHaveAttribute("data-toggle-appearance", "botanical");
    await expect(page.locator("html")).toHaveAttribute("data-appearance", "1");
    await expect(page.locator(".theme-toggle .toggle-flower > :not(.toggle-botanical-art)").first()).toHaveCSS("display", "none");
});

test("theme selection safely falls back when localStorage is blocked or contains an invalid value", async ({ testBrowser }) => {
    const context = await testBrowser.newContext();
    try {
        await context.addInitScript(() => {
            localStorage.setItem("divav-theme", "all-palettes");
            Object.defineProperty(window, "localStorage", {
                configurable: true,
                get() { throw new Error("storage blocked"); }
            });
        });
        await routeSite(context);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${siteOrigin}/`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
        await expect(page.locator("html")).toHaveAttribute("data-palette", "4");
        await page.locator(".theme-toggle").click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
        await page.evaluate(() => { delete window.localStorage; });
        await page.goto(`${siteOrigin}/pages/omne.html`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});

test("all seven theme toggle variants render in both states and keep reduced-motion behavior", async ({ page }) => {
    await routeSite(page.context(), [localPreviewOrigin, siteOrigin]);
    for (let variant = 1; variant <= 7; variant += 1) {
        await page.goto(`${localPreviewOrigin}/?preview=1&theme=day&toggleVariant=${variant}`);
        const root = page.locator("html");
        const toggle = page.locator(".theme-toggle");
        await expect(root).toHaveAttribute("data-toggle-variant", String(variant));
        await expect(toggle).toHaveAttribute("data-toggle-variant", String(variant));
        await expect(toggle).toHaveAttribute("data-theme", "day");
        await expect(toggle.locator(".toggle-hill")).toBeVisible();
        await expect(toggle.locator(".toggle-illustrated-art .toggle-open-flower")).toBeVisible();

        await toggle.click();
        await expect(toggle).toHaveAttribute("data-theme", "night");
        if (variant === 1) {
            await expect(toggle.locator(".toggle-illustrated-art .toggle-closed-flower")).toHaveCSS("opacity", "1");
            await expect(toggle.locator(".toggle-illustrated-art .toggle-open-flower")).toHaveCSS("opacity", "0");
        } else if (variant === 2 || variant === 3) {
            await expect(toggle.locator(".toggle-fireflies")).toHaveCSS("opacity", "1");
            const animationName = await toggle.locator(".toggle-fireflies circle").first().evaluate((el) => getComputedStyle(el).animationName);
            expect(animationName).toBe(variant === 3 ? "firefly-glow" : "none");
        } else if (variant === 4) {
            await expect(toggle.locator(".toggle-dew").first()).toHaveCSS("opacity", "0.9");
            await expect(toggle.locator(".toggle-moon")).toHaveCSS("opacity", "1");
        } else if (variant === 5) {
            await expect(toggle.locator(".toggle-open-flower path").first()).toHaveCSS("fill", "rgb(50, 21, 31)");
        } else if (variant === 6) {
            await expect(toggle.locator(".toggle-sun")).toHaveCSS("transition-duration", "0s");
        } else {
            await expect.poll(() => toggle.locator(".toggle-moon").evaluate((element) =>
                getComputedStyle(element).transitionDuration.split(",").map((duration) => duration.trim())
            )).toContain("0.58s");
        }
        await expect(toggle).toHaveAttribute("aria-disabled", "false");
        await toggle.click();
        await expect(toggle).toHaveAttribute("data-theme", "day");
    }

    for (let hillVariant = 1; hillVariant <= 3; hillVariant += 1) {
        for (let variant = 1; variant <= 7; variant += 1) {
            await page.goto(`${localPreviewOrigin}/?preview=1&theme=day&toggleVariant=${variant}&hillVariant=${hillVariant}`);
            const toggle = page.locator(".theme-toggle");
            await expect(toggle).toHaveAttribute("data-toggle-appearance", "illustrated");
            await expect(toggle).toHaveAttribute("data-hill-variant", String(hillVariant));
            await expect(toggle.locator(".toggle-hill")).toHaveCSS("display", hillVariant === 3 || hillVariant === 2 ? "none" : "block");
            await expect(toggle.locator(".toggle-hill-line")).toHaveCSS("display", hillVariant === 1 ? "block" : "none");
            await expect(toggle.locator(".toggle-hill-arch")).toHaveCSS("display", hillVariant === 2 ? "block" : "none");
            await toggle.click();
            await expect(toggle).toHaveAttribute("data-theme", "night");
            await expect(toggle.locator(".toggle-hill-arch")).toHaveCSS("display", hillVariant === 2 ? "block" : "none");
        }
    }

    const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(reduced).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${localPreviewOrigin}/?preview=1&theme=night&toggleVariant=3`);
    const firefly = page.locator(".toggle-fireflies circle").first();
    await expect(firefly).toHaveCSS("animation-name", "none");
    await expect(page.locator(".toggle-moon")).toHaveCSS("transition-duration", "1e-05s");
});

test("theme palette transitions calmly across the site without layout shifts", async ({ page }) => {
    await routeSite(page.context());
    await page.goto(`${siteOrigin}/`);
    const geometry = () => page.evaluate(() =>
        [...document.querySelectorAll(".site-header, main, footer")].map((element) => {
            const rect = element.getBoundingClientRect();
            return [rect.x, rect.y, rect.width, rect.height];
        })
    );
    const beforeGeometry = await geometry();
    const before = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.querySelector(".site-nav a:not([aria-current])")).color
    }));
    await page.locator(".theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(page.locator(".theme-toggle")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".theme-toggle")).toBeFocused();
    await page.waitForTimeout(60);
    const during = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.querySelector(".site-nav a:not([aria-current])")).color,
        duration: getComputedStyle(document.documentElement).transitionDuration
    }));
    expect(during.background).not.toBe(before.background);
    expect(during.background).not.toBe("rgb(35, 28, 38)");
    expect(during.text).not.toBe(before.text);
    expect(during.duration).toContain("0.48s");
    const contrast = () => page.evaluate(() => {
        const luminance = (color) => {
            const [r, g, b] = color.match(/\d+/g).slice(0, 3).map(Number)
                .map((channel) => channel / 255)
                .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (foreground, background) => {
            const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
            return (light + 0.05) / (dark + 0.05);
        };
        const bodyColor = getComputedStyle(document.body).backgroundColor;
        const bodyText = getComputedStyle(document.body).color;
        const link = document.querySelector(".site-nav a:not([aria-current])");
        const active = document.querySelector(".site-nav a[aria-current]");
        const activeStyle = getComputedStyle(active);
        const cta = getComputedStyle(document.querySelector(".button"));
        return {
            body: ratio(bodyText, bodyColor),
            link: ratio(getComputedStyle(link).color, bodyColor),
            active: ratio(activeStyle.color, activeStyle.backgroundColor),
            cta: ratio(cta.color, cta.backgroundColor),
            heading: ratio(getComputedStyle(document.querySelector("h1")).color, bodyColor)
        };
    });
    expect(await contrast()).toMatchObject({ body: expect.any(Number), link: expect.any(Number), active: expect.any(Number) });
    expect(Object.values(await contrast()).every((value) => value >= 4.5)).toBe(true);

    await expect(page.locator("html")).toHaveAttribute("data-theme-transition", "light-bridge-to-night");
    const bridge = await page.evaluate(() => ({
        phase: document.documentElement.getAttribute("data-theme-transition"),
        text: getComputedStyle(document.body).color
    }));
    expect(bridge).toEqual({ phase: "light-bridge-to-night", text: "rgb(255, 255, 255)" });
    expect(Object.values(await contrast()).every((value) => value >= 4.5)).toBe(true);
    await page.locator(".theme-toggle").waitFor({ state: "visible" });
    await expect(page.locator(".theme-toggle")).toHaveAttribute("aria-disabled", "false", { timeout: 1000 });
    expect(Object.values(await contrast()).every((value) => value >= 4.5)).toBe(true);
    expect(await geometry()).toEqual(beforeGeometry);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
    await expect(page.locator("html")).toHaveCSS("transition-duration", /1e-05s/);
    await expect(page.locator(".theme-toggle")).toHaveAttribute("aria-disabled", "false");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator(".theme-toggle").click();
    await expect(page.locator(".theme-toggle")).toHaveAttribute("aria-disabled", "false", { timeout: 1000 });
    await page.locator(".theme-toggle").click();
    await page.waitForTimeout(60);
    expect(await page.locator("html").getAttribute("data-theme-transition")).toBe("light-bridge-to-day");
    expect((await page.evaluate(() => getComputedStyle(document.body).color))).toBe("rgb(255, 255, 255)");
    expect(Object.values(await contrast()).every((value) => value >= 4.5)).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-theme-transition", "dark-bridge-to-day");
    expect(await page.locator("html").getAttribute("data-theme-transition")).toBe("dark-bridge-to-day");
    expect((await page.evaluate(() => getComputedStyle(document.body).color))).toBe("rgb(17, 17, 17)");
    expect(Object.values(await contrast()).every((value) => value >= 4.5)).toBe(true);
    await expect(page.locator(".theme-toggle")).toBeEnabled({ timeout: 1000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
    expect(Object.values(await contrast()).every((value) => value >= 4.5)).toBe(true);
});

test("every animation and appearance renders and its native disclosure works by mouse and keyboard", async ({ page }) => {
    const { missing } = await routeSite(page.context(), [siteOrigin, localPreviewOrigin]);
    for (let animation = 1; animation <= 4; animation += 1) {
        for (let appearance = 1; appearance <= 2; appearance += 1) {
            await page.goto(`${localServicePage}?preview=1&animation=${animation}&appearance=${appearance}`);
            await expect(page.locator("html")).toHaveAttribute("data-animation", String(animation));
            await expect(page.locator("html")).toHaveAttribute("data-appearance", String(appearance));
            const details = page.locator("details.tulip").first();
            const summary = details.locator("summary");
            const expectedDisplay = appearance === 1 ? "inline" : "none";
            await expect(page.locator("#tulip-stem .tulip-soft")).toHaveCSS("display", expectedDisplay);
            await expect(page.locator("#tulip-stem .tulip-botanical")).toHaveCSS("display", appearance === 1 ? "none" : "inline");

            await summary.click();
            await expect(details).toHaveAttribute("open", "");
            await details.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))));
            await expect(details.locator(".tulip-content")).toBeVisible();
            await expect(details.locator(".tulip-content")).not.toHaveJSProperty("offsetHeight", 0);
            await expect.poll(() => details.locator(".tulip-content").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
            await summary.press("Enter");
            await expect(details).not.toHaveAttribute("open", "");
            await summary.press("Space");
            await expect(details).toHaveAttribute("open", "");
        }
    }
    expect(missing).toEqual([]);
});

test("a touch pointer opens and closes a service without hover", async ({ testBrowser }) => {
    const context = await testBrowser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    try {
        await routeSite(context, [siteOrigin, localPreviewOrigin]);
        const page = await context.newPage();
        await page.goto(localServicePage);
        const details = page.locator("details.tulip").nth(1);
        const summary = details.locator("summary");
        await summary.tap();
        await expect(details).toHaveAttribute("open", "");
        await summary.tap();
        await expect(details).not.toHaveAttribute("open", "");
    } finally {
        await context.close();
    }
});

test("hash navigation opens linked tulips on load and after hash changes", async ({ page }) => {
    await routeSite(page.context());
    await page.goto(`${servicePage}#mediace`);
    await expect(page.locator("#mediace")).toHaveAttribute("open", "");
    await page.evaluate(() => { window.location.hash = "psychoterapie"; });
    await expect(page.locator("#psychoterapie")).toHaveAttribute("open", "");
});

test("native service disclosures remain usable when JavaScript is disabled", async ({ testBrowser }) => {
    const context = await testBrowser.newContext({ javaScriptEnabled: false });
    try {
        await routeSite(context);
        const page = await context.newPage();
        await page.goto(servicePage);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
        await expect(page.locator("html")).toHaveAttribute("data-palette", "4");
        await expect(page.locator(".theme-toggle")).toBeHidden();
        const details = page.locator("details.tulip").first();
        await details.locator("summary").click();
        await expect(details).toHaveAttribute("open", "");
        await expect(details.locator(".tulip-content")).toBeVisible();
    } finally {
        await context.close();
    }
});

test("reduced-motion preference reduces disclosure motion to an imperceptible duration", async ({ testBrowser }) => {
    const context = await testBrowser.newContext({ reducedMotion: "reduce" });
    try {
        await routeSite(context, [siteOrigin, localPreviewOrigin]);
        const page = await context.newPage();
        await page.goto(`${localServicePage}?preview=1&animation=3`);
        const details = page.locator("details.tulip").first();
        await details.locator("summary").click();
        await expect(details).toHaveAttribute("open", "");
        await page.waitForTimeout(20);
        const longMotion = await details.evaluate((element) =>
            element.getAnimations({ subtree: true }).map((animation) => {
                const timing = animation.effect.getTiming();
                return {
                    duration: timing.duration,
                    delay: timing.delay,
                    state: animation.playState,
                    pseudoElement: animation.effect.pseudoElement ?? null
                };
            }).filter((animation) => Number(animation.duration) > 0.02 || Number(animation.delay) > 0.02)
        );
        expect(longMotion, JSON.stringify(longMotion)).toEqual([]);
        await expect(details.locator(".tulip-content")).toBeVisible();
    } finally {
        await context.close();
    }
});

test("all palettes apply, previews are local-only and invalid values are ignored", async ({ page }) => {
    await routeSite(page.context(), [siteOrigin, localPreviewOrigin]);
    for (let palette = 1; palette <= 5; palette += 1) {
        await page.goto(`${localPreviewOrigin}/?preview=1&palette=${palette}`);
        await expect(page.locator("html")).toHaveAttribute("data-palette", String(palette));
        const ratios = await page.evaluate(() => {
            const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
            const luminance = (color) => {
                const channels = rgb(color).map((value) => value / 255);
                const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
                return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
            };
            const ratio = (foreground, background) => {
                const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
                return (values[0] + 0.05) / (values[1] + 0.05);
            };
            const style = (selector) => getComputedStyle(document.querySelector(selector));
            const body = style("body");
            const currentNav = style(".site-nav a[aria-current='page']");
            const button = style(".button");
            const footer = style(".site-footer");
            const footerLink = style(".site-footer a");
            return [
                ratio(body.color, body.backgroundColor),
                ratio(currentNav.color, currentNav.backgroundColor),
                ratio(button.color, button.backgroundColor),
                ratio(footer.color, footer.backgroundColor),
                ratio(footerLink.color, footer.backgroundColor)
            ];
        });
        expect(ratios.every((value) => value >= 4.5), `palette ${palette}: ${ratios.join(", ")}`).toBeTruthy();
    }
    await page.goto(`${siteOrigin}/?preview=1&palette=3`);
    await expect(page.locator("html")).toHaveAttribute("data-palette", "4");
    await page.goto(`${localPreviewOrigin}/?preview=1&palette=0&animation=abc&appearance=100`);
    await expect(page.locator("html")).toHaveAttribute("data-palette", "4");
    await expect(page.locator("html")).toHaveAttribute("data-animation", "1");
    await expect(page.locator("html")).toHaveAttribute("data-appearance", "1");
});

test("local preview pages send strict CSP without browser violations", async ({ page }) => {
    const violations = [];
    page.on("securitypolicyviolation", (event) => violations.push(`${event.violatedDirective}: ${event.blockedURI}`));
    const { missing } = await routeSite(page.context(), [localPreviewOrigin, siteOrigin]);
    for (const route of pages) {
        await page.goto(`${localPreviewOrigin}${route}`);
        await expect(page.locator("main h1")).toBeVisible();
    }
    expect(violations).toEqual([]);
    expect(missing).toEqual([]);
});

test("design preview and 42-cell matrix controls work", async ({ page }) => {
    await routeSite(page.context(), [localPreviewOrigin, siteOrigin]);
    await page.goto(`${localPreviewOrigin}/__design-matrix`);
    await expect(page.locator(".matrix-cell")).toHaveCount(40);
    await page.getByRole("button", { name: "Otevřít vše" }).click();
    expect(await page.locator(".matrix-cell details[open]").count()).toBe(40);
    await page.getByRole("button", { name: "Zavřít vše" }).click();
    expect(await page.locator(".matrix-cell details[open]").count()).toBe(0);
    await page.getByRole("button", { name: "Přehrát znovu" }).click();
    await expect.poll(() => page.locator(".matrix-cell details[open]").count()).toBe(40);

    await page.goto(`${localPreviewOrigin}/__design-preview`);
    const frame = page.frameLocator("#showcase");
    await expect(frame.locator("main h1")).toBeVisible();
    await page.locator("#palette").selectOption("3");
    await expect(frame.locator("html")).toHaveAttribute("data-palette", "3");
    await page.locator("#animation").selectOption("4");
    await expect(frame.locator("html")).toHaveAttribute("data-animation", "4");
    await page.locator("#appearance").selectOption("2");
    await expect(frame.locator("html")).toHaveAttribute("data-appearance", "2");
    await page.locator("#toggleAppearance").selectOption("botanical");
    await expect(frame.locator("html")).toHaveAttribute("data-toggle-appearance", "botanical");
    await page.locator("#toggleAppearance").selectOption("illustrated");
    await expect(frame.locator("html")).toHaveAttribute("data-toggle-appearance", "illustrated");
    await page.locator("#toggleVariant").selectOption("7");
    await expect(frame.locator("html")).toHaveAttribute("data-toggle-variant", "7");
    await page.locator("#hillVariant").selectOption("3");
    await expect(frame.locator("html")).toHaveAttribute("data-hill-variant", "3");
    await page.locator("#palette").selectOption("theme");
    await page.locator("#theme").selectOption("night");
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(frame.locator("html")).toHaveAttribute("data-palette", "5");
    await page.locator("#reducedMotion").check();
    await expect(frame.locator("html")).toHaveAttribute("data-preview-reduced-motion", "true");
    await frame.locator(".theme-toggle").click();
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "day");
    await expect(frame.locator("html")).not.toHaveAttribute("data-theme-transition");

    await page.goto(`${localPreviewOrigin}/__theme-toggle-matrix`);
    await expect(page.locator(".toggle-preview-card")).toHaveCount(42);
    await expect(page.locator(".toggle-preview-group")).toHaveCount(6);
    const matrixToggle = page.locator(".toggle-preview-card .theme-toggle").nth(2);
    await matrixToggle.click();
    await expect(matrixToggle).toHaveAttribute("data-theme", "night");
    await page.getByRole("button", { name: "Nastavit všechny na den" }).click();
    await expect(page.locator(".toggle-preview-card .theme-toggle[data-theme='day']")).toHaveCount(42);
    await page.getByRole("button", { name: "Nastavit všechny na noc" }).click();
    await expect(page.locator(".toggle-preview-card .theme-toggle[data-theme='night']")).toHaveCount(42);
    await page.getByLabel("Omezit pohyb").check();
    await expect(page.locator("html")).toHaveAttribute("data-preview-reduced-motion", "true");
});

test("all design combinations have no horizontal overflow at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await routeSite(page.context(), [localPreviewOrigin, siteOrigin]);
    for (let palette = 1; palette <= 5; palette += 1) {
        for (let animation = 1; animation <= 4; animation += 1) {
            for (let appearance = 1; appearance <= 2; appearance += 1) {
                await page.goto(`${localServicePage}?preview=1&palette=${palette}&animation=${animation}&appearance=${appearance}`);
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                expect(overflow, `palette ${palette}, animation ${animation}, appearance ${appearance}`).toBeLessThanOrEqual(1);
            }
        }
    }
});
