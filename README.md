# Dots — částicový život

Simulace „particle life“: barevné tečky, jedna matice sil – a z ní samovolně vznikají buňky, hadi, oběžnice, roje i honičky. Hřiště s umělým životem, kde se dá hrát, zkoumat a tvořit.

**▶ Hrát:** https://garon92.github.io/dots/

## Co umí

- **Galerie 18 světů** s živými náhledy (buňky, hadi, oběžnice, lovci a kořist, šroubovice, stonožky, rakety, duhový červ, hvězdokupa, kvítí, galaxie, … i všech 5 světů z původní verze).
- **Editor matice** – tažení buňky nahoru/dolů, kolečko myši, klávesnice; detail buňky s popisem „kdo koho honí“, přesným posuvníkem a grafem síly v závislosti na vzdálenosti.
- **Úpravy matice**: náhodná, zmutovat, souměrná, obrátit znaménka, prohodit role, vynulovat, zpět/znovu. Plynulý přechod („morph“) mezi maticemi.
- **2–8 druhů**, počty částic po druzích i celkem, 6 způsobů rozmístění (náhodně, kruh, prstence, pruhy, hnízda, spirála), rozfoukání.
- **Fyzika**: dosah, síla, tření, časový krok, osobní prostor; rychlost simulace ¼× až 3×, pauza a krokování.
- **Nástroje na plátně**: odpuzovat, přitahovat, vířit, přidávat částice (vybraného druhu), gumovat; velikost štětce.
- **Vzhled**: plátno „Noc“ (zářící tečky) nebo „Papír“ (inkoust na papíře), 4 barevné palety, stopy, záře, velikost teček, **živá síť** (vlákna mezi přitahujícími se částicemi), vinětace, měřítko světa.
- **Sdílení odkazem** – celý svět (matice, počty, fyzika, rozmístění) je zakódovaný v adrese (~80 znaků).
- **Oblíbené** s náhledy v prohlížeči (přejmenovat, smazat s „Vrátit“, zkopírovat odkaz). Uložené „My Setups“ ze staré verze se automaticky přenesou.
- **Obrázek do PNG**, celá obrazovka, režim bez rozhraní (H), auto-pauza při skrytí záložky.
- **„Jak to funguje?“** – přátelské vysvětlení principu s grafem a mini-maticí, přehled klávesových zkratek (`?`).
- Hlídání plynulosti: když zařízení nestíhá, rovnoměrně ubere částice (dá se vypnout).
- PWA – jde nainstalovat a funguje offline.

## Ovládání

| Akce | Myš / klávesnice | Dotyk |
|---|---|---|
| odpuzovat (výchozí nástroj) | držet levé tlačítko | držet prst |
| přitahovat | Shift + držet, pravé tlačítko | **dva prsty** (roztažením zvětšíš oblast) |
| vířit | Alt/Ctrl + držet, nástroj 3 | tři prsty |
| změna síly v matici | táhnout buňku ↕, kolečko, šipky + Shift | táhnout buňku ↕ |
| přesná hodnota | kliknout na číslo u posuvníku a napsat (i s desetinnou čárkou) | totéž |

Klávesy: `mezerník` pauza · `.` krok · `R` náhodná matice · `Shift+R` překvapení · `M` zmutovat · `Y` souměrná · `I` obrátit · `X` prohodit · `0` vynulovat · `Ctrl+Z/Y` zpět/znovu · `N` rozmístit · `V` rozfoukat · `1–5` nástroje · `[` `]` štětec · `+` `−` rychlost · `←` `→` předchozí/další svět · `B` živá síť · `T` stopy · `L` laboratoř · `G` galerie · `H` skrýt rozhraní · `F` celá obrazovka · `S` uložit · `C` obrázek · `U` odkaz · `?` nápověda.

## Jak to funguje

Každá tečka vidí sousedy do vzdálenosti *dosah*. Zblízka se všechny odstrkují (osobní prostor), ve střední vzdálenosti rozhoduje matice: číslo v řádku *A* a sloupci *B* říká, jak moc se *A* táhne k *B* (−1 utíká, +1 se přitahuje). Matice nemusí být souměrná – když *A* honí *B* a *B* utíká, vznikne pohyb, rotace a „lov“.

## Technika

- **Vite 8 + TypeScript (strict)**, bez frameworku; sdílený design systém **g92 kit** (`src/kit/`, vendorovaný z `menu/kit`, needitovat).
- `src/sim/` – čistá logika: silový zákon, toroidní prostorová mřížka (buňka = dosah, dopředné sousední buňky → každá dvojice částic se počítá jen jednou), svět v typovaných polích seřazených podle buněk (cache), štětce, vlákna. Běží ve **Web Workeru** (přenos bufferů bez kopírování, back-pressure); bez workeru poběží v hlavním vlákně.
- `src/render/` – **WebGL2** instancované kreslení do half-float bufferu (stopy nezávislé na obnovovací frekvenci, záře, vlákna jako měkké čáry, „papírový“ režim), záložní Canvas 2D; náhledy galerie se počítají v samostatném workeru.
- `src/state/` – recepty světů, presety, URL kódování, palety, nastavení, úložiště (`g92:dots:*`).
- `src/ui/` – panel „Laboratoř“ (boční panel / spodní šuplík na mobilu), matice, galerie, nástrojová lišta, HUD, nápověda.
- **Paralelní výpočet sil**: na vícejádrových zařízeních pomáhá simulaci až 6 pomocných workerů (propojených přes MessageChannel). Částice se dělí na úseky podle odhadnuté práce – i jeden obří shluk se rozdělí mezi vlákna. Simulace sama měří, zda je rychlejší jedno vlákno, nebo pomocníci, a přepíná.
- Výkon (Apple M1 Pro, 1440×900 @2×, vykreslování vždy stabilních 60 FPS):

  | svět / částic | původní verze | nová verze |
  |---|---|---|
  | Oběžné řetězy 3 000 | 4,5 ms/krok (hlavní vlákno) | 1,3–1,8 ms |
  | Oběžné řetězy 6 000 / 10 000 / 14 000 | – (max. 4 200) | 3,7 / 7,0 / 11,3 ms |
  | Buňky (husté shluky) 3 000 / 6 000 / 10 000 | – | 2,3 / 7,2 / 20,5 ms |

  60 kroků za sekundu = 16,7 ms na krok; hlídání plynulosti ubere částice, když zařízení nestíhá.

## Vývoj

```bash
npm install
npm run dev        # http://localhost:5178/dots/
npm run typecheck
npm test           # Vitest: silový zákon, mřížka, svět vs. referenční O(n²), URL, presety, migrace
npm run build      # dist/ (PWA)
npm run preview
```

`lab.html` (jen při `npm run dev`: http://localhost:5178/dots/lab.html) je laboratoř na ladění presetů – vykreslí všechny světy (nebo náhodné matice `?random=24&species=6`) po zadaném počtu kroků.

Nasazení: `.github/workflows/deploy.yml` (build → GitHub Pages přes Actions) při pushi do `main`.
