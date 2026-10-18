/*
 * Nastavení vzhledu webu divav.cz
 * ================================
 * Změňte číslo u požadované volby, uložte soubor a obnovte stránku.
 *
 *   colorPalette     1 = Warm Tulip (výchozí)   2 = Soft Sage   3 = Blush & Plum
 *                    4 = Golden Calm            5 = Evening Warmth (tmavá)
 *   tulipAnimation   1 = tulipán rozkvete       2 = plátky se rozestoupí
 *                    3 = plátky opadají         4 = květ se pootevře a text se rozbalí
 *   tulipAppearance  1 = ilustrovaný            2 = botanicky detailní
 *
 * Barvy palet jsou v css/palettes.css, animace a vzhledy tulipánů v css/tulips.css.
 * Číslo, ke kterému neexistuje varianta v CSS, se neprojeví a použije se varianta 1.
 * Skript se načítá v <head> před styly, aby barvy při načítání stránky neproblikly.
 */
(function () {
    "use strict";

    const siteDesign = {
        colorPalette: 1,
        tulipAnimation: 1,
        tulipAppearance: 1
    };

    const settings = [
        ["palette", "colorPalette"],
        ["animation", "tulipAnimation"],
        ["appearance", "tulipAppearance"]
    ];
    const variantNumber = /^[1-9][0-9]?$/;

    // Lokální náhled (npm run preview) smí variantu dočasně změnit adresou,
    // např. ?preview=1&palette=3. Na veřejném webu se tyto parametry ignorují.
    const host = window.location.hostname;
    const params = host === "localhost" || host === "127.0.0.1" ? new URLSearchParams(window.location.search) : null;
    const preview = params !== null && params.get("preview") === "1";

    const root = document.documentElement;
    settings.forEach(function (setting) {
        const attribute = setting[0];
        let value = String(siteDesign[setting[1]]);
        if (preview && variantNumber.test(params.get(attribute) || "")) {
            value = params.get(attribute);
        }
        if (variantNumber.test(value)) {
            root.setAttribute("data-" + attribute, value);
        }
    });
})();
