/*
 * Nastavení vzhledu webu divav.cz. Změny zde platí pro všechny stránky.
 * defaultTheme: "day" nebo "night"; dayPalette/nightPalette: čísla palet 1–5.
 * tulipAnimation: 1–4; tulipAppearance: 1–2; themeToggleVariant: 1–7.
 * themeToggleHillVariant: 1–3; themeToggleAppearance: "illustrated".
 */
(function () {
    "use strict";

    const siteDesign = {
        defaultTheme: "day",
        dayPalette: 4,
        nightPalette: 5,
        tulipAnimation: 1,
        tulipAppearance: 1,
        themeToggleVariant: 1,
        themeToggleHillVariant: 1,
        themeToggleAppearance: "illustrated"
    };
    const storageKey = "divav-theme";
    const validNumber = /^[1-9][0-9]?$/;
    const root = document.documentElement;
    const host = window.location.hostname;
    const params = host === "localhost" || host === "127.0.0.1"
        ? new URLSearchParams(window.location.search)
        : null;
    const preview = params !== null && params.get("preview") === "1";

    function validTheme(value) {
        return value === "day" || value === "night";
    }

    function readStoredTheme() {
        try {
            const value = window.localStorage.getItem(storageKey);
            return validTheme(value) ? value : null;
        } catch {
            return null;
        }
    }

    const previewTheme = preview && validTheme(params.get("theme")) ? params.get("theme") : null;
    const defaultTheme = validTheme(siteDesign.defaultTheme) ? siteDesign.defaultTheme : "day";
    const theme = previewTheme || readStoredTheme() || defaultTheme;
    const themeTransitionTimers = [];
    const themeTransitionDuration = 480;

    function activePalette(nextTheme) {
        const previewPalette = preview && params.get("palette");
        return previewPalette && validNumber.test(previewPalette)
            ? previewPalette
            : nextTheme === "night" ? siteDesign.nightPalette : siteDesign.dayPalette;
    }

    root.setAttribute("data-theme", theme);
    root.setAttribute("data-palette", String(activePalette(theme)));
    root.setAttribute("data-animation", String(siteDesign.tulipAnimation));
    root.setAttribute("data-appearance", String(siteDesign.tulipAppearance));
    root.setAttribute("data-toggle-variant", String(siteDesign.themeToggleVariant));
    root.setAttribute("data-hill-variant", String(siteDesign.themeToggleHillVariant));
    root.setAttribute("data-toggle-appearance", siteDesign.themeToggleAppearance);

    const previewSettings = [
        ["palette", "data-palette"],
        ["animation", "data-animation"],
        ["appearance", "data-appearance"],
        ["toggleVariant", "data-toggle-variant"],
        ["hillVariant", "data-hill-variant"]
    ];
    if (preview) {
        previewSettings.forEach(function ([parameter, attribute]) {
            const value = params.get(parameter);
            if (value && validNumber.test(value)) root.setAttribute(attribute, value);
        });
        if (params.get("reducedMotion") === "1") {
            root.setAttribute("data-preview-reduced-motion", "true");
        }
    }

    function startThemeTransition(nextTheme) {
        while (themeTransitionTimers.length) window.clearTimeout(themeTransitionTimers.pop());
        root.removeAttribute("data-theme-transition");
        document.querySelectorAll(".theme-toggle").forEach(function (button) {
            button.setAttribute("aria-disabled", "false");
        });

        const reducedMotion = root.hasAttribute("data-preview-reduced-motion")
            || (typeof window.matchMedia === "function"
                && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        if (reducedMotion || String(activePalette(nextTheme)) === root.getAttribute("data-palette")) return;

        const toNight = nextTheme === "night";
        const phase = toNight ? "dark-bridge-to-night" : "light-bridge-to-day";
        const middlePhase = toNight ? "light-bridge-to-night" : "dark-bridge-to-day";
        root.setAttribute("data-theme-transition", phase);
        document.querySelectorAll(".theme-toggle").forEach(function (button) {
            button.setAttribute("aria-disabled", "true");
        });

        themeTransitionTimers.push(window.setTimeout(function () {
            root.setAttribute("data-theme-transition", middlePhase);
        }, toNight ? 310 : 240));
        themeTransitionTimers.push(window.setTimeout(function () {
            root.setAttribute("data-theme-transition", "settle");
        }, themeTransitionDuration * 0.875));
        themeTransitionTimers.push(window.setTimeout(function () {
            root.removeAttribute("data-theme-transition");
            document.querySelectorAll(".theme-toggle").forEach(function (button) {
                button.setAttribute("aria-disabled", "false");
            });
        }, themeTransitionDuration));
    }

    function applyTheme(nextTheme, persist, animate) {
        if (!validTheme(nextTheme)) return;
        if (animate && root.getAttribute("data-theme") !== nextTheme) {
            startThemeTransition(nextTheme);
        }
        root.setAttribute("data-theme", nextTheme);
        root.setAttribute("data-palette", String(activePalette(nextTheme)));

        document.querySelectorAll(".theme-toggle").forEach(function (button) {
            const isNight = nextTheme === "night";
            button.dataset.theme = nextTheme;
            button.dataset.toggleVariant = root.getAttribute("data-toggle-variant");
            button.dataset.hillVariant = root.getAttribute("data-hill-variant");
            button.dataset.toggleAppearance = root.getAttribute("data-toggle-appearance");
            button.setAttribute("aria-pressed", String(isNight));
            button.setAttribute(
                "aria-label",
                isNight ? "Přepnout na denní režim" : "Přepnout na noční režim"
            );
            button.removeAttribute("hidden");
        });

        if (persist) {
            try {
                window.localStorage.setItem(storageKey, nextTheme);
            } catch {
                // Režim zůstává aktivní do odchodu ze stránky, i když úložiště není dostupné.
            }
        }
    }

    function initializeThemeToggle() {
        applyTheme(theme, false, false);

        document.querySelectorAll(".theme-toggle").forEach(function (button) {
            button.addEventListener("click", function () {
                if (button.getAttribute("aria-disabled") === "true") return;
                applyTheme(root.getAttribute("data-theme") === "night" ? "day" : "night", !preview, true);
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeThemeToggle, { once: true });
    } else {
        initializeThemeToggle();
    }
})();
