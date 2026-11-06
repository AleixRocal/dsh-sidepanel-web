# Navegador integrat a DSH Web — recerca, pla i implementació

Data: 2026-11-06 · DSH 0.2.1-rc.2 · perfil `web`

> **Actualització 2026-11-06 (implementat).** Les decisions d'aquest document ja
> són al codi: la pestanya ocupa el kind `browser` (els enllaços del xat hi
> arriben), tria portador per URL (públic → CDP, local → proxy), té presets
> d'emulació de dispositiu i normalitza les adreces (https per defecte, http per
> a hosts locals). El detall és a §7; els requisits de navegador i com fer servir
> **el teu** navegador són a §8 i §9, i les imatges/documentació de publicació a §7.7.

Aquest document respon tres preguntes:

1. Com funciona DSH Web per dins (per què hi ha «pestanyes» i qui decideix què s'obre).
2. Com funciona el navegador integrat que ja porta DSH i per què no s'activa aquí.
3. Com fem que **quan s'obre una pestanya o un enllaç, s'obri al navegador integrat**
   (el nostre, amb proxy i anotacions) i per què ara «no carrega webs».

---

## 1. Com funciona DSH Web

### 1.1 Perfil, bundles i capes de patch

Un perfil (`~/.dsh/profiles/web`) és una pila ordenada de capes:

```
@deepseek-ai/dsh-base          ← serveis del host
@deepseek-ai/dsh-web-app       ← composició web (client + host)
<bundles instal·lats>          ← dshmarket, plugins…
dsh-sidepanel-web              ← el nostre
~/.dsh/profiles/web/cordis.patch.yml  ← la teva capa (guanya)
```

Cada capa és un `cordis.patch.yml` amb entrades `insert` / `override` per `id`.
El nostre bundle només fa:

```yaml
- insert:
    - id: dsh-sidepanel-web
      name: "dsh-sidepanel-web"
```

El carregador munta **dues meitats** del mateix paquet:

| Meitat | Fitxer | Corre a | Pot fer |
| --- | --- | --- | --- |
| Host | `lib/index.js` | Node (dins el servidor web de DSH) | rutes HTTP, CDP, sistema de fitxers |
| Client | `lib/client.js` | navegador | React, slots, pestanyes, DOM |

El client es declara a `package.json`:

```json
"dsh": { "client": { "platform": "web", "immediately": true,
  "inject": ["@deepseek-ai/dsh-client-ui-conversation",
             "@deepseek-ai/dsh-client-ui-sidebar-right"] } }
```

`immediately: true` vol dir que el bundle s'injecta al boot (no pas quan es fa servir
per primera vegada). El fitxer ha de ser JavaScript ja compilat i registrar una
factory:

```js
window.__ModuleLoader__.load({ id: "dsh-sidepanel-web", factory(require) { … } });
```

### 1.2 Slots: on es pot dibuixar

El client no munta components «a sobre» de l'app: demana un **seient (slot)** i hi
registra un component. Els que ens interessen:

| Slot | Què és | Tipus |
| --- | --- | --- |
| `sidebar.right.pane.tab` | el cos d'una pestanya del panell dret, **keyed pel `id` del tipus** | keyed |
| `sidebar.right.pane.tab.title` | el títol/icona de la pestanya | keyed |
| `conversation.input.dock` | franja sobre el composer (on escrivim les anotacions) | list |
| `sidebar.right.tab.guide` | substitueix la guia buida | chain |

### 1.3 El registre de tipus de pestanya (`ctx.sidebarRightTabs`)

Un tipus de pestanya es declara en **dues etapes**:

```js
// 1) el tipus (estàtic, sense hooks)
ctx.sidebarRightTabs.register({
  id: "dsh-sidepanel-web",      // identitat única; també és la clau del cos
  kind: "sidepanel-web",        // discriminant que fa servir openTab()
  multiple: true,               // cada obertura = pestanya independent
  priority: "extension",        // extension > builtin > fallback
  keepMounted: true,
  title: () => t("Navegador"),
  guide: [{ id: "open", order: 70, icon: BrowserGlyph, title: … }],
});

// 2) el cos, keyed per l'id del tipus
ctx.slots.register({ name: "sidebar.right.pane.tab", key: "dsh-sidepanel-web" }, Panel);
```

