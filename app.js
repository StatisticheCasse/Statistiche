/* Renko Stats — dashboard statistiche RistorAndro
 * Pagina statica: supabase-js + Chart.js. Nessun build step. */
(() => {
  "use strict";

  const APP_VERSION = "1.8.1";
  const CFG = window.RENKO_CONFIG || {};
  console.info("Renko Stats " + APP_VERSION);
  const DEMO = new URLSearchParams(location.search).has("demo") || !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("XXXX") || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY.includes("INCOLLA");
  const $ = (s, r = document) => r.querySelector(s);
  // collega un evento solo se l'elemento esiste (pagina e script di versioni diverse non bloccano più tutto)
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el[ev] = fn; return el; };
  // qualsiasi errore all'avvio viene mostrato invece di lasciare la pagina bianca
  window.addEventListener("error", (e) => {
    if (document.getElementById("login")?.classList.contains("hidden") && document.getElementById("app")?.classList.contains("hidden")) {
      document.body.insertAdjacentHTML("beforeend", `<div style="max-width:560px;margin:60px auto;padding:20px;font-family:sans-serif;border:1px solid #fecaca;background:#fef2f2;border-radius:12px;color:#7f1d1d">
        <b>La pagina non si è caricata correttamente.</b><br>Probabilmente i file del sito non sono tutti aggiornati alla stessa versione (index.html e app.js).
        Ricarica con Ctrl+F5; se il problema resta, ricarica su GitHub tutti i file del sito.<br><small style="color:#991b1b">${String(e.message || e).replace(/</g, "&lt;")}</small></div>`);
    }
  });
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ------------------------------------------------------------------ formattazione
  const eur = (n) => "€ " + (Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = (n) => "€ " + (Number(n) || 0).toLocaleString("it-IT", { maximumFractionDigits: 0 });
  const num = (n, d = 0) => (Number(n) || 0).toLocaleString("it-IT", { maximumFractionDigits: d });
  const pct = (n) => (Number(n) || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseD = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtDay = (s, o = { day: "numeric", month: "short" }) => parseD(s).toLocaleDateString("it-IT", o);
  const fmtTs = (s) => s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "mai";
  const DOW = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const ago = (min) => min == null ? "mai" : min < 1 ? "adesso" : min < 60 ? `${min} min fa` : min < 1440 ? `${Math.floor(min / 60)} h fa` : `${Math.floor(min / 1440)} g fa`;

  function delta(cur, prev, label = "vs periodo prec.") {
    if (!prev) return `<div class="delta flat">— ${label}</div>`;
    const p = ((cur - prev) / Math.abs(prev)) * 100;
    const cls = Math.abs(p) < 0.5 ? "flat" : p > 0 ? "up" : "down";
    return `<div class="delta ${cls}">${p > 0 ? "▲" : p < 0 ? "▼" : "•"} ${Math.abs(p).toFixed(1)}% <span style="font-weight:400">${label}</span></div>`;
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  const store = {
    get(k, d) { try { return localStorage.getItem("rs_" + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("rs_" + k, v); } catch { /* ok */ } },
  };

  // ------------------------------------------------------------------ API
  function realApi() {
    const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    return {
      async user() { const { data } = await sb.auth.getSession(); return data.session?.user ?? null; },
      async login(email, password) { unwrap(await sb.auth.signInWithPassword({ email, password })); },
      async logout() { await sb.auth.signOut(); },
      async resetPassword(email) { unwrap(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin })); },
      async setPassword(password) { unwrap(await sb.auth.updateUser({ password })); },
      onAuth(cb) { sb.auth.onAuthStateChange(cb); },
      async isAdmin(uid) { const d = unwrap(await sb.from("app_admins").select("user_id").eq("user_id", uid)); return d.length > 0; },
      async stores() { return unwrap(await sb.from("stores").select("*").order("name")); },
      async stats(id, from, to) { return unwrap(await sb.rpc("get_stats", { p_store: id, p_from: from, p_to: to })); },
      async calendar(id, month) { return unwrap(await sb.rpc("get_calendar", { p_store: id, p_month: month })); },
      async documents(id, from, to, kind, search) { return unwrap(await sb.rpc("get_documents", { p_store: id, p_from: from, p_to: to, p_kind: kind, p_search: search || null })); },
      async vatDaily(id, from, to) { return unwrap(await sb.rpc("get_vat_daily", { p_store: id, p_from: from, p_to: to })); },
      async documentDetail(id, nmov, day) { return unwrap(await sb.rpc("get_document_detail", { p_store: id, p_nmov: nmov, p_day: day })); },
      async devices() { return unwrap(await sb.rpc("get_devices_status")); },
      async syncLog(id) { return unwrap(await sb.from("sync_log").select("*").eq("store_id", id).order("at", { ascending: false }).limit(40)); },
      async emailLog(id) { await sb.rpc("report_refresh_status").catch(() => null); return unwrap(await sb.from("email_log").select("*").eq("store_id", id).order("created_at", { ascending: false }).limit(60)); },
      async saveSettings(id, s) {
        unwrap(await sb.rpc("update_store_settings", { p_store: id, p_report_enabled: s.report_enabled, p_report_emails: s.report_emails, p_offline_alert_minutes: s.offline_alert_minutes }));
      },
      async signUp(email, password) { unwrap(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })); },
      // Mail: tutto con funzioni del database (nessuna Edge Function)
      async report(b) {
        if (b.mode === "preview") return unwrap(await sb.rpc("report_preview", { p_store: b.store_id, p_day: b.day }));
        return { result: unwrap(await sb.rpc("report_send", { p_store: b.store_id, p_day: b.day, p_test: b.mode === "test" })) };
      },
      async adminIngest(store, p) { return unwrap(await sb.rpc("admin_ingest", { p_store: store, p })); },
      async printEnqueue(store, device, title, payload) { return unwrap(await sb.rpc("print_enqueue", { p_store: store, p_device: device, p_title: title, p_payload: payload })); },
      async printStatus(id) { return unwrap(await sb.from("print_jobs").select("status,error,printed_at").eq("id", id).maybeSingle()); },
      async admin(b) {
        switch (b.action) {
          case "list_members": return { members: unwrap(await sb.rpc("admin_list_members", { p_store: b.store_id })) };
          case "create_device": { const r = unwrap(await sb.rpc("admin_create_device", { p_store: b.store_id, p_name: b.name })); return { activation_code: activationCode(r.key, r.store) }; }
          case "regen_device_key": { const r = unwrap(await sb.rpc("admin_regen_device_key", { p_device: b.device_id })); return { activation_code: activationCode(r.key, r.store) }; }
          case "add_member": return unwrap(await sb.rpc("admin_add_member", { p_store: b.store_id, p_email: b.email, p_role: b.role }));
          case "remove_member": unwrap(await sb.rpc("admin_remove_member", { p_store: b.store_id, p_user: b.user_id })); return {};
        }
        throw new Error("azione sconosciuta");
      },
      async upsertStore(s) {
        if (s.id) return unwrap(await sb.from("stores").update(s).eq("id", s.id).select().single());
        return unwrap(await sb.from("stores").insert(s).select().single());
      },
      async deleteStore(id) { unwrap(await sb.from("stores").delete().eq("id", id)); },
      async updateDevice(id, patch) { unwrap(await sb.from("devices").update(patch).eq("id", id)); },
      async deleteDevice(id) { unwrap(await sb.from("devices").delete().eq("id", id)); },
    };
  }

  function demoApi() {
    let data = null;
    const load = async () => data ??= await (await fetch("demo/demo-data.json")).json();
    const demoStore = { id: "demo", name: "Piatti e Fagotti (demo)", code: "PEF", address: "Via Arnolfo 27, Firenze", day_cutoff_hour: 5, report_enabled: true, report_emails: ["titolare@example.com"], offline_alert_minutes: 180 };
    return {
      async user() { return { id: "demo", email: "demo@renkosoft.it" }; },
      async login() {}, async signUp() {}, async logout() { location.search = ""; }, async resetPassword() {}, async setPassword() {}, onAuth() {},
      async isAdmin() { return true; },
      async stores() { return [demoStore]; },
      async stats(id, from, to) {
        await load();
        const key = `${from}_${to}`;
        if (data.stats[key]) return data.stats[key];
        const days = (parseD(to) - parseD(from)) / 864e5 + 1;
        const best = Object.values(data.stats).sort((a, b) => Math.abs(a.range.days - days) - Math.abs(b.range.days - days))[0];
        return best;
      },
      async calendar(id, month) { await load(); return data.calendar[month.slice(0, 7)] ?? []; },
      async documents(id, f, t, kind) { await load(); return (data.documents || {})[kind] || { n: 0, totale: 0, rows: [] }; },
      async documentDetail() { return { header: {}, lines: [], payments: [] }; },
      async vatDaily() { await load(); return data.vat || { rows: [], non_fiscale: [], docs: [] }; },
      async devices() {
        return [{ device_id: "d1", store_id: "demo", store_name: demoStore.name, name: "Tablet cassa", enabled: true, last_seen: new Date(Date.now() - 120000).toISOString(),
          last_sync_at: new Date(Date.now() - 420000).toISOString(), last_error: null, app_version: "1.0.0", db_path: "Venduto.db + Anagra.db",
          info: { cursors: { lines: 22010, receipts: 4240, payments: 3240, deleted: 168 }, sample_datam: "2026-10-22 23:41:02 (text)", android: "Lenovo TB-X606F · Android 10", interval_min: 5, printer: "192.168.1.50:9100 (80 mm)" }, minutes_ago: 2, offline: false }];
      },
      async syncLog() { return Array.from({ length: 8 }, (_, i) => ({ at: new Date(Date.now() - i * 3e5 * 7).toISOString(), ok: i !== 5, counts: { lines: 40 - i * 3, receipts: 6, payments: 6, deleted: 0 }, error: i === 5 ? "rete: timeout" : null })); },
      async emailLog() { return Array.from({ length: 6 }, (_, i) => ({ created_at: addDays(new Date(), -i).toISOString(), day: iso(addDays(new Date(), -i - 1)), kind: "daily", status: i === 3 ? "error" : "sent", recipients: ["titolare@example.com"], subject: "Riepilogo", error: i === 3 ? "Resend 422: dominio non verificato" : null })); },
      async saveSettings() {}, async report() { return { ok: true, html: "<p style='font-family:sans-serif;padding:20px'>Anteprima disponibile con il backend collegato.</p>", result: { status: "sent" } }; },
      async printEnqueue(s, d, t, p) { window.__print = p; return 1; },
      async printStatus() { return { status: "done" }; },
      async adminIngest(store, p) { (window.__ingest ||= []).push(p); await new Promise((r) => setTimeout(r, 5)); return {}; },
      async admin(b) { return b.action === "list_members" ? { members: [{ user_id: "u1", email: "titolare@example.com", role: "owner" }] } : { activation_code: "RS1.eyJ1IjoiaHR0cHM6Ly9kZW1vIiwiayI6ImRlbW8iLCJzIjoiZGVtbyJ9" }; },
      async upsertStore(s) { return { ...demoStore, ...s }; }, async deleteStore() {}, async updateDevice() {}, async deleteDevice() {},
    };
  }

  // Codice da incollare nello spooler: indirizzo Supabase + anon key + chiave del dispositivo
  function activationCode(key, storeName) {
    const json = JSON.stringify({ u: CFG.SUPABASE_URL, a: CFG.SUPABASE_ANON_KEY, k: key, s: storeName });
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return "RS1." + b64;
  }

  const api = DEMO ? demoApi() : realApi();

  // ------------------------------------------------------------------ stato
  const S = {
    user: null, isAdmin: false, stores: [], storeId: null,
    preset: store.get("preset", "yesterday"), from: null, to: null,
    tab: store.get("tab", "overview"), stats: null, calMonth: null,
    prodSort: { k: "netto", d: -1 }, prodSearch: "", prodRep: "",
  };
  const cur = () => S.stores.find((s) => s.id === S.storeId);

  // ------------------------------------------------------------------ periodo
  function businessToday() {
    const cut = cur()?.day_cutoff_hour ?? 5;
    const d = new Date(); d.setHours(d.getHours() - cut); d.setHours(0, 0, 0, 0); return d;
  }
  function applyPreset(p) {
    const t = businessToday();
    let f = t, to = t;
    switch (p) {
      case "today": break;
      case "yesterday": f = to = addDays(t, -1); break;
      case "7d": f = addDays(t, -7); to = addDays(t, -1); break;
      case "30d": f = addDays(t, -30); to = addDays(t, -1); break;
      case "month": f = new Date(t.getFullYear(), t.getMonth(), 1); to = t; break;
      case "prevmonth": f = new Date(t.getFullYear(), t.getMonth() - 1, 1); to = new Date(t.getFullYear(), t.getMonth(), 0); break;
      case "year": f = new Date(t.getFullYear(), 0, 1); to = t; break;
    }
    S.preset = p; S.from = iso(f); S.to = iso(to);
    store.set("preset", p);
  }
  function rangeText() {
    if (S.from === S.to) return fmtDay(S.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return `${fmtDay(S.from, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDay(S.to, { day: "numeric", month: "short", year: "numeric" })}`;
  }

  // ------------------------------------------------------------------ grafici
  const charts = [];
  function killCharts() { while (charts.length) charts.pop().destroy(); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function barChart(canvas, labels, values, opts = {}) {
    const accent = css("--accent"), muted = css("--muted"), grid = css("--grid");
    const c = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: opts.colors || accent, borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, borderSkipped: "start", maxBarThickness: 38, categoryPercentage: .8, barPercentage: .9 }] },
      options: {
        indexAxis: opts.horizontal ? "y" : "x",
        maintainAspectRatio: false, animation: { duration: 250 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => " " + (opts.fmt || eur)(ctx.parsed[opts.horizontal ? "x" : "y"]) + (opts.extra ? " · " + opts.extra(ctx.dataIndex) : "") } } },
        scales: {
          x: { grid: { display: !!opts.horizontal, color: grid }, ticks: Object.assign({ color: muted, maxRotation: 0, autoSkip: true }, opts.horizontal ? { callback: (v) => (opts.tick || eur0)(v) } : {}), border: { display: false } },
          y: { grid: { display: !opts.horizontal, color: grid }, ticks: Object.assign({ color: muted }, opts.horizontal ? {} : { callback: (v) => (opts.tick || eur0)(v) }), border: { display: false }, beginAtZero: true },
        },
      },
    });
    charts.push(c); return c;
  }

  // ------------------------------------------------------------------ util viste
  const card = (title, sub, body, extra = "") => `<div class="card"><div class="card-head"><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${extra}</div>${body}</div>`;
  const kpi = (label, value, d = "", hero = false) => `<div class="card kpi ${hero ? "hero" : ""}"><div class="label">${label}</div><div class="value">${value}</div>${d}</div>`;
  const empty = (msg = "Nessun dato nel periodo selezionato") => `<div class="empty-state">${msg}</div>`;

  function sortedHours(st) {
    const cut = st.range?.cutoff_hour ?? 0;
    return [...(st.hourly || [])].sort((a, b) => ((a.ora - cut + 24) % 24) - ((b.ora - cut + 24) % 24));
  }
  function trimHours(hours) {
    let a = 0, b = hours.length - 1;
    while (a < b && !hours[a].netto && !hours[a].scontrini) a++;
    while (b > a && !hours[b].netto && !hours[b].scontrini) b--;
    return hours.slice(a, b + 1);
  }
  const hh = (h) => String(h).padStart(2, "0");

  function downloadCsv(name, rows) {
    const csv = rows.map((r) => r.map((v) => typeof v === "number" ? String(v).replace(".", ",") : `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    saveBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), name);
  }

  // ------------------------------------------------------------------ viste
  const views = {};

  views.overview = (st) => {
    const k = st.kpi;
    if (!k.scontrini && !k.netto) return empty("Nessuna vendita nel periodo. Se non te lo aspetti, controlla il Monitoraggio dello spooler.");
    const single = st.range.days === 1;
    const prods = st.products.filter((p) => p.codint !== "888888").slice(0, 10);
    const maxP = Math.max(1, ...prods.map((p) => p.netto));
    const payTot = st.payments.reduce((a, p) => a + p.importo, 0) || 1;
    const html = `
      <div class="grid kpis">
        ${kpi("Incasso netto", eur(k.netto), delta(k.netto, k.prev_netto), true)}
        ${kpi("Scontrini", num(k.scontrini), delta(k.scontrini, k.prev_scontrini))}
        ${kpi("Scontrino medio", eur(k.scontrino_medio), delta(k.scontrino_medio, k.prev_scontrini ? k.prev_netto / k.prev_scontrini : 0))}
        ${kpi("Coperti", num(k.coperti), delta(k.coperti, k.prev_coperti))}
        ${kpi("Medio a coperto", eur(k.medio_coperto), delta(k.medio_coperto, k.prev_coperti ? k.prev_netto / k.prev_coperti : 0))}
        ${kpi("Pezzi venduti", num(k.pezzi), `<div class="delta flat">sconti ${eur(k.sconti)}</div>`)}
      </div>
      <div class="grid cols-2">
        ${single
          ? card("Incasso per fascia oraria", "Ora di apertura dello scontrino", `<div class="chart-box"><canvas id="c1"></canvas></div>`)
          : card("Incasso per giorno", `${st.range.days} giornate contabili`, `<div class="chart-box"><canvas id="c1"></canvas></div>`)}
        ${single
          ? card("Scontrini per fascia oraria", "", `<div class="chart-box"><canvas id="c2"></canvas></div>`)
          : card("Media per giorno della settimana", "Incasso medio per giornata di apertura", `<div class="chart-box"><canvas id="c2"></canvas></div>`)}
      </div>
      <div class="grid cols-2" style="margin-top:12px">
        ${card("Prodotti più venduti", "Per incasso", `<div class="table-wrap"><table class="data"><thead><tr><th>Prodotto</th><th class="r">Q.tà</th><th class="r">Incasso</th><th></th></tr></thead><tbody>
          ${prods.map((p) => `<tr><td>${esc(p.descrizione)}</td><td class="r">${num(p.qta, 1)}</td><td class="r">${eur(p.netto)}</td><td class="bar-cell"><div class="bar" style="width:${(p.netto / maxP) * 100}%"></div></td></tr>`).join("")}
          </tbody></table></div>`, `<button class="btn small" data-go="products">Tutti →</button>`)}
        ${card("Pagamenti", `Incassato ${eur(k.incassato)}`, `<div class="table-wrap"><table class="data"><thead><tr><th>Tipo</th><th class="r">N.</th><th class="r">Importo</th><th class="r">%</th></tr></thead><tbody>
          ${st.payments.map((p) => `<tr><td>${esc(p.descrizione)}</td><td class="r">${num(p.n)}</td><td class="r">${eur(p.importo)}</td><td class="r">${pct((p.importo / payTot) * 100)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nessun pagamento registrato</td></tr>`}
          </tbody></table></div>`, `<button class="btn small" data-go="payments">Dettaglio →</button>`)}
      </div>`;
    S.exportSpec = () => ({ title: "Panoramica", file: "panoramica", kpi: [["Incasso netto", k.netto, "eur"], ["Scontrini", k.scontrini, "n"], ["Scontrino medio", k.scontrino_medio, "eur"], ["Coperti", Number(k.coperti), "n"], ["Medio a coperto", k.medio_coperto, "eur"], ["Pezzi venduti", Number(k.pezzi), "n"], ["Incasso periodo precedente", k.prev_netto, "eur"]],
      sections: [
        single ? { name: "Incasso per ora", cols: ["Ora", "Scontrini", "Incasso"], eur: [2], rows: trimHours(sortedHours(st)).map((h) => [`${hh(h.ora)}:00`, h.scontrini, h.netto]) }
               : { name: "Incasso per giorno", cols: ["Giorno", "Scontrini", "Coperti", "Incasso"], eur: [3], print: [0, 1, 3], rows: st.daily.map((d) => [parseD(d.day).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }), d.scontrini, Number(d.coperti) || 0, d.netto]) },
        { name: "Prodotti più venduti", cols: ["Prodotto", "Quantità", "Incasso"], eur: [2], rows: st.products.filter((p) => p.codint !== "888888").slice(0, 20).map((p) => [p.descrizione, Number(p.qta), p.netto]) },
        { name: "Pagamenti", cols: ["Tipo", "N.", "Importo", "%"], eur: [2], pct: [3], print: [0, 2], rows: st.payments.map((p) => [p.descrizione, p.n, p.importo, (p.importo / payTot) * 100]) },
      ] });
    return { html, after() {
      if (single) {
        const h = trimHours(sortedHours(st));
        barChart($("#c1"), h.map((x) => `${hh(x.ora)}`), h.map((x) => x.netto), { extra: (i) => `${h[i].scontrini} scontrini` });
        barChart($("#c2"), h.map((x) => `${hh(x.ora)}`), h.map((x) => x.scontrini), { fmt: (v) => num(v) + " scontrini", tick: num });
      } else {
        barChart($("#c1"), st.daily.map((d) => fmtDay(d.day, st.range.days > 40 ? { month: "short", day: "numeric" } : { weekday: "short", day: "numeric" })), st.daily.map((d) => d.netto), { extra: (i) => `${st.daily[i].scontrini} scontrini` });
        const w = st.weekday;
        barChart($("#c2"), w.map((x) => DOW[x.dow]), w.map((x) => x.giorni ? x.netto / x.giorni : 0), { extra: (i) => `${w[i].giorni} giorni · ${eur(w[i].netto)} totale` });
      }
    } };
  };

  views.products = (st) => {
    const reps = st.departments;
    const totRep = reps.reduce((a, r) => a + r.netto, 0) || 1;
    const repName = Object.fromEntries(reps.map((r) => [r.reparto, r.descrizione]));
    const html = `
      <div class="grid cols-2" style="margin-bottom:12px">
        ${card("Incasso per reparto", "", `<div class="chart-box tall"><canvas id="cRep"></canvas></div>`)}
        ${card("Reparti", "", `<div class="table-wrap"><table class="data"><thead><tr><th>Reparto</th><th class="r">Q.tà</th><th class="r">Incasso</th><th class="r">%</th></tr></thead><tbody>
          ${reps.map((r) => `<tr><td>${esc(r.descrizione)}</td><td class="r">${num(r.qta, 1)}</td><td class="r">${eur(r.netto)}</td><td class="r">${pct((r.netto / totRep) * 100)}</td></tr>`).join("")}
          </tbody><tfoot><tr><td>Totale</td><td class="r">${num(reps.reduce((a, r) => a + r.qta, 0), 1)}</td><td class="r">${eur(totRep)}</td><td></td></tr></tfoot></table></div>`)}
      </div>
      ${card("Prodotti venduti", `${st.products.length} articoli · confronto quantità con il periodo precedente`, `<div id="prodTable"></div>`,
        `<div class="toolbar"><input class="search" id="prodSearch" type="text" placeholder="Cerca prodotto…" value="${esc(S.prodSearch)}">
         <select id="prodRep" style="width:auto"><option value="">Tutti i reparti</option>${reps.map((r) => `<option value="${r.reparto}" ${String(r.reparto) === S.prodRep ? "selected" : ""}>${esc(r.descrizione)}</option>`).join("")}</select>
         <button class="btn small" id="prodCsv">Esporta CSV</button></div>`)}`;
    const drawTable = () => {
      const q = S.prodSearch.toLowerCase();
      let rows = st.products.filter((p) => (!q || (p.descrizione || "").toLowerCase().includes(q) || String(p.codint).includes(q)) && (!S.prodRep || String(p.reparto) === S.prodRep));
      const { k, d } = S.prodSort;
      rows.sort((a, b) => (typeof a[k] === "string" ? a[k].localeCompare(b[k]) : (a[k] || 0) - (b[k] || 0)) * d);
      const tot = rows.reduce((a, p) => a + p.netto, 0) || 1;
      S.prodView = { rows, tot };
      const max = Math.max(1, ...rows.map((p) => p.netto));
      const th = (key, label, r = true) => `<th class="sortable ${r ? "r" : ""}" data-sort="${key}">${label}${k === key ? (d > 0 ? " ↑" : " ↓") : ""}</th>`;
      $("#prodTable").innerHTML = `<div class="table-wrap" style="max-height:640px;overflow:auto"><table class="data"><thead><tr>${th("descrizione", "Prodotto", false)}<th>Reparto</th>${th("qta", "Q.tà")}${th("var", "Var. q.tà")}${th("netto", "Incasso")}<th class="r">%</th><th></th></tr></thead><tbody>
        ${rows.slice(0, 400).map((p) => {
          const v = p.prev_qta ? ((p.qta - p.prev_qta) / p.prev_qta) * 100 : null;
          return `<tr><td>${esc(p.descrizione)} <span class="muted" style="font-size:11px">${esc(p.codint)}</span></td><td class="muted">${esc(repName[p.reparto] ?? p.reparto)}</td>
          <td class="r">${num(p.qta, 2)}</td><td class="r ${v == null ? "muted" : v >= 0 ? "delta up" : "delta down"}">${v == null ? "nuovo" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"}</td>
          <td class="r">${eur(p.netto)}</td><td class="r muted">${pct((p.netto / tot) * 100)}</td><td class="bar-cell"><div class="bar" style="width:${(p.netto / max) * 100}%"></div></td></tr>`;
        }).join("") || `<tr><td colspan="7" class="muted">Nessun prodotto</td></tr>`}</tbody></table></div>
        ${rows.length > 400 ? `<div class="muted" style="padding:8px">Mostrati 400 di ${rows.length}: usa la ricerca o esporta il CSV.</div>` : ""}`;
      $$("#prodTable th[data-sort]").forEach((el) => el.onclick = () => {
        const key = el.dataset.sort;
        S.prodSort = { k: key, d: S.prodSort.k === key ? -S.prodSort.d : key === "descrizione" ? 1 : -1 };
        drawTable();
      });
    };
    st.products.forEach((p) => p.var = p.prev_qta ? (p.qta - p.prev_qta) / p.prev_qta : 999);
    S.prodView = null;
    S.exportSpec = () => {
      const pv = S.prodView || { rows: st.products, tot: totRep };
      const filt = [S.prodSearch && `ricerca "${S.prodSearch}"`, S.prodRep && `reparto ${repName[S.prodRep] ?? S.prodRep}`].filter(Boolean).join(", ");
      return { title: "Prodotti" + (filt ? ` (${filt})` : ""), file: "prodotti",
        sections: [
          !S.prodRep && !S.prodSearch ? { name: "Reparti", cols: ["Reparto", "Quantità", "Incasso", "%"], eur: [2], pct: [3], print: [0, 2], rows: reps.map((r) => [r.descrizione, Number(r.qta), r.netto, (r.netto / totRep) * 100]) } : null,
          { name: "Prodotti venduti", cols: ["Codice", "Prodotto", "Reparto", "Quantità", "Q.tà periodo prec.", "Incasso", "%"], eur: [5], pct: [6], print: [1, 3, 5], printMax: 80,
            rows: pv.rows.map((p) => [p.codint, p.descrizione, repName[p.reparto] ?? p.reparto, Number(p.qta), Number(p.prev_qta) || 0, p.netto, (p.netto / (pv.tot || 1)) * 100]) },
        ] };
    };
    return { html, after() {
      const top = reps.slice(0, 14);
      barChart($("#cRep"), top.map((r) => r.descrizione), top.map((r) => r.netto), { horizontal: true, extra: (i) => `${num(top[i].qta)} pz` });
      drawTable();
      $("#prodSearch").oninput = (e) => { S.prodSearch = e.target.value; drawTable(); };
      $("#prodRep").onchange = (e) => { S.prodRep = e.target.value; drawTable(); };
      $("#prodCsv").onclick = () => downloadCsv(`prodotti_${S.from}_${S.to}.csv`,
        [["Codice", "Prodotto", "Reparto", "Quantita", "Incasso", "Sconti", "Quantita periodo prec."],
          ...st.products.map((p) => [p.codint, p.descrizione, repName[p.reparto] ?? p.reparto, p.qta, p.netto, p.sconti, p.prev_qta])]);
    } };
  };

  views.payments = (st) => {
    const k = st.kpi, pays = st.payments;
    const tot = pays.reduce((a, p) => a + p.importo, 0);
    const diff = tot - k.netto;
    const html = `
      <div class="grid kpis">
        ${kpi("Incassato (pagamenti)", eur(tot), "", true)}
        ${kpi("Vendite nette", eur(k.netto))}
        ${kpi("Differenza", eur(diff), `<div class="delta ${Math.abs(diff) < 1 ? "flat" : "down"}">${Math.abs(diff) < 1 ? "quadra" : "pagamenti − vendite"}</div>`)}
        ${kpi("Transazioni", num(pays.reduce((a, p) => a + p.n, 0)))}
      </div>
      <div class="grid cols-2">
        ${card("Incasso per tipo di pagamento", "", `<div class="chart-box"><canvas id="cPay"></canvas></div>`)}
        ${card("Dettaglio pagamenti", "", `<div class="table-wrap"><table class="data"><thead><tr><th>Tipo</th><th class="r">Transazioni</th><th class="r">Importo</th><th class="r">%</th><th class="r">Medio</th></tr></thead><tbody>
          ${pays.map((p) => `<tr><td>${esc(p.descrizione)}</td><td class="r">${num(p.n)}</td><td class="r">${eur(p.importo)}</td><td class="r">${pct(tot ? (p.importo / tot) * 100 : 0)}</td><td class="r">${eur(p.n ? p.importo / p.n : 0)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nessun pagamento</td></tr>`}
          </tbody><tfoot><tr><td>Totale</td><td class="r">${num(pays.reduce((a, p) => a + p.n, 0))}</td><td class="r">${eur(tot)}</td><td></td><td></td></tr></tfoot></table></div>`)}
      </div>`;
    S.exportSpec = () => ({ title: "Pagamenti", file: "pagamenti",
      kpi: [["Incassato (pagamenti)", tot, "eur"], ["Vendite nette", k.netto, "eur"], ["Differenza", diff, "eur"], ["Transazioni", pays.reduce((a, p) => a + p.n, 0), "n"]],
      sections: [{ name: "Pagamenti", cols: ["Tipo", "Transazioni", "Importo", "%", "Medio"], eur: [2, 4], pct: [3], print: [0, 1, 2], boldLast: true,
        rows: [...pays.map((p) => [p.descrizione, p.n, p.importo, tot ? (p.importo / tot) * 100 : 0, p.n ? p.importo / p.n : 0]), ["Totale", pays.reduce((a, p) => a + p.n, 0), tot, 100, null]] }] });
    return { html, after() { if (pays.length) barChart($("#cPay"), pays.map((p) => p.descrizione), pays.map((p) => p.importo), { horizontal: true, extra: (i) => `${pays[i].n} transazioni` }); } };
  };

  views.finance = (st) => {
    const k = st.kpi, sv = st.service || {};
    const ivaTot = st.iva.reduce((a, i) => ({ imp: a.imp + i.imponibile, iva: a.iva + i.imposta, tot: a.tot + i.totale }), { imp: 0, iva: 0, tot: 0 });
    const line = (l, v, strong = false, cls = "") => `<tr><td ${strong ? 'style="font-weight:700"' : ""}>${l}</td><td class="r ${cls}" ${strong ? 'style="font-weight:700"' : ""}>${v}</td></tr>`;
    const people = (rows, title) => card(title, "", `<div class="table-wrap"><table class="data"><thead><tr><th>Nome</th><th class="r">Scontrini</th><th class="r">Incasso</th><th class="r">Medio</th></tr></thead><tbody>
      ${rows.map((o) => `<tr><td>${esc(o.descrizione)}</td><td class="r">${num(o.scontrini)}</td><td class="r">${eur(o.netto)}</td><td class="r">${eur(o.scontrini ? o.netto / o.scontrini : 0)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nessun dato</td></tr>`}</tbody></table></div>`);
    const html = `
      <div class="grid cols-3" style="margin-bottom:12px">
        ${card("Riepilogo finanziario", rangeText(), `<table class="data"><tbody>
          ${line("Vendite lorde", eur(k.lordo))}
          ${line("− Sconti", eur(k.sconti), false, "delta down")}
          ${line("Abbuoni (inclusi nel netto)", eur(k.abbuoni))}
          ${line("Vendite nette", eur(k.netto), true)}
          ${line("di cui non fiscale", eur(k.non_fiscale))}
          ${line("Incassato da pagamenti", eur(k.incassato))}
          ${line("Righe eliminate", `${num(k.eliminati_n)} · ${eur(k.eliminati_importo)}`)}
          <tr><td colspan="2" style="padding-top:14px;font-weight:700">Documenti emessi</td></tr>
          ${line("Documenti commerciali", `${num(sv.doc_comm_n)} · ${eur(sv.doc_comm_totale)}`)}
          ${line("Fatture", `${num(sv.fatture_n)} · ${eur(sv.fatture_totale)}`)}
        </tbody></table><div class="muted" style="font-size:11px;margin-top:6px">Le fatture sono comprese nelle vendite e in tutte le statistiche. <a href="#" data-go="documents">Vedi documenti →</a></div>`)}
        ${card("IVA per aliquota", "Sulle vendite fiscali", `<table class="data"><thead><tr><th>Aliquota</th><th class="r">Imponibile</th><th class="r">Imposta</th><th class="r">Totale</th></tr></thead><tbody>
          ${st.iva.map((i) => `<tr><td>${num(i.aliquota, 2)}%</td><td class="r">${eur(i.imponibile)}</td><td class="r">${eur(i.imposta)}</td><td class="r">${eur(i.totale)}</td></tr>`).join("")}
          </tbody><tfoot><tr><td>Totale</td><td class="r">${eur(ivaTot.imp)}</td><td class="r">${eur(ivaTot.iva)}</td><td class="r">${eur(ivaTot.tot)}</td></tr></tfoot></table>`)}
        ${card("Servizio", "", `<table class="data"><tbody>
          ${line("Scontrini", num(k.scontrini))}
          ${line("Coperti", num(k.coperti))}
          ${line("Tavoli diversi serviti", num(sv.tavoli_n))}
          ${line("Asporto", `${num(sv.asporto_n)} · ${eur(sv.asporto_totale)}`)}
          ${line("Ordini web", num(sv.web_n))}
          ${line("Scontrino medio", eur(k.scontrino_medio))}
          ${line("Medio a coperto", eur(k.medio_coperto))}
        </tbody></table>`)}
      </div>
      <div class="grid cols-3">
        ${people(st.operators, "Operatori (cassa)")}
        ${people(st.waiters, "Camerieri")}
        ${card("Articoli eliminati", "Righe cancellate dagli ordini", `<div class="table-wrap"><table class="data"><thead><tr><th>Articolo</th><th class="r">Q.tà</th><th class="r">Importo</th></tr></thead><tbody>
          ${st.deleted.map((d) => `<tr><td>${esc(d.descrizione)}</td><td class="r">${num(d.qta, 1)}</td><td class="r">${eur(d.importo)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nessuna eliminazione</td></tr>`}</tbody></table></div>`)}
      </div>`;
    S.exportSpec = () => ({ title: "Finanziario", file: "finanziario",
      sections: [
        { name: "Riepilogo finanziario", cols: ["Voce", "Importo"], eur: [1], rows: [["Vendite lorde", k.lordo], ["Sconti", k.sconti], ["Abbuoni (inclusi nel netto)", k.abbuoni], ["Vendite nette", k.netto], ["di cui non fiscale", k.non_fiscale], ["Incassato da pagamenti", k.incassato], ["Importo righe eliminate", k.eliminati_importo]] },
        { name: "Documenti emessi", cols: ["Tipo", "Numero", "Totale"], eur: [2], print: [0, 1, 2], rows: [["Documenti commerciali", sv.doc_comm_n || 0, sv.doc_comm_totale || 0], ["Fatture", sv.fatture_n || 0, sv.fatture_totale || 0]] },
        { name: "IVA per aliquota", cols: ["Aliquota %", "Imponibile", "Imposta", "Totale"], eur: [1, 2, 3], print: [0, 2, 3], boldLast: true,
          rows: [...st.iva.map((i) => [Number(i.aliquota), i.imponibile, i.imposta, i.totale]), ["Totale", ivaTot.imp, ivaTot.iva, ivaTot.tot]] },
        { name: "Servizio", cols: ["Voce", "Valore"], rows: [["Scontrini", k.scontrini], ["Coperti", Number(k.coperti)], ["Tavoli serviti", sv.tavoli_n || 0], ["Asporto", sv.asporto_n || 0], ["Scontrino medio", eur(k.scontrino_medio)], ["Medio a coperto", eur(k.medio_coperto)]] },
        { name: "Operatori", cols: ["Operatore", "Scontrini", "Incasso"], eur: [2], print: [0, 1, 2], rows: st.operators.map((o) => [o.descrizione, o.scontrini, o.netto]) },
        { name: "Camerieri", cols: ["Cameriere", "Scontrini", "Incasso"], eur: [2], print: [0, 1, 2], rows: st.waiters.map((o) => [o.descrizione, o.scontrini, o.netto]) },
        { name: "Articoli eliminati", cols: ["Articolo", "Quantità", "Importo"], eur: [2], rows: st.deleted.map((d) => [d.descrizione, Number(d.qta), d.importo]) },
      ] });
    return { html };
  };

  views.documents = async () => {
    const kind = S.docKind || "sc";
    const data = await api.documents(S.storeId, S.from, S.to, kind, S.docSearch || "");
    const rows = data.rows || [];
    const isFt = kind === "ft";
    S.docRows = rows;
    S.exportSpec = () => isFt
      ? { title: "Fatture" + (S.docSearch ? ` (ricerca "${S.docSearch}")` : ""), file: "fatture", kpi: [["Fatture", data.n, "n"], ["Totale", data.totale, "eur"]],
          sections: [{ name: "Fatture", cols: ["Data", "Numero", "Tipo", "Cliente", "P.IVA", "Codice fiscale", "Comune", "Pagamento", "Totale"], eur: [8], print: [1, 3, 8],
            rows: rows.map((r) => [parseD(r.dkey).toLocaleDateString("it-IT"), `${r.numero}${r.sezionale ? "/" + r.sezionale : ""}`, tipo(r.tipo_doc), r.cliente, r.piva, r.cf, r.comune, r.pagamenti, r.totale]) }] }
      : { title: "Documenti commerciali" + (S.docSearch ? ` (ricerca "${S.docSearch}")` : ""), file: "documenti", kpi: [["Documenti", data.n, "n"], ["Totale", data.totale, "eur"]],
          sections: [{ name: "Documenti commerciali", cols: ["Data", "Ora", "N. documento", "N. chiusura", "Operatore", "Tavolo", "Pagamento", "Totale"], eur: [7], print: [1, 2, 7], printMax: 150,
            rows: rows.map((r) => [String(r.datam).slice(0, 10).split("-").reverse().join("/"), String(r.datam).slice(11, 16), r.n_doc, r.n_chiusura, r.opdes, r.tavolo || "", r.pagamenti, r.totale]) }] };
    const head = isFt
      ? `<th>Data</th><th class="r">N.</th><th>Tipo</th><th>Cliente</th><th>P.IVA / C.F.</th><th>Comune</th><th>Pagamento</th><th class="r">Totale</th>`
      : `<th>Data e ora</th><th class="r">N. doc.</th><th class="r">Chiusura</th><th>Operatore</th><th class="r">Tavolo</th><th>Pagamento</th><th class="r">Totale</th>`;
    const tipo = (t) => ({ TD01: "Fattura", TD04: "Nota di credito", TD24: "Fattura differita", TD02: "Acconto" }[t] || t || "");
    const body = rows.map((r, i) => isFt
      ? `<tr class="doc-row" data-i="${i}"><td>${parseD(r.dkey).toLocaleDateString("it-IT")}</td><td class="r">${r.numero}${r.sezionale ? "/" + esc(r.sezionale) : ""}</td><td>${tipo(r.tipo_doc)}</td>
          <td><b>${esc(r.cliente || "—")}</b></td><td class="muted">${esc(r.piva || r.cf || "")}</td><td class="muted">${esc([r.comune, r.provincia ? "(" + r.provincia.toUpperCase() + ")" : ""].filter(Boolean).join(" "))}</td>
          <td class="muted">${esc(r.pagamenti || "")}</td><td class="r">${r.totale == null ? '<span class="muted">—</span>' : eur(r.totale)}</td></tr>`
      : `<tr class="doc-row" data-i="${i}"><td>${fmtTs(r.datam)}</td><td class="r">${r.n_doc ?? ""}</td><td class="r muted">${r.n_chiusura ?? ""}</td><td class="muted">${esc(r.opdes || "")}</td>
          <td class="r muted">${r.tavolo || ""}</td><td class="muted">${esc(r.pagamenti || "")}${r.flg_nf ? ' <span class="pill warn">non fiscale</span>' : ""}</td><td class="r">${eur(r.totale)}</td></tr>`).join("");
    const html = `
      <div class="toolbar" style="margin-bottom:12px">
        <div class="seg" id="docKind"><button data-k="sc" class="${!isFt ? "active" : ""}">Documenti commerciali</button><button data-k="ft" class="${isFt ? "active" : ""}">Fatture</button></div>
        <input class="search" id="docSearch" type="text" placeholder="${isFt ? "Cerca cliente, P.IVA, numero…" : "Cerca n. documento, importo…"}" value="${esc(S.docSearch || "")}">
        <span class="range-label">${num(data.n)} documenti · ${eur(data.totale)}</span>
      </div>
      ${card(isFt ? "Fatture" : "Documenti commerciali", (data.n > rows.length ? `Mostrati i ${rows.length} più recenti su ${num(data.n)}: restringi il periodo o usa la ricerca. ` : "") + "Clicca un documento per vedere righe e pagamenti." + (isFt ? " Le fatture senza importo sono precedenti allo storico vendite importato." : ""),
        rows.length ? `<div class="table-wrap" style="max-height:640px;overflow:auto"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` : empty("Nessun documento nel periodo"))}`;
    return { html, after() {
      $$("#docKind button").forEach((b) => b.onclick = () => { S.docKind = b.dataset.k; render(); });
      let t; $("#docSearch").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { S.docSearch = e.target.value; render().then(() => { const el = $("#docSearch"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); }, 400); };
      $$(".doc-row").forEach((tr) => tr.onclick = () => showDocument(rows[+tr.dataset.i], isFt));
    } };
  };

  // Riepilogo IVA giornaliero: documenti commerciali (senza non fiscali) e fatture
  function vatTables(v) {
    const days = [];
    for (let d = parseD(S.from); d <= parseD(S.to); d = addDays(d, 1)) days.push(iso(d));
    const nf = Object.fromEntries((v.non_fiscale || []).map((x) => [String(x.giorno).slice(0, 10), x.totale]));
    const nd = {}; (v.docs || []).forEach((x) => { nd[x.tipo + String(x.giorno).slice(0, 10)] = x.n; });
    const build = (tipo) => {
      const rows = (v.rows || []).filter((r) => r.tipo === tipo);
      const aliq = [...new Set(rows.map((r) => Number(r.aliquota)))].sort((a, b) => b - a);
      const map = {}; rows.forEach((r) => { map[String(r.giorno).slice(0, 10) + "|" + Number(r.aliquota)] = r; });
      const lines = days.map((g) => {
        const cells = aliq.map((a) => map[g + "|" + a] || { imponibile: 0, imposta: 0, totale: 0 });
        return { g, n: nd[tipo + g] || 0, cells, imp: cells.reduce((x, c) => x + c.imponibile, 0), iva: cells.reduce((x, c) => x + c.imposta, 0),
          tot: cells.reduce((x, c) => x + c.totale, 0), nf: tipo === "sc" ? nf[g] || 0 : 0 };
      }).filter((l) => l.n || l.tot || l.nf);
      const sum = (f) => lines.reduce((x, l) => x + f(l), 0);
      const totals = { n: sum((l) => l.n), cells: aliq.map((_, i) => ({ imponibile: sum((l) => l.cells[i].imponibile), imposta: sum((l) => l.cells[i].imposta), totale: sum((l) => l.cells[i].totale) })),
        imp: sum((l) => l.imp), iva: sum((l) => l.iva), tot: sum((l) => l.tot), nf: sum((l) => l.nf) };
      return { aliq, lines, totals };
    };
    return { sc: build("sc"), ft: build("ft") };
  }

  views.vat = async () => {
    const v = await api.vatDaily(S.storeId, S.from, S.to);
    const t = vatTables(v);
    const table = (x, tipo) => {
      if (!x.lines.length) return empty(tipo === "ft" ? "Nessuna fattura nel periodo" : "Nessun documento commerciale nel periodo");
      const head1 = `<tr><th rowspan="2">Giorno</th><th rowspan="2" class="r">Doc.</th>${x.aliq.map((a) => `<th colspan="2" class="r" style="text-align:center">IVA ${num(a, 2)}%</th>`).join("")}<th rowspan="2" class="r">Imponibile</th><th rowspan="2" class="r">IVA</th><th rowspan="2" class="r">Totale</th>${tipo === "sc" ? '<th rowspan="2" class="r">Non fiscale<br><span style="font-weight:400;text-transform:none">(escluso)</span></th>' : ""}</tr>`;
      const head2 = `<tr>${x.aliq.map(() => `<th class="r">Imponibile</th><th class="r">Imposta</th>`).join("")}</tr>`;
      const row = (l) => `<tr><td>${l.g === "Totale" ? "<b>Totale</b>" : parseD(l.g).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</td><td class="r">${num(l.n)}</td>
        ${l.cells.map((c) => `<td class="r">${eur(c.imponibile)}</td><td class="r muted">${eur(c.imposta)}</td>`).join("")}
        <td class="r">${eur(l.imp)}</td><td class="r">${eur(l.iva)}</td><td class="r"><b>${eur(l.tot)}</b></td>${tipo === "sc" ? `<td class="r muted">${l.nf ? eur(l.nf) : ""}</td>` : ""}</tr>`;
      return `<div class="table-wrap" style="max-height:560px;overflow:auto"><table class="data"><thead>${head1}${head2}</thead><tbody>${x.lines.map(row).join("")}</tbody>
        <tfoot>${row({ ...x.totals, g: "Totale" })}</tfoot></table></div>`;
    };
    const tot = t.sc.totals.tot + t.ft.totals.tot;
    const html = `
      <div class="grid kpis">
        ${kpi("Documenti commerciali", eur(t.sc.totals.tot), `<div class="delta flat">IVA ${eur(t.sc.totals.iva)} · ${num(t.sc.totals.n)} doc.</div>`, true)}
        ${kpi("Fatture", eur(t.ft.totals.tot), `<div class="delta flat">IVA ${eur(t.ft.totals.iva)} · ${num(t.ft.totals.n)} fatture</div>`)}
        ${kpi("Totale fiscale", eur(tot), `<div class="delta flat">IVA ${eur(t.sc.totals.iva + t.ft.totals.iva)}</div>`)}
        ${kpi("Non fiscale (escluso)", eur(t.sc.totals.nf), `<div class="delta flat">non compreso nei totali IVA</div>`)}
      </div>
      <div style="margin-bottom:12px">${card("Documenti commerciali", "Scontrini per giorno e aliquota, esclusi i non fiscali", table(t.sc, "sc"))}</div>
      ${card("Fatture", "Fatture per giorno di emissione e aliquota", table(t.ft, "ft"))}
      <div class="muted" style="font-size:11px;margin-top:8px">Imponibile e imposta sono calcolati per scorporo sul totale giornaliero di ogni aliquota: possono differire di qualche centesimo dalla chiusura del registratore, che arrotonda documento per documento.</div>`;
    const vrow = (l) => [l.g === "Totale" ? "Totale" : parseD(l.g).toLocaleDateString("it-IT"), l.n, ...l.cells.flatMap((c) => [c.imponibile, c.imposta]), l.imp, l.iva, l.tot];
    const vsec = (x, name, nf) => ({ name, boldLast: true,
      cols: ["Giorno", "Doc.", ...x.aliq.flatMap((a) => [`Imponibile ${a}%`, `Imposta ${a}%`]), "Imponibile", "IVA", "Totale", ...(nf ? ["Non fiscale (escluso)"] : [])],
      eur: Array.from({ length: x.aliq.length * 2 + 3 + (nf ? 1 : 0) }, (_, i) => i + 2), print: [0, x.aliq.length * 2 + 3, x.aliq.length * 2 + 4],
      rows: [...x.lines.map((l) => [...vrow(l), ...(nf ? [l.nf] : [])]), [...vrow({ ...x.totals, g: "Totale" }), ...(nf ? [x.totals.nf] : [])]] });
    S.exportSpec = () => ({ title: "Riepilogo IVA", file: "iva",
      kpi: [["Documenti commerciali", t.sc.totals.tot, "eur"], ["IVA documenti commerciali", t.sc.totals.iva, "eur"], ["Fatture", t.ft.totals.tot, "eur"], ["IVA fatture", t.ft.totals.iva, "eur"], ["Non fiscale (escluso)", t.sc.totals.nf, "eur"]],
      sections: [t.sc.lines.length ? vsec(t.sc, "Documenti commerciali (esclusi non fiscali)", true) : null, t.ft.lines.length ? vsec(t.ft, "Fatture", false) : null] });
    return { html };
  };

  async function showDocument(r, isFt) {
    if (!r.nmov) {
      openDialog(`Fattura ${r.numero}${r.sezionale ? "/" + r.sezionale : ""}`, `<p><b>${esc(r.cliente)}</b><br>${esc(r.indirizzo || "")} ${esc(r.cap || "")} ${esc(r.comune || "")} ${esc(r.provincia || "")}<br>P.IVA ${esc(r.piva || "")} ${r.cf ? "· C.F. " + esc(r.cf) : ""}</p><p class="muted">Fattura precedente allo storico vendite importato: righe e importo non disponibili.</p>`);
      return;
    }
    try {
      const d = await api.documentDetail(S.storeId, r.nmov, String(r.dkey).slice(0, 10));
      const h = d.header || {}, inv = d.invoice;
      const tot = (d.lines || []).reduce((a, l) => a + Number(l.importo), 0);
      openDialog(isFt ? `Fattura ${r.numero}${r.sezionale ? "/" + r.sezionale : ""} del ${fmtDay(r.dkey, { day: "numeric", month: "long", year: "numeric" })}` : `Documento commerciale n. ${h.n_doc ?? "—"} · ${fmtTs(h.datam)}`, `
        ${inv ? `<div class="card" style="margin-bottom:12px"><b>${esc(inv.denominazione || ((inv.nome || "") + " " + (inv.cognome || "")))}</b><br>
          <span class="muted">${esc(inv.indirizzo || "")} · ${esc(inv.cap || "")} ${esc(inv.comune || "")} ${inv.provincia ? "(" + esc(inv.provincia.toUpperCase()) + ")" : ""}<br>
          P.IVA ${esc(inv.cod_cli || "—")}${inv.cf_cli ? " · C.F. " + esc(inv.cf_cli) : ""} · ${esc(inv.tipo_doc || "")} · pagamento ${esc(inv.tipo_pagamento || "")}</span></div>` : ""}
        <dl class="kv" style="margin-bottom:12px"><dt>Movimento</dt><dd>${h.nmov}</dd><dt>Operatore</dt><dd>${esc(h.opdes || "")}</dd>
          ${h.tavolo ? `<dt>Tavolo</dt><dd>${h.tavolo}</dd>` : ""}${h.n_chiusura ? `<dt>Chiusura</dt><dd>${h.n_chiusura}</dd>` : ""}${h.matricola ? `<dt>Matricola RT</dt><dd>${esc(h.matricola)}</dd>` : ""}</dl>
        <table class="data"><thead><tr><th>Articolo</th><th>Reparto</th><th class="r">Q.tà</th><th class="r">Prezzo</th><th class="r">IVA</th><th class="r">Importo</th></tr></thead><tbody>
        ${(d.lines || []).map((l) => `<tr><td>${esc(l.descrizione)}</td><td class="muted">${esc(l.reparto)}</td><td class="r">${num(l.qta, 3)}</td><td class="r">${eur(l.prezzo)}</td><td class="r">${num(l.aliquota)}%</td><td class="r">${eur(l.importo)}</td></tr>`).join("")}
        </tbody><tfoot><tr><td colspan="5">Totale</td><td class="r">${eur(tot)}</td></tr></tfoot></table>
        <div style="margin-top:12px"><b>Pagamenti:</b> ${(d.payments || []).map((p) => `${esc(p.descrizione)} ${eur(p.importo)}`).join(" · ") || "—"}</div>`);
    } catch (e) { toast(e.message); }
  }

  // Fasce orarie: con un solo giorno selezionato, confronto con lo stesso giorno della settimana precedente
  views.hours = async (st) => {
    if (S.from !== S.to) return views.hoursRange(st);
    const prevDay = iso(addDays(parseD(S.from), -7));
    const prev = await api.stats(S.storeId, prevDay, prevDay);
    return hoursCompare(st, prev, prevDay);
  };

  function hoursCompare(st, prev, prevDay) {
    const cut = st.range?.cutoff_hour ?? 0;
    const order = (h) => (h - cut + 24) % 24;
    const cur = Object.fromEntries((st.hourly || []).map((h) => [h.ora, h]));
    const old = Object.fromEntries((prev.hourly || []).map((h) => [h.ora, h]));
    let hours = Array.from({ length: 24 }, (_, i) => (i + cut) % 24)
      .map((o) => ({ ora: o, a: cur[o] || { netto: 0, scontrini: 0 }, b: old[o] || { netto: 0, scontrini: 0 } }));
    let i0 = hours.findIndex((h) => h.a.netto || h.b.netto || h.a.scontrini || h.b.scontrini);
    let i1 = hours.length - 1 - [...hours].reverse().findIndex((h) => h.a.netto || h.b.netto || h.a.scontrini || h.b.scontrini);
    if (i0 < 0) return empty(`Nessuna vendita né il ${fmtDay(S.from, { weekday: "long", day: "numeric", month: "long" })} né il ${fmtDay(prevDay, { weekday: "long", day: "numeric", month: "long" })}`);
    hours = hours.slice(i0, i1 + 1);
    const dayLbl = fmtDay(S.from, { weekday: "short", day: "numeric", month: "short" });
    const prevLbl = fmtDay(prevDay, { weekday: "short", day: "numeric", month: "short" });
    const diffCell = (a, b, money = true) => {
      const d = a - b;
      const cls = Math.abs(d) < 0.005 ? "muted" : d > 0 ? "delta up" : "delta down";
      const p = b && Math.abs(d) >= 0.005 ? ` <span style="font-weight:400">(${d >= 0 ? "+" : "−"}${Math.abs((d / Math.abs(b)) * 100).toFixed(0)}%)</span>` : "";
      return `<td class="r ${cls}">${d > 0 ? "+" : d < 0 ? "−" : ""}${money ? eur(Math.abs(d)) : num(Math.abs(d))}${p}</td>`;
    };
    const T = hours.reduce((t, h) => ({ an: t.an + h.a.netto, as: t.as + h.a.scontrini, bn: t.bn + h.b.netto, bs: t.bs + h.b.scontrini }), { an: 0, as: 0, bn: 0, bs: 0 });
    const k = st.kpi, pk = prev.kpi || {};
    // fasce del giorno a confronto
    const bands = [["Mattina", cut, 11], ["Pranzo", 11, 15], ["Pomeriggio", 15, 19], ["Cena", 19, 23], ["Notte", 23, 24 + cut]].map(([name, a, b]) => {
      const inBand = (h) => { const o = h.ora < cut ? h.ora + 24 : h.ora; return o >= a && o < b; };
      const sum = (arr, f) => (arr || []).filter(inBand).reduce((x, h) => x + h[f], 0);
      return { name, range: `${hh(a % 24)}–${hh(b % 24)}`, an: sum(st.hourly, "netto"), as: sum(st.hourly, "scontrini"), bn: sum(prev.hourly, "netto"), bs: sum(prev.hourly, "scontrini") };
    }).filter((b) => b.as || b.bs);
    const html = `
      <div class="grid kpis">
        ${kpi("Incasso " + dayLbl, eur(T.an), delta(T.an, T.bn, "vs " + prevLbl), true)}
        ${kpi("Incasso " + prevLbl, eur(T.bn), `<div class="delta flat">stesso giorno settimana precedente</div>`)}
        ${kpi("Differenza", `${T.an - T.bn >= 0 ? "+" : "−"}${eur(Math.abs(T.an - T.bn))}`, `<div class="delta ${T.an >= T.bn ? "up" : "down"}">${T.bn ? ((T.an - T.bn) / T.bn * 100).toFixed(1) + "%" : "—"}</div>`)}
        ${kpi("Scontrini", `${num(T.as)} <span class="muted" style="font-size:14px">vs ${num(T.bs)}</span>`, delta(T.as, T.bs, "vs " + prevLbl))}
        ${kpi("Scontrino medio", eur(T.as ? T.an / T.as : 0), delta(T.as ? T.an / T.as : 0, T.bs ? T.bn / T.bs : 0, "vs " + prevLbl))}
        ${kpi("Coperti", `${num(k.coperti)} <span class="muted" style="font-size:14px">vs ${num(pk.coperti)}</span>`, delta(Number(k.coperti), Number(pk.coperti), "vs " + prevLbl))}
      </div>
      <div style="margin-bottom:12px">${card(`Incasso per ora: ${dayLbl} e ${prevLbl}`, "Stesso giorno della settimana precedente in grigio", `<div class="chart-box tall"><canvas id="cCmp"></canvas></div>`)}</div>
      <div class="grid cols-2" style="align-items:start">
        ${card("Confronto ora per ora", "", `<div class="table-wrap"><table class="data">
          <thead><tr><th rowspan="2">Ora</th><th colspan="2" class="r" style="text-align:center">${esc(dayLbl)}</th><th colspan="2" class="r" style="text-align:center">${esc(prevLbl)}</th><th colspan="2" class="r" style="text-align:center">Differenza</th></tr>
          <tr><th class="r">Sc.</th><th class="r">Incasso</th><th class="r">Sc.</th><th class="r">Incasso</th><th class="r">Sc.</th><th class="r">Incasso</th></tr></thead>
          <tbody>${hours.map((h) => `<tr><td>${hh(h.ora)}:00–${hh((h.ora + 1) % 24)}:00</td>
            <td class="r">${num(h.a.scontrini)}</td><td class="r"><b>${eur(h.a.netto)}</b></td>
            <td class="r muted">${num(h.b.scontrini)}</td><td class="r muted">${eur(h.b.netto)}</td>
            ${diffCell(h.a.scontrini, h.b.scontrini, false)}${diffCell(h.a.netto, h.b.netto)}</tr>`).join("")}</tbody>
          <tfoot><tr><td>Totale</td><td class="r">${num(T.as)}</td><td class="r">${eur(T.an)}</td><td class="r">${num(T.bs)}</td><td class="r">${eur(T.bn)}</td>
            ${diffCell(T.as, T.bs, false)}${diffCell(T.an, T.bn)}</tr></tfoot></table></div>`)}
        ${card("Fasce del giorno a confronto", "", `<table class="data"><thead><tr><th>Fascia</th><th class="r">${esc(dayLbl)}</th><th class="r">${esc(prevLbl)}</th><th class="r">Differenza</th></tr></thead><tbody>
          ${bands.map((b) => `<tr><td><b>${b.name}</b> <span class="muted">${b.range}</span><div class="muted" style="font-size:11px">${num(b.as)} sc. vs ${num(b.bs)}</div></td><td class="r">${eur(b.an)}</td><td class="r muted">${eur(b.bn)}</td>${diffCell(b.an, b.bn)}</tr>`).join("")}
          </tbody></table>`)}
      </div>`;
    S.exportSpec = () => ({ title: `Fasce orarie ${dayLbl} vs ${prevLbl}`, file: "fasce_orarie",
      kpi: [[`Incasso ${dayLbl}`, T.an, "eur"], [`Incasso ${prevLbl}`, T.bn, "eur"], ["Differenza", T.an - T.bn, "eur"], [`Scontrini ${dayLbl}`, T.as, "n"], [`Scontrini ${prevLbl}`, T.bs, "n"]],
      sections: [
        { name: "Confronto ora per ora", cols: ["Ora", `Sc. ${dayLbl}`, `Incasso ${dayLbl}`, `Sc. ${prevLbl}`, `Incasso ${prevLbl}`, "Diff. sc.", "Diff. €", "Diff. %"], eur: [2, 4, 6], pct: [7], print: [0, 2, 4, 6], boldLast: true,
          rows: [...hours.map((h) => [`${hh(h.ora)}-${hh((h.ora + 1) % 24)}`, h.a.scontrini, h.a.netto, h.b.scontrini, h.b.netto, h.a.scontrini - h.b.scontrini, h.a.netto - h.b.netto, h.b.netto ? (h.a.netto - h.b.netto) / h.b.netto * 100 : null]),
                 ["Totale", T.as, T.an, T.bs, T.bn, T.as - T.bs, T.an - T.bn, T.bn ? (T.an - T.bn) / T.bn * 100 : null]] },
        { name: "Fasce del giorno", cols: ["Fascia", dayLbl, prevLbl, "Differenza"], eur: [1, 2, 3], print: [0, 1, 3], rows: bands.map((b) => [`${b.name} ${b.range}`, b.an, b.bn, b.an - b.bn]) },
      ] });
    return { html, after() {
      const accent = css("--accent"), muted = css("--muted"), grid = css("--grid");
      charts.push(new Chart($("#cCmp"), {
        type: "bar",
        data: { labels: hours.map((h) => hh(h.ora)), datasets: [
          { label: prevLbl, data: hours.map((h) => h.b.netto), backgroundColor: "rgba(148,163,184,.55)", borderRadius: 4, maxBarThickness: 30 },
          { label: dayLbl, data: hours.map((h) => h.a.netto), backgroundColor: accent, borderRadius: 4, maxBarThickness: 30 },
        ] },
        options: { maintainAspectRatio: false, animation: { duration: 250 },
          plugins: { legend: { display: true, labels: { color: muted, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${eur(c.parsed.y)} · ${(c.datasetIndex ? hours[c.dataIndex].a : hours[c.dataIndex].b).scontrini} sc.`,
              afterBody: (items) => { const h = hours[items[0].dataIndex]; const d = h.a.netto - h.b.netto; return `Differenza: ${d >= 0 ? "+" : "−"}${eur(Math.abs(d))}`; } } } },
          scales: { x: { grid: { display: false }, ticks: { color: muted }, border: { display: false } },
            y: { grid: { color: grid }, ticks: { color: muted, callback: (v) => eur0(v) }, border: { display: false }, beginAtZero: true } } },
      }));
    } };
  }

  views.hoursRange = (st) => {
    const cut = st.range?.cutoff_hour ?? 0;
    const hours = trimHours(sortedHours(st));
    if (!hours.length || !st.kpi.scontrini) return empty();
    const bands = [
      ["Mattina", cut, 11], ["Pranzo", 11, 15], ["Pomeriggio", 15, 19], ["Cena", 19, 23], ["Notte", 23, 24 + cut],
    ].map(([name, a, b]) => {
      const hs = st.hourly.filter((h) => { const o = h.ora < cut ? h.ora + 24 : h.ora; return o >= a && o < b; });
      const net = hs.reduce((x, h) => x + h.netto, 0), n = hs.reduce((x, h) => x + h.scontrini, 0);
      return { name, range: `${hh(a % 24)}–${hh(b % 24)}`, net, n };
    }).filter((b) => b.n > 0);
    const tot = bands.reduce((a, b) => a + b.net, 0) || 1;
    // heatmap
    const cells = {}; let max = 0;
    for (const c of st.heatmap) { cells[`${c.dow}_${c.ora}`] = c; max = Math.max(max, c.netto); }
    const order = Array.from({ length: 24 }, (_, i) => (i + cut) % 24);
    const used = order.filter((h) => st.heatmap.some((c) => c.ora === h));
    const cols = used.length ? order.slice(order.indexOf(used[0]), order.indexOf(used[used.length - 1]) + 1) : [];
    const heat = `<div class="table-wrap"><div class="heat" style="grid-template-columns:44px repeat(${cols.length}, minmax(22px,1fr))">
      <div></div>${cols.map((h) => `<div class="h">${hh(h)}</div>`).join("")}
      ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<div class="d">${DOW[d]}</div>${cols.map((h) => {
        const c = cells[`${d}_${h}`]; const v = c ? c.netto / (max || 1) : 0;
        return `<div class="c" title="${DOW[d]} ${hh(h)}:00 — ${c ? eur(c.netto) + " · " + c.scontrini + " scontrini" : "nessuna vendita"}" style="${c ? `background:color-mix(in srgb, var(--accent) ${Math.round(12 + v * 88)}%, var(--surface))` : ""}"></div>`;
      }).join("")}`).join("")}</div></div>
      <div class="muted" style="font-size:11px;margin-top:6px">Più scuro = più incasso. Le ore dopo mezzanotte sono attribuite alla giornata precedente (fine giornata alle ${hh(cut)}:00).</div>`;
    const html = `
      <div class="grid cols-2" style="margin-bottom:12px">
        ${card("Incasso per ora", "Ora di apertura dello scontrino", `<div class="chart-box"><canvas id="cH1"></canvas></div>`)}
        ${card("Scontrini per ora", "", `<div class="chart-box"><canvas id="cH2"></canvas></div>`)}
      </div>
      <div class="grid cols-2" style="margin-bottom:12px">
        ${card("Fasce del giorno", "", `<table class="data"><thead><tr><th>Fascia</th><th>Orario</th><th class="r">Scontrini</th><th class="r">Incasso</th><th class="r">%</th><th class="r">Medio</th></tr></thead><tbody>
          ${bands.map((b) => `<tr><td style="font-weight:600">${b.name}</td><td class="muted">${b.range}</td><td class="r">${num(b.n)}</td><td class="r">${eur(b.net)}</td><td class="r">${pct((b.net / tot) * 100)}</td><td class="r">${eur(b.net / b.n)}</td></tr>`).join("")}</tbody></table>`)}
        ${card("Dettaglio orario", "", `<div class="table-wrap" style="max-height:300px;overflow:auto"><table class="data"><thead><tr><th>Ora</th><th class="r">Scontrini</th><th class="r">Incasso</th><th class="r">Medio</th></tr></thead><tbody>
          ${hours.map((h) => `<tr><td>${hh(h.ora)}:00–${hh((h.ora + 1) % 24)}:00</td><td class="r">${num(h.scontrini)}</td><td class="r">${eur(h.netto)}</td><td class="r">${eur(h.scontrini ? h.netto / h.scontrini : 0)}</td></tr>`).join("")}</tbody></table></div>`)}
      </div>
      ${card("Mappa giorno × ora", "Incasso per giorno della settimana e ora", heat)}`;
    S.exportSpec = () => ({ title: "Fasce orarie", file: "fasce_orarie",
      sections: [
        { name: "Fasce del giorno", cols: ["Fascia", "Orario", "Scontrini", "Incasso", "%", "Medio"], eur: [3, 5], pct: [4], print: [0, 2, 3], rows: bands.map((b) => [b.name, b.range, b.n, b.net, (b.net / tot) * 100, b.net / b.n]) },
        { name: "Dettaglio orario", cols: ["Ora", "Scontrini", "Incasso", "Medio"], eur: [2, 3], print: [0, 1, 2], rows: hours.map((h) => [`${hh(h.ora)}-${hh((h.ora + 1) % 24)}`, h.scontrini, h.netto, h.scontrini ? h.netto / h.scontrini : 0]) },
        { name: "Giorno x ora", cols: ["Giorno", ...cols.map((h) => hh(h))], eur: cols.map((_, i) => i + 1), print: [0],
          rows: [1, 2, 3, 4, 5, 6, 7].map((d) => [DOW[d], ...cols.map((h) => cells[`${d}_${h}`]?.netto ?? null)]) },
      ] });
    return { html, after() {
      barChart($("#cH1"), hours.map((h) => hh(h.ora)), hours.map((h) => h.netto), { extra: (i) => `${hours[i].scontrini} scontrini` });
      barChart($("#cH2"), hours.map((h) => hh(h.ora)), hours.map((h) => h.scontrini), { fmt: (v) => num(v) + " scontrini", tick: num });
    } };
  };

  views.calendar = async () => {
    if (!S.calMonth) S.calMonth = S.to.slice(0, 7) + "-01";
    const m = parseD(S.calMonth);
    const data = await api.calendar(S.storeId, S.calMonth);
    const byDay = Object.fromEntries(data.map((d) => [d.day, d]));
    const max = Math.max(1, ...data.map((d) => d.netto));
    const tot = data.reduce((a, d) => a + d.netto, 0), nsc = data.reduce((a, d) => a + d.scontrini, 0);
    const first = (m.getDay() + 6) % 7;
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const today = iso(businessToday());
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<div class="day empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = iso(new Date(m.getFullYear(), m.getMonth(), d));
      const x = byDay[key];
      const a = x ? Math.round(8 + (x.netto / max) * 45) : 0;
      cells += `<div class="day ${key === today ? "today" : ""}" data-day="${key}" style="${x ? `background:color-mix(in srgb, var(--accent) ${a}%, var(--surface))` : ""}">
        <span class="n">${d}</span>${x ? `<span><div class="v">${eur0(x.netto)}</div><div class="s">${x.scontrini} sc.</div></span>` : `<span class="s muted">—</span>`}</div>`;
    }
    const html = card(`<div class="cal-head"><button class="btn small" id="calPrev">‹</button><span class="title">${m.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span><button class="btn small" id="calNext">›</button>
        <span style="flex:1"></span><button class="btn small" id="calXls">⬇ Excel</button><button class="btn small" id="calPdf">⬇ PDF</button><button class="btn small" id="calPrn">🖨 Stampa</button></div>`,
      `Totale mese: <b>${eur(tot)}</b> · ${num(nsc)} scontrini · ${data.length} giorni con vendite · media ${eur(data.length ? tot / data.length : 0)}/giorno — clicca un giorno per il dettaglio`,
      `<div class="cal">${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => `<div class="wd">${d}</div>`).join("")}${cells}</div>`);
    S.exportSpec = () => ({ title: "Calendario " + m.toLocaleDateString("it-IT", { month: "long", year: "numeric" }), file: "calendario",
      kpi: [["Totale mese", tot, "eur"], ["Scontrini", nsc, "n"], ["Giorni con vendite", data.length, "n"], ["Media giornaliera", data.length ? tot / data.length : 0, "eur"]],
      sections: [{ name: "Giorni", cols: ["Giorno", "Scontrini", "Incasso"], eur: [2], rows: data.map((d) => [parseD(d.day).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }), d.scontrini, d.netto]) }] });
    return { html, after() {
      $("#calXls").onclick = exportExcel; $("#calPdf").onclick = exportPdf; $("#calPrn").onclick = printDialog;
      $("#calPrev").onclick = () => { S.calMonth = iso(new Date(m.getFullYear(), m.getMonth() - 1, 1)); render(); };
      $("#calNext").onclick = () => { S.calMonth = iso(new Date(m.getFullYear(), m.getMonth() + 1, 1)); render(); };
      $$(".cal .day[data-day]").forEach((el) => el.onclick = () => { S.from = S.to = el.dataset.day; S.preset = ""; setTab("overview"); });
    } };
  };

  views.monitor = async () => {
    const s = cur();
    const [devs, slog, elog] = await Promise.all([api.devices(), api.syncLog(S.storeId), api.emailLog(S.storeId)]);
    const mine = devs.filter((d) => d.store_id === S.storeId);
    const devHtml = mine.map((d) => `
      <div class="card"><div class="dev"><span class="status ${d.offline || !d.enabled ? "off" : "on"}"></span><div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(d.name)}</b>
          <span class="pill ${d.offline ? "err" : d.last_error ? "warn" : "ok"}"><span class="dot"></span>${!d.enabled ? "disattivato" : d.offline ? "offline" : d.last_error ? "errore" : "online"}</span></div>
        <dl class="kv">
          <dt>Ultimo contatto</dt><dd>${ago(d.minutes_ago)} (${fmtTs(d.last_seen)})</dd>
          <dt>Ultimo invio dati</dt><dd>${fmtTs(d.last_sync_at)}</dd>
          <dt>File</dt><dd>${esc(d.db_path || "—")}</dd>
          <dt>Dispositivo</dt><dd>${esc(d.info?.android || "—")} · app ${esc(d.app_version || "?")}</dd>
          <dt>Intervallo</dt><dd>${d.info?.interval_min ? `ogni ${d.info.interval_min} min` : "—"}</dd>
          <dt>Formato data</dt><dd>${esc(d.info?.sample_datam || "—")}</dd>
          <dt>Cursori</dt><dd class="muted">${d.info?.cursors ? Object.entries(d.info.cursors).map(([k, v]) => `${k} ${v}`).join(" · ") : "—"}</dd>
          ${d.last_error ? `<dt>Errore</dt><dd style="color:var(--bad)">${esc(d.last_error)}</dd>` : ""}
        </dl></div></div></div>`).join("") || card("Nessuno spooler collegato", "", `<p class="muted">Crea un dispositivo dalla sezione Admin e inserisci il codice di attivazione nell'app sul tablet.</p>`);

    const html = `
      <div class="grid cols-2" style="margin-bottom:12px">${devHtml}</div>
      <div class="grid cols-2" style="margin-bottom:12px">
        ${card("Mail di riepilogo giornaliero", "Inviata ogni mattina con le statistiche del giorno prima", `
          <form id="mailForm">
            <label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="mEnabled" ${s.report_enabled ? "checked" : ""}> Invio automatico attivo</label>
            <div class="field"><label>Destinatari (separati da virgola)</label><input type="text" id="mEmails" value="${esc((s.report_emails || []).join(", "))}"></div>
            <div class="field"><label>Avviso se lo spooler è offline da (minuti, 0 = mai)</label><input type="number" id="mOffline" min="0" step="15" value="${s.offline_alert_minutes}"></div>
            <div class="toolbar" style="margin-top:12px">
              <button class="btn primary" type="submit">Salva</button>
              <button class="btn" type="button" id="mPreview">Anteprima</button>
              <button class="btn" type="button" id="mSend">Invia ora (${fmtDay(S.to)})</button>
              <button class="btn" type="button" id="mTest">Invia test a me</button>
            </div>
          </form>`)}
        ${card("Sincronizzazioni recenti", "Invii di dati dallo spooler", `<div class="table-wrap" style="max-height:290px;overflow:auto"><table class="data"><thead><tr><th>Quando</th><th>Esito</th><th class="r">Righe</th><th class="r">Scontrini</th><th class="r">Pagam.</th></tr></thead><tbody>
          ${slog.map((l) => `<tr><td>${fmtTs(l.at)}</td><td>${l.ok ? `<span class="pill ok"><span class="dot"></span>ok</span>` : `<span class="pill err" title="${esc(l.error)}"><span class="dot"></span>${esc((l.error || "errore").slice(0, 40))}</span>`}</td>
            <td class="r">${num(l.counts?.lines)}</td><td class="r">${num(l.counts?.receipts)}</td><td class="r">${num(l.counts?.payments)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nessuna sincronizzazione</td></tr>`}
          </tbody></table></div>`)}
      </div>
      ${card("Registro email", "Ogni invio è registrato: se una mail non arriva qui vedi l'errore e puoi reinviarla", `<div class="table-wrap"><table class="data"><thead><tr><th>Inviata</th><th>Giornata</th><th>Tipo</th><th>Esito</th><th>Destinatari</th><th></th></tr></thead><tbody>
        ${elog.map((l) => `<tr><td>${fmtTs(l.created_at)}</td><td>${l.day ? fmtDay(l.day, { weekday: "short", day: "numeric", month: "short" }) : ""}</td><td>${{ daily: "Giornaliera", alert: "Avviso offline", test: "Test" }[l.kind] || l.kind}</td>
          <td>${l.status === "sent" ? `<span class="pill ok"><span class="dot"></span>inviata</span>` : l.status === "queued" ? `<span class="pill"><span class="dot"></span>in invio…</span>` : l.status === "skipped" ? `<span class="pill warn"><span class="dot"></span>saltata</span>` : `<span class="pill err"><span class="dot"></span>errore</span>`}${l.error ? `<div class="muted" style="font-size:11px">${esc(l.error)}</div>` : ""}</td>
          <td class="muted">${esc((l.recipients || []).join(", "))}</td>
          <td>${l.day && l.kind !== "alert" ? `<button class="btn small" data-resend="${l.day}">Reinvia</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Nessuna email inviata</td></tr>`}
      </tbody></table></div>`)}`;
    return { html, after() {
      $("#mailForm").onsubmit = async (e) => {
        e.preventDefault();
        const emails = $("#mEmails").value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
        const bad = emails.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
        if (bad.length) return toast("Email non valida: " + bad.join(", "));
        const settings = { report_enabled: $("#mEnabled").checked, report_emails: emails, offline_alert_minutes: Number($("#mOffline").value) || 0 };
        try { await api.saveSettings(S.storeId, settings); Object.assign(s, settings); toast("Impostazioni salvate"); } catch (err) { toast(err.message); }
      };
      $("#mPreview").onclick = async () => {
        try {
          const r = await api.report({ mode: "preview", store_id: S.storeId, day: S.to });
          openDialog(r.subject || "Anteprima", `<iframe id="prevFrame"></iframe>`);
          $("#prevFrame").srcdoc = r.html;
        } catch (err) { toast(err.message); }
      };
      const send = async (body, ok) => { try { const r = await api.report(body); toast(["sent", "queued"].includes(r.result?.status) ? ok : `Esito: ${r.result?.status} ${r.result?.error || ""}`); render(); } catch (err) { toast(err.message); } };
      $("#mSend").onclick = () => send({ mode: "send", store_id: S.storeId, day: S.to }, "Mail in invio ai destinatari");
      $("#mTest").onclick = () => send({ mode: "test", store_id: S.storeId, day: S.to }, `Mail di test in invio a ${S.user.email}`);
      $$("[data-resend]").forEach((b) => b.onclick = () => send({ mode: "send", store_id: S.storeId, day: b.dataset.resend }, "Mail in reinvio"));
    } };
  };

  // ---------------------------------------------------------------- import storico (sql.js nel browser)
  const IMP = {
    tables: [
      { key: "receipts", table: "headmov", pk: "nmov", cols: ["nmov", "datam", "operatore", "opdes", "tavolo", "asporto", "totale", "totaleNF",
        "flgNF", "sospeso", "nChiusura", "nfat", "cliente", "clides", "fromweb", "sezionale", "nscontrinoffm", "matricolacassap", "datam2", "datam3"] },
      { key: "lines", table: "Venduto", pk: "chiave", cols: ["chiave", "nmov", "codint", "descrizione", "qta", "prezzov", "importo", "scov", "scop",
        "reparto", "iva", "aliquota", "flgNF", "sospeso", "cameriere", "turno", "FromWeb", "datam", "datam2", "datam3"] },
      { key: "payments", table: "CausaliPagamenti", pk: "chiave", cols: ["chiave", "codice", "descrizione", "datam", "nmov", "qta", "importo", "sospeso", "datam2", "datam3"] },
      { key: "deleted", table: "eliminati", pk: "chiave", cols: ["chiave", "codint", "nmov", "datam", "operatore", "qta", "importo", "tavolo"] },
    ],
    lookups: {
      departments: ["reparti", ["codice", "descrizione"]],
      payment_types: ["pagamenti", ["codice", "descrizione", "RTPagamento"]],
      operators: ["operatori", ["codice", "descrizione"]],
      products: ["anagra", ["codint", "descrizione", "reparto", "list1"]],
      invoices: ["FEDatiMov", ["Chiave", "TipoDoc", "DataDoc", "NumeroDoc", "Sezionale", "CodCli", "CFCli", "DenominazioneCli", "NomeCli",
        "CognomeCli", "IndirizzoCli", "CAPCli", "ComuneCli", "ProvinciaCli", "NazioneCli", "TipoPagamento", "NomeFile", "ProgInvio"]],
    },
    keep: new Set(["chiave", "nmov", "datam", "codice", "reparto", "iva", "aliquota", "operatore", "qta", "importo", "totale"]),
  };
  function impCols(db, table, wanted) {
    try {
      const r = db.exec(`PRAGMA table_info("${table}")`);
      if (!r.length) return [];
      const have = Object.fromEntries(r[0].values.map((v) => [String(v[1]).toLowerCase(), v[1]]));
      return wanted.map((w) => have[w.toLowerCase()]).filter(Boolean);
    } catch { return []; }
  }
  function impRows(db, table, cols) {
    const out = [];
    const st = db.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM "${table}"`);
    while (st.step()) out.push(st.getAsObject());
    st.free();
    return out;
  }
  // stessa logica dello spooler: RistorAndro scrive mese/giorno/anno, l'ora vera è in datam3/datam2
  function impDate(v) {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/), y, mo, d, h, mi, se;
    if (m) [, y, mo, d, h, mi, se] = m;
    else {
      m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (!m) return null;
      let a, b; [, a, b, y, h, mi, se] = m;
      if (+a > 12) { d = a; mo = b; } else { mo = a; d = b; }
    }
    const p2 = (x) => String(+(x || 0)).padStart(2, "0");
    return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(se)}`;
  }
  function impClean(o) {
    let dt = null;
    for (const k of ["datam3", "datam2", "datam"]) {
      if (k in o) { const n = impDate(o[k]); if (!dt && n && !n.startsWith("1900")) dt = n; delete o[k]; }
    }
    o.datam = dt;
    for (const k of Object.keys(o)) { const v = o[k]; if ((v === 0 || v === "" || v === null) && !IMP.keep.has(k)) delete o[k]; }
    return o;
  }
  async function importHistory(store) {
    const fv = $("#impVen").files[0], fa = $("#impAna").files[0];
    const out = $("#impOut");
    if (!fv) return toast("Scegli il file Venduto.db");
    if (!confirm(`Importare lo storico di "${fv.name}" nel negozio "${store.name}"?`)) return;
    const btn = $("#impGo"); btn.disabled = true;
    const log = (h) => { out.innerHTML = h; };
    try {
      log("Carico il lettore di database…");
      await loadScript("https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/sql-wasm.js");
      const SQL = await window.initSqlJs({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/${f}` });
      log("Leggo i file…");
      const ven = new SQL.Database(new Uint8Array(await fv.arrayBuffer()));
      const ana = fa ? new SQL.Database(new Uint8Array(await fa.arrayBuffer())) : null;
      // anagrafiche: prima Anagra.db, poi Venduto.db
      const lookups = {};
      for (const [k, [t, w]] of Object.entries(IMP.lookups)) {
        lookups[k] = [];
        for (const db of [ana, ven].filter(Boolean)) {
          const c = impCols(db, t, w); if (!c.length) continue;
          const rows = impRows(db, t, c); if (rows.length) { lookups[k] = rows; break; }
        }
      }
      // tabelle di vendita: dal Venduto.db, se manca (es. eliminati) dall'Anagra.db
      const data = {}; let totale = 0;
      for (const t of IMP.tables) {
        let db = ven, c = impCols(ven, t.table, t.cols);
        if (!c.length && ana) { db = ana; c = impCols(ana, t.table, t.cols); }
        data[t.key] = c.length ? impRows(db, t.table, c).map(impClean).filter((r) => r.datam) : [];
        if (t.key === "lines") totale = data.lines.reduce((a, r) => a + (Number(r.importo) || 0), 0);
      }
      ven.close(); ana && ana.close();
      // lotti da inviare
      const jobs = [];
      const lk = { ...lookups }; const inv = lk.invoices || []; delete lk.invoices;
      jobs.push({ label: "anagrafiche", n: 0, p: { lookups: lk } });
      for (let i = 0; i < inv.length; i += 500) jobs.push({ label: "fatture", n: Math.min(500, inv.length - i), p: { lookups: { invoices: inv.slice(i, i + 500) } } });
      for (const t of IMP.tables) {
        const rows = data[t.key];
        for (let i = 0; i < rows.length; i += 1000) jobs.push({ label: t.key, n: Math.min(1000, rows.length - i), p: { [t.key]: rows.slice(i, i + 1000) } });
      }
      const nRows = { receipts: data.receipts.length, lines: data.lines.length, payments: data.payments.length, deleted: data.deleted.length, invoices: inv.length };
      let done = 0, failed = 0;
      const show = () => log(`<div style="font-size:13px;margin-bottom:6px">Invio ${done} / ${jobs.length} blocchi…${failed ? ` <span style="color:var(--bad)">${failed} ripetuti</span>` : ""}</div>
        <div style="height:10px;background:var(--surface-2);border-radius:5px;overflow:hidden"><div style="height:100%;width:${(done / jobs.length * 100).toFixed(1)}%;background:var(--accent)"></div></div>
        <div class="muted" style="font-size:12px;margin-top:6px">Nel file: ${num(nRows.lines)} righe · ${num(nRows.receipts)} conti · ${num(nRows.payments)} pagamenti · ${num(nRows.invoices)} fatture · totale vendite ${eur(totale)}. Non chiudere la pagina.</div>`);
      show();
      let idx = 0;
      const worker = async () => {
        while (idx < jobs.length) {
          const j = jobs[idx++];
          for (let tent = 1; ; tent++) {
            try { await api.adminIngest(store.id, j.p); break; }
            catch (e) { failed++; if (tent >= 4) throw new Error(`blocco ${j.label}: ${e.message}`); await new Promise((r) => setTimeout(r, 1500 * tent)); }
          }
          done++; if (done % 3 === 0 || done === jobs.length) show();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      log(`<div class="pill ok" style="margin-bottom:8px"><span class="dot"></span>Importazione completata</div>
        <table class="data" style="max-width:520px"><tbody>
        <tr><td>Righe vendute</td><td class="r">${num(nRows.lines)}</td></tr><tr><td>Conti (scontrini e fatture)</td><td class="r">${num(nRows.receipts)}</td></tr>
        <tr><td>Pagamenti</td><td class="r">${num(nRows.payments)}</td></tr><tr><td>Righe eliminate</td><td class="r">${num(nRows.deleted)}</td></tr>
        <tr><td>Fatture elettroniche</td><td class="r">${num(nRows.invoices)}</td></tr><tr><td><b>Totale vendite nel file</b></td><td class="r"><b>${eur(totale)}</b></td></tr>
        </tbody></table><div class="muted" style="font-size:12px;margin-top:6px">Apri Panoramica e scegli "Anno" per vedere i dati.</div>`);
      window.__importResult = { nRows, totale };
    } catch (e) {
      log(`<div class="pill err"><span class="dot"></span>Errore</div> <span style="color:var(--bad)">${esc(e.message)}</span><div class="muted" style="font-size:12px">Puoi rilanciare l'importazione: i dati già caricati non vengono duplicati.</div>`);
    } finally { btn.disabled = false; }
  }

  views.admin = async () => {
    if (!S.isAdmin) return empty("Sezione riservata agli amministratori");
    const s = cur();
    const [devs, mem] = await Promise.all([api.devices(), s ? api.admin({ action: "list_members", store_id: s.id }) : { members: [] }]);
    const mine = devs.filter((d) => d.store_id === S.storeId);
    const storeForm = (x = {}) => `
      <form class="storeForm" data-id="${x.id || ""}">
        <div class="field"><label>Nome negozio</label><input type="text" name="name" required value="${esc(x.name)}"></div>
        <div class="grid cols-2" style="gap:8px">
          <div class="field"><label>Codice breve</label><input type="text" name="code" value="${esc(x.code)}"></div>
          <div class="field"><label>Fine giornata contabile (ora)</label><input type="number" name="day_cutoff_hour" min="0" max="12" value="${x.day_cutoff_hour ?? 5}"></div>
        </div>
        <div class="field"><label>Indirizzo</label><input type="text" name="address" value="${esc(x.address)}"></div>
        <div class="field"><label>Email riepilogo (separate da virgola)</label><input type="text" name="report_emails" value="${esc((x.report_emails || []).join(", "))}"></div>
        <div class="toolbar" style="margin-top:12px"><button class="btn primary" type="submit">${x.id ? "Salva modifiche" : "Crea negozio"}</button>
        ${x.id ? `<button class="btn danger" type="button" id="delStore">Elimina negozio</button>` : ""}</div>
      </form>`;
    const html = `
      <div class="grid cols-2" style="margin-bottom:12px">
        ${s ? card(`Negozio: ${esc(s.name)}`, "Impostazioni generali", storeForm(s)) : ""}
        ${card("Nuovo negozio", "Crea un nuovo punto vendita", storeForm())}
      </div>
      <div class="grid cols-2">
        ${s ? card("Dispositivi (spooler)", "Ogni tablet ha il suo codice di attivazione", `
          <div class="table-wrap"><table class="data"><thead><tr><th>Nome</th><th>Stato</th><th></th></tr></thead><tbody>
          ${mine.map((d) => `<tr><td><b>${esc(d.name)}</b><div class="muted" style="font-size:11px">${ago(d.minutes_ago)}</div></td>
            <td>${d.enabled ? `<span class="pill ${d.offline ? "err" : "ok"}"><span class="dot"></span>${d.offline ? "offline" : "online"}</span>` : `<span class="pill warn"><span class="dot"></span>disattivato</span>`}</td>
            <td style="text-align:right;white-space:nowrap"><button class="btn small" data-regen="${d.device_id}">Nuovo codice</button>
            <button class="btn small" data-toggle="${d.device_id}" data-en="${d.enabled}">${d.enabled ? "Disattiva" : "Attiva"}</button>
            <button class="btn small danger" data-deldev="${d.device_id}">Elimina</button></td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nessun dispositivo</td></tr>`}
          </tbody></table></div>
          <form id="devForm" class="toolbar" style="margin-top:12px"><input type="text" id="devName" placeholder="Nome (es. Tablet cassa)" style="max-width:240px"><button class="btn primary" type="submit">Crea dispositivo</button></form>`) : ""}
        ${s ? card("Utenti con accesso", "Proprietari e collaboratori che vedono questo negozio", `
          <div class="table-wrap"><table class="data"><thead><tr><th>Email</th><th>Ruolo</th><th></th></tr></thead><tbody>
          ${(mem.members || []).map((m) => `<tr><td>${esc(m.email)}</td><td>${m.role === "owner" ? "Proprietario" : "Visualizzatore"}</td><td style="text-align:right"><button class="btn small danger" data-delmem="${m.user_id}">Rimuovi</button></td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nessun utente</td></tr>`}
          </tbody></table></div>
          <form id="memForm" style="margin-top:12px">
            <div class="grid cols-2" style="gap:8px">
              <div class="field"><label>Email</label><input type="email" id="memEmail" required></div>
              <div class="field"><label>Ruolo</label><select id="memRole"><option value="owner">Proprietario</option><option value="viewer">Visualizzatore</option></select></div>
            </div>
            <div class="muted" style="font-size:12px;margin-top:8px">L'utente deve prima registrarsi dalla pagina di accesso con <b>Crea account</b>, poi lo abiliti qui.</div>
            <div class="toolbar" style="margin-top:10px"><button class="btn primary" type="submit">Aggiungi utente</button></div>
          </form>`) : ""}
      </div>
      ${s ? `<div style="margin-top:12px">${card(`Importa storico in "${esc(s.name)}"`, "Carica le vendite passate direttamente dai file di RistorAndro. Si può ripetere: non crea doppioni.", `
        <div class="grid cols-2" style="gap:8px">
          <div class="field"><label>Venduto.db (vendite) — obbligatorio</label><input type="file" id="impVen" accept=".db,.db3,.sqlite"></div>
          <div class="field"><label>Anagra.db (reparti, pagamenti, eliminati) — consigliato</label><input type="file" id="impAna" accept=".db,.db3,.sqlite"></div>
        </div>
        <div class="toolbar" style="margin-top:12px"><button class="btn primary" id="impGo">Importa nel negozio ${esc(s.name)}</button></div>
        <div id="impOut" style="margin-top:12px"></div>`)}</div>` : ""}`;
    return { html, after() {
      $("#impGo") && ($("#impGo").onclick = () => importHistory(s));
      $$(".storeForm").forEach((f) => f.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const rec = { name: fd.get("name"), code: fd.get("code") || null, address: fd.get("address") || null,
          day_cutoff_hour: Number(fd.get("day_cutoff_hour")) || 0,
          report_emails: String(fd.get("report_emails")).split(/[,;\s]+/).filter(Boolean) };
        if (f.dataset.id) rec.id = f.dataset.id;
        try {
          const saved = await api.upsertStore(rec);
          S.stores = await api.stores(); S.storeId = saved.id; fillStores(); toast("Negozio salvato"); render();
        } catch (err) { toast(err.message); }
      });
      $("#delStore") && ($("#delStore").onclick = async () => {
        if (prompt(`Per eliminare "${s.name}" e TUTTI i suoi dati scrivi ELIMINA`) !== "ELIMINA") return;
        try { await api.deleteStore(s.id); S.stores = await api.stores(); S.storeId = S.stores[0]?.id ?? null; fillStores(); render(); } catch (err) { toast(err.message); }
      });
      const showCode = (code) => {
        openDialog("Codice di attivazione", `<p>Copia questo codice e incollalo nell'app <b>Renko Stats Spooler</b> sul tablet (pulsante <i>Incolla codice</i>). Viene mostrato una sola volta.</p>
          <div class="code-box" id="codeBox">${esc(code)}</div><div class="toolbar" style="margin-top:12px"><button class="btn primary" id="copyCode">Copia</button>
          <a class="btn" href="mailto:?subject=${encodeURIComponent("Codice attivazione Renko Stats")}&body=${encodeURIComponent(code)}">Invia per email</a>
          <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(code)}">WhatsApp</a></div>`);
        $("#copyCode").onclick = () => navigator.clipboard.writeText(code).then(() => toast("Copiato"));
      };
      $("#devForm") && ($("#devForm").onsubmit = async (e) => {
        e.preventDefault();
        try { const r = await api.admin({ action: "create_device", store_id: s.id, name: $("#devName").value || "Tablet cassa" }); showCode(r.activation_code); render(); } catch (err) { toast(err.message); }
      });
      $$("[data-regen]").forEach((b) => b.onclick = async () => {
        if (!confirm("Il vecchio codice smetterà di funzionare. Continuare?")) return;
        try { const r = await api.admin({ action: "regen_device_key", device_id: b.dataset.regen }); showCode(r.activation_code); } catch (err) { toast(err.message); }
      });
      $$("[data-toggle]").forEach((b) => b.onclick = async () => { try { await api.updateDevice(b.dataset.toggle, { enabled: b.dataset.en !== "true" }); render(); } catch (err) { toast(err.message); } });
      $$("[data-deldev]").forEach((b) => b.onclick = async () => { if (!confirm("Eliminare il dispositivo?")) return; try { await api.deleteDevice(b.dataset.deldev); render(); } catch (err) { toast(err.message); } });
      $$("[data-delmem]").forEach((b) => b.onclick = async () => { if (!confirm("Rimuovere l'accesso?")) return; try { await api.admin({ action: "remove_member", store_id: s.id, user_id: b.dataset.delmem }); render(); } catch (err) { toast(err.message); } });
      $("#memForm") && ($("#memForm").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api.admin({ action: "add_member", store_id: s.id, email: $("#memEmail").value, role: $("#memRole").value });
          toast("Accesso aggiunto"); render();
        } catch (err) { toast(err.message); }
      });
    } };
  };

  // ------------------------------------------------------------------ export Excel / PDF
  const LIBS = {
    xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
    autotable: "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
  };
  const loaded = {};
  // Salva un file: nel browser scarica, nell'app Android lo passa all'app (che lo mette in Download)
  function saveBlob(blob, filename) {
    if (window.RenkoApp && window.RenkoApp.saveFile) {
      const fr = new FileReader();
      fr.onload = () => { window.RenkoApp.saveFile(String(fr.result).split(",")[1], filename, blob.type || "application/octet-stream"); };
      fr.readAsDataURL(blob);
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const writeXlsx = (wb, filename) => saveBlob(new Blob([window.XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: XLSX_MIME }), filename);
  function loadScript(url) {
    return loaded[url] ??= new Promise((ok, ko) => {
      const el = document.createElement("script");
      el.src = url; el.onload = ok; el.onerror = () => { delete loaded[url]; ko(new Error("Impossibile caricare " + url)); };
      document.head.appendChild(el);
    });
  }
  const fileBase = () => `renko_${(cur()?.name || "negozio").replace(/[^a-z0-9]+/gi, "_")}_${S.from}${S.from !== S.to ? "_" + S.to : ""}`;
  async function statsForExport() {
    if (NEEDS_STATS.includes(S.tab) && S.stats) return S.stats;
    return await api.stats(S.storeId, S.from, S.to);
  }
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // Ogni scheda imposta S.exportSpec = () => ({ title, kpi: [[etichetta, valore, "eur"|"n"|"txt"]], sections: [...] })
  // sezione: { name, cols: [...], rows: [[...]], eur: [indici colonne in €], pct: [indici %], print: [indici da stampare] }
  const fmtCell = (v, i, sec) => v == null || v === "" ? "" : sec.eur?.includes(i) ? eur(v) : sec.pct?.includes(i) ? pct(v) : typeof v === "number" ? num(v, 2) : String(v);
  const fmtKpi = ([, v, t]) => t === "eur" ? eur(v) : t === "txt" ? String(v ?? "") : num(v, 2);
  function currentSpec() {
    if (typeof S.exportSpec !== "function") throw new Error("Questa scheda non ha dati da esportare");
    const sp = S.exportSpec();
    sp.sections = (sp.sections || []).filter((x) => x && x.rows && x.rows.length);
    return sp;
  }

  async function exportExcel() {
    const btn = $("#xlsBtn"); btn.disabled = true; toast("Preparo il file Excel…");
    try {
      const sp = currentSpec();
      await loadScript(LIBS.xlsx);
      const X = window.XLSX, wb = X.utils.book_new(), EUR = '#,##0.00 "€"';
      const head = [[`Renko Stats — ${cur()?.name || ""} — ${sp.title}`], ["Periodo", rangeText()], []];
      const used = new Set();
      const sheetName = (n) => { const b = n.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Foglio"; let x = b, i = 2; while (used.has(x)) x = `${b} ${i++}`; used.add(x); return x; };
      if (sp.kpi?.length || !sp.sections.length) {
        const aoa = [...head, ["Indicatore", "Valore"], ...(sp.kpi || []).map(([l, v, t]) => [l, t === "txt" ? String(v ?? "") : Math.round((Number(v) || 0) * 100) / 100])];
        const ws = X.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 34 }, { wch: 18 }];
        (sp.kpi || []).forEach((k, i) => { if (k[2] === "eur") { const c = ws[X.utils.encode_cell({ r: head.length + 1 + i, c: 1 })]; if (c) c.z = EUR; } });
        X.utils.book_append_sheet(wb, ws, sheetName("Riepilogo"));
      }
      for (const sec of sp.sections) {
        const rnd = (v, i) => typeof v !== "number" ? (v == null ? "" : v) : sec.eur?.includes(i) || sec.pct?.includes(i) ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000;
        const ws = X.utils.aoa_to_sheet([sec.cols, ...sec.rows.map((r) => r.map(rnd))]);
        ws["!cols"] = sec.cols.map((c, i) => ({ wch: Math.min(45, Math.max(String(c).length + 2, ...sec.rows.slice(0, 300).map((r) => String(r[i] ?? "").length + 2))) }));
        sec.rows.forEach((_, ri) => (sec.eur || []).forEach((ci) => { const c = ws[X.utils.encode_cell({ r: ri + 1, c: ci })]; if (c && typeof c.v === "number") c.z = EUR; }));
        ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sec.rows.length, c: sec.cols.length - 1 } }) };
        X.utils.book_append_sheet(wb, ws, sheetName(sec.name));
      }
      writeXlsx(wb, `${fileBase()}_${sp.file || S.tab}.xlsx`);
    } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  }

  async function exportPdf() {
    const btn = $("#pdfBtn"); btn.disabled = true; toast("Preparo il PDF…");
    try {
      const sp = currentSpec();
      await loadScript(LIBS.jspdf); await loadScript(LIBS.autotable);
      const wide = sp.sections.some((x) => x.cols.length > 7);
      const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: wide ? "landscape" : "portrait" });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      const teal = [15, 118, 110], muted = [100, 116, 139];
      doc.setFillColor(...teal); doc.rect(0, 0, W, 28, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text(sp.title.toUpperCase(), 14, 10);
      doc.setFontSize(18); doc.setFont(undefined, "bold"); doc.text(cur()?.name || "", 14, 18);
      doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.text(rangeText(), 14, 24);
      doc.setTextColor(15, 23, 42);
      const base = { theme: "grid", styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1 },
        headStyles: { fillColor: teal, textColor: 255, fontStyle: "bold" }, margin: { left: 14, right: 14 } };
      let y = 34;
      if (sp.kpi?.length) {
        const kp = sp.kpi.map((k) => [k[0], fmtKpi(k)]); const half = Math.ceil(kp.length / 2);
        doc.autoTable({ ...base, theme: "plain", startY: y, body: kp.slice(0, half).map((r, i) => [...r, ...(kp[half + i] || ["", ""])]),
          columnStyles: { 0: { textColor: muted }, 1: { fontStyle: "bold", halign: "right" }, 2: { textColor: muted }, 3: { fontStyle: "bold", halign: "right" } } });
        y = doc.lastAutoTable.finalY + 8;
      }
      for (const sec of sp.sections) {
        if (y > H - 30) { doc.addPage(); y = 18; }
        doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.text(sec.name, 14, y); doc.setFont(undefined, "normal");
        const colStyles = {}; sec.cols.forEach((_, i) => { if (sec.rows.some((r) => typeof r[i] === "number")) colStyles[i] = { halign: "right" }; });
        doc.autoTable({ ...base, startY: y + 2, head: [sec.cols], body: sec.rows.map((r) => r.map((v, i) => fmtCell(v, i, sec))), columnStyles: colStyles,
          didParseCell: (d) => { if (d.section === "body" && sec.boldLast && d.row.index === sec.rows.length - 1) d.cell.styles.fontStyle = "bold"; } });
        y = doc.lastAutoTable.finalY + 8;
      }
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...muted);
        doc.text(`Renko Stats · ${cur()?.name || ""} · ${sp.title} · ${rangeText()}`, 14, H - 7);
        doc.text(`pagina ${i} di ${n}`, W - 14, H - 7, { align: "right" });
      }
      saveBlob(doc.output("blob"), `${fileBase()}_${sp.file || S.tab}.pdf`);
    } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  }

  // ------------------------------------------------------------------ stampa ESC/POS (tramite lo spooler)
  function printPayload(sp) {
    const sections = sp.sections.map((sec) => {
      const idx = sec.print || [0, sec.cols.length - 1];
      const max = sec.printMax || 60;
      return { name: sec.name, head: idx.map((i) => String(sec.cols[i])), rows: sec.rows.slice(0, max).map((r) => idx.map((i) => fmtCell(r[i], i, sec))),
        more: Math.max(0, sec.rows.length - max) };
    });
    return { store: cur()?.name || "", title: sp.title, period: rangeText(), printed_at: new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }),
      kpi: (sp.kpi || []).map((k) => [k[0], fmtKpi(k)]), sections };
  }
  // Anteprima: stessa impaginazione dello spooler (carta 80 mm = 48 caratteri)
  function printPreviewText(p, width = 48) {
    const L = [], line = (c = "-") => L.push(c.repeat(width));
    const two = (a, b) => { a = String(a); b = String(b); const sp = width - a.length - b.length; L.push(sp >= 1 ? a + " ".repeat(sp) + b : (a.slice(0, Math.max(0, width - b.length - 1)) + " " + b)); };
    const center = (t) => L.push(" ".repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t);
    center(p.store.toUpperCase()); center(p.title); center(p.period); line("=");
    p.kpi.forEach(([a, b]) => two(a, b));
    p.sections.forEach((sec) => {
      line(); L.push(sec.name.toUpperCase());
      // colonne: la prima prende lo spazio libero, le altre larghe quanto il valore più lungo (max 14)
      const n = Math.max(...sec.rows.map((r) => r.length), 1);
      const w = Array.from({ length: n }, (_, i) => i === 0 ? 0 : Math.min(14, Math.max(...sec.rows.map((r) => String(r[i] ?? "").length))));
      const lw = width - w.slice(1).reduce((a, x) => a + x + 1, 0);
      sec.rows.forEach((r) => {
        if (r.length <= 2) return two(r[0], r[1] ?? "");
        if (lw >= 8) {
          const lab = String(r[0]); L.push((lab.length > lw ? lab.slice(0, lw) : lab.padEnd(lw)) + r.slice(1).map((v, i) => " " + String(v ?? "").padStart(w[i + 1])).join(""));
        } else { L.push(String(r[0]).slice(0, width)); two("  " + r.slice(1, -1).join("  "), r[r.length - 1]); }
      });
      if (sec.more) L.push(`... altre ${sec.more} righe`);
    });
    line("="); center("Stampato " + p.printed_at);
    return L.join("\n");
  }
  async function printDialog() {
    let sp; try { sp = currentSpec(); } catch (e) { return toast(e.message); }
    const p = printPayload(sp);
    const devs = (await api.devices().catch(() => [])).filter((d) => d.store_id === S.storeId && d.enabled);
    const printers = devs.filter((d) => d.info?.printer);
    openDialog("Stampa su stampante termica", `
      ${printers.length ? `<div class="field"><label>Stampa con</label><select id="prDev">${printers.map((d) => `<option value="${d.device_id}">${esc(d.name)} → ${esc(d.info.printer)}</option>`).join("")}</select></div>`
        : `<p class="pill warn"><span class="dot"></span>Nessuno spooler di questo negozio ha una stampante configurata</p><p class="muted" style="font-size:13px">Nell'app Renko Stats Spooler sul tablet, sezione <b>Stampante</b>, inserisci l'indirizzo IP della stampante ESC/POS e premi <b>Salva</b>.</p>`}
      <div class="muted" style="font-size:12px;margin:10px 0 4px">Anteprima (carta 80 mm)</div>
      <pre style="background:#fff;color:#000;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:11px;line-height:1.35;max-height:50vh;overflow:auto;white-space:pre">${esc(printPreviewText(p))}</pre>
      <div class="toolbar" style="margin-top:10px"><button class="btn primary" id="prGo" ${printers.length ? "" : "disabled"}>🖨 Invia alla stampante</button><span id="prState" class="muted"></span></div>`);
    const go = $("#prGo");
    if (go) go.onclick = async () => {
      go.disabled = true;
      const st = $("#prState");
      try {
        const id = await api.printEnqueue(S.storeId, $("#prDev").value, `${sp.title} · ${rangeText()}`, p);
        st.textContent = "In coda: lo spooler la stampa entro pochi secondi…";
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const j = await api.printStatus(id).catch(() => null);
          if (!j) continue;
          if (j.status === "done") { st.innerHTML = `<span class="pill ok"><span class="dot"></span>Stampato</span>`; return; }
          if (j.status === "error") { st.innerHTML = `<span class="pill err"><span class="dot"></span>${esc(j.error || "errore")}</span>`; return; }
          st.textContent = j.status === "printing" ? "Stampa in corso…" : "In coda…";
        }
        st.textContent = "Lo spooler non ha ancora preso la stampa: controlla che il tablet sia acceso (Monitoraggio).";
      } catch (e) { toast(e.message); } finally { go.disabled = false; }
    };
  }

  // ------------------------------------------------------------------ render
  const NEEDS_STATS = ["overview", "products", "payments", "finance", "hours"];
  let renderSeq = 0;

  async function render() {
    const seq = ++renderSeq;
    const view = $("#view");
    $$("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === S.tab));
    $$("#presets button").forEach((b) => b.classList.toggle("active", b.dataset.p === S.preset));
    $("#dFrom").value = S.from; $("#dTo").value = S.to;
    $("#rangeLabel").textContent = rangeText();
    $("#filters").classList.toggle("hidden", !NEEDS_STATS.includes(S.tab) && !["monitor", "documents", "vat"].includes(S.tab));
    S.exportSpec = null;
    $("#exportBtns")?.classList.add("hidden");
    if (!S.storeId) { view.innerHTML = S.isAdmin ? "" : empty("Nessun negozio associato al tuo account. Contatta l'amministratore."); if (!S.isAdmin) return; S.tab = "admin"; }
    view.classList.add("loading");
    try {
      let out;
      if (NEEDS_STATS.includes(S.tab)) {
        S.stats = await api.stats(S.storeId, S.from, S.to);
        if (seq !== renderSeq) return;
        updateSyncInfo();
        out = await views[S.tab](S.stats);
        if (seq !== renderSeq) return;
      } else {
        out = await views[S.tab]();
        if (seq !== renderSeq) return;
      }
      killCharts();
      if (typeof out === "string") out = { html: out };
      view.innerHTML = out.html;
      out.after && out.after();
      $("#exportBtns")?.classList.toggle("hidden", typeof S.exportSpec !== "function");
      $$("[data-go]", view).forEach((b) => b.onclick = () => setTab(b.dataset.go));
    } catch (err) {
      if (seq !== renderSeq) return;
      killCharts();
      view.innerHTML = DEMO
        ? empty("Modalità demo: per vedere i dati reali inserisci la <b>anon key</b> di Supabase nel file <b>config.js</b> e ricarica la pagina.")
        : empty("Errore: " + esc(err.message));
    } finally {
      if (seq === renderSeq) view.classList.remove("loading");
    }
  }

  async function updateSyncInfo() {
    const el = $("#syncInfo");
    try {
      const devs = (await api.devices()).filter((d) => d.store_id === S.storeId && d.enabled);
      if (!devs.length) { el.className = "pill warn"; el.innerHTML = `<span class="dot"></span>nessuno spooler`; return; }
      const off = devs.some((d) => d.offline), err = devs.some((d) => d.last_error);
      const last = devs.map((d) => d.last_sync_at).filter(Boolean).sort().pop();
      el.className = "pill " + (off ? "err" : err ? "warn" : "ok");
      el.innerHTML = `<span class="dot"></span>${off ? "spooler offline" : err ? "spooler con errori" : "dati aggiornati"} · ${fmtTs(last)}`;
      el.style.cursor = "pointer"; el.onclick = () => setTab("monitor");
    } catch { el.textContent = ""; }
  }

  function setTab(t) { S.tab = t; store.set("tab", t); render(); window.scrollTo(0, 0); }

  function fillStores() {
    const sel = $("#storeSelect");
    sel.innerHTML = S.stores.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
    sel.value = S.storeId ?? "";
    sel.classList.toggle("hidden", S.stores.length === 0);
  }

  // Installazione: PWA (Android/iPhone/PC) e APK Android
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => null);
  async function showAppDialog() {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const inApp = !!window.RenkoApp || matchMedia("(display-mode: standalone)").matches;
    let apkOk = false;
    try { const r = await fetch("download/RenkoStats.apk", { method: "HEAD", cache: "no-store" }); apkOk = r.ok && !(r.headers.get("content-type") || "").includes("text/html"); } catch { /* ok */ }
    openDialog("Scarica l'app", `
      ${inApp ? `<p class="pill ok" style="margin-bottom:12px"><span class="dot"></span>Stai già usando l'app</p>` : ""}
      <div class="grid cols-2">
        <div class="card"><h3>📱 Installa sul telefono</h3>
          <p class="muted" style="font-size:13px">Aggiunge Renko Stats alla schermata Home: si apre a schermo intero come un'app. Funziona su Android, iPhone e PC.</p>
          ${isIos ? `<ol style="font-size:13px;padding-left:18px"><li>Apri questa pagina con <b>Safari</b></li><li>Tocca <b>Condividi</b> (il quadrato con la freccia)</li><li>Scegli <b>Aggiungi alla schermata Home</b></li></ol>`
            : installPrompt ? `<button class="btn primary" id="pwaInstall">Installa Renko Stats</button>`
            : `<p style="font-size:13px">Dal menu del browser (⋮) scegli <b>Installa app</b> o <b>Aggiungi a schermata Home</b>.</p>`}
        </div>
        <div class="card"><h3>🤖 App Android (APK)</h3>
          <p class="muted" style="font-size:13px">App Android dedicata. Scarica Excel e PDF direttamente nella cartella Download del telefono.</p>
          ${apkOk ? `<a class="btn primary" href="download/RenkoStats.apk" download>Scarica APK</a>
            <p class="muted" style="font-size:11px;margin-top:8px">Alla prima installazione Android chiede di consentire le app da "origini sconosciute".</p>`
            : `<p style="font-size:13px" class="muted">APK non ancora pubblicato: caricalo su GitHub nella cartella <b>download</b> con il nome <b>RenkoStats.apk</b>.</p>`}
        </div>
      </div>
      <div style="margin-top:12px;text-align:center"><img alt="QR" style="width:150px;height:150px;border-radius:8px;background:#fff;padding:6px"
        src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(location.origin + location.pathname)}">
        <div class="muted" style="font-size:12px">Inquadra con il telefono per aprire il sito</div></div>`);
    const b = $("#pwaInstall");
    if (b) b.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice.catch(() => null); installPrompt = null; $("#dlg").close(); };
  }

  function openDialog(title, html) {
    $("#dlgTitle").textContent = title; $("#dlgBody").innerHTML = html; $("#dlg").showModal();
  }

  // ------------------------------------------------------------------ avvio
  function bindUi() {
    $$("#tabs .tab").forEach((t) => t.onclick = () => setTab(t.dataset.tab));
    $$("#presets button").forEach((b) => b.onclick = () => { applyPreset(b.dataset.p); S.calMonth = null; render(); });
    const custom = () => {
      if (!$("#dFrom").value || !$("#dTo").value) return;
      S.from = $("#dFrom").value; S.to = $("#dTo").value;
      if (S.from > S.to) [S.from, S.to] = [S.to, S.from];
      S.preset = ""; render();
    };
    on("#dFrom", "onchange", custom); on("#dTo", "onchange", custom);
    on("#storeSelect", "onchange", (e) => { S.storeId = e.target.value; store.set("store", S.storeId); S.calMonth = null; render(); });
    on("#logoutBtn", "onclick", async () => { await api.logout(); location.reload(); });
    on("#dlgClose", "onclick", () => $("#dlg").close());
    on("#xlsBtn", "onclick", exportExcel);
    on("#appBtn", "onclick", showAppDialog);
    on("#pdfBtn", "onclick", exportPdf);
    on("#prnBtn", "onclick", printDialog);
    on("#themeBtn", "onclick", () => {
      const curT = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = curT === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next; store.set("theme", next); render();
    });
  }

  async function startApp(user) {
    S.user = user;
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#userChip").textContent = user.email;
    S.isAdmin = await api.isAdmin(user.id).catch(() => false);
    $("#adminTab").classList.toggle("hidden", !S.isAdmin);
    S.stores = await api.stores();
    const saved = store.get("store", null);
    S.storeId = S.stores.some((s) => s.id === saved) ? saved : S.stores[0]?.id ?? null;
    fillStores();
    applyPreset(S.preset || "yesterday");
    if (S.tab === "admin" && !S.isAdmin) S.tab = "overview";
    render();
  }

  async function init() {
    const th = store.get("theme", null);
    if (th) document.documentElement.dataset.theme = th;
    bindUi();
    $("#appVersion").textContent = "Renko Stats v" + APP_VERSION;
    if (DEMO) $("#demoBanner").classList.remove("hidden");

    // Link di reset password / invito: chiede la nuova password
    if (!DEMO && /type=(recovery|invite)/.test(location.hash)) {
      api.onAuth(async (ev) => {
        if (ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN") {
          const pwd = prompt("Scegli la tua nuova password (almeno 8 caratteri)");
          if (pwd && pwd.length >= 8) { try { await api.setPassword(pwd); toast("Password impostata"); } catch (e) { toast(e.message); } }
          history.replaceState(null, "", location.pathname);
        }
      });
    }

    const user = await api.user();
    if (user) return startApp(user);

    $("#login").classList.remove("hidden");
    if ($("#loginForm")) $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      $("#loginError").textContent = "";
      try {
        await api.login($("#email").value, $("#password").value);
        startApp(await api.user());
      } catch (err) { $("#loginError").textContent = err.message === "Invalid login credentials" ? "Email o password errati" : err.message; }
    };
    if ($("#signupBtn")) $("#signupBtn").onclick = async () => {
      const em = $("#email").value, pw = $("#password").value;
      if (!em || pw.length < 8) { $("#loginError").textContent = "Inserisci email e una password di almeno 8 caratteri"; return; }
      try {
        await api.signUp(em, pw);
        $("#loginError").textContent = "Account creato. Conferma dal link ricevuto via email, poi chiedi all'amministratore di abilitarti al negozio.";
      } catch (err) { $("#loginError").textContent = err.message; }
    };
    if ($("#forgotBtn")) $("#forgotBtn").onclick = async () => {
      const em = $("#email").value;
      if (!em) { $("#loginError").textContent = "Scrivi prima la tua email"; return; }
      try { await api.resetPassword(em); $("#loginError").textContent = "Ti abbiamo inviato un link per reimpostare la password."; } catch (err) { $("#loginError").textContent = err.message; }
    };
  }

  init();
})();
