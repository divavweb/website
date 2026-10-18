/*
 * Otevře tulipán služby, na který vede odkaz s kotvou, např. sluzby.html#mediace
 * z úvodní stránky. Bez JavaScriptu stránka ke službě jen sjede a obsah se otevře
 * kliknutím; texty služeb jsou vždy přímo v HTML.
 */
(function () {
    "use strict";

    function openTulipFromHash() {
        let id;
        try {
            id = decodeURIComponent(window.location.hash.slice(1));
        } catch (error) {
            return;
        }
        if (!id) {
            return;
        }
        const target = document.getElementById(id);
        if (target && target.matches("details.tulip")) {
            target.open = true;
        }
    }

    openTulipFromHash();
    window.addEventListener("hashchange", openTulipFromHash);
})();
