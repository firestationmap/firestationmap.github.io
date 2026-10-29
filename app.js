/* Mapa hasičských jednotiek SR – statická stránka bez servera. Návrhy doručuje formulárová služba (Web3Forms / FormSubmit) na e-mail správcu. */
(function () {
  "use strict";

  const CFG = window.SITE_CONFIG || {};
  const DATA = window.FIRE_DATA;
  const SK_BOUNDS = [[16.8, 47.7], [22.6, 49.65]];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DATA_VERSION = DATA.metadata?.version || DATA.metadata?.generated || "";

  const panel = document.getElementById("panel");

  // ---- vrstvy (poradie = poradie v legende) ----
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const LAYERS = [
    { key: "hazz", label: "Stanice HaZZ", hint: "profesionálni hasiči", color: css("--c-hazz"), on: true, r: [5, 6, 9, 11, 13, 14] },
    { key: "dhzo_a1", label: "DHZO kategória A1", hint: "výjazd 1+3 do 10 min", color: css("--c-a1"), on: true, r: [5, 3.5, 9, 6.5, 13, 9], group: true },
    { key: "dhzo_a", label: "DHZO kategória A", hint: "výjazd 1+3 do 10 min", color: css("--c-a"), on: true, r: [5, 3.5, 9, 6.5, 13, 9] },
    { key: "dhzo_b", label: "DHZO kategória B", hint: "pohotovosť do 2 h", color: css("--c-b"), on: true, r: [5, 2.4, 9, 5, 13, 7.5] },
    { key: "dhzo_c", label: "DHZO kategória C", hint: "pohotovosť do 2 h", color: css("--c-c"), on: true, r: [5, 2.4, 9, 5, 13, 7.5] },
    { key: "dhzo_d", label: "DHZO kategória D", hint: "bez požiadavky na pohotovosť", color: css("--c-d"), on: true, r: [5, 2.4, 9, 5, 13, 7.5] },
    { key: "dhzo_none", label: "Obce bez kategórie", hint: "akcieschopnosť neznáma", color: css("--c-none"), on: false, r: [5, 2, 9, 4, 13, 6.5] },
    { key: "dhz", label: "DHZ (nie obecné)", hint: "pri podniku, škole a pod.", color: css("--c-dhz"), on: true, r: [5, 3, 9, 5.5, 13, 8], group: true },
    { key: "other", label: "Iné útvary", hint: "ZHÚ, ZHZ, letiská, záchranné brigády", color: css("--c-other"), on: true, r: [5, 3.5, 9, 6, 13, 8.5] },
  ];
  const BY_KEY = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

  const PREC = {
    "exact-verified": "presná, overená",
    "exact-unverified": "budova (neoverená)",
    "address-geocoded": "podľa adresy",
    approximate: "približná",
    "municipality-centroid": "iba stred obce",
    unknown: "neznáma",
  };
  const CONF = { high: 3, medium: 2, low: 1, "very-low": 0, none: 0 };
  const CONF_LABEL = { high: "vysoká", medium: "stredná", low: "nízka", "very-low": "veľmi nízka", none: "žiadna" };
  const FLAG = {
    ADDRESS_IS_DISTRICT_HQ: "adresa je sídlo okresného riaditeľstva",
    ADDRESS_NUMBER_MISMATCH: "číslo domu sa v zdrojoch líši",
    SOURCE_CONFLICT: "zdroje si odporujú",
    GEOCODED_TO_STREET_ONLY: "geokódované iba na ulicu",
    MISSING_ADDRESS: "chýba adresa",
    LOCATION_IS_MUNICIPALITY_CENTROID: "poloha je stred obce",
    MISSING_LOCATION: "chýba poloha",
    NOT_CATEGORIZED_IN_2026: "obec bez kategórie v roku 2026",
    NOT_MUNICIPAL_DHZO: "nejde o obecný zbor",
    DISTRICT_INFERRED_FROM_NEIGHBOURS: "okres odvodený z poradia v dokumente",
    AMBIGUOUS_NAME_RESOLVED: "rovnaký názov obce v inom okrese – rozlíšené",
    OSM_MATCH_BY_ADDRESS_ONLY: "spárované iba podľa adresy v OSM",
    CORRECTED_BY_MAINTAINER: "opravené správcom mapy",
    OSM_ONLY: "iba z OpenStreetMap",
    REGION_FROM_NEAREST_UNIT: "kraj a okres odvodené z najbližšej jednotky",
  };
  const NEED = { poloha: "chýba poloha zbrojnice", overenie: "poloha neoverená", adresa: "chýba adresa" };

  // ---- stav ----
  const state = { on: Object.fromEntries(LAYERS.map((l) => [l.key, l.on])), region: "", status: "", selected: null, mode: null };

  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const features = DATA.features;
  features.forEach((f, i) => {
    f.id = i;
    f.properties._q = norm([f.properties.name, f.properties.municipality, f.properties.district].join(" "));
  });

  document.getElementById("dataVersion").textContent = `Verzia dát ${DATA_VERSION} · ${features.length.toLocaleString("sk-SK")} jednotiek`;
  document.getElementById("missingCount").textContent =
    features.filter((f) => f.properties.need.includes("poloha") && f.properties.layer !== "dhzo_none").length.toLocaleString("sk-SK");

  // ---- panel ----
  const regions = [...new Set(features.map((f) => f.properties.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sk"));
  const regionSel = document.getElementById("region");
  regions.forEach((r) => regionSel.add(new Option(r, r)));
  const statusSel = document.getElementById("status");

  const layerList = document.getElementById("layerList");
  LAYERS.forEach((l) => {
    const row = document.createElement("label");
    row.className = "layer-row" + (l.group ? " group-start" : "");
    row.innerHTML =
      `<input type="checkbox" data-key="${l.key}" ${l.on ? "checked" : ""}>` +
      `<span class="swatch ${l.key === "hazz" ? "hazz" : ""}" style="background:${l.color}"></span>` +
      `<span><span class="name">${l.label}</span><span class="hint">${l.hint}</span></span>` +
      `<span class="count" data-count="${l.key}"></span>`;
    layerList.appendChild(row);
  });

  const visibleByFilters = (p) => (!state.region || p.region === state.region) && (!state.status || p.need.includes(state.status));
  function updateCounts() {
    const c = {};
    features.forEach((f) => { if (visibleByFilters(f.properties)) c[f.properties.layer] = (c[f.properties.layer] || 0) + 1; });
    document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = (c[el.dataset.count] || 0).toLocaleString("sk-SK"); });
  }

  // ---- mapa ----
  const notice = document.getElementById("notice");
  const showNotice = (msg) => { notice.textContent = msg; notice.hidden = false; setTimeout(() => { notice.hidden = true; }, 8000); };
  const FALLBACK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef1f2" } }] };

  const map = new maplibregl.Map({
    container: "map", style: CFG.basemap || FALLBACK_STYLE, bounds: SK_BOUNDS, fitBoundsOptions: { padding: 20 },
    hash: "map", attributionControl: { compact: true }, maxBounds: [[14.5, 46.8], [25.0, 50.6]],
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false, showAccuracyCircle: false }), "bottom-right");

  let dataAdded = false, styleFailed = false;
  const styleTimer = setTimeout(() => { if (!dataAdded) useFallback("Podkladová mapa sa nenačítala. Body sú zobrazené bez podkladu."); }, 10000);
  function useFallback(msg) {
    if (styleFailed) return;
    styleFailed = true;
    showNotice(msg);
    map.setStyle(FALLBACK_STYLE);
    map.once("style.load", addData);
  }
  map.on("error", (e) => {
    const m = String(e?.error?.message || e?.error || "");
    if (!dataAdded && /style|Failed to fetch|NetworkError/i.test(m)) useFallback("Podkladová mapa nie je dostupná. Body sú zobrazené bez podkladu.");
  });
  map.on("load", addData);

  const radiusExpr = (r) => ["interpolate", ["linear"], ["zoom"], r[0], r[1], r[2], r[3], r[4], r[5]];

  function addData() {
    if (dataAdded) return;
    dataAdded = true;
    clearTimeout(styleTimer);
    map.addSource("units", { type: "geojson", data: DATA, attribution: "Dáta: vyhl. 55/2002, minv.sk, DPO SR, © prispievatelia OpenStreetMap (ODbL)" });
    const order = ["dhzo_none", "dhzo_d", "dhzo_c", "dhzo_b", "other", "dhz", "dhzo_a", "dhzo_a1", "hazz"];
    order.forEach((key) => {
      const l = BY_KEY[key];
      if (key === "hazz") {
        map.addLayer({ id: "hazz-ring", type: "circle", source: "units", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 9, 9, 15, 13, 19], "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": l.color, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 2], "circle-stroke-opacity": 0.55,
        } });
      }
      map.addLayer({ id: key, type: "circle", source: "units", paint: {
        "circle-radius": radiusExpr(l.r),
        "circle-color": ["case", ["get", "approx"], "rgba(255,255,255,0.65)", l.color],
        "circle-stroke-color": ["case", ["get", "approx"], l.color, "#ffffff"],
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["get", "approx"], 1.6, 0.6], 12, ["case", ["get", "approx"], 2, 1.4]],
      } });
      map.on("mouseenter", key, () => { if (!state.mode) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", key, () => { if (!state.mode) map.getCanvas().style.cursor = ""; });
      map.on("click", key, (e) => { if (!state.mode) select(e.features[0].id); });
    });
    map.addLayer({ id: "selected", type: "circle", source: "units", filter: ["==", ["id"], -1], paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, 13, 20], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#1c2329", "circle-stroke-width": 2.5,
    } });
    applyFilters();
    const m = location.hash.match(/unit=([^&]+)/);
    if (m) {
      const f = features.find((x) => x.properties.id === decodeURIComponent(m[1]));
      if (f) select(f.id, true);
    }
  }

  function layerFilter(key) {
    const f = ["all", ["==", ["get", "layer"], key]];
    if (state.region) f.push(["==", ["get", "region"], state.region]);
    if (state.status) f.push(["in", state.status, ["get", "need"]]);
    return f;
  }
  function applyFilters() {
    updateCounts();
    if (!dataAdded) return;
    LAYERS.forEach((l) => {
      map.setFilter(l.key, layerFilter(l.key));
      map.setLayoutProperty(l.key, "visibility", state.on[l.key] ? "visible" : "none");
    });
    map.setFilter("hazz-ring", layerFilter("hazz"));
    map.setLayoutProperty("hazz-ring", "visibility", state.on.hazz ? "visible" : "none");
  }

  layerList.addEventListener("change", (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    state.on[k] = e.target.checked;
    applyFilters();
  });
  statusSel.addEventListener("change", () => { state.status = statusSel.value; applyFilters(); });
  regionSel.addEventListener("change", () => {
    state.region = regionSel.value;
    applyFilters();
    const pts = features.filter((f) => !state.region || f.properties.region === state.region).map((f) => f.geometry.coordinates);
    if (pts.length) {
      const b = pts.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(state.region ? b : SK_BOUNDS, { padding: 40, duration: reduceMotion ? 0 : 800 });
    }
  });
  document.getElementById("showMissing").addEventListener("click", () => {
    statusSel.value = "poloha";
    state.status = "poloha";
    applyFilters();
  });

  // ---- detail jednotky ----
  const detail = document.getElementById("detail");
  const detailBody = document.getElementById("detailBody");

  function sourceLink(s) {
    if (s.startsWith("osm:")) {
      const id = s.slice(4); const t = { n: "node", w: "way", r: "relation" }[id[0]];
      return `<a href="https://www.openstreetmap.org/${t}/${id.slice(1)}" target="_blank" rel="noopener">OpenStreetMap ${t} ${id.slice(1)}</a>`;
    }
    if (s.startsWith("osm-place:")) return `<a href="https://www.openstreetmap.org/node/${esc(s.slice(11))}" target="_blank" rel="noopener">OpenStreetMap – stred obce</a>`;
    if (s.startsWith("minv.sk:")) return `<a href="https://www.minv.sk/?${esc(s.slice(8))}" target="_blank" rel="noopener">minv.sk/?${esc(s.slice(8))}</a>`;
    if (s.startsWith("vyhlaska-55-2002:")) return `<a href="https://static.slov-lex.sk/static/SK/ZZ/2002/55/20190601.html" target="_blank" rel="noopener">Vyhláška 55/2002 Z. z.</a>`;
    if (s.startsWith("dposr-kategorizacia-2026:")) {
      const m = s.match(/p(\d+)/);
      return `<a href="https://www.dposr.sk/images/2026/kategorizacia_dhzo_2026.pdf#page=${m ? m[1] : 1}" target="_blank" rel="noopener">Kategorizácia DHZO 2026, strana ${m ? m[1] : "?"}</a>`;
    }
    if (s.startsWith("nominatim")) return "Geokódovanie adresy (Nominatim / OpenStreetMap)";
    if (s.startsWith("manual:")) return "Oprava správcu mapy " + esc(s.slice(7));
    if (s.startsWith("report:")) return "Pripomienka návštevníka (schválená)";
    return esc(s);
  }

  function select(fid, fly) {
    const f = features[fid];
    if (!f) return;
    cancelPick();
    const p = f.properties;
    const l = BY_KEY[p.layer];
    state.selected = fid;
    if (dataAdded) map.setFilter("selected", ["==", ["id"], fid]);
    const [lon, lat] = f.geometry.coordinates;
    const lightBadge = ["dhzo_c", "dhzo_d"].includes(p.layer);
    const catBadge = p.cat ? `<span class="badge ${lightBadge ? "light" : ""}" style="background:${l.color}">${esc(p.cat)}</span>` : "";
    const confN = CONF[p.conf] ?? 0;
    const confBars = [1, 2, 3].map((i) => `<i class="${i <= confN ? "on" : ""}"></i>`).join("");
    const flags = (p.flags || []).map((x) => FLAG[x] || x);
    const needs = p.need.filter((n) => n !== "adresa" || p.layer === "hazz");

    detailBody.innerHTML = `
      <div class="d-kind"><span class="swatch ${p.layer === "hazz" ? "hazz" : ""}" style="background:${l.color}"></span>${esc(p.kind)}</div>
      <h2 class="d-name">${esc(p.name)}</h2>
      ${needs.length ? `<p class="need">${needs.map((n) => `<span class="need-tag need-${n}">${esc(NEED[n])}</span>`).join(" ")}</p>` : ""}
      <dl class="d-grid">
        ${p.cat ? `<dt>Kategória</dt><dd>${catBadge}</dd>` : ""}
        ${p.municipality ? `<dt>Obec</dt><dd>${esc(p.municipality)}</dd>` : ""}
        ${p.district ? `<dt>Okres</dt><dd>${esc(p.district)}</dd>` : ""}
        ${p.region ? `<dt>Kraj</dt><dd>${esc(p.region)}</dd>` : ""}
        <dt>Adresa</dt><dd>${p.address ? esc(p.address) : "<span class='d-notes'>neznáma</span>"}</dd>
        <dt>Poloha</dt><dd>${esc(PREC[p.prec] || p.prec)}</dd>
        <dt>Dôvera</dt><dd><span class="conf" aria-hidden="true">${confBars}</span>${esc(CONF_LABEL[p.conf] || p.conf)}</dd>
        <dt>Súradnice</dt><dd class="d-coords">${lat.toFixed(5)}, ${lon.toFixed(5)}<button type="button" class="copy" data-copy="${lat.toFixed(6)}, ${lon.toFixed(6)}">Kopírovať</button></dd>
      </dl>
      <div class="d-actions">
        <button type="button" class="btn primary" id="suggestFix">Navrhnúť opravu</button>
        <button type="button" class="btn small" id="shareUnit">Odkaz na jednotku</button>
      </div>
      ${flags.length ? `<div class="d-section"><h3>Upozornenia k údajom</h3><ul>${flags.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${p.notes ? `<div class="d-section"><h3>Poznámky</h3><p class="d-notes">${esc(p.notes)}</p></div>` : ""}
      <div class="d-section"><h3>Zdroje</h3><ul>${(p.sources || []).map((s) => `<li>${sourceLink(s)}</li>`).join("")}</ul></div>`;
    detail.hidden = false;
    document.getElementById("suggestFix").addEventListener("click", () => openReport(fid));
    document.getElementById("shareUnit").addEventListener("click", (e) => {
      const url = location.href.split("#")[0] + "#unit=" + encodeURIComponent(p.id);
      copyText(url, e.currentTarget, "Odkaz skopírovaný");
    });
    if (fly) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12.5), duration: reduceMotion ? 0 : 900 });
  }

  function copyText(text, btn, done) {
    const ok = () => { if (btn) { const t = btn.textContent; btn.textContent = done || "Skopírované"; setTimeout(() => (btn.textContent = t), 2500); } };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text, ok));
    else fallbackCopy(text, ok);
  }
  function fallbackCopy(text, ok) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); ok(); } catch { /* nič */ }
    ta.remove();
  }

  detailBody.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (b) copyText(b.dataset.copy, b);
  });
  function closeDetail() {
    cancelPick();
    detail.hidden = true;
    state.selected = null;
    if (dataAdded) map.setFilter("selected", ["==", ["id"], -1]);
  }
  document.getElementById("detailClose").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (state.mode) finishPick(); else if (!detail.hidden) closeDetail(); } });

  // ---- výber polohy na mape (špendlík) ----
  const pickHint = document.getElementById("pickHint");
  const narrow = () => window.innerWidth < 760;
  let pin = null;
  let onPinMove = null;
  function startPick(lngLat, hint, cb) {
    state.mode = "pick";
    onPinMove = cb;
    map.getCanvas().style.cursor = "crosshair";
    pickHint.innerHTML = `<span>${esc(hint)}</span> <button type="button" class="btn small" id="pickDone">Hotovo</button>`;
    pickHint.hidden = false;
    pickHint.classList.toggle("with-detail", !detail.hidden && !narrow());
    document.getElementById("pickDone").addEventListener("click", finishPick);
    if (narrow()) {
      // na mobile uvoľniť mapu: skryť formulár a zbaliť panel; po „Hotovo“ sa formulár vráti
      detail.hidden = true;
      if (!panel.classList.contains("collapsed")) { panel.classList.add("collapsed", "auto-collapsed"); setTimeout(() => map.resize(), 50); }
    }
    if (pin) pin.setDraggable(true);
    if (!pin) {
      const el = document.createElement("div");
      el.className = "pin";
      el.setAttribute("aria-label", "navrhovaná poloha");
      pin = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" });
      pin.on("dragend", () => onPinMove && onPinMove(pin.getLngLat()));
    }
    if (lngLat) { pin.setLngLat(lngLat).addTo(map); onPinMove(pin.getLngLat()); }
  }
  /** Ukončí výber, špendlík ostane (poloha je zvolená). */
  function finishPick() {
    state.mode = null;
    map.getCanvas().style.cursor = "";
    pickHint.hidden = true;
    if (pin) pin.setDraggable(false);
    detail.hidden = false;
    restorePanel();
  }
  function restorePanel() {
    if (panel.classList.contains("auto-collapsed")) { panel.classList.remove("collapsed", "auto-collapsed"); setTimeout(() => map.resize(), 50); }
  }
  /** Zruší výber aj špendlík (zatvorenie formulára). */
  function cancelPick() {
    state.mode = null;
    map.getCanvas().style.cursor = "";
    pickHint.hidden = true;
    if (pin) { pin.remove(); pin.setDraggable(true); }
    restorePanel();
  }
  map.on("click", (e) => {
    if (state.mode !== "pick") return;
    pin.setLngLat(e.lngLat).addTo(map);
    onPinMove && onPinMove(e.lngLat);
  });

  // ---- odoslanie návrhu cez formulárovú službu (Web3Forms / FormSubmit) ----
  // Poskytovatelia v poradí: hlavný (CFG.formProvider), potom záložný, ak je nastavený.
  const PROVIDERS = {
    web3forms: { label: "Web3Forms", ready: () => Boolean(CFG.web3formsKey) },
    formsubmit: { label: "FormSubmit", ready: () => Boolean(CFG.formsubmitId) },
  };
  const providerChain = () => {
    const main = CFG.formProvider === "formsubmit" ? "formsubmit" : "web3forms";
    const other = main === "formsubmit" ? "web3forms" : "formsubmit";
    return [main, other].filter((k) => PROVIDERS[k].ready());
  };
  const formReady = () => providerChain().length > 0;

  async function sendVia(provider, { subject, body, replyTo, honey }) {
    if (provider === "formsubmit") {
      const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(CFG.formsubmitId)}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ _subject: subject, _template: "box", _captcha: "false", _honey: honey, ...(replyTo ? { email: replyTo } : {}), sprava: body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || String(j.success) !== "true") throw new Error(j.message || `HTTP ${res.status}`);
      return;
    }
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: CFG.web3formsKey, subject, from_name: "Mapa hasičských jednotiek", botcheck: honey ? true : "", ...(replyTo ? { email: replyTo } : {}), message: body }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) throw new Error(j.message || `HTTP ${res.status}`);
  }

  /** Skúsi hlavného poskytovateľa; ak zlyhá (limit, výpadok), automaticky záložného. */
  async function sendForm(msg) {
    let lastErr = new Error("Odosielanie nie je nastavené.");
    for (const provider of providerChain()) {
      try { await sendVia(provider, msg); return; } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  const PROBLEMS = [
    ["poloha", "poloha zbrojnice / stanice"],
    ["adresa", "adresa"],
    ["odkaz", "odkaz na web alebo Facebook zboru / obce"],
    ["kategoria", "kategória alebo názov"],
    ["neexistuje", "jednotka neexistuje, je zlúčená alebo nefunguje"],
    ["ine", "iné"],
  ];

  function reportForm({ title, unit, isNew }) {
    const p = unit?.properties;
    return `
      <h2 class="d-name">${esc(title)}</h2>
      ${p ? `<p class="small muted">${esc(p.kind)} · ${esc(p.municipality || p.district || "")}</p>` : `<p class="small muted">Jednotka, ktorá na mape chýba (napr. DHZ, zbrojnica v časti obce).</p>`}
      <form id="reportForm" class="report" novalidate>
        ${isNew ? `
          <label class="lbl" for="rName">Názov jednotky</label>
          <input id="rName" type="text" required placeholder="napr. DHZ Horná Ves">
          <label class="lbl" for="rMuni">Obec</label>
          <input id="rMuni" type="text" placeholder="obec / časť obce">` : `
          ${p.prec === "exact-unverified" ? `<label class="check confirm"><input type="checkbox" name="problem" value="potvrdenie" id="rConfirm"><span><b>Poloha je správna.</b> Overil(a) som, že bod na mape leží na zbrojnici / stanici tejto jednotky.</span></label>` : ""}
          <fieldset><legend class="lbl">Čo je nesprávne alebo chýba</legend>
            ${PROBLEMS.map(([k, v]) => `<label class="check"><input type="checkbox" name="problem" value="${k}" ${k === "poloha" && p.need.includes("poloha") ? "checked" : ""}>${esc(v)}</label>`).join("")}
          </fieldset>`}
        <div class="pos-box">
          <span class="lbl">Navrhovaná poloha</span>
          <span id="rPos" class="d-coords">${isNew ? "kliknite do mapy" : "bez zmeny"}</span>
          <button type="button" class="btn small" id="rPick">${isNew ? "Vybrať na mape" : "Upraviť na mape"}</button>
        </div>
        <label class="lbl" for="rAddr">Adresa zbrojnice / stanice</label>
        <input id="rAddr" type="text" placeholder="ulica, súpisné číslo, obec">
        <label class="lbl" for="rLink">Odkaz (web, Facebook, článok)</label>
        <input id="rLink" type="url" inputmode="url" placeholder="https://">
        <label class="lbl" for="rNote">Poznámka alebo zdroj informácie</label>
        <textarea id="rNote" rows="3" maxlength="800" placeholder="napr. zbrojnica je za obecným úradom; som členom zboru"></textarea>
        <label class="lbl" for="rMail">Váš e-mail <span class="muted">(nepovinné – iba ak vám môžem napísať doplňujúcu otázku)</span></label>
        <input id="rMail" type="email" autocomplete="email" maxlength="120" placeholder="meno@example.sk">
        <div class="hp" aria-hidden="true"><label>Nevypĺňať <input id="rHoney" type="text" tabindex="-1" autocomplete="off"></label></div>
        <p class="small muted">Návrh pred zapracovaním skontrolujem. Údaje z návrhu (nie váš e-mail) môžu byť zverejnené v mape pod licenciou ODbL. Návrh doručí služba ${providerChain().map((k) => PROVIDERS[k].label).join(" alebo ") || "Web3Forms"}. <a href="o-mape.html#sukromie" target="_blank">Ochrana údajov</a></p>
        <div class="btn-row">
          <button type="submit" class="btn primary" id="rSend">Odoslať návrh</button>
          <button type="button" class="btn" id="rCancel">Zrušiť</button>
        </div>
        <div id="rFallback" class="fallback" hidden></div>
      </form>`;
  }

  function buildMessage({ unit, isNew, pos }) {
    const v = (id) => (document.getElementById(id)?.value || "").trim().replace(/\r?\n/g, " ");
    const problems = [...document.querySelectorAll('input[name="problem"]:checked')].map((x) => x.value);
    const p = unit?.properties;
    const name = isNew ? v("rName") || "(bez názvu)" : p.name;
    const lines = [
      "--- ÚDAJE PRE SPRACOVANIE (prosím neupravujte) ---",
      "format: mapa-hasicov/1",
      `typ: ${isNew ? "nova-jednotka" : "oprava"}`,
      `id: ${isNew ? "-" : p.id}`,
      `nazov: ${name}`,
      `obec: ${isNew ? v("rMuni") : p.municipality || ""}`,
    ];
    if (!isNew) {
      const [lon, lat] = unit.geometry.coordinates;
      lines.push(`problem: ${problems.join(", ") || "-"}`);
      lines.push(`poloha-povodna: ${lat.toFixed(6)}, ${lon.toFixed(6)} (${p.prec})`);
    }
    lines.push(`poloha-navrh: ${pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : "-"}`);
    lines.push(`adresa: ${v("rAddr") || "-"}`);
    lines.push(`odkaz: ${v("rLink") || "-"}`);
    lines.push(`poznamka: ${v("rNote") || "-"}`);
    lines.push(`verzia-dat: ${DATA_VERSION}`);
    lines.push("--- KONIEC ---");
    const subject = isNew ? `[Mapa hasičov] Nová jednotka: ${name}` : `[Mapa hasičov] Oprava: ${p.name} (${p.id})`;
    return { subject, body: lines.join("\n") };
  }

  function wireReport({ unit, isNew }) {
    let pos = null;
    const posEl = document.getElementById("rPos");
    const setPos = (ll) => { pos = ll; posEl.textContent = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`; };
    const pickHintText = "Kliknite na miesto zbrojnice alebo posuňte špendlík. Pomôže priblíženie mapy.";
    document.getElementById("rPick").addEventListener("click", () => {
      const start = isNew ? null : { lng: unit.geometry.coordinates[0], lat: unit.geometry.coordinates[1] };
      if (!isNew && !document.querySelector('input[value="poloha"]').checked) document.querySelector('input[value="poloha"]').checked = true;
      if (document.getElementById("rConfirm")) document.getElementById("rConfirm").checked = false;
      startPick(start, pickHintText, setPos);
      if (start) map.flyTo({ center: start, zoom: Math.max(map.getZoom(), 15), duration: reduceMotion ? 0 : 700 });
    });
    if (isNew) startPick(null, pickHintText, setPos);
    // pri novej jednotke na mobile najprv formulár, polohu vyberie tlačidlom
    if (isNew && narrow()) finishPick();

    const conf = document.getElementById("rConfirm");
    if (conf) {
      const polo = document.querySelector('input[name="problem"][value="poloha"]');
      conf.addEventListener("change", () => { if (conf.checked) polo.checked = false; });
      polo.addEventListener("change", () => { if (polo.checked) conf.checked = false; });
    }
    const form = document.getElementById("reportForm");
    const fallback = document.getElementById("rFallback");
    const validate = () => {
      const link = document.getElementById("rLink").value.trim();
      if (link && !/^https?:\/\/\S+\.\S+/.test(link)) return "Odkaz musí začínať https:// alebo http://";
      if (isNew && !document.getElementById("rName").value.trim()) return "Zadajte názov jednotky.";
      if (isNew && !pos) return "Vyberte polohu jednotky na mape.";
      return null;
    };
    const showFallback = (msg, text, ok) => {
      fallback.hidden = false;
      fallback.className = "fallback" + (ok ? " ok" : "");
      fallback.innerHTML = `<p>${esc(msg)}</p>` + (text ? `<textarea readonly rows="8" aria-label="Text návrhu">${esc(text)}</textarea><p><button type="button" class="copy" data-copy-area>Skopírovať text</button></p>` : "");
    };
    let sending = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (sending) return;
      const err = validate();
      if (err) { showFallback(err); return; }
      const mail = document.getElementById("rMail").value.trim();
      if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { showFallback("Skontrolujte e-mailovú adresu alebo pole nechajte prázdne."); return; }
      const { subject, body } = buildMessage({ unit, isNew, pos });
      if (!formReady()) { showFallback("Odosielanie zatiaľ nie je nastavené. Text návrhu si môžete skopírovať.", `${subject}\n\n${body}`); return; }
      const btn = document.getElementById("rSend");
      sending = true; btn.disabled = true; btn.textContent = "Odosielam…";
      try {
        await sendForm({ subject, body, replyTo: mail, honey: document.getElementById("rHoney").value });
        cancelPick();
        form.querySelectorAll("input, textarea, button").forEach((x) => { if (x.id !== "rCancel") x.disabled = true; });
        document.getElementById("rCancel").textContent = "Zavrieť";
        btn.textContent = "Odoslané";
        showFallback("Ďakujem! Návrh bol odoslaný. Po kontrole ho zapracujem do mapy.", null, true);
      } catch (ex) {
        sending = false; btn.disabled = false; btn.textContent = "Odoslať návrh";
        showFallback(`Odoslanie sa nepodarilo (${ex.message || "chyba siete"}). Skúste to neskôr alebo si text uložte.`, `${subject}\n\n${body}`);
      }
    });
    fallback.addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy-area]");
      if (b) copyText(fallback.querySelector("textarea").value, b, "Skopírované");
    });
    document.getElementById("rCancel").addEventListener("click", () => { cancelPick(); unit ? select(unit.id) : closeDetail(); });
  }

  function openReport(fid) {
    const unit = features[fid];
    detailBody.innerHTML = reportForm({ title: `Návrh opravy – ${unit.properties.name}`, unit, isNew: false });
    detail.hidden = false;
    wireReport({ unit, isNew: false });
  }
  document.getElementById("addUnit").addEventListener("click", () => {
    if (dataAdded) map.setFilter("selected", ["==", ["id"], -1]);
    state.selected = null;
    detailBody.innerHTML = reportForm({ title: "Nahlásiť chýbajúcu jednotku", unit: null, isNew: true });
    detail.hidden = false;
    wireReport({ unit: null, isNew: true });
    if (window.innerWidth < 760) document.getElementById("sheetToggle").click();
  });

  // ---- vyhľadávanie ----
  const search = document.getElementById("search");
  const results = document.getElementById("results");
  let hits = [], active = -1;
  function renderResults() {
    results.innerHTML = "";
    if (!hits.length) results.innerHTML = `<li class="empty">Nič sa nenašlo. Skúste názov obce bez diakritiky.</li>`;
    hits.forEach((f, i) => {
      const p = f.properties;
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      li.dataset.fid = f.id;
      li.innerHTML = `<span class="swatch ${p.layer === "hazz" ? "hazz" : ""}" style="background:${BY_KEY[p.layer].color}"></span>` +
        `<span><span class="r-name">${esc(p.name)}</span> <span class="r-meta">${esc(p.district || p.region || p.kind)}</span></span>`;
      results.appendChild(li);
    });
    results.hidden = false;
  }
  search.addEventListener("input", () => {
    const q = norm(search.value.trim());
    if (q.length < 2) { results.hidden = true; return; }
    const rank = (p) => (p.layer === "hazz" ? 0 : p.layer === "other" || p.layer === "dhz" ? 2 : 1);
    hits = features.filter((f) => f.properties._q.includes(q))
      .sort((a, b) => rank(a.properties) - rank(b.properties) ||
        (norm(a.properties.name).startsWith(q) ? -1 : 0) - (norm(b.properties.name).startsWith(q) ? -1 : 0) ||
        a.properties.name.localeCompare(b.properties.name, "sk"))
      .slice(0, 12);
    active = hits.length ? 0 : -1;
    renderResults();
  });
  search.addEventListener("keydown", (e) => {
    if (results.hidden || !hits.length) return;
    if (e.key === "ArrowDown") { active = Math.min(active + 1, hits.length - 1); renderResults(); e.preventDefault(); }
    if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); renderResults(); e.preventDefault(); }
    if (e.key === "Enter" && active >= 0) { choose(hits[active].id); e.preventDefault(); }
    if (e.key === "Escape") results.hidden = true;
  });
  results.addEventListener("click", (e) => { const li = e.target.closest("[data-fid]"); if (li) choose(+li.dataset.fid); });
  function choose(fid) {
    const p = features[fid].properties;
    if (!state.on[p.layer]) { state.on[p.layer] = true; document.querySelector(`input[data-key="${p.layer}"]`).checked = true; }
    if (state.status && !p.need.includes(state.status)) { state.status = ""; statusSel.value = ""; }
    if (state.region && state.region !== p.region) { state.region = ""; regionSel.value = ""; }
    applyFilters();
    results.hidden = true;
    search.value = p.name;
    select(fid, true);
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) results.hidden = true; });

  // ---- mobil ----
  const toggle = document.getElementById("sheetToggle");
  toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    toggle.textContent = collapsed ? "Zobraziť panel" : "Skryť panel";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    setTimeout(() => map.resize(), 50);
  });

  updateCounts();
  window.__fireMap = { map, state, select, choose, buildMessage };
})();
