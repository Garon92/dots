# Primordia — particle life

Simulace „particle life": šest druhů částic, jejichž vzájemné přitahování a odpuzování řídí jediná 6×6 matice. Z pár čísel samovolně vznikají buňky, řetězy, oběžné dráhy i lov.

**▶ Hrát:** https://garon92.github.io/dots/

## Ovládání

| Akce | Efekt |
|---|---|
| klik + držet | odpuzovač — rozmíchá polévku |
| Shift + držet | přitahovač — shromáždí částice |
| tažení buňky matice ↕ | přepisuje sílu přitahování (−1 až +1) |
| `mezerník` | pauza / pokračovat |
| `R` | náhodná matice |
| `B` | zapnout/vypnout „Living Web" (vlákna vazeb) |

## Technicky

Celá hra je jediný soubor `index.html` — HTML, CSS i JavaScript, bez externích závislostí. Rendering přes Canvas 2D, simulace používá spatial hash grid a typed arrays, takže zvládne tisíce částic při 60 FPS.

## Plánované featury

Zatím výchozí verze; nové featury přibudou postupně.