Regles que importen (de `dsh-client-ui-sidebar-right`):

- `id` repetit → **throw**. `kind` pot tenir com a màxim **un builtin i una extensió**;
  l'extensió mana i el builtin torna quan aquella marxa. Aquesta és la porta per
  ocupar el kind `browser`.
- `priority`: `extension` (fora del producte, el més alt i el valor per defecte),
  `builtin`, `fallback`.
- Si no es declara `icon` a la guia, surt **el cub genèric** (era el nostre cas).
- `multiple: true` → cada obertura crea contingut independent; sense això, una
  pestanya per kind i panell.

### 1.4 Com s'obre una pestanya

Totes les vies passen per dos mètodes de `ctx.sidebarRight`:

```js
ctx.sidebarRight.openTab(kind, { params, paneId, replaceTab, preferNewPane, revealIfOpened });
ctx.sidebarRight.openResource("dsh-resource://…", { kind, params });
```

`params` arriba al cos com a `navigation.params` (JSON sense validar en runtime) i
`navigation.revision` puja a cada navegació. El cos ho llegeix amb el hook injectat:

```js
function Panel({ useTabInfo }) {
  const { tab } = useTabInfo();          // { sidebar, panel, tab }
  const initial = tab.navigation.params?.url;
}
```

`openResource` **només** accepta adreces `dsh-resource://`. Els enllaços `http(s)`
no passen pel registre de globs: van per `openTab`.

---

## 2. El navegador integrat que ja porta DSH

Paquet: `@deepseek-ai/dsh-client-ui-sidebar-browser` (entrada `ui-sidebar-browser`).

Fa exactament el que sembla: pestanyes de navegador HTTP(S) al panell dret, amb
adreça, enrere/endavant, recàrrega, «Obrir al navegador del sistema» i, a Desktop,
sandbox per pestanya.

```js
// la seva declaració (lib/client.js: browserDefinition)
{ id: "@deepseek-ai/dsh-client-ui-sidebar-browser",
  kind: "browser",            // ← la clau de tot
  multiple: true,
  priority: "builtin",
  keepMounted: desktop !== undefined,
  title: () => t("type.label"),
  guide: [{ id: "new", order: 30, icon: GuideArtworkBrowser, … }] }
```

### 2.1 Per què no el veus

Al bundle `dsh-web-app`, l'entrada ve desactivada fora de Desktop:

```yaml
- id: ui-sidebar-browser
  name: '@deepseek-ai/dsh-client-ui-sidebar-browser'
  disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"
```

És a dir: **al perfil `web` no hi ha cap tipus `browser` registrat**. Per això
`ctx.sidebarRightTabs.get("browser")` és `undefined` i el xat obre els enllaços
fora. Per activar-lo, una línia al patch del perfil:

```yaml
- id: ui-sidebar-browser
  disabled: false
```

### 2.2 Com obre els enllaços el xat (el punt clau)

`dsh-client-ui-chat`, a `openExternalLink`:

```js
openExternalLink: (url) => {
  if (linkOpening.getSnapshot() === "sidebar"
      && ctx.get("sidebarRightTabs")?.get("browser") !== void 0)
    ctx.sidebarRight.openTab("browser", { params: { url } });
  else
    window.open(url, "_blank", "noopener,noreferrer");
}
```

Dues condicions, totes dues necessàries:

1. **Preferència** `ui-chat.linkOpening === "sidebar"` (és el valor per defecte:
   `DEFAULT_LINK_OPENING = "sidebar"`). Es canvia a
   *Settings → General → Open chat links in* (`sidebar` | `new-tab`). La fila
   només apareix si hi ha un tipus `browser` registrat.
2. **Que existeixi un tipus amb `kind: "browser"`**. Ara no n'hi ha cap.

Conseqüència directa: si el nostre plugin registra `kind: "browser"`, tots els
enllaços HTTP(S) del xat obriran **la nostra** pestanya, amb `params.url`.

---

## 3. Per què «no carrega webs»

El nostre panell té dos portadors:

| Portador | Quan | Què passa |
| --- | --- | --- |
| iframe directe (live) | URL pública | el lloc decideix si es pot incrustar |
| proxy reescriptor | `localhost`, `*.local`, IP privades | funciona: és same-origin |

