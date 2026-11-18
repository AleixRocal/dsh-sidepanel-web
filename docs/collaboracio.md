# Com es col·labora en aquest projecte

Aquest document explica **per què** el projecte accepta contribucions de la manera
que ho fa: quins models fan servir altres projectes, què n'hem adoptat, com
s'integren les aportacions quan funcionen i què passa quan xoquen. Les regles
pràctiques (comandes, plantilles, què has d'executar abans d'obrir un pull
request) són a [`CONTRIBUTING.md`](../CONTRIBUTING.md), en anglès com la resta de
documents de procés.

És un document viu: si canvia el model, canvia aquí i al fitxer
[`.github/branch-protection.json`](../.github/branch-protection.json) alhora, en el
mateix pull request.

## 1. Per què cal un model, en un projecte tan petit

`dsh-sidepanel-web` té un sol mantenidor, zero dependències d'execució i cap pas de
compilació. Un model de governança pesat seria pitjor que no tenir-ne: el que cal
és barat de seguir i barat de canviar. Però hi ha tres riscos reals que un model
sí que ha de cobrir:

1. **Canvis de comportament sense disseny previ.** El plugin té dues meitats que
   es mouen juntes (host i client) i una finestra de compatibilitat amb DSH molt
   estreta (`>=0.2.1-rc.2 <0.3.0-0`). Un canvi de carrier, del payload
   d'anotacions o de l'esquema de configuració que arribi com un PR de 600 línies
   és car de revisar i més car de desfer.
2. **Dependència d'una sola persona.** Si el mantenidor desapareix, el codi és MIT
   i qualsevol pot continuar; el que es perd és el coneixement del procés. Per això
   el procés és aquí, escrit, i no només al cap d'una persona.
