<p align="center">
  <img src="https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/banner.png" alt="dsh-sidepanel-web — un navegador al panell dret de DSH amb anotacions DOM que arriben al xat" width="100%">
</p>

<p align="center">
  <strong>Un navegador al panell dret de DSH — anota qualsevol pàgina en el seu DOM i envia l'anotació al xat.</strong>
</p>

<p align="center">
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/AleixRocal/dsh-sidepanel-web/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/releases"><img alt="Última versió" src="https://img.shields.io/github/v/release/AleixRocal/dsh-sidepanel-web?sort=semver&label=release&display_name=tag"></a>
  <a href="https://www.npmjs.com/package/dsh-sidepanel-web"><img alt="Paquet npm" src="https://img.shields.io/npm/v/dsh-sidepanel-web"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/pkgs/npm/dsh-sidepanel-web"><img alt="GitHub Packages" src="https://img.shields.io/badge/GitHub%20Packages-mirror-24292f?logo=github"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/LICENSE"><img alt="Llicència MIT" src="https://img.shields.io/github/license/AleixRocal/dsh-sidepanel-web"></a>
  <img alt="DSH 0.2.1-rc.2 a 0.3" src="https://img.shields.io/badge/DSH-0.2.1--rc.2%20%E2%86%92%200.3-4f46e5">
  <img alt="Node 22.19+" src="https://img.shields.io/badge/node-%E2%89%A522.19-339933?logo=nodedotjs&logoColor=white">
  <a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin"><img alt="Market: listed" src="https://img.shields.io/badge/market-listed-2ea44f"></a>
</p>

<p align="center">
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.md">English</a> · Català · <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.zh.md">中文</a>
</p>

`dsh-sidepanel-web` afegeix una pestanya **Navegador** al panell dret de DeepSeek Harness Web. És un navegador real al costat de la conversa, i pot convertir qualsevol element de la pàgina en un missatge precís per a l'agent.

Tria el botó, el camp o la targeta de què parles, escriu què cal canviar i insereix-ho. El missatge porta el selector de l'element, el text, un fragment d'HTML, els estils calculats, la mida i la posició, i una captura amb l'anotació marcada. L'agent ja no ha d'endevinar a quin element et refereixes, i tu ja no has de descriure'l amb coordenades ni un munt de captures.