L'iframe **no és una limitació nostra**: si el lloc envia `X-Frame-Options` o
`Content-Security-Policy: frame-ancestors`, cap pàgina el pot incrustar. Google,
GitHub, la majoria de SaaS i sovint `deepseek.com` ho fan. Resultat: àrea en blanc,
sense missatge.

El proxy només accepta hosts local/dev **per disseny** (`isPrivateHost`), i no pot
trampejar un lloc públic: reescriure HTML aliè sense control acaba en cookies,
CORS, WebSockets i CSP trencats.

**Les tres vies tècniques reals:**

1. **Iframe** — zero cost, però només per als llocs que ho permeten.
2. **Proxy reescriptor** — perfecte per a dev local (ja funciona; verificat:
   reescriu `href/src/srcset/url()`, injecta el shim i l'overlay, refusa públics
   amb 403).
3. **CDP screencast** — el host renderitza la pàgina en un Chromium real i envia
   fotogrames; funciona amb **qualsevol** lloc. Ja està implementat a
   `lib/service.js` (`startStream` / `acquireStream` / `onFrame`, ruta
   `/api/sidepanel-web/stream`) i a `lib/cdp.js`; el client anterior
   (commit `1e5b478`) el feia servir amb `EventSource` + `<img>`.

Conclusió: perquè «carreguin webs» de veritat a Web cal mantenir el portador 1 per
als llocs que ho permeten i **recuperar el 3** per a la resta. El 2 es queda per a
local/dev, que és on aporta valor (DOM anotable).

### 3.1 La vista CDP encara és al fitxer

`lib/client.js` conserva **dues** implementacions senceres:

| Component | Línia | Estat des del 2026-11-06 |
| --- | --- | --- |
| `PanelTab` — vista CDP (stream + anotació per CDP) | 579 | **muntada per `BrowserTab`** sempre que la URL no sigui local |
| `IframePanel` — vista iframe/proxy | 2105 | només per a `localhost`, `*.local` i IP privades |
| `BrowserTab` — selector de portador | — | nou: decideix quin dels dos es munta i reacciona a `params.url` |

`PanelTab` ja consumeix `/status`, `/stream` (`EventSource`), `/element`, `/input`,
`/hover`, `/crop`… i totes aquestes rutes continuen vives a `lib/index.js` i
`lib/service.js` (verificat: Chrome arrenca, navega i fa captures en aquest entorn).

O sigui: recuperar la càrrega de webs **no és reescriure res**, és triar portador i
tornar a muntar `PanelTab` quan toqui.

---

## 4. Opcions d'integració

### Opció A — Activar el navegador de DSH (sense codi)

```yaml
- id: ui-sidebar-browser
  disabled: false
```

- ✅ Els enllaços del xat obren pestanya al panell dret.
- ✅ UX completa (adreça, historial, obrir al sistema, sandbox).
- ❌ No té proxy ni overlay: no es poden anotar elements.
- ❌ Segueix sense poder incrustar llocs amb XFO.

### Opció B — Ocupar el kind `browser` des del nostre plugin (recomanada)

```js
ctx.sidebarRightTabs.register({
  id: "dsh-sidepanel-web",
  kind: "browser",          // ← en lloc de "sidepanel-web"
  multiple: true,
  priority: "extension",    // guanya al builtin si algun dia s'activa
  keepMounted: true,
  title: () => t("Navegador"),
  guide: [{ id: "open", order: 70, icon: BrowserGlyph, … }],
});
```

I el cos ha de llegir el paràmetre:

```js
function Panel({ useTabInfo }) {
  const { tab } = useTabInfo();
  const [url, setUrl] = useState(() => normalizeUrl(tab.navigation.params?.url) || HOME);
  // …
}
```

