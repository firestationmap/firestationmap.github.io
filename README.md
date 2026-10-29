# Mapa hasičských jednotiek Slovenska

Interaktívna mapa staníc HaZZ, dobrovoľných hasičských zborov obcí (DHZO) podľa kategorizácie 2026, DHZ a ďalších hasičských útvarov.
Návštevníci môžu navrhovať opravy – najmä polohy zbrojníc, ktoré sú zatiaľ iba v strede obce.

- Statická stránka bez servera (GitHub Pages). Návrhy z formulára doručuje na e-mail služba Web3Forms alebo FormSubmit (nastavenie v `config.js`).
- Údaje: verejné zdroje a OpenStreetMap, licencia ODbL 1.0 ([DATA-LICENSE.md](DATA-LICENSE.md)). Nie sú úradne overené.
- V núdzi volajte 150 alebo 112.

## Súbory

| Súbor | Obsah |
|---|---|
| `index.html`, `app.js`, `styles.css` | mapa |
| `o-mape.html` | zdroje, licencie, ochrana údajov |
| `config.js` | e-mail pre návrhy, prevádzkovateľ, mapový podklad |
| `data/` | dáta (ODbL): `units.js` pre mapu, `jednotky.csv`, `jednotky.geojson` na stiahnutie |
| `tools/build_public_data.py` | príprava verejných dát z interného datasetu (odstráni interné poznámky) |
| `vendor/`, `fonts/` | MapLibre GL JS 4.7.1, písmo Atkinson Hyperlegible – všetko lokálne, bez CDN |

## Formát e-mailu s návrhom

Každý návrh (text e-mailu zo služby) obsahuje strojovo čitateľný blok, ktorý sa dá hromadne načítať:

```
--- ÚDAJE PRE SPRACOVANIE (prosím neupravujte) ---
format: mapa-hasicov/1
typ: oprava | nova-jednotka
id: dhzo-…
nazov: …
obec: …
problem: poloha, adresa, odkaz, kategoria, neexistuje, ine
poloha-povodna: lat, lon (presnosť)
poloha-navrh: lat, lon
adresa: …
odkaz: …
poznamka: …
verzia-dat: RRRR-MM-DD.n
--- KONIEC ---
```

## Aktualizácia dát

```bash
python3 tools/build_public_data.py <priečinok s CSV vo formáte FireStation> .
```

Lokálne spustenie: ľubovoľný statický server, napr. `python3 -m http.server` a otvoriť http://localhost:8000.
