# Web Dity Vávrové

Statický český web psychologického poradenství a dalších služeb ve Valašském Meziříčí. Stránky jsou ručně udržované HTML, CSS a JavaScript bez frameworku a bez produkčního sestavení. Produkční doména je `https://divav.cz/`; veřejné adresy stránek zůstávají zachované.

## Struktura

- `index.html` – úvodní stránka, lokální strukturovaná data a hlavní interní odkazy.
- `pages/omne.html`, `pages/sluzby.html`, `pages/cenik.html`, `pages/kontakt.html` – obsahové stránky.
- `css/styles.css` – společné rozvržení, typografie, navigace, patička a ovládací prvky.
- `css/palettes.css` – pět sad sémantických barevných proměnných.
- `css/tulips.css` a `pages/sluzby.html` – vzhled a CSS animace tulipánového přehledu služeb.
- `js/design.js` – jediná konfigurace aktivní palety, animace a vzhledu tulipánů.
- `js/tulips.js` – otevření služby odkazované pomocí URL kotvy; obsah funguje i bez JavaScriptu.
- `images/` – fotografie, logo, loga organizací a optimalizované varianty WebP.
- `robots.txt`, `sitemap.xml`, `CNAME` a `_config.yml` – soubory pro crawl a GitHub Pages/Jekyll.
- `tools/design-preview.mjs` – lokální náhled stránek a porovnání variant; není veřejnou stránkou.
- `tests/` – rychlé statické testy a Playwright testy vykreslených stránek a interakcí.

## Spuštění a testy

Web lze otevřít jako statické soubory, ale pro úplný místní náhled doporučujeme Node.js 20 nebo novější:

```sh
npm ci
npm run preview
```

Otevřete `http://127.0.0.1:4173/__design-preview` pro výběr stránky a variant nebo `http://127.0.0.1:4173/__design-matrix` pro matici všech tulipánů. Server poslouchá pouze na loopback rozhraní. Po dokončení jej zastavte pomocí `Ctrl+C`.

Playwright používá Chromium. Pokud jeho prohlížeč není nainstalovaný:

```sh
npx playwright install chromium
```

Spuštění kontrol:

```sh
npm test
npm run test:browser
npm run test:all
```

V omezených macOS/sandbox prostředích může být nutné spustit Chromium v režimu jednoho procesu a nastavit cestu k již nainstalovanému prohlížeči:

```sh
PW_SINGLE_PROCESS=1 PLAYWRIGHT_BROWSERS_PATH="$TMPDIR/ms-playwright" npm run test:browser
```

Prohlížečové testy obsluhují lokální soubory přes Playwright routing, takže nepotřebují otevřený síťový port. Externí Calendly a Mapy.cz se při nich nahrazují testovací odpovědí; jejich skutečnou dostupnost je nutné ověřit ručně.

## Úprava textů, obrázků a služeb

- Texty měňte přímo v odpovídajícím HTML. Zachovejte českou diakritiku, přístupnou hierarchii nadpisů a ověřené znění profesních informací.
- Při úpravě stránky aktualizujte její jedinečný `<title>`, popis `meta[name="description"]`, canonical a sociální metadata. Canonical, `og:url` a záznam v `sitemap.xml` musí ukazovat na tutéž veřejnou adresu.
- Kontaktní údaje jsou opakovány na stránkách a v JSON-LD na homepage; měňte je společně. Do strukturovaných dat nepřidávejte neověřené ceny, hodnocení, otevírací dobu, členství ani kvalifikace.
- Při výměně fotografie aktualizujte `src`, případné `srcset`, rozměry `width`/`height` a věcný text `alt`. Dekorativní obrázek má `alt=""`. Obrázky před nahráním přiměřeně zmenšete a zkontrolujte, že neobsahují soukromá metadata, například GPS polohu.
- Služby jsou na stránce `pages/sluzby.html` jako nativní prvky `<details class="tulip">`. Upravte název v `<summary>` a obsah v `.tulip-content`. Při přidání služby jí dejte jedinečné stabilní `id` a podle potřeby přidejte odkaz z homepage. Nepřidávejte tvrzení o léčebném výsledku ani jiné neověřené informace.