- ✅ Cada enllaç del xat obre **la nostra** pestanya, amb proxy + anotacions.
- ✅ Cap canvi al nucli: és el camí oficial (extensió sobre builtin).
- ✅ La guia i `browser.new` segueixen funcionant (l'entry obre el `kind`).
- ⚠️ Cal suportar `multiple` (estat per pestanya, no un singleton) i el cas
  «sense params» (guia → portada).
- ⚠️ Si activem també el builtin, la nostra extensió mana i el seu cos no es munta.

### Opció C — Híbrid: dos tipus i mirall

Mantenir `sidepanel-web` (anotable) i activar el builtin per als enllaços, obrint
el mateix URL a tots dos.

- ❌ Dues pestanyes per enllaç, dues navegacions, estats divergents.
- Només té sentit si volem el navegador «net» a part de l'anotable.

**Recomanació: B**, amb una condició: abans cal arreglar la càrrega de webs
(§3), perquè si ocupem el kind i els llocs no carreguen, empitjorem l'experiència
respecte del builtin.

---

## 5. Pla concret

> Estat: **fet** (vegeu §7). Es manté aquí com a registre de la decisió.

1. **Triar portador per URL** dins el cos de la pestanya:
   - `localhost` / `*.local` / IP privada → `IframePanel` (proxy, native, overlay);
   - qualsevol altra → `PanelTab` (CDP stream, funciona a qualsevol lloc).
   Un commutador manual («Vista nativa / Vista remota») cobreix els casos dubtosos.
2. **Un sol component de pestanya** que decideixi el portador i passi la URL
   inicial als dos, perquè `params.url` funcioni igual.
3. **Ocupar `kind: "browser"`** — `multiple: true`, llegir
   `navigation.params.url`, ignorar `revision` 0 (guia).
4. **Estat per pestanya** — moure l'estat singleton (`url`, `history`, `picks`,
   `frame`) a un àmbit per ocurrència; amb `multiple`, cada pestanya ha de tenir
   el seu historial.
5. **Verificació** — enllaç al xat → pestanya nostra amb la URL; URL local →
   proxy amb overlay; URL pública → stream.

Fitxers tocats: `lib/client.js` (registre + selector de portador). La resta
(`service.js`, `index.js`, `page.js`, `proxy.js`) ja hi és.

---

## 6. Referències exactes

| Tema | Paquet / símbol |
| --- | --- |
| Registre de tipus | `@deepseek-ai/dsh-client-ui-sidebar-right` → `SidebarRightTabRegistry`, `tab-registry.d.ts` (`get(kind)`, bandes de prioritat) |
| Obrir pestanya | `ISidebarRight.openTab` / `openResource`, `service.d.ts:131` |
| Paràmetres | `SidebarRightTabNavigation` (`contract/slots.d.ts:113-124`) |
| Navegador de DSH | `@deepseek-ai/dsh-client-ui-sidebar-browser`, `browserDefinition` (`kind:"browser"`, `multiple:true`) |
| Desactivat a Web | `@deepseek-ai/dsh-web-app/cordis.patch.yml` (`ui-sidebar-browser`, `disabled: !!js …`) |
| Enllaços del xat | `@deepseek-ai/dsh-client-ui-chat` → `openExternalLink`, `linkOpening` |
| Preferència | *Settings → General → Open chat links in* (`sidebar` per defecte) |
| Obrir al sistema | `@deepseek-ai/dsh-host-open-in-app` + `dsh-client-ui-open-in-app` |


---

## 7. Què s'ha implementat (2026-11-06)

### 7.1 Una sola pestanya, dos portadors

`BrowserTab` (a `lib/client.js`) decideix el portador per URL:

| URL | Portador | Per què |
| --- | --- | --- |
| `http(s)` pública | `PanelTab` (CDP screencast) | funciona a **qualsevol** lloc; un iframe no pot incrustar res amb `X-Frame-Options`/CSP |
| `localhost`, `*.localhost`, `*.local`, `127/10/192.168/172.16-31`, `169.254`, `[::1]`, IPv6 ULA | `IframePanel` (proxy DSH) | render natiu same-origin + overlay anotable, sense cost de screencast |

El commutador hi és **sempre**, en tots dos sentits:

- vista nativa → botó **Vista remota (CDP)** a la barra (sempre visible);
- vista remota → menú `⋯` → **Native view (proxy)**, quan la URL és local
  (el proxy només accepta hosts local/dev per disseny);
- escrivint una URL pública dins la vista nativa, salta sol a la remota.

La tria **es recorda per origen** (`localStorage: sidepanel-web:carrier:<origin>`):
si un lloc local no funciona bé pel proxy i el passes a CDP, la propera vegada
s'obre directament en CDP.

