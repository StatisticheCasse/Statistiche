/* Renko Stats — dashboard statistiche RistorAndro
 * Pagina statica: supabase-js + Chart.js. Nessun build step. */
(() => {
  "use strict";

  const APP_VERSION = "1.3.0";
  const CFG = window.RENKO_CONFIG || {};
  console.info("Renko Stats " + APP_VERSION);
  const DEMO = new URLSearchParams(location.search).has("demo") || !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("XXXX") || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY.includes("INCOLLA");
  const $ = (s, r = document) => r.querySelector(s);
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
      async devices() {
        return [{ device_id: "d1", store_id: "demo", store_name: demoStore.name, name: "Tablet cassa", enabled: true, last_seen: new Date(Date.now() - 120000).toISOString(),
          last_sync_at: new Date(Date.now() - 420000).toISOString(), last_error: null, app_version: "1.0.0", db_path: "Venduto.db + Anagra.db",
          info: { cursors: { lines: 22010, receipts: 4240, payments: 3240, deleted: 168 }, sample_datam: "2026-10-22 23:41:02 (text)", android: "Lenovo TB-X606F · Android 10", interval_min: 5 }, minutes_ago: 2, offline: false }];
      },
      async syncLog() { return Array.from({ length: 8 }, (_, i) => ({ at: new Date(Date.now() - i * 3e5 * 7).toISOString(), ok: i !== 5, counts: { lines: 40 - i * 3, receipts: 6, payments: 6, deleted: 0 }, error: i === 5 ? "rete: timeout" : null })); },
      async emailLog() { return Array.from({ length: 6 }, (_, i) => ({ created_at: addDays(new Date(), -i).toISOString(), day: iso(addDays(new Date(), -i - 1)), kind: "daily", status: i === 3 ? "error" : "sent", recipients: ["titolare@example.com"], subject: "Riepilogo", error: i === 3 ? "Resend 422: dominio non verificato" : null })); },
      async saveSettings() {}, async report() { return { ok: true, html: "<p style='font-family:sans-serif;padding:20px'>Anteprima disponibile con il backend collegato.</p>", result: { status: "sent" } }; },
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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
    return { html };
  };

  views.documents = async () => {
    const kind = S.docKind || "sc";
    const data = await api.documents(S.storeId, S.from, S.to, kind, S.docSearch || "");
    const rows = data.rows || [];
    const isFt = kind === "ft";
    S.docRows = rows;
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
        <button class="btn small" id="docXls">⬇ Excel elenco</button>
        <span class="range-label">${num(data.n)} documenti · ${eur(data.totale)}</span>
      </div>
      ${card(isFt ? "Fatture" : "Documenti commerciali", (data.n > rows.length ? `Mostrati i ${rows.length} più recenti su ${num(data.n)}: restringi il periodo o usa la ricerca. ` : "") + "Clicca un documento per vedere righe e pagamenti." + (isFt ? " Le fatture senza importo sono precedenti allo storico vendite importato." : ""),
        rows.length ? `<div class="table-wrap" style="max-height:640px;overflow:auto"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` : empty("Nessun documento nel periodo"))}`;
    return { html, after() {
      $$("#docKind button").forEach((b) => b.onclick = () => { S.docKind = b.dataset.k; render(); });
      let t; $("#docSearch").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { S.docSearch = e.target.value; render().then(() => { const el = $("#docSearch"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); }, 400); };
      $$(".doc-row").forEach((tr) => tr.onclick = () => showDocument(rows[+tr.dataset.i], isFt));
      $("#docXls").onclick = async () => {
        toast("Preparo il file Excel…");
        try {
          await loadScript(LIBS.xlsx);
          const X = window.XLSX;
          const aoa = isFt
            ? [["Data", "Numero", "Sezionale", "Tipo", "Cliente", "P.IVA", "Codice fiscale", "Indirizzo", "CAP", "Comune", "Prov.", "Pagamento", "Totale"],
               ...rows.map((r) => [String(r.datam).slice(0, 10), r.numero, r.sezionale, tipo(r.tipo_doc), r.cliente, r.piva, r.cf, r.indirizzo, r.cap, r.comune, r.provincia, r.pagamenti, r.totale == null ? null : round2(r.totale)])]
            : [["Data", "Ora", "N. documento", "N. chiusura", "Matricola", "Operatore", "Tavolo", "Pagamento", "Non fiscale", "Totale"],
               ...rows.map((r) => [String(r.datam).slice(0, 10), String(r.datam).slice(11, 16), r.n_doc, r.n_chiusura, r.matricola, r.opdes, r.tavolo, r.pagamenti, r.flg_nf ? "sì" : "", round2(r.totale)])];
          const ws = X.utils.aoa_to_sheet(aoa); const wb = X.utils.book_new();
          X.utils.book_append_sheet(wb, ws, isFt ? "Fatture" : "Documenti commerciali");
          X.writeFile(wb, `${fileBase()}_${isFt ? "fatture" : "documenti"}.xlsx`);
        } catch (e) { toast(e.message); }
      };
    } };
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

  views.hours = (st) => {
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
    const html = card(`<div class="cal-head"><button class="btn small" id="calPrev">‹</button><span class="title">${m.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span><button class="btn small" id="calNext">›</button></div>`,
      `Totale mese: <b>${eur(tot)}</b> · ${num(nsc)} scontrini · ${data.length} giorni con vendite · media ${eur(data.length ? tot / data.length : 0)}/giorno — clicca un giorno per il dettaglio`,
      `<div class="cal">${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => `<div class="wd">${d}</div>`).join("")}${cells}</div>`);
    return { html, after() {
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
      </div>`;
    return { html, after() {
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

  function exportSections(st) {
    const k = st.kpi;
    const cut = st.range?.cutoff_hour ?? 0;
    const repName = Object.fromEntries((st.departments || []).map((r) => [r.reparto, r.descrizione]));
    const payTot = (st.payments || []).reduce((a, p) => a + p.importo, 0) || 1;
    const repTot = (st.departments || []).reduce((a, r) => a + r.netto, 0) || 1;
    const hours = trimHours(sortedHours(st));
    return {
      kpi: [
        ["Incasso netto", round2(k.netto), "eur"], ["Vendite lorde", round2(k.lordo), "eur"], ["Sconti", round2(k.sconti), "eur"],
        ["Abbuoni", round2(k.abbuoni), "eur"], ["di cui non fiscale", round2(k.non_fiscale), "eur"],
        ["Incassato (pagamenti)", round2(k.incassato), "eur"], ["Scontrini", k.scontrini, "n"],
        ["Scontrino medio", round2(k.scontrino_medio), "eur"], ["Coperti", Number(k.coperti), "n"],
        ["Medio a coperto", round2(k.medio_coperto), "eur"], ["Pezzi venduti", Number(k.pezzi), "n"],
        ["Righe eliminate", k.eliminati_n, "n"], ["Importo eliminato", round2(k.eliminati_importo), "eur"],
        ["Incasso periodo precedente", round2(k.prev_netto), "eur"], ["Scontrini periodo precedente", k.prev_scontrini, "n"],
      ],
      tables: [
        { name: "Giornaliero", cols: ["Data", "Giorno", "Scontrini", "Coperti", "Incasso"], eur: [4],
          rows: (st.daily || []).map((d) => [String(d.day).slice(0, 10), DOW[((parseD(d.day).getDay() + 6) % 7) + 1], d.scontrini, Number(d.coperti) || 0, round2(d.netto)]) },
        { name: "Fasce orarie", cols: ["Ora", "Scontrini", "Incasso", "Medio"], eur: [2, 3],
          rows: hours.map((h) => [`${hh(h.ora)}:00-${hh((h.ora + 1) % 24)}:00`, h.scontrini, round2(h.netto), round2(h.scontrini ? h.netto / h.scontrini : 0)]) },
        { name: "Pagamenti", cols: ["Tipo", "Transazioni", "Importo", "%"], eur: [2],
          rows: (st.payments || []).map((p) => [p.descrizione, p.n, round2(p.importo), round2((p.importo / payTot) * 100)]) },
        { name: "Reparti", cols: ["Reparto", "Quantità", "Incasso", "%"], eur: [2],
          rows: (st.departments || []).map((r) => [r.descrizione, Number(r.qta), round2(r.netto), round2((r.netto / repTot) * 100)]) },
        { name: "Prodotti", cols: ["Codice", "Prodotto", "Reparto", "Quantità", "Incasso", "Sconti", "Q.tà periodo prec."], eur: [4, 5],
          rows: (st.products || []).map((p) => [p.codint, p.descrizione, repName[p.reparto] ?? p.reparto, Number(p.qta), round2(p.netto), round2(p.sconti), Number(p.prev_qta) || 0]) },
        { name: "IVA", cols: ["Aliquota %", "Imponibile", "Imposta", "Totale"], eur: [1, 2, 3],
          rows: (st.iva || []).map((i) => [Number(i.aliquota), round2(i.imponibile), round2(i.imposta), round2(i.totale)]) },
        { name: "Operatori", cols: ["Operatore", "Scontrini", "Incasso"], eur: [2],
          rows: (st.operators || []).map((o) => [o.descrizione, o.scontrini, round2(o.netto)]) },
        { name: "Camerieri", cols: ["Cameriere", "Scontrini", "Incasso"], eur: [2],
          rows: (st.waiters || []).map((o) => [o.descrizione, o.scontrini, round2(o.netto)]) },
        { name: "Eliminati", cols: ["Codice", "Articolo", "Quantità", "Importo"], eur: [3],
          rows: (st.deleted || []).map((d) => [d.codint, d.descrizione, Number(d.qta), round2(d.importo)]) },
      ],
      cut,
    };
  }

  async function exportExcel() {
    const btn = $("#xlsBtn"); btn.disabled = true; toast("Preparo il file Excel…");
    try {
      const [st] = await Promise.all([statsForExport(), loadScript(LIBS.xlsx)]);
      const X = window.XLSX, sec = exportSections(st), wb = X.utils.book_new();
      const EUR = '#,##0.00 "€"';
      const sheet = (aoa, widths, eurCells) => {
        const ws = X.utils.aoa_to_sheet(aoa);
        ws["!cols"] = widths.map((w) => ({ wch: w }));
        eurCells.forEach(([r, c]) => { const a = X.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === "number") ws[a].z = EUR; });
        return ws;
      };
      const head = [["Renko Stats — " + (cur()?.name || "")], ["Periodo", rangeText()], []];
      const kAoa = [...head, ["Indicatore", "Valore"], ...sec.kpi.map(([l, v]) => [l, v])];
      const kEur = sec.kpi.map((x, i) => x[2] === "eur" ? [head.length + 1 + i, 1] : null).filter(Boolean);
      X.utils.book_append_sheet(wb, sheet(kAoa, [30, 16], kEur), "Riepilogo");
      for (const t of sec.tables) {
        if (!t.rows.length) continue;
        const aoa = [t.cols, ...t.rows];
        const eurCells = [];
        t.rows.forEach((_, ri) => t.eur.forEach((c) => eurCells.push([ri + 1, c])));
        const widths = t.cols.map((c, i) => Math.max(c.length + 2, ...t.rows.slice(0, 300).map((r) => String(r[i] ?? "").length + 2)));
        const ws = sheet(aoa, widths.map((w) => Math.min(w, 45)), eurCells);
        ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: t.rows.length, c: t.cols.length - 1 } }) };
        X.utils.book_append_sheet(wb, ws, t.name);
      }
      X.writeFile(wb, fileBase() + ".xlsx");
    } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  }

  async function exportPdf() {
    const btn = $("#pdfBtn"); btn.disabled = true; toast("Preparo il PDF…");
    try {
      const st = await statsForExport();
      await loadScript(LIBS.jspdf); await loadScript(LIBS.autotable);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const sec = exportSections(st);
      const W = doc.internal.pageSize.getWidth();
      const teal = [15, 118, 110], muted = [100, 116, 139];
      const fmt = (v, kind) => kind === "eur" ? eur(v) : num(v, 2);
      // intestazione
      doc.setFillColor(...teal); doc.rect(0, 0, W, 28, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text("RIEPILOGO STATISTICHE", 14, 10);
      doc.setFontSize(18); doc.setFont(undefined, "bold"); doc.text(cur()?.name || "", 14, 18);
      doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.text(rangeText(), 14, 24);
      doc.setTextColor(15, 23, 42);
      // KPI in due colonne
      const kp = sec.kpi.map(([l, v, t]) => [l, fmt(v, t)]);
      const half = Math.ceil(kp.length / 2);
      const kRows = kp.slice(0, half).map((r, i) => [...r, ...(kp[half + i] || ["", ""])]);
      const base = { theme: "grid", styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1 },
        headStyles: { fillColor: teal, textColor: 255, fontStyle: "bold" }, margin: { left: 14, right: 14 } };
      doc.autoTable({ ...base, startY: 34, body: kRows, theme: "plain",
        columnStyles: { 0: { textColor: muted }, 1: { fontStyle: "bold", halign: "right" }, 2: { textColor: muted }, 3: { fontStyle: "bold", halign: "right" } } });
      const section = (title, t, limit) => {
        if (!t.rows.length) return;
        let y = doc.lastAutoTable.finalY + 8;
        if (y > 260) { doc.addPage(); y = 18; }
        doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.text(title, 14, y); doc.setFont(undefined, "normal");
        const rows = (limit ? t.rows.slice(0, limit) : t.rows).map((r) => r.map((v, i) => t.eur.includes(i) ? eur(v) : typeof v === "number" ? num(v, 2) : String(v ?? "")));
        const colStyles = {}; t.cols.forEach((_, i) => { if (i > 0 && typeof t.rows[0][i] === "number") colStyles[i] = { halign: "right" }; });
        doc.autoTable({ ...base, startY: y + 2, head: [t.cols], body: rows, columnStyles: colStyles });
      };
      const T = Object.fromEntries(sec.tables.map((t) => [t.name, t]));
      section("Pagamenti", T["Pagamenti"]);
      section("Reparti", T["Reparti"]);
      section("Fasce orarie", T["Fasce orarie"]);
      if ((st.range?.days || 1) > 1) section("Andamento giornaliero", T["Giornaliero"]);
      section("IVA", T["IVA"]);
      section("Prodotti più venduti (primi 60)", { ...T["Prodotti"], cols: T["Prodotti"].cols.slice(1, 5), eur: [3],
        rows: T["Prodotti"].rows.map((r) => r.slice(1, 5)) }, 60);
      section("Operatori", T["Operatori"]);
      section("Articoli eliminati", T["Eliminati"]);
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...muted);
        doc.text(`Renko Stats · ${cur()?.name || ""} · ${rangeText()}`, 14, 290);
        doc.text(`pagina ${i} di ${n}`, W - 14, 290, { align: "right" });
      }
      doc.save(fileBase() + ".pdf");
    } catch (e) { toast(e.message); } finally { btn.disabled = false; }
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
    $("#filters").classList.toggle("hidden", !NEEDS_STATS.includes(S.tab) && !["monitor", "documents"].includes(S.tab));
    $("#exportBtns").classList.toggle("hidden", !NEEDS_STATS.includes(S.tab));
    if (!S.storeId) { view.innerHTML = S.isAdmin ? "" : empty("Nessun negozio associato al tuo account. Contatta l'amministratore."); if (!S.isAdmin) return; S.tab = "admin"; }
    view.classList.add("loading");
    try {
      let out;
      if (NEEDS_STATS.includes(S.tab)) {
        S.stats = await api.stats(S.storeId, S.from, S.to);
        if (seq !== renderSeq) return;
        updateSyncInfo();
        out = views[S.tab](S.stats);
      } else {
        out = await views[S.tab]();
        if (seq !== renderSeq) return;
      }
      killCharts();
      if (typeof out === "string") out = { html: out };
      view.innerHTML = out.html;
      out.after && out.after();
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
    $("#dFrom").onchange = custom; $("#dTo").onchange = custom;
    $("#storeSelect").onchange = (e) => { S.storeId = e.target.value; store.set("store", S.storeId); S.calMonth = null; render(); };
    $("#logoutBtn").onclick = async () => { await api.logout(); location.reload(); };
    $("#dlgClose").onclick = () => $("#dlg").close();
    $("#xlsBtn").onclick = exportExcel;
    $("#pdfBtn").onclick = exportPdf;
    $("#themeBtn").onclick = () => {
      const curT = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = curT === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next; store.set("theme", next); render();
    };
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
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      $("#loginError").textContent = "";
      try {
        await api.login($("#email").value, $("#password").value);
        startApp(await api.user());
      } catch (err) { $("#loginError").textContent = err.message === "Invalid login credentials" ? "Email o password errati" : err.message; }
    };
    $("#signupBtn").onclick = async () => {
      const em = $("#email").value, pw = $("#password").value;
      if (!em || pw.length < 8) { $("#loginError").textContent = "Inserisci email e una password di almeno 8 caratteri"; return; }
      try {
        await api.signUp(em, pw);
        $("#loginError").textContent = "Account creato. Conferma dal link ricevuto via email, poi chiedi all'amministratore di abilitarti al negozio.";
      } catch (err) { $("#loginError").textContent = err.message; }
    };
    $("#forgotBtn").onclick = async () => {
      const em = $("#email").value;
      if (!em) { $("#loginError").textContent = "Scrivi prima la tua email"; return; }
      try { await api.resetPassword(em); $("#loginError").textContent = "Ti abbiamo inviato un link per reimpostare la password."; } catch (err) { $("#loginError").textContent = err.message; }
    };
  }

  init();
})();
