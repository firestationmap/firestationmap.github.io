"""Zostaví verejné dáta mapy z datasetov aplikácie (formát FireStation, priečinok data/seed).

Verejná verzia:
  - neobsahuje interné analytické poznámky ani mená osôb (ručné korekcie sú označené „opravené správcom mapy“),
  - vynecháva záznamy vylúčené ako „nie hasičská jednotka“ a záznamy bez polohy,
  - ku každej jednotke pridáva stav údajov (čo chýba), aby návštevníci vedeli, kde pomôcť.

Výstupy (licencia ODbL 1.0 – obsahujú údaje z OpenStreetMap):
  data/units.js        window.FIRE_DATA = {...}  (načítanie bez servera)
  data/jednotky.geojson
  data/jednotky.csv

Použitie: python3 tools/build_public_data.py <priečinok so seed CSV> [výstupný priečinok]
"""
import csv
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "fire-response" / "data" / "seed"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1]

CAT_LAYER = {"A1": "dhzo_a1", "A": "dhzo_a", "B": "dhzo_b", "C": "dhzo_c", "D": "dhzo_d"}
APPROX = {"municipality-centroid", "approximate", "unknown"}
OTHER_KIND = [
    (r"ZHÚ|Závodný hasičský útvar", "Závodný hasičský útvar (ZHÚ)"),
    (r"ZHZ|Závodný hasičský zbor", "Závodný hasičský zbor (ZHZ)"),
    (r"Letisk", "Letiskový hasičský útvar"),
    (r"Záchranná brigáda", "Záchranná brigáda HaZZ"),
    (r"Letecká základňa", "Letecká základňa HaZZ"),
]

# Časti poznámok, ktoré sú interné (postup prieskumu, pôvodné hodnoty, mená) – do verejnej verzie nejdú.
INTERNAL = re.compile(r"KOREKCIA|otvorené:|overiť|x=\d|používateľ|Raab|\[.*→", re.I)


def public_notes(notes: str, manual: bool, prec: str) -> str:
    parts = [p.strip() for p in (notes or "").split("|") if p.strip()]
    keep = []
    for p in parts:
        p = re.sub(r"\[[^\]]*\]", "", p).strip()
        if not p or INTERNAL.search(p):
            continue
        # zastaraný text po oprave polohy (záznam už má presnú polohu)
        if prec not in APPROX and re.search(r"stred obce|nenájdené", p):
            continue
        p = p.replace("NIE poloha", "nie poloha")
        keep.append(p)
    if manual:
        keep.append("údaj opravený správcom mapy")
    return "; ".join(dict.fromkeys(keep))


def public_sources(recs: str, prec: str) -> list[str]:
    out = []
    for s in [x for x in (recs or "").split(";") if x]:
        if (s.startswith("osm-place:") or s == "nominatim:municipality") and prec not in APPROX:
            continue  # stred obce už nie je zdrojom polohy
        if s.startswith("manual:"):
            m = re.search(r"\(zdroj: ([^)]+)\)", s)
            d = re.search(r"\d{4}-\d{2}-\d{2}", s)
            out.append("manual:" + (d.group(0) if d else "") + (f" (zdroj: {m.group(1)})" if m else ""))
        else:
            out.append(s)
    return out


def need(prec: str, address: str) -> list[str]:
    n = []
    if prec in APPROX:
        n.append("poloha")
    elif prec == "exact-unverified":
        n.append("overenie")
    if not address:
        n.append("adresa")
    return n