Això és el que arregla el símptoma «www.google.com ha rechazado la conexión»:
la pestanya muntava **sempre** l'iframe, i Google (com GitHub, DeepSeek i la
majoria de SaaS) prohibeix ser incrustat. Ara Google s'obre pel portador CDP,
que el renderitza de veritat.

### 7.2 La pestanya ocupa `kind: "browser"`

```js
ctx.sidebarRightTabs.register({
  id: "dsh-sidepanel-web",
  kind: "browser",        // ← el xat obre aquí els enllaços
  multiple: false,
  keepMounted: true,
  priority: "extension",
  ...
});
```

- `dsh-client-ui-chat` fa `openTab("browser", { params: { url } })` quan
  `ui-chat.linkOpening === "sidebar"` i existeix un tipus amb aquest `kind`.
- `multiple: false` és deliberat: el host manté **una** pàgina CDP, i diverses
  ocurrències de pestanya es disputarien la mateixa pàgina. Re-obrir un
  enllaç revela la pestanya i la navega (`navigation.revision` puja).
- `params.url` es llegeix amb `useTabInfo()` i es navega quan canvia la revisió;
  `revision: 0` (guia) obre la pàgina d'inici.

### 7.3 Emulació de dispositiu

Presets al host (`DEVICE_PRESETS`, `lib/service.js`) i al menú de la pestanya:

| `preset` | Viewport | DPR | Tàctil | UA |
| --- | --- | --- | --- | --- |
| `responsive` | el del panell | 1 | no | la del navegador |
| `desktop` | 1280×800 | 1 | no | la del navegador |
| `laptop` | 1440×900 | 1 | no | la del navegador |
| `tablet` | 768×1024 | 2 | sí | iPad |
| `mobile` | 390×844 | 3 | sí | iPhone |
| `android` | 412×915 | 2.625 | sí | Pixel 7 |

S'apliquen amb `Emulation.setDeviceMetricsOverride` +
`setTouchEmulationEnabled` + `setUserAgentOverride` i un `Page.reload` (la
capacitat tàctil i el layout mòbil només es veuen després de recarregar).

Detalls que importen:

- amb un preset fix, `/viewport` (que segueix el panell) **no** s'aplica: si no,
  canviar la mida del panell trencaria l'emulació;
- `responsive` esborra override + UA + tàctil i recarrega si veníem d'un preset;
- el preset viu a la sessió CDP: es reaplica quan s'adopta una pàgina nova o es
  canvia de target;
- configuració inicial via `config.device` al `cordis.patch.yml`.

### 7.4 Proxy: import maps i galetes

Dos errors reals trobats provant `https://ubuntuserver.local` (una app de catàleg
amb mòduls ES):

1. **Import maps.** L'app declara
   `<script type="importmap">{"imports":{"rc-ui":"/static/js/rc-ui.js"}}</script>`.
   El reescriptor només tocava atributs `src`/`href`, no el JSON de l'import map,
   així que `import … from "rc-ui"` anava a `/static/js/rc-ui.js` **del servidor
   de DSH** → 404 → el mòdul d'entrada no s'executava. Símptoma exacte: la pàgina
   es veu (HTML+CSS) però «0 de 0 productes» i cap targeta. Ara `rewriteHtml`
   reescriu `imports` i `scopes` de l'import map cap al proxy.
2. **Galetes de DSH filtrades.** El proxy reenviava la capçalera `cookie` del
   navegador (la sessió de DSH) al lloc de destí. Ara es descarta i només
   s'envia el cookie jar propi de l'origen destí.
3. **`data-action` tractat com a URL.** La regla d'atributs era
   `\b(action)=`, i `\b` també casa dins de `data-action="family"`. El proxy el
   convertia en la URL del proxy, però aquest lloc fa servir `data-action` com a
   **nom d'acció** (`actions[el.dataset.action]`): el handler no es trobava i els
   botons de família no feien res. Ara la regla és `(?<![\w-])action=` i només
   reescriu l'atribut real dels formularis; `data-src` continua reescrivint-se
   perquè sí que és una URL.

