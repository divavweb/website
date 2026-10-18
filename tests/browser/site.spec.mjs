import { expect, test } from "./fixtures.mjs";
import { localPreviewOrigin, serveStaticSite, siteOrigin } from "./static-site.mjs";

const pages = ["/", "/pages/omne.html", "/pages/sluzby.html", "/pages/cenik.html", "/pages/kontakt.html"];
const widths = [320, 375, 430, 768, 1024, 1440];
const servicePage = `${siteOrigin}/pages/sluzby.html`;
const localServicePage = `${localPreviewOrigin}/pages/sluzby.html`;

async function routeSite(context, origins = [siteOrigin]) {
    return serveStaticSite(context, { origins });
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

test("navigation and disclosure controls meet 44px touch target dimensions", async ({ page }) => {
    await routeSite(page.context());
    for (const width of [320, 375, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${siteOrigin}/pages/sluzby.html`);
        const targets = await page.locator(".site-nav a, details.tulip summary, .button").evaluateAll((elements) =>
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
    await expect(page.locator("html")).toHaveAttribute("data-palette", "1");
    await page.goto(`${localPreviewOrigin}/?preview=1&palette=0&animation=abc&appearance=100`);
    await expect(page.locator("html")).toHaveAttribute("data-palette", "1");
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

test("design preview and 40-cell matrix controls work", async ({ page }) => {
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