features, skipped = [], Counter()
for fname in ["hazz_stations.csv", "dhzo_stations_2026.csv", "other_units_osm.csv"]:
    for r in csv.DictReader(open(SRC / fname, encoding="utf-8")):
        if not r["latitude"]:
            skipped["bez polohy"] += 1
            continue
        if r["operationalStatus"].startswith("excluded"):
            skipped["vylúčené"] += 1
            continue
        ut, org = r["unitType"], r["organizationType"]
        if ut == "HAZZ_PROFESSIONAL":
            layer, kind = "hazz", "Profesionálna stanica HaZZ"
        elif ut == "DHZO":
            layer, kind = CAT_LAYER.get(r["category"], "dhzo_none"), "Dobrovoľný hasičský zbor obce (DHZO)"
        elif ut == "ENTERPRISE_FIRE_UNIT" or fname == "other_units_osm.csv":
            layer = "other"
            kind = next((k for pat, k in OTHER_KIND if re.search(pat, r["name"] + " " + org)), org or "Iný útvar")
        else:
            layer, kind = "dhz", "Dobrovoľný hasičský zbor (nie obecný)"
        flags = [f for f in r["dataQualityFlags"].split(";") if f]
        manual = any(f.startswith("USER_") for f in flags) or "manual:" in r["sourceRecords"]
        flags = ["CORRECTED_BY_MAINTAINER" if f.startswith("USER_") else f for f in flags]
        if r["locationPrecision"] not in APPROX:
            flags = [f for f in flags if f != "LOCATION_IS_MUNICIPALITY_CENTROID"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(float(r["longitude"]), 6), round(float(r["latitude"]), 6)]},
            "properties": {
                "id": r["id"], "layer": layer, "name": r["name"], "kind": kind,
                "cat": r["category"] if ut == "DHZO" or layer == "dhz" else (r["category"] if ut == "HAZZ_PROFESSIONAL" else ""),
                "municipality": r["municipality"], "district": r["district"], "region": r["region"],
                "address": r["address"], "prec": r["locationPrecision"], "conf": r["locationConfidence"],
                "approx": r["locationPrecision"] in APPROX,
                "need": need(r["locationPrecision"], r["address"]),
                "flags": list(dict.fromkeys(flags)),
                "notes": public_notes(r["notes"], manual, r["locationPrecision"]),
                "sources": public_sources(r["sourceRecords"], r["locationPrecision"]),
                "url": r["sourceUrl"],
            },
        })

today = date.today().isoformat()
meta = {
    "generated": today,
    "version": today + ".1",
    "license": "ODbL 1.0 (obsahuje údaje © prispievatelia OpenStreetMap)",
    "datasets": [
        {"name": "Sídla hasičských staníc – vyhláška MV SR č. 55/2002 Z. z. (znenie od 1. 6. 2019)", "url": "https://static.slov-lex.sk/static/SK/ZZ/2002/55/20190601.html"},
        {"name": "Stránky krajských a okresných riaditeľstiev HaZZ, minv.sk (stav 29. 10. 2026)", "url": "https://www.minv.sk/?hasici-zachranari"},
        {"name": "Kategorizácia DHZO na rok 2026, Dobrovoľná požiarna ochrana SR", "url": "https://www.dposr.sk/images/2026/kategorizacia_dhzo_2026.pdf"},
        {"name": "OpenStreetMap – hasičské objekty a stredy obcí (stav 29. 10. 2026), licencia ODbL", "url": "https://www.openstreetmap.org/copyright"},
        {"name": "Opravy a doplnenia správcu mapy a návštevníkov", "url": ""},
    ],
}
fc = {"type": "FeatureCollection", "metadata": meta, "features": features}
(OUT / "data").mkdir(parents=True, exist_ok=True)
(OUT / "data" / "jednotky.geojson").write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
(OUT / "data" / "units.js").write_text(
    "/* Vygenerované nástrojom tools/build_public_data.py – needitovať ručne. Licencia dát: ODbL 1.0. */\nwindow.FIRE_DATA = "
    + json.dumps(fc, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
cols = ["id", "name", "kind", "cat", "municipality", "district", "region", "address", "latitude", "longitude", "prec", "conf", "need", "notes", "sources"]
with open(OUT / "data" / "jednotky.csv", "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    for f in features:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        w.writerow([p["id"], p["name"], p["kind"], p["cat"], p["municipality"], p["district"], p["region"], p["address"], lat, lon,
                    p["prec"], p["conf"], ";".join(p["need"]), p["notes"], ";".join(p["sources"])])

print("bodov:", len(features), dict(Counter(f["properties"]["layer"] for f in features)))
print("vynechané:", dict(skipped))
print("chýba poloha:", sum("poloha" in f["properties"]["need"] for f in features))
