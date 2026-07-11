# Dots — particle life

Simulace „particle life": šest druhů částic, jejichž vzájemné přitahování a odpuzování řídí jediná 6×6 matice. Z pár čísel samovolně vznikají buňky, řetězy, oběžné dráhy i lov.

**▶ Hrát:** https://garon92.github.io/dots/

## Ovládání

| Akce | Efekt |
|---|---|
| klik + držet | odpuzovač — rozmíchá polévku |
| Shift + držet | přitahovač — shromáždí částice |
| tažení buňky matice ↕ | přepisuje sílu přitahování (−1 až +1) |
| klik na číslo u šoupátka | zadání přesné hodnoty (Enter potvrdí) |
| `mezerník` | pauza / pokračovat |
| `R` | náhodná matice |
| `B` | zapnout/vypnout „Living Web" (vlákna vazeb) |

## Technicky

Celá hra je jediný soubor `index.html` — HTML, CSS i JavaScript, bez externích závislostí. Rendering přes Canvas 2D, simulace používá spatial hash grid a typed arrays, takže zvládne tisíce částic při 60 FPS.

## Featury navíc oproti originálu

- **My Setups** — uložení celého nastavení (matice, populace, fyzika, Living Web) do prohlížeče; pojmenované setupy přežijí zavření stránky a dají se jedním klikem načíst nebo křížkem smazat
- **Přepisovatelná šoupátka** — kliknutím na číslo vedle šoupátka lze zadat přesnou hodnotu (funguje i desetinná čárka); hodnoty mimo rozsah se automaticky oříznou

Další featury přibudou postupně.