3. **Un fork amb upstream viu.** Aquest repositori és un fork de
   [`zengxiaolou/dsh-annotate-browser`](https://github.com/zengxiaolou/dsh-annotate-browser).
   Una part de les millores són genèriques i han d'anar primer a l'upstream; una
   altra és específica d'aquest fork. Sense una regla, cada PR acaba decidint-ho a
   mà.

## 2. Què fan altres projectes

Els models que existeixen són respostes a problemes de mida i de risc. Aquesta és
la lectura que n'hem fet, amb la font primària de cada un.

### 2.1 Flux de branques: GitHub Flow guanya, GitFlow no s'hi assembla

[GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow) és
un sol bucle: branca curta, commits, pull request, revisió, merge a la branca per
defecte, esborrar la branca. No hi ha branca d'integració, ni de release, ni de
hotfix; la revisió viu al PR, no en un graf de branques paral·lel.

[GitFlow](https://nvie.com/posts/a-successful-git-branching-model/) (Vincent
Driessen, 2010) feia servir `master` i `develop` i tres tipus de branca de suport
(feature, release, hotfix). Al mateix article, Driessen hi va afegir una nota
posterior dient que el model es va convertir en dogma i que, per a programari que
es lliura de manera contínua, recomanaria un flux molt més simple, com GitHub
Flow. Val la pena citar-ho perquè la crítica ve de qui el va inventar.

**Aquí:** GitHub Flow, amb el títol de squash escrit pel mantenidor. No tenim
versions antigues que mantenir en paral·lel, i una branca `develop` només afegiria
un lloc on els canvis es poden quedar a mig fer.

### 2.2 Disseny previ: RFC, KEP i PEP

[Rust](https://github.com/rust-lang/rfcs) obre un RFC com un pull request amb una
plantilla, el numera, li assigna un subequip i un shepherd, i el porta a una
*moció de període final de comentaris* (FCP): un comentari públic amb el resultat
proposat (merge, tancar o posposar), 10 dies naturals de marge, i la possibilitat
de cancel·lar-lo si apareix un argument nou.

[Kubernetes](https://github.com/kubernetes/enhancements/blob/master/keps/README.md)
fa servir els KEP: primer es socialitza la idea amb un SIG que l'apadrina, després
s'emplena la plantilla, i l'estat (`provisional → implementable → implemented`) el
mouen uns aprovadors nomenats, no qui edita l'últim. A més, hi ha una congelació de
millores dins del cicle de llançament.

[Python](https://peps.python.org/pep-0001/) separa explícitament el filtre
editorial del filtre de decisió: els editors de PEP comproven només la forma i
diuen que "no jutgen"; la decisió és del Steering Council o d'un delegat, i un PEP
rebutjat es conserva com a registre històric.

**Què n'hem adoptat:** el FCP, reduït. Per als canvis de comportament, el
mantenidor escriu al fil la decisió proposada i la deixa 7 dies per si algú té un
argument que no s'havia considerat. També n'hem adoptat la separació entre "és un
problema real" i "aquesta és la solució que s'accepta": l'etiqueta `needs-design`
i l'etiqueta `accepted` són dues portes diferents.

**Què n'hem descartat:** l'estat de set graons dels KEP, els sponsors del PEP i el
Consell. Coordinen centenars de persones; aquí només cal que una decisió quedi
escrita i datada.

### 2.3 Llicència i procedència: ni CLA ni DCO obligatori

El [DCO 1.1](https://developercertificate.org/) és una certificació per commit:
el treball és meu, o es basa en treball amb una llicència compatible, o me l'ha
proporcionat algú que n'ha certificat l'origen. S'aplica amb `git commit -s`.
L'[ICLA d'Apache](https://www.apache.org/licenses/contributor-agreements.html)
és un PDF signat que s'envia a la secretaria de la fundació, i és requisit previ
per tenir permisos d'escriptura: existeix perquè la fundació pugui defensar el
projecte en un litigi.

**Aquí:** no hi ha CLA. El projecte és MIT i la contribució és *inbound =
outbound*: el que entra surt amb la mateixa llicència i la nota de copyright
original es queda. Tampoc no exigim sign-off DCO, perquè amb squash-merge el
commit que acaba a `main` és nou i els `Signed-off-by` dels commits individuals no
hi arriben per defecte; exigir-lo seria cerimònia sense efecte. El que sí que és
obligatori és el que el DCO protegeix de veritat: si el teu canvi incorpora codi de
tercers, en mantens la llicència i l'atribució i ho dius al pull request.

### 2.4 Rols i escala: l'escala de Node.js, la cua de merge

[Node.js](https://github.com/nodejs/node/blob/main/GOVERNANCE.md) té una escala
Triager → Collaborator → TSC. Un col·laborador et proposa en un issue amb un
resum de les contribucions, la proposta passa si cap altre col·laborador s'hi oposa
al cap d'una setmana, i 12 mesos d'inactivitat et fan emèrit. Per a qui arriba, dues
etiquetes fan la feina: `good first issue` i `help wanted`, la segona més dura.

La [cua de merge de GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
retesta cada PR amb la branca base més els PRs que té davant, de manera que dos
PRs verds per separat no trenquen `main` junts. Té un requisit que aquí no es
compleix: només està disponible per a repositoris públics d'una organització (o
privats d'empresa amb Enterprise Cloud), i cal una matriu de CI amb l'esdeveniment
`merge_group`.

**Aquí:** una escala de dos graons, no tres. Col·laborador (contribucions
sostingudes, sense permisos d'escriptura) i mantenidor (merge, releases,
administració del ruleset). Les etiquetes `good first issue` i `help wanted` ja hi
són i es fan servir amb el mateix significat que a Node. La cua de merge no s'hi
pot posar i, amb aquest volum, no caldria.

### 2.5 Convencions: Conventional Commits i SemVer

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) dona
significat de versió als tipus: `fix` és PATCH, `feat` és MINOR, `!` o
`BREAKING CHANGE` és MAJOR, i la resta (`docs`, `chore`, `ci`) no fan pujar la
versió. El seu FAQ diu explícitament que, amb squash-merge, no cal que tothom
escrigui el missatge perfecte perquè el mantenidor l'escriu en el moment del merge.

[SemVer 2.0.0](https://semver.org/) té una precondició (una API pública
declarada) i una excepció explícita: a `0.y.z` tot pot canviar. Aquest projecte és
a la línia `0.4.x`, així que aquesta és la regla honesta, i el `CHANGELOG.md` ha de
dir què trenca cada bump.

**Aquí:** títol de PR convencional, squash-merge, changelog per release i versió
`0.y.z` amb els canvis incompatibles escrits.

### 2.6 Conducta: Contributor Covenant

El projecte ja adopta el [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/),
que porta una escala de quatre graons (correcció, avís, ban temporal, ban
permanent) i un camp de contacte que cal omplir. El nostre ja apunta al perfil de
GitHub del mantenidor, no al buit que queda per defecte.

### 2.7 Un projecte petit que ho fa bé: FerrisKey

[FerrisKey](https://github.com/ferriskey/ferriskey/blob/main/GOVERNANCE.md)
(765 estrelles el novembre de 2026) té un `GOVERNANCE.md` de 3,4 KB i un
`CONTRIBUTING.md` de 5,3 KB. El govern és **consens mandrós**: si ningú no s'hi
oposa en 72 hores, la proposta s'accepta; els desacords es voten per majoria dels
mantenidors. El `CONTRIBUTING` regula la forma i no la cerimònia: prefixos de
branca, una sola qüestió per PR, separar per capa, i "prou petit per revisar-lo en
menys de 20 minuts", amb exemples de PR bo i dolent.

**Què n'hem adoptat:** el to i la mida del PR. **Què no:** el consens mandrós pur.
Amb un sol mantenidor, el silenci no pot ser acceptació, perquè no hi ha ningú que
voti; la decisió ha de ser explícita i escrita. Per això aquí el FCP substitueix el
consens mandrós.

### 2.8 Resum de decisions

| Decisió | Origen | Per què |
| --- | --- | --- |
| Trunk-based sobre `main`, sense `develop` | GitHub Flow | Un sol lloc on els canvis estan integrats, i la revisió al PR |
| Proposta prèvia per a canvis de comportament | RFC de Rust, KEP, PEP | El disseny és car de canviar després del codi, sobretot entre host i client |
| FCP de 7 dies amb resultat escrit | RFC de Rust (10 dies) | Un "últim avís" datat evita reobrir decisions preses |
| Etiquetes `needs-design` i `accepted` | KEP (estat mogut per aprovadors) | La decisió no la pren qui edita l'últim |
| Sense CLA, atribució obligatòria de tercers | DCO / Apache ICLA | MIT *inbound = outbound*; la cerimònia del sign-off no sobreviu al squash |
| Escala de dos graons | Node.js (tres graons) | Tres graons necessiten volum que aquí no hi ha |
| Squash + títol convencional | Conventional Commits FAQ | Un sol camp controlat pel mantenidor alimenta changelog i versió |
| `0.y.z` amb canvis incompatibles documentats | SemVer regla 4 | És la línia de versió real del projecte |
| Sense cua de merge | Requisit de GitHub (organització) | No està disponible en un repositori personal |
| Contributor Covenant amb contacte omplert | Contributor Covenant 2.1 | L'escala ja hi és; el camp de contacte buit és el fracàs habitual |
| PR petit, una preocupació | FerrisKey | La mida és el predictor més fiable de temps de revisió |

## 3. El model d'aquest projecte

Tres portes, de la més barata a la més cara:

1. **Correcció o documentació.** PR directe. Si toca codi, els checks obligatoris
   són `npm run check` i `npm test`.
2. **Canvi de comportament.** Proposta en un issue, etiqueta `needs-design`.
   Quan hi ha una forma acordada, el mantenidor la marca `accepted` i obre el
   període final de comentaris: un comentari amb la decisió proposada i 7 dies per
   si apareix un argument nou. Passats els 7 dies sense arguments, es construeix.
   Una proposta pot acabar tancada sense merge; el motiu es queda al fil.
3. **Dependència nova, canvi d'`engines` o canvi del model de col·laboració.**
   Proposta, decisió escrita i nota al `CHANGELOG.md`. La resposta per defecte és
   no, i el "no" és una decisió de disseny, no un judici sobre el treball.

Per què el FCP i no una votació: aquí no hi ha un cos electoral estable. Una
votació entre desconeguts que passen pel repositori no mesura res; un període de
comentaris amb una decisió escrita sí que deixa rastre per al següent que pregunti
el mateix.

## 4. Rols

| Rol | Qui | Pot fer | Com s'hi arriba |
| --- | --- | --- | --- |
| Reportador | Qualsevol | Issues, pull requests, revisions | Obert a tothom |
| Col·laborador | Qui ha aportat de manera sostinguda | El mateix, amb crèdit explícit a les notes de llançament | Tres o més aportacions acceptades, o una de substancial |
| Mantenidor | @AleixRocal avui | Merge, releases, ruleset, decisió final | Invitació; inactivitat de 12 mesos el deixa com a emèrit |

No hi ha triadors ni consell. Si el projecte arriba a tres mantenidors actius,
aquest document hauria de canviar (vegeu §9).

## 5. El cicle d'una contribució

```text
issue (o PR directe)  →  triatge ≤ 7 dies  →  needs-design  →  accepted
      →  branca curta  →  PR  →  CI verd  →  revisió  →  squash a main
      →  CHANGELOG + pujada de versió  →  tag vX.Y.Z  →  npm + GitHub Packages
      →  READMEs sincronitzats  →  crèdit a les notes de llançament
```

- **Triatge:** etiqueta i primera lectura en una setmana aproximadament, amb
  `accepted` o una explicació.
- **Revisió:** una aprovació d'un code owner. Les aprovacions caduquen quan
  arriben commits nous.
- **CI:** el job `Syntax and smoke tests` ha d'estar verd i la branca al dia amb
  `main`; el ruleset exigeix les dues coses.
- **Merge:** squash per convenció. El ruleset només prohibeix els merge commits,
  així que un rebase també passa; el squash és la norma perquè deixa el títol del
  PR com a registre.
- **Release:** el mantenidor puja la versió, escriu el changelog, etiqueta
  `vX.Y.Z` i publica. El llançament de GitHub publica també el mirall amb àmbit a
  GitHub Packages.
- **Crèdit:** les notes de llançament diuen qui ha fet la feina.

## 6. Dependències i compatibilitat

La regla dura és **zero dependències d'execució i cap compilació**. El plugin
s'executa dins del host de DSH directament des del tarball publicat, i ha de
continuar funcionant així. Les conseqüències pràctiques:

- `dependencies` buit; els mòduls integrats de Node 22 (`fetch`, `WebSocket`,
  `node:*`) són la caixa d'eines. Per això `lib/cdp.js` parla CDP per WebSocket
  global en lloc d'importar un client.
- Avui no hi ha dependències de desenvolupament. Afegir-ne una necessita una
  proposta i un motiu que sobrevisqui a la revisió; un test runner preferit no és
  suficient quan els scripts de smoke amb `node:assert` i `node --check` ja
  cobreixen la superfície.
- El codi de tercers no es queda al repositori: els bundles UMD de React del
  harness es baixen a `test/preview/vendor/`, que és ignorat.
- Si algun dia una dependència d'execució fos inevitable, caldria proposta,
  decisió escrita, revisió de la finestra `engines` i nota de migració al
  `CHANGELOG.md`.
- La finestra `engines.dsh` és una promesa de compatibilitat. No s'eixampla per
  fer passar un CI local; es prova contra una versió que la finestra ja cobreixi.

## 7. Conflictes

Els conflictes no són excepcions: són el cas normal quan hi ha més d'un PR obert.

| Conflicte | Com es resol |
| --- | --- |
| Dues branques toquen els mateixos fitxers | El primer PR verd i aprovat es fusiona; el segon rebasa sobre el nou `main`. Si el rebase no és mecànic, s'explica quina versió ha guanyat i per què |
| Dues solucions diferents per al mateix problema | El mantenidor tria al fil de l'issue i escriu el motiu; l'altre autor revisa la solució guanyadora |
| El teu rebase té conflictes | `git fetch origin`, `git rebase origin/main`, resoldre, `npm run check && npm test`, i `git push --force-with-lease` a la teva branca. Mai a `main` |
| Upstream i fork divergeixen | Una correcció genèrica (client CDP, launcher, selector d'elements) va primer a `zengxiaolou/dsh-annotate-browser` i després es sincronitza. El comportament propi del fork es queda aquí i es documenta a la secció Credits del README |
| Un problema de conducta | L'escala de quatre graons del CoC; el contacte és el perfil de GitHub del mantenidor |
| Seguretat | Advisory privat; si un PR públic exposa el problema, es tanca i es demana l'advisory |

## 8. Protecció de `main`

`main` està protegit pel ruleset `main protection` de
[`.github/branch-protection.json`](../.github/branch-protection.json), aplicat amb
[`scripts/protect-main.sh`](../scripts/protect-main.sh). El fitxer és la font de
veritat: canviar la política vol dir un PR sobre el JSON, no un clic a Settings.

| Regla | Efecte |
| --- | --- |
| Pull request obligatori | cap push directe a `main` |
| 1 aprovació i revisió de code owner | una segona lectura; l'aprovació caduca amb commits nous |
| Fils de revisió resolts | un comentari obert bloqueja el merge |
| Check `Syntax and smoke tests` i branca al dia | CI vermell o branca desfasada no passen |
| Història lineal | només squash o rebase |
| Sense force push ni esborrat | només l'administrador del repositori pot reescriure o eliminar `main` |

El mantenidor pot saltar-se el ruleset, i això inclou fer push directament a
`main`: el rol d'administrador del repositori sempre hi passa. És una sortida
d'emergència per a un projecte d'una sola persona quan `main` queda trencat, no una
drecera per estalviar-se la revisió, i la taula de dalt diu què rep tothom, no una
tanca al voltant de l'administrador. Un salt s'ha de dir al fil de l'issue o al
missatge del commit; si no, és un commit que ha aparegut del no-res.

Per què un ruleset i no la protecció clàssica de branques: el ruleset té un
payload exportable que viu al repositori i es revisa com a codi. La protecció
clàssica només existeix com a estat al servidor.

Per què no hi ha cua de merge: GitHub només la dona a repositoris d'organització, i
aquí no hi ha volum que la justifiqui. Per què no hi ha protecció d'etiquetes: els
tags `vX.Y.Z` encara es poden moure a mà; si el projecte creix, és el següent pas
natural.

## 9. Si el projecte creix

Aquestes són les portes que obriríem, en ordre. Cap és urgent avui.

- **Tres mantenidors actius:** revisió creuada obligatòria (dues aprovacions) i un
  `GOVERNANCE.md` separat d'aquest document.
- **Molts PRs alhora:** cua de merge si el repositori passa a una organització, o
  un job de CI que agrupi PRs mentre no hi sigui.
- **Codi de tercers al repositori:** sign-off DCO i el bot que el comprova.
- **Etiquetes d'àrea** (`host`, `client`, `proxy`, `docs`) quan el volum d'issues
  faci que una sola etiqueta no basti per filtrar.
- **Debats** (`Discussions`) per a preguntes, si l'etiqueta `question` es
  converteix en un embús.

## 10. Fonts

- GitHub Flow: <https://docs.github.com/en/get-started/using-github/github-flow>
- GitFlow original i la nota de 2020: <https://nvie.com/posts/a-successful-git-branching-model/>
- RFC de Rust: <https://github.com/rust-lang/rfcs>
- Processos KEP de Kubernetes: <https://github.com/kubernetes/enhancements/blob/master/keps/README.md>
- PEP 1: <https://peps.python.org/pep-0001/>
- DCO 1.1: <https://developercertificate.org/>
- Acords de contribució d'Apache: <https://www.apache.org/licenses/contributor-agreements.html>
- Governança de Node.js: <https://github.com/nodejs/node/blob/main/GOVERNANCE.md>
- Conventional Commits: <https://www.conventionalcommits.org/en/v1.0.0/>
- SemVer: <https://semver.org/>
- Cua de merge de GitHub: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>
- Contributor Covenant 2.1: <https://www.contributor-covenant.org/version/2/1/code_of_conduct/>
- FerrisKey: <https://github.com/ferriskey/ferriskey/blob/main/GOVERNANCE.md>