4. **Els enllaços es navegaven a un camí escapçat.** L'overlay intercepta el
   clic i reconstrueix la URL de destí des del camí del proxy. La versió anterior
   agafava només el segment després de la primera barra:
   `/api/sidepanel-web/p/<token>/producte/A2082` → `https://…/A2082` (404 del
   lloc). Ara agafa **tot** el que hi ha després del token
   (`targetUrlFrom()` a `lib/page.js`, compartida amb el test). Verificat:
   clicar producte / consultes / login emet
   `https://ubuntuserver.local/producte/A2082`, `…/consultes_pintura` i
   `…/configuracio/login`.

5. **JavaScript en línia tractat com a marcatge.** La regla `url(...)` s'aplicava
   a tot el document i, amb el flag `i`, també casava `URL.createObjectURL(blob)`:
   el convertia en `createObjecturl(/api/…/blob)`, que el navegador llegia com un
   literal regex → `SyntaxError: Invalid regular expression flags` a la pàgina
   de comparar. Ara `rewriteHtml` **separa els blocs `<script>`**: els scripts
   només reben la reescriptura d'import map i de rutes `_next`; els atributs i
   `url()` s'apliquen només al marcatge, i `url()` només dins de `<style>` i dels
   atributs `style="…"` (amb gestió de cometes encaixades).

6. **`fetch("/camí/absolut")` no passava pel proxy.** El shim només reescrivia
   URLs relatives que ja quedaven sota el prefix i URLs absolutes del lloc; un
   camí arrel com `fetch("/producte/M5911V3/compare/fragment")` anava al servidor
   de DSH (404) i la comparació deia «No s'ha pogut carregar la comparació». Ara
   `proxifyUrl()` (exportada i injectada al shim) també prefixa els camins arrel.
7. **Regressió meva a 0.2.4:** en separar els blocs `<script>` del marcatge,
   l'atribut `src` de `<script type="module" src="/static/js/app.js">` va deixar
   de reescriure's → els mòduls ES es demanaven a DSH (404). Ara
   `rewriteScriptBlock` reescriu l'atribut `src` de l'etiqueta d'obertura abans
   de tocar import maps i rutes `_next`.
8. **URLs dins de `<meta content>`.** `rc-ui.js` llegeix la ruta del sprite
   d'icones de `<meta name="rc-icon-sprite" content="/static/icons/sprite.svg">`
   i la fa servir en elements creats per JS (on no arriba cap reescriptura
   d'atribut). Ara els `content` que comencen per `/` es reescriuen; les
   descripcions (text) no es toquen.

Els vuit casos queden clavats a [test/proxy-smoke.mjs](<test/proxy-smoke.mjs>)
(`npm run test:proxy`): import map, `data-action`, `action=` de formulari,
enllaç del proxy → camí sencer, JS en línia intacte, `src` de `<script module>`,
`content` de `<meta>` amb URL i `proxifyUrl` per a camins arrel.

### 7.5 Coordenades correctes amb DPR i screencast escalat

Els clics/el hover/les anotacions es calculaven amb els píxels de la imatge.
Amb `deviceScaleFactor > 1` (o si el screencast reduïa a `maxWidth=1000`) això
desplaçava l'element triat. Ara l'host retorna el viewport CSS a `/status`
(`viewport: {w,h,dpr}`) i el client mapeja sempre contra aquest valor
(`vpRef` / `remotePoint`).

### 7.6 Adreces: esquema automàtic i una sola regla

Escriure `example.com` a la barra d'adreces ja no dona error: s'obre
`https://example.com/`. La regla viu a `lib/url.js` i està **mirallada** dins de
`lib/client.js` (el client no pot importar mòduls del host: el carrega el
`__ModuleLoader__` del navegador). `test/url-smoke.mjs` extreu el bloc del client
i passa el mateix corpus per les dues implementacions, de manera que una
divergència trenca el test.

| Entrada | Resultat | Per què |
| --- | --- | --- |
| `example.com` | `https://example.com/` | https per defecte |
| `example.com:8443` | `https://example.com:8443/` | `host:port` no és un esquema |
| `localhost:3000`, `shop.local`, `192.168.1.20:8080`, `10.0.0.5`, `[::1]:3000` | `http://…` | els servidors de desenvolupament no solen tenir TLS |
| `//example.com/x` | `https://example.com/x` | URL protocol-relative |
| `http:example.com` | `http://example.com/` | el navegador ho accepta igualment |
| `mailto:`, `file:`, `javascript:`, `data:`, `ftp:` | `""` (rebutjat) | no són pàgines web |
| `localhost:abc`, `https://`, text amb espais al host | `""` | URL invàlida |

La ruta host `/api/sidepanel-web/navigate` aplica la mateixa funció, així que una
crida directa a l'API no pot saltar-se la regla. També s'actualitza la barra
d'adreces amb la URL canònica i el `title` de l'input explica que el `https://`
s'afegeix sol.

### 7.7 Imatges de documentació i entrada al market

Les quatre imatges de `assets/screenshots/` es generen amb
`test/preview/mockups.mjs` (1600×1000 CSS a 2×, PNG 3200×2000):

| Fitxer | Què mostra |
| --- | --- |
| `01-browser-panel.png` | el panell al costat d'una conversa de DSH (mockup) |
| `02-annotate.png` | pin sobre el CTA, targeta de nota i payload a punt d'inserir |
| `03-devices.png` | emulació de telèfon 390×844 amb el menú de presets obert |
| `04-how-it-works.png` | els dos portadors i el camí de l'anotació |

Regles de privacitat que compleixen i que s'han de mantenir si es regeneren:

- el panell és el **codi real** (`lib/client.js`) contra el backend mock, però el
  voltant (xat, espai de treball, sessió) és HTML inventat;
- la botiga és **Northwind Supply**, fictícia, al domini reservat `example.com`;
- cap captura de la GUI real, cap compte, cap client, cap ruta personal, cap
  token: el contingut està fixat a `test/preview/shell.html`, `diagram.html` i
  `fixture-page*.svg`;
- `screenshots.json` declara les quatre imatges per al storefront del market.

L'entrada del market és a `market/entry.yml` (una sola entrada; la descripció va
entre cometes perquè conté `: ` i YAML no la llegeixi com una clau) i la PR afegeix
`data/plugins/AleixRocal__dsh-sidepanel-web.yml`; el CI del registre valida edat
del repo, manifest `dsh.bundle`, tema `dsh-plugin`, icona i YAML.