## Změna vzhledu

V `js/design.js` změňte právě tři číselné hodnoty. Není zde veřejný přepínač motivu:

```js
const siteDesign = {
    colorPalette: 1,
    tulipAnimation: 1,
    tulipAppearance: 1
};
```

**Palety:** 1 Warm Tulip, 2 Soft Sage, 3 Blush & Plum, 4 Golden Calm, 5 Evening Warmth. Celé sady proměnných jsou v `css/palettes.css`. Nová paleta musí definovat všechny existující barevné tokeny, splnit kontrastní požadavky a být doplněna do komentáře konfigurace a testů.

**Animace:** 1 rozkvétá, 2 rozestupuje plátky, 3 nechává plátky jemně opadat, 4 mírně otevírá květ a rozbaluje obsah. **Vzhledy:** 1 měkká ilustrace, 2 detailnější botanicky laděný vektor. Animace a vzhledy používají stejné HTML i obsah; jejich CSS je v `css/tulips.css`, SVG kresba v `pages/sluzby.html`. Text zůstává přímo v HTML. Pro nové varianty rozšiřte příslušné selektory `[data-animation="N"]` či `[data-appearance="N"]`, aktualizujte výběr variant v náhledu a přidejte test.

Animované obrázky jsou udržovatelné vektorové ilustrace, nikoli fotorealistická botanická grafika. Přesné zobrazení se může mezi prohlížeči lišit; varianta s rozbalováním výšky závisí na podpoře CSS `::details-content` a `interpolate-size`. Při `prefers-reduced-motion` jsou pohybové efekty zkráceny na zanedbatelnou dobu.

## Bezpečná údržba a publikování

Projekt se publikuje jako statický web přes GitHub Pages/Jekyll z kořene repozitáře. `_config.yml` vylučuje README, dokumentaci, testy, nástroje a vývojové závislosti z veřejného výstupu. Produkční web nemá build ani runtime závislost; Playwright je pouze vývojová závislost.

Před odevzdáním změn:

1. Spusťte `npm ci` a `npm run test:all`.
2. Projděte `git diff` a ověřte změněný text, kontakty, ceny, SEO metadata a lokální obrázky.
3. Změny publikujte pouze standardním schváleným postupem repozitáře. Tento projektový návod nespouští ani neprovádí nasazení.
4. Po publikaci ověřte hlavní stránky, rezervaci a mapu. Interní vývojové dokumenty jsou lokální, Git-ignored a vyloučené z Jekyll publikace.

Nepřidávejte přihlašovací údaje, neveřejné informace o klientech ani produkční tajné údaje do repozitáře. Web sám nenačítá analytiku ani vzdálené skripty. Kalendář Calendly a mapa jsou obsah třetích stran vložený přes iframe; mohou uplatnit vlastní zásady soukromí. GitHub Pages nemusí umožnit vlastní HTTP bezpečnostní hlavičky. CSP je ověřována lokálním náhledovým serverem; případné produkční hlavičky vyžadují podporu hostingu nebo proxy a musí být ověřeny po nasazení.

## SEO úkoly vyžadující majitelku webu

Repozitář nemá přístup k externím účtům a nepoužívá produkční přihlašovací údaje. Majitelka musí mimo repozitář:

- ověřit aktuální profesní status, tituly, výcvik, členství, ceny, kontakty a přesné znění zdravotních či právních tvrzení;
- ověřit Google Business Profile, jeho kategorii a shodu jména, adresy, telefonu, webu a objednávacího odkazu s realitou;
- ověřit záznamy v Google Search Console a Seznam Webmaster, odeslat `https://divav.cz/sitemap.xml` a po publikaci sledovat indexaci;
- udržovat konzistentní a pravdivé údaje v relevantních místních a profesních adresářích;
- po nasazení ručně zkontrolovat HTTPS, přesměrování doménové varianty, skutečný rezervační kalendář a mapu na mobilu.

Ověření domény v Search Console, změny DNS/hostingu, aktualizace externích profilů a publikování jsou ruční úkony majitelky. SEO úpravy nezaručují konkrétní pozici ve vyhledávání.