**Codi:** [github.com/AleixRocal/dsh-sidepanel-web](https://github.com/AleixRocal/dsh-sidepanel-web) · **Paquet:** [npmjs.com/package/dsh-sidepanel-web](https://www.npmjs.com/package/dsh-sidepanel-web)

> [!TIP]
> **Dos portadors, un sol flux.** Les pàgines que construeixes — `localhost`, `*.local`, IP privades, servidors de desenvolupament amb certificats autosignats — passen per un proxy same-origin i continuen sent totalment interactives. Les pàgines públiques les renderitza un Chromium real al host via CDP, així que `X-Frame-Options` i CSP no les poden bloquejar. El panell tria sol; el commutador és a un clic.

![DSH Web amb el panell Navegador obert al costat d'una conversa](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/01-browser-panel.png)

<p align="center"><em>Captures mockup: la botiga, la conversa i les URL són inventades. No mostren cap compte ni dada de client real.</em></p>

## Índex

- [Com es fa servir](#com-es-fa-servir)
- [Què arriba al xat](#què-arriba-al-xat)
- [Per què anotar en el DOM](#per-què-anotar-en-el-dom)
- [Els dos portadors](#els-dos-portadors)
- [Funcions](#funcions)
- [Inici ràpid](#inici-ràpid)
- [Ús](#ús)
- [Configuració](#configuració)
- [Com funciona](#com-funciona)
- [Preguntes freqüents](#preguntes-freqüents)
- [Captures](#captures)
- [Captures i privacitat](#captures-i-privacitat)
- [Seguretat](#seguretat)
- [Limitacions](#limitacions)
- [Desenvolupament](#desenvolupament)
- [Canvis](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CHANGELOG.md)
- [Market](#market)
- [Contribuir](#contribuir)
- [Crèdits](#crèdits)
- [Llicència](#llicència)

## Com es fa servir

1. **Obre la pàgina.** Desplega el panell dret i tria **Navegador**. Escriu `localhost:5173`, `shop.local` o `example.com`: l'esquema s'afegeix sol (`http://` per als hosts locals, `https://` per als públics).
2. **Assenyala l'element.** Fes clic a **Anotar**, passa el ratolí per la pàgina i clica el botó, el camp o la targeta que vols. La targeta de nota mostra què has triat. Escriu què cal canviar: *fes aquesta acció primària sticky al mòbil*, *aquest camp hauria de ser obligatori*, *iguala aquesta targeta al disseny*.
3. **Envia-ho al xat.** Tria **Afegeix a la llista** per continuar anotant i després **Insereix**. El composer rep el text de l'anotació i una captura anotada. Envia-ho a l'agent.

Ni coordenades ni «el botó blau de baix». L'anotació diu com es diu l'element, on és i què vols canviar.

## Què arriba al xat

Cada anotació és un bloc de text, seguit d'una imatge amb tots els picks marcats:

```text
[Annotation 1] button#save.primary
· Selector: #save
· Text: Save changes
· HTML: <button id="save" class="btn primary" type="button">Save changes</button>
· Styles: display=inline-block; position=static; color=rgb(255, 255, 255); background=rgb(37, 99, 235); font=…; padding=12px 20px; radius=8px
· Position: 132×40 @ (24, 680)
· Page: Settings https://localhost:5173/settings
· Note: Make this primary action sticky on mobile
· Screenshot: ~/.dsh/data/dsh-sidepanel-web/crops/…
```

> [!NOTE]
> L'exemple mostra el payload amb la interfície en anglès. Amb la interfície en castellà, les etiquetes surten en castellà; els valors (selector, HTML, estils, posició) són els mateixos.

- **El text és un punter que l'agent pot seguir.** Rep la identitat de l'element (tag, id, classes, selector), un fragment d'HTML, els estils calculats que normalment importen (display, position, colors, font, padding, radius), la mida i la posició, la URL i el títol de la pàgina, i la teva nota. Pot fer servir el selector i l'HTML per trobar el component al codi, i els estils i la posició per raonar sobre el layout.
- **La imatge és el context.** En inserir, es captura una vista de la pàgina amb cada pick numerat i emmarcat. DSH mostra una imatge sola a 240 px del costat llarg (i diverses imatges en un mateix missatge com a quadrats de 64 px), així que una sola imatge per inserció és deliberada: hi veus la pàgina, els pins i el que els envolta, i pots obrir l'original a mida completa.
- **Diversos picks, un sol missatge.** Afegeix tants elements com vulguis a la llista; Insereix envia tots els blocs d'anotació i una sola imatge amb tots els pins.

## Per què anotar en el DOM

Una captura mostra com es veu la pàgina. Una anotació DOM diu **què és** l'element.

| Només una captura | Una anotació DOM |
| --- | --- |
| L'agent veu píxels i endevina a quin element et refereixes. | L'agent rep el tag, l'id, les classes, el selector i un fragment d'HTML. |
| Li descrius la ubicació amb paraules. | L'agent rep els estils calculats, la mida i la posició. |
| El context visual és clar. | El context visual hi és, amb pins numerats. |

Totes dues coses importen. La imatge diu a l'agent on és l'element i què l'envolta; el payload DOM diu què és, de manera que pot trobar el codi, fer el canvi i raonar sobre el layout sense una ronda de «quin botó?». La nota hi afegeix la intenció: què vols canviar, no només què hi ha.

## Els dos portadors

El panell pot renderitzar una pàgina de dues maneres. Normalment no cal pensar-hi: l'elecció segueix la URL i es recorda per origen.

| URL | Portador | Què et dona |
| --- | --- | --- |
| `localhost`, `*.localhost`, `*.local`, IP privades, loopback i link-local | **Natiu** — proxy same-origin | La pàgina i el seu DOM reals, totalment interactius, amb l'overlay d'anotació; accepta certificats autosignats; les galetes viuen en un pot per origen. |
| Qualsevol altra pàgina `http(s)` | **Remot** — CDP | Un Chromium real al host renderitza la pàgina; els fotogrames i l'entrada es transmeten al panell. Funciona amb `X-Frame-Options`, CSP i logins del perfil del navegador. |

**Portador natiu.** DSH baixa la pàgina, en reescriu les URL i hi injecta un petit shim i l'overlay d'anotació, de manera que la pàgina queda same-origin amb DSH i es pot inspeccionar i clicar com una pestanya normal. HTML, CSS, JS, imatges i crides d'API passen pel proxy; `fetch`, `XMLHttpRequest`, `history.pushState`/`replaceState` i `window.open` s'hi queden; les URL de `<script type="importmap">` es reescriuen; els noms d'acció com `data-action="family"` no es toquen. Les WebSockets/HMR no es proxien.

**Portador remot.** El Chromium del host carrega la pàgina de veritat i envia els fotogrames al panell; clics, roda, escriptura i arrossegaments es reenvien. És el portador per a llocs públics, pàgines que es neguen a ser incrustades i llocs amb login.

**Commutar.** La vista nativa té un botó **Vista remota (CDP)**. La vista remota ofereix **Vista nativa (proxy)** per a hosts locals i **Força la vista nativa (insegur)** per a qualsevol altre origen, recordat per origen. Forçar una pàgina pública pel proxy comparteix l'origen de DSH amb aquella pàgina: fes-ho només amb llocs de confiança.

## Funcions

**Al panell**

- **Una pestanya de navegador real** (`kind: "browser"`), de manera que l'opció «obre l'enllaç a la barra lateral» del xat obre aquest navegador; `params.url` es navega en arribar.
- **Esquema automàtic a la barra d'adreces.** `example.com` es converteix en `https://example.com/`; `shop.local:5173`, `127.0.0.1:5173` o `192.168.1.20:8080` fan servir `http://`. Els esquemes que no són web (`mailto:`, `file:`, `javascript:`, `data:`) es rebutgen.
- **Porta el teu navegador.** Apunta `cdpUrl`/`wsUrl` a qualsevol Chrome amb `--remote-debugging-port`, deixa que el plugin en descobreixi un o deixa que n'arrenqui un amb perfil persistent.
- **Emulació de dispositiu.** Responsive (s'ajusta al panell), escriptori 1280×800, portàtil 1440×900, tauleta 768×1024 (UA d'iPad), mòbil 390×844 (UA d'iPhone) i Android 412×915, amb touch i `devicePixelRatio` coherent.
- **Interfície en anglès i castellà** via `ctx.locale`; altres idiomes cauen a l'anglès.

**Anotació**

- **Inspector en passar el ratolí:** `tag#id.class  240×44  [role]`, per veure què estàs a punt de triar.
- **Selecció d'element** amb selector, text, classes, fragment d'HTML, estils calculats, mida/posició i URL de la pàgina.
- **Pins numerats i notes.** Guarda diversos picks a la llista i insereix-los junts.
- **Lliurament al composer** amb `InputActions.insertText`, de manera que l'anotació s'afegeix al cursor sense substituir l'esborrany.
- **Una imatge anotada** per inserció, amb tots els picks marcats — no un retall minúscul per element.
- **Esc surt del mode d'anotació** des de la pàgina o la barra; si hi ha una nota oberta, es tanca primer.

## Inici ràpid

### Requisits

- DSH **0.2.1-rc.2** o superior, per sota de `0.3.0` (perfil Web).
- Node.js **22.19+**.
- Un navegador basat en Chromium al host. El plugin detecta Chrome/Chromium; la caché de Chromium de Playwright també funciona.

### Instal·lació

```bash
# des de npm
dsh plugin --profile web add dsh-sidepanel-web

# des de GitHub
dsh plugin --profile web add github:AleixRocal/dsh-sidepanel-web

# o des d'un clon local, mentre desenvolupes
git clone https://github.com/AleixRocal/dsh-sidepanel-web
dsh plugin --profile web add link:/absolute/path/to/dsh-sidepanel-web
```

Reinicia `dsh web` una vegada i refresca la GUI. La pestanya **Navegador** apareix a la guia del panell dret.

També hi ha una còpia amb scope (`@aleixrocal/dsh-sidepanel-web`) a [GitHub Packages](https://github.com/AleixRocal/dsh-sidepanel-web/pkgs/npm/dsh-sidepanel-web); el paquet canònic és el de npmjs. Per instal·lar el mirall cal un token amb `read:packages` i `@aleixrocal:registry=https://npm.pkg.github.com`.

### Primera pàgina

1. Desplega el panell dret i tria **Navegador**.
2. Escriu `example.com` i prem **Enter**. El panell obre `https://example.com/`; l'esquema s'afegeix sol.
3. Fes clic a **Anotar**, passa el ratolí, clica un element, escriu la nota i tria **Insereix**.

> [!NOTE]
> Si no troba cap navegador als ports CDP habituals, el plugin arrenca un Chromium headless dedicat amb un perfil persistent. Només cal `chromePath` si la detecció automàtica falla.

### Fes servir el teu navegador

Per reutilitzar el navegador que ja tens obert (amb les mateixes galetes i sessions), exposa'n el port CDP i apunta-hi el plugin — sense instal·lacions separades:

```sh
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/chrome-dsh" &
```

```yaml
- id: dsh-sidepanel-web
  config:
    cdpUrl: http://127.0.0.1:9222   # o wsUrl: ws://127.0.0.1:9222/devtools/browser/…
```

Chrome 136+ es nega a exposar `/json/version` al perfil per defecte; per això cal un `--user-data-dir` separat. Sense `cdpUrl`/`wsUrl`, el plugin prova 9222–9225 i 9333, després `~/.local/state/dsh-sidepanel-web/browser.json` i finalment el fitxer del pont d'ego.

## Ús

1. Obre una sessió, desplega el panell dret i tria **Navegador**.
2. Escriu una URL a la barra d'adreces.
   - `example.com` → `https://example.com/` (l'esquema s'afegeix sol).
   - `localhost:3000`, `shop.local`, `192.168.1.20:8080` → `http://`, perquè els servidors de desenvolupament poques vegades tenen TLS.
   - Un host local/dev passa pel proxy de DSH i continua sent interactiu; un host públic el renderitza el Chromium del host i s'envia al panell.
3. Fes clic a **Anotar** i passa el ratolí. L'inspector mostra el tipus i la mida de l'element.
4. Fes clic a l'element, escriu la nota i tria **Afegeix a la llista**. Repeteix per cada element que vulguis incloure.
5. Tria **Insereix** per posar les anotacions i la imatge anotada al composer; envia el missatge.
6. Fes servir el menú **⋯** per als presets de dispositiu, per netejar els pins o per canviar entre **Vista nativa (proxy)** i **Vista remota (CDP)**. La tria es recorda per origen.

| URL | Portador | Per què |
| --- | --- | --- |
| `example.com`, qualsevol lloc públic | Screencast CDP | Funciona encara que el lloc enviï `X-Frame-Options`/CSP. |
| `localhost`, `*.local`, IP privades/loopback/link-local | Proxy same-origin | Render natiu, accés al DOM i anotació sense screencast. |

## Configuració

Les opcions es posen al patch del perfil, sota la fila del plugin:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: dsh-sidepanel-web
  config:
    chromePath: /path/to/chrome
    headless: true
```

| Clau | Per defecte | Significat |
| --- | --- | --- |
| `chromePath` | auto-detect | Ruta absoluta a un navegador basat en Chromium. |
| `headless` | `true` | Arrenca el navegador del host sense finestra. |
| `autoLaunch` | `true` | Arrenca un navegador quan no hi ha cap endpoint CDP. |
| `wsUrl` | buit | Endpoint CDP explícit (`ws://127.0.0.1:port/devtools/browser/…`). |
| `cdpUrl` | buit | Endpoint HTTP de depuració d'un navegador existent, p. ex. `http://127.0.0.1:9222`; es resol via `/json/version`. |
| `profileDir` | `~/.local/share/dsh-sidepanel-web/profile` | Directori del perfil del navegador (persistent: les sessions sobreviuen als reinicis). |
| `homeUrl` | `https://www.deepseek.com` | Primera pàgina quan arrenca el navegador. |
| `device` | `responsive` | Preset d'emulació: `responsive`, `desktop`, `laptop`, `tablet`, `mobile`, `android`. |
| `pollMs` | `1200` | Interval de sondeig de captures per al mode stream llegat. |
| `quality` | `82` | Qualitat JPEG per al mode stream llegat. |
| `streamMode` | `screencast` | `screencast` o `poll` (mode stream llegat). |
| `streamFps` | `15` | Límit de fotogrames per al mode stream llegat. |

## Com funciona

```text
DSH Web GUI
  └─ Pestanya Navegador (sidebar.right.pane.tab)
       ├─ Portador A · natiu (local/dev)
       │    iframe del proxy ──► /api/sidepanel-web/p/<origen>/<camí>
       │                         └─ proxy reescriptor (HTML/CSS/JS/API)
       │                              └─ overlay: pick → nota → imatge composta
       └─ Portador B · remot (qualsevol pàgina)
            Chromium CDP (host) ──► fotogrames + entrada reenviada
                 └─ mateix panell, mateix flux d'anotació

  anotacions + una captura amb pins ──► composer (InputActions.insertText)
```

La **meitat host** posseeix el Chromium, el proxy, les captures i el render compost; la **meitat client** és la pestanya que veus. El portador natiu manté la pàgina same-origin perquè l'overlay en pugui llegir el DOM i tu la puguis clicar; el portador remot envia un navegador real i reenvia la teva entrada. Tots dos alimenten el mateix payload d'anotació, així que el xat no depèn del portador que hagis fet servir.

En prémer **Insereix**, el host renderitza una vista de la pàgina, torna a posar el pin de cada pick (per selector en una pàgina nativa, des de la pàgina viva en CDP) i retorna un sol PNG. Si aquest render falla, s'adjunta el retall del primer element, de manera que el missatge sempre té una imatge i tot el text.

- **Meitat host** (`lib/index.js`, `lib/service.js`, `lib/cdp.js`, `lib/launcher.js`): rutes, cicle de vida del Chromium, CDP, captures, retalls, render compost.
- **Proxy** (`lib/proxy.js`): baixa pàgines local/dev, reescriu URL, injecta el shim i l'overlay i manté un pot de galetes per origen.
- **Pàgina/overlay** (`lib/page.js`): portador de pàgina renderitzada i overlay d'anotació.
- **Regles d'URL** (`lib/url.js`): detecció d'esquema compartida amb el client (mirall dins `lib/client.js` i verificada per `test/url-smoke.mjs`).
- **Meitat client** (`lib/client.js`): la pestanya, la barra d'adreces, els portadors natiu/remot, la targeta de nota, la inserció al composer i els diccionaris EN/ES.

Una explicació més profunda de la integració amb DSH Web (slots, registre de pestanyes, portadors, descoberta de navegador) és a [`docs/browser-integration.md`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/docs/browser-integration.md).

## Preguntes freqüents

<details>
<summary><strong>He escrit <code>example.com</code> i ha obert <code>https://example.com/</code>. Puc forçar <code>http://</code>?</strong></summary>

Sí: escriu l'esquema explícitament (`http://example.com`). Els hosts local/dev (`localhost`, `*.local`, adreces privades, loopback i link-local) ja fan servir `http://` per defecte perquè els servidors de desenvolupament poques vegades tenen TLS. Els esquemes que no són web es rebutgen.
</details>

<details>
<summary><strong>La pàgina pública dona error de connexió o no carrega.</strong></summary>

Les pàgines públiques van pel portador CDP, no per un iframe, així que `X-Frame-Options` no n'és la causa. Comprova que el Chromium del host estigui engegat i accessible (`cdpUrl`/`wsUrl` o l'autoarrencada) i que el host tingui xarxa cap al lloc. La línia d'estat del panell indica l'error CDP.
</details>

<details>
<summary><strong>Puc forçar la vista nativa per a un lloc públic?</strong></summary>

Sí, explícitament: obre el lloc, clica el menú **⋯** i tria **Força la vista nativa (insegur)**. La tria es recorda per origen, així que cada pestanya nova a aquell origen obre el portador natiu, i la pàgina esdevé proxificada i anotable com una de local. Fes-ho només amb llocs de confiança: la pàgina proxificada comparteix l'origen de DSH i pot llegir el DOM del panell i cridar l'API de DSH amb la teva sessió. La política per defecte no canvia: local/dev → natiu, públic → CDP.
</details>

<details>
<summary><strong>Per què el xat mostra una imatge i no un retall per anotació?</strong></summary>

Perquè DSH dimensiona les imatges segons quantes n'arriben juntes: una imatge sola es mostra a 240 px del costat llarg i mai s'amplia per sobre de la seva mida natural, mentre que diverses imatges en un mateix missatge esdevenen quadrats de 64 px. Un retall d'un botó petit es veuria minúscul igualment. Per això Insereix envia una sola vista de la pàgina amb tots els picks marcats, i manté la ruta del retall de cada element al text.
</details>

<details>
<summary><strong>La pàgina local es veu en blanc a la vista nativa.</strong></summary>

El proxy reescriptor cobreix la majoria d'apps, però les WebSockets/HMR no es proxien i algunes apps amb molt JavaScript necessiten un navegador real. Fes servir **Vista remota (CDP)** per a aquell lloc; la tria es recorda per origen.
</details>

<details>
<summary><strong>Chrome 136+ no exposa <code>/json/version</code>.</strong></summary>

Arrenca'l amb un perfil separat: `--user-data-dir="$HOME/.config/chrome-dsh"`. Des de Chrome 136 el perfil per defecte està protegit de CDP.
</details>

<details>
<summary><strong>On es guarden les galetes i els logins?</strong></summary>

El Chromium propi del plugin fa servir el `profileDir` persistent (`~/.local/share/dsh-sidepanel-web/profile` per defecte). Si l'apuntes al teu navegador via `cdpUrl`/`wsUrl`, qui guarda el perfil i les galetes és aquell navegador.
</details>

<details>
<summary><strong>Funciona a DSH Desktop?</strong></summary>

No. És un plugin del perfil Web; DSH Desktop fa servir un `<webview>` d'Electron i un perfil diferent.
</details>

<details>
<summary><strong>Puc anotar iframes cross-origin o shadow DOM tancat?</strong></summary>

Només el seu contenidor. L'overlay no pot travessar un iframe cross-origin ni un shadow root tancat.
</details>

<details>
<summary><strong>Com es generen les captures i s'hi fa servir cap dada real?</strong></summary>

Amb `npm run mockups`, a partir del client real i un backend mock. Totes les imatges fan servir contingut inventat (botiga fictícia, `example.com` reservat, conversa inventada); no es captura cap finestra de DSH, compte, client, ruta ni token real. Vegeu [Captures i privacitat](#captures-i-privacitat).
</details>

## Captures

| | |
| --- | --- |
| ![Anotant el botó de fer la comanda](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/02-annotate.png) | ![Preset d'emulació de mòbil](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/03-devices.png) |
| **Tria, nota, envia.** El pin cau damunt de l'element i la targeta de nota prepara el payload del composer. | **Emulació de dispositiu.** Escriptori, portàtil, tauleta, iPhone i Android amb touch i DPR. |

![Com funcionen els dos portadors i el camí de l'anotació](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/04-how-it-works.png)

<p align="center"><em>El diagrama: una pàgina local/dev pel proxy same-origin, una pàgina pública per CDP, i totes dues alimentant el mateix payload d'anotació.</em></p>

Totes les captures són mockups generats des de [`test/preview/shell.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/shell.html) i [`test/preview/diagram.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/diagram.html): el panell és el client real, la botiga és la fictícia **Northwind Supply** al domini reservat `example.com`, i no s'hi fa servir cap compte, pàgina ni dada de client real. Vegeu [Captures i privacitat](#captures-i-privacitat).

## Captures i privacitat

Les captures formen part del lliurament, així que segueixen una regla dura: **cap dada real d'usuari**.

- El panell és el `lib/client.js` real; el shell del voltant (conversa, espai de treball, sessió) és HTML estàtic a [`test/preview/shell.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/shell.html).
- La botiga és **Northwind Supply**, una botiga fictícia al domini reservat `example.com`.
- Cap finestra de DSH, compte, pàgina, client, ruta ni token real no apareix a cap imatge.
- [`screenshots.json`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/screenshots.json) declara les quatre imatges de botiga per als marketplaces de plugins.
- Es regeneren amb `npm run mockups`; el banner es renderitza des de [`test/preview/banner.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/banner.html).

## Seguretat

- Totes les rutes del host criden `connection.requestRejection(req)`; el servidor web està lligat a loopback.
- El proxy reescriptor només accepta **hosts locals/dev** (localhost, `*.local`, rangs privats, loopback i link-local). Les URL públiques es rebutgen i les gestiona el portador CDP, tret que l'origen s'hagi forçat explícitament a la vista nativa.
- L'iframe natiu corre amb sandbox (`allow-scripts allow-forms allow-same-origin allow-popups` per a pàgines locals). `allow-same-origin` és necessari perquè el document del proxy conservi galetes i API; també vol dir que una pàgina proxificada comparteix l'origen de DSH. Només proxifica pàgines de confiança.
- **Forçar la vista nativa és un override explícit.** Deixa passar un origen públic pel proxy same-origin; aquella pàgina comparteix l'origen de DSH (DOM, galetes, crides a l'API). La política per defecte continua rebutjant hosts públics. Força només llocs de confiança.
- El navegador del host fa servir un perfil dedicat i ignora errors de certificat (necessari per als servidors locals autosignats). El portador CDP té les capacitats del navegador al qual l'apuntes.
- El text de les anotacions i el contingut de la pàgina són dades no confiables per a l'agent.
- Reporta vulnerabilitats en privat via [SECURITY.md](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/SECURITY.md); no obris un issue públic.

## Limitacions

- **Només Web.** DSH Desktop fa servir `<webview>` d'Electron i un altre perfil; aquest plugin no el substitueix.
- **El proxy és només local/dev per defecte.** Els llocs públics no es proxien; van al navegador CDP. **Força la vista nativa** és l'override explícit per origen, amb l'avís de same-origin d'adalt.
- **WebSocket/HMR no es proxien** al portador natiu. Els servidors de desenvolupament serveixen la pàgina, però el hot reload pot no funcionar; canvia a la vista CDP.
- **Galetes** al portador natiu viuen en un pot per origen; alguns fluxos de login poden fallar. El portador CDP fa servir el perfil del navegador.
- **Iframes cross-origin i shadow DOM tancat** no es poden anotar; només el contenidor.
- **La imatge anotada és un render fresc al host** (un viewport de 1200 px d'ample que creix per encabir els picks, o la pàgina CDP en viu), així que un estat que només vivia al panell — un modal obert, un formulari a mitges — pot no aparèixer-hi. El text conserva cada pick, el seu fragment d'HTML i la ruta del retall.
- **La latència CDP** depèn del host i de la pàgina; el screencast té un límit de 15 fps per defecte.
- **Alpha:** les API i el comportament poden canviar.

## Desenvolupament

```text
lib/
  index.js        plugin host: rutes, ajustos, registre del proxy
  service.js      servei CDP: estat, navegació, captures, retall, compost
  cdp.js          client CDP sense dependències
  launcher.js     descoberta/arrencada de Chromium (container-safe, ignora errors de certificat)
  page.js         portador de pàgina renderitzada + overlay d'anotació
  proxy.js        proxy invers reescriptor per a local/dev
  url.js          normalització de la barra d'adreces (mirall a client.js)
  client.js       pestanya, portadors, pont de l'overlay, composer
assets/           icon.svg, icon.png, icon-180.png, banner.png, screenshots/
test/             smoke tests i harness de preview/mockups
docs/             recerca d'integració amb DSH Web (català)
```

```bash
npm run check          # node --check de tots els fitxers font
npm test               # regles d'URL + proves de reescriptura del proxy
npm run test:ui        # Esc, inserció nativa i adjunts compostos (necessita Chromium)
npm run test:composite # render compost real amb pins (necessita Chromium)
npm run smoke          # smoke test del host amb CDP (necessita Chromium)
npm run mockups        # regenera assets/banner.png i assets/screenshots
dsh plugin --profile web add link:$PWD
```

Les notes de versió viuen a [`CHANGELOG.md`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CHANGELOG.md).

El harness de preview renderitza el `lib/client.js` real amb un backend mock:

```bash
node test/preview/server.mjs
# http://127.0.0.1:7788/harness.html?state=ready&w=360&h=780
```

Vegeu [`test/preview/README.md`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/README.md) per a cada estat, el shell de finestra completa, el test de comportament i el pipeline de mockups.

## Market

Listat a [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) (PR [#12641](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/12641), fusionat el 2026-11-08):

- [x] El repositori és públic i el topic `dsh-plugin` està posat.
- [x] `package.json` declara `dsh.bundle` i inclou [`cordis.patch.yml`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/cordis.patch.yml).
- [x] Icona raster a `assets/icon-180.png` i captures de botiga a [`screenshots.json`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/screenshots.json).
- [x] Entrada a [`market/entry.yml`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/market/entry.yml).
- [x] Paquet publicat com a [`dsh-sidepanel-web`](https://www.npmjs.com/package/dsh-sidepanel-web) a npm.

## Contribuir

Les contribucions són benvingudes: errors, arreglos de portadors, documentació i millores dels mockups. Comença per [CONTRIBUTING.md](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CONTRIBUTING.md), executa `npm run check` i `npm test`, i llegeix la regla de privacitat de les captures abans d'afegir imatges. Aquest projecte segueix el [Codi de conducta](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CODE_OF_CONDUCT.md). Els reports de seguretat van per [SECURITY.md](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/SECURITY.md), no per issues públics.

## Crèdits

Fork de [`zengxiaolou/dsh-annotate-browser`](https://github.com/zengxiaolou/dsh-annotate-browser) (MIT): el client CDP, el launcher, el selector d'elements i el flux de retall hi van començar. Aquest fork afegeix la integració oficial al panell dret, el proxy reescriptor local/dev, el commutador de portadors, l'overlay d'anotació, l'emulació de dispositiu, la UI EN/ES, la imatge anotada composta i el lliurament al composer.

## Llicència

MIT. Vegeu [LICENSE](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/LICENSE); la nota de copyright original es conserva.

---

<p align="center"><a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.md">English</a> · Català · <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.zh.md">中文</a> · <a href="#índex">Torna a dalt ↑</a></p>