---

## 8. Requisits de navegador (què cal tenir)

El plugin **no descarrega res**: necessita un Chrome/Chromium al host on corre
DSH.

| Requisit | Estat en aquest servidor |
| --- | --- |
| Binari Chrome/Chromium | ✅ `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` (configurat al perfil `web`) |
| Headless | ✅ per defecte (`headless: true`); aquest servidor no té escriptori |
| Perfil persistent | ✅ `~/.local/share/dsh-sidepanel-web/profile` (les sessions/cookies sobreviuen reinicis) |
| Xarxa sortint | ✅ verificat: `google.com` i `deepseek.com` carreguen i es capturen |

Si el binari no hi és (`findChrome` no troba res), el panell mostra l'error de
connexió i cal posar `chromePath` a la configuració del plugin. En un contenidor
el launcher ja afegeix `--no-sandbox`/`--disable-dev-shm-usage` quan cal.

Un Chrome *headless* n'hi ha prou per navegar, autenticar-se i anotar: el
screencast és la pantalla. `headless: false` només té sentit amb un `DISPLAY`.

---

## 9. Fer servir **el teu** navegador (el que obre la GUI de DSH)

### 9.1 Per què no és automàtic

La GUI de DSH es renderitza al navegador del client (el teu portàtil), però el
plugin corre al host de DSH i només pot parlar CDP amb un navegador **d'aquella
màquina**. Una pàgina web no pot «entrar» al navegador que la mostra: cal que
aquell navegador exposi un endpoint CDP o que hi hagi un pont d'extensió.

L'altre repo (`zengxiaolou/dsh-annotate-browser`) fa exactament el mateix que
aquest: mira un endpoint existent (`~/.local/state/ego-lite-linux/browser.json`,
que escriu el pont «ego»), o un `wsUrl` de la configuració, i si no en troba cap
**arrenca el seu propi Chrome**. No s'enganxa al navegador de la GUI.

### 9.2 Ordre de resolució (implementat)

1. `wsUrl` de la configuració del plugin (`ws://…/devtools/browser/…`);
2. variable d'entorn `DSH_SIDEPANEL_WS_URL`;
3. `cdpUrl` de la configuració (`http://127.0.0.1:9222` → es resol amb `/json/version`);
4. `~/.local/state/dsh-sidepanel-web/browser.json` (`{"wsUrl": "…"}` o `{"httpUrl": "…"}`);
5. `~/.local/state/ego-lite-linux/browser.json` (compatibilitat amb el pont ego);
6. escaneig ràpid de ports locals: 9222, 9223, 9224, 9225, 9333;
7. si no hi ha res: arrenca un Chrome amb perfil persistent.

Els passos 1–3 i 6 són la resposta a «vull el mateix navegador»: si exposes el
teu Chrome, el panell el fa servir tal qual (mateixes galetes, mateixos logins,
mateixes extensions).

### 9.3 Receptes

**A. DSH i el navegador a la mateixa màquina**

```sh
# Chrome ≥ 136 no deixa depurar el perfil per defecte: cal un --user-data-dir
google-chrome --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.config/chrome-dsh" &
```

Després, a *Settings → dsh-sidepanel-web*, posa `cdpUrl = http://127.0.0.1:9222`
(o deixa-ho buit: l'escaneig el troba sol). Reinicia el panell.

**B. DSH en un servidor i tu al portàtil**

```sh
# al servidor: publica el 9222 del servidor al teu portàtil NO serveix;
# el que cal és que el servidor arribi al teu Chrome. Obre un túnel invers:
ssh -R 9222:127.0.0.1:9222 usuari@servidor
```

(el servidor veu `127.0.0.1:9222` → el teu Chrome). Alternativa equivalent:
`ssh -L 9222:127.0.0.1:9222 server` des del portàtil si el Chrome és al servidor.

**C. Pont d'extensió (ego)**

Si ja tens el pont ego en marxa, `~/.local/state/ego-lite-linux/browser.json`
conté el `wsUrl` i el plugin l'agafa sol. No cal configurar res.

**D. Sense res de l'anterior**

El plugin arrenca el seu Chromium headless amb un perfil persistent. És el mode
per defecte aquí: inicia sessió una vegada a Google/GitHub dins del panell i les
galetes es queden entre reinicis de DSH.

> Nota: quan s'enganxa a un navegador aliè, el plugin **no adopta** cap pestanya
> existent; crea la seva pròpia (o recupera la que va crear abans, pel
> `targetId` desat). Així no et «segresta» la pestanya on treballes.

---

## 10. Verificació feta

| Prova | Resultat |
| --- | --- |
| `node --check` de tots els fitxers | ✅ |
| Chrome arrencat + `google.com` carregat i capturat | ✅ 132 KB JPEG |
| Presets `mobile` / `tablet` / `desktop` / `responsive` | ✅ `innerWidth` 392/768/1280/1280, UA iPhone/iPad/desktop, `ontouchstart` i `pointer:coarse` correctes |
| Enganxar-se a un Chrome extern per `cdpUrl` i per escaneig de port | ✅ |
| Render del panell amb React real (preview) sense excepcions | ✅ |
| Menú de dispositiu → `POST /device` → xip actiu | ✅ |
| `params.url` pública → navegació CDP; local → iframe proxy | ✅ |
| Commutador natiu ↔ remot en tots dos sentits + preferència per origen | ✅ |
| Proxy amb import map: catàleg real carrega «24 de 511 productes» i imatges | ✅ |
| Filtrar per família a la vista nativa: clic → «15 de 15», ARC actiu | ✅ |
| Clic en un producte a la vista nativa → `…/producte/A2082` (no `/A2082`) | ✅ |
| Pàgines de producte i de comparar pel proxy: render sencer, 0 excepcions | ✅ |
| Comparar: fragment carregat i estructura KAIS/Inventor visible, 0 errors HTTP | ✅ |
| `npm test`: regla d'adreces (host + client) i reescriptura del proxy | ✅ |
| `npm run mockups`: 4 PNG 3200×2000 a `assets/screenshots/` | ✅ |
| Contingut de les imatges sense dades reals (revisió manual + fixtures) | ✅ |

Pendent de provar dins la GUI real després de refrescar (el host ha de servir
`lib/client.js` nou): enllaç del xat → pestanya amb la URL; canvi de preset →
recàrrega amb viewport/UA del dispositiu; escriure `example.com` i comprovar que
la barra mostra `https://example.com/`.
