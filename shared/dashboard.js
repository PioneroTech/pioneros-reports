/* Pioneros Reports - motor de tablero "tipo Ventas/Compras".
   Cada tablero (ventas.html, compras.html) solo aporta una configuración:
   cómo normalizar el Excel, cómo se llama la entidad (cliente/proveedor) y qué KPIs mostrar.
   Filas normalizadas esperadas: { empresa, y, m, ent, tipo?, usd, ars, producto, cant, cuenta, estado, comp, tcomp } */
(function (PR) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const hexA = (hex, a) => {
    const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  /* Medidas comunes (equivalentes a las de DAX del tablero de Power BI) */
  PR.baseKpis = (rows) => {
    const usd = rows.reduce((a, r) => a + r.usd, 0), ars = rows.reduce((a, r) => a + r.ars, 0);
    const facturas = new Set(rows.filter((r) => r.tcomp !== 'NC').map((r) => r.comp)).size;
    const pagado = rows.filter((r) => r.estado === 'Pagado').reduce((a, r) => a + r.usd, 0);
    return { usd, ars, tc: usd ? ars / usd : 0, ents: new Set(rows.map((r) => r.ent)).size,
             facturas, factProm: facturas ? usd / facturas : 0, pagado, pctPagado: usd ? pagado / usd * 100 : 0 };
  };
  PR.groupSum = (rows, keyFn, valFn = (r) => r.usd) => {
    const m = new Map(); rows.forEach((r) => { const k = keyFn(r); m.set(k, (m.get(k) || 0) + valFn(r)); }); return m;
  };

  /* Plugin de Chart.js: valor al final de cada barra */
  Chart.register({
    id: 'endLabels',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.values) return;
      const { ctx, scales } = chart; const meta = chart.getDatasetMeta(0);
      ctx.save(); ctx.fillStyle = css('--ink-2'); ctx.font = `11px ${css('--font')}`;
      opts.values.forEach((v, i) => {
        const el = meta.data[i]; if (!el || v === null) return;
        const txt = PR.fmt.compact(v);
        if (opts.horizontal) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, scales.x.getPixelForValue(v) + 6, el.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, el.x, scales.y.getPixelForValue(v) - 4); }
      });
      ctx.restore();
    },
  });

  const ESTADOS = { 'Pagado': ['--good', '✓'], 'Pago Parcial': ['--warn', '◐'], 'Impago': ['--crit', '✕'] };

  PR.createDashboard = function (cfg) {
    const E = cfg.entity;
    const S = { rows: [], metas: [], year: null, empresa: '', tipo: '', q: '',
                sel: { mes: null, ent: null, estado: null, cuenta: null }, sort: { k: 'usd', dir: -1 } };
    const charts = {};
    const emptySel = () => ({ mes: null, ent: null, estado: null, cuenta: null });

    /* ---------- Estructura de la página ---------- */
    document.title = `${cfg.name} · Pioneros Reports`;
    $('root').innerHTML = `
    <div class="wrap">
      <header class="top">
        <div><div class="brand">Pioneros Reports</div><h1>${PR.esc(cfg.name)}</h1></div>
        <div class="fileinfo" id="fileinfo" hidden><span id="fileinfoText"></span>
          <button class="btn" id="changeBtn" type="button">Cambiar archivo</button></div>
      </header>
      <div id="error" class="err" role="alert" hidden></div>
      <section id="drop" class="drop">
        <h2>${PR.esc(cfg.dropTitle)}</h2>
        <p>Arrastrá acá el Excel exportado de Synagro (uno o varios, uno por empresa).<br>
           El archivo se procesa en tu navegador y no se sube a ningún servidor.</p>
        <button class="btn" id="pickBtn" type="button">Elegir archivo</button>
      </section>
      <input id="file" type="file" accept=".xls,.xlsx" multiple hidden>
      <main id="app" hidden>
        <div class="filters">
          <label class="field">Año<select id="fYear"></select></label>
          <label class="field">Empresa<select id="fEmpresa"></select></label>
          ${cfg.tipoFilter ? `<div class="field">Tipo
            <div class="seg" id="fTipo" role="group" aria-label="Tipo">
              <button type="button" data-v="" aria-pressed="true">Todo</button>
              ${cfg.tipoFilter.map((t) => `<button type="button" data-v="${PR.esc(t)}" aria-pressed="false">${PR.esc(t)}</button>`).join('')}
            </div></div>` : ''}
          <label class="field">Buscar<input id="fQ" type="search" placeholder="${PR.esc(cfg.searchPlaceholder)}"></label>
          <div class="chips" id="chips"></div>
        </div>
        <section class="kpis" id="kpis" aria-label="Indicadores"></section>
        <div class="grid">
          <section class="panel c7"><h2>${PR.esc(cfg.name)} por mes</h2>
            <p class="sub">USD con IVA · clic en una barra para filtrar el mes</p>
            <div class="chart"><canvas id="chMes" role="img" aria-label="${PR.esc(cfg.name)} por mes en USD"></canvas></div></section>
          <section class="panel c5"><h2>${PR.esc(E.rankTitle)}</h2>
            <p class="sub">Top 10 · USD con IVA · clic para filtrar</p>
            <div class="chart"><canvas id="chEnt" role="img" aria-label="${PR.esc(E.rankTitle)} en USD"></canvas></div></section>
          <section class="panel c4"><h2>Estado de pago</h2>
            <p class="sub">Según el estado del comprobante · clic para filtrar</p><div id="pay"></div></section>
          <section class="panel c8"><h2>${PR.esc(cfg.name)} por cuenta</h2>
            <p class="sub">USD con IVA · clic para filtrar</p>
            <div class="chart" style="height:250px"><canvas id="chCta" role="img" aria-label="${PR.esc(cfg.name)} por cuenta contable en USD"></canvas></div></section>
          <section class="panel c12"><h2>${PR.esc(cfg.tableTitle)}</h2><p class="sub" id="subTabla"></p>
            <div class="tablewrap"><table>
              <thead><tr><th data-k="producto">Detalle</th><th data-k="usd">${PR.esc(cfg.name)} USD</th><th data-k="cant">Cant.</th><th data-k="pct">% del total</th></tr></thead>
              <tbody id="tbody"></tbody><tfoot><tr id="tfoot"></tr></tfoot></table></div></section>
        </div>
        <p class="note" id="note"></p>
      </main>
    </div>`;

    /* ---------- Carga de archivos ---------- */
    const showError = (msg) => { const e = $('error'); e.textContent = msg; e.hidden = !msg; };

    async function loadFiles(files) {
      showError('');
      try {
        let rows = [], metas = [];
        for (const f of files) {
          const { meta, records } = await PR.readFile(f, cfg.mustHave);
          const norm = records.map((r) => cfg.normalize(r, meta)).filter(Boolean);
          if (!norm.length) throw new Error(`“${f.name}” no tiene filas con fecha válida.`);
          rows = rows.concat(norm); metas.push(meta);
        }
        rows.forEach((r) => { r._q = (r.producto + ' ' + r.ent).toLowerCase(); });
        S.rows = rows; S.metas = metas; S.sel = emptySel(); S.q = ''; $('fQ').value = ''; S.tipo = ''; S.empresa = '';
        const years = [...new Set(rows.map((r) => r.y))].sort((a, b) => b - a);
        S.year = years[0];
        initFilters(years);
        $('drop').hidden = true; $('app').hidden = false; $('fileinfo').hidden = false;
        render();
      } catch (e) { showError(e.message || String(e)); }
    }

    function initFilters(years) {
      $('fYear').innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
      $('fYear').value = S.year;
      const emps = [...new Set(S.rows.map((r) => r.empresa))].sort();
      $('fEmpresa').innerHTML = `<option value="">Todas</option>` + emps.map((e) => `<option>${PR.esc(e)}</option>`).join('');
      if ($('fTipo')) $('fTipo').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === '' ? 'true' : 'false'));
      const periodos = S.metas.map((m) => m.periodo).filter(Boolean).join(' · ');
      $('fileinfoText').textContent = `${trunc(S.metas.map((m) => m.archivo).join(', '), 60)}${periodos ? ' · Período ' + periodos : ''} · ${PR.fmt.int(S.rows.length)} líneas`;
    }

    /* ---------- Filtrado ---------- */
    // ex: filtros a ignorar (cada gráfico sigue mostrando todas sus categorías)
    const pass = (r, ex = {}) =>
      (ex.year || r.y === S.year) && (!S.empresa || r.empresa === S.empresa) && (!S.tipo || r.tipo === S.tipo) &&
      (!S.q || r._q.includes(S.q)) && (ex.mes || S.sel.mes === null || r.m === S.sel.mes) &&
      (ex.ent || !S.sel.ent || r.ent === S.sel.ent) && (ex.estado || !S.sel.estado || r.estado === S.sel.estado) &&
      (ex.cuenta || !S.sel.cuenta || r.cuenta === S.sel.cuenta);
    const sub = (ex) => S.rows.filter((r) => pass(r, ex));
    // El redibujado se difiere: destruir un gráfico mientras Chart.js procesa su propio clic provoca errores.
    const toggle = (k, v) => { S.sel[k] = S.sel[k] === v ? null : v; setTimeout(render, 0); };

    /* ---------- Gráficos ---------- */
    function baseOpts(horizontal) {
      const val = { grid: { color: css('--grid') }, border: { display: false }, ticks: { color: css('--ink-2'), callback: (v) => PR.fmt.compact(v), maxTicksLimit: 6 } };
      const cat = { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: css('--ink-2') } };
      return { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, indexAxis: horizontal ? 'y' : 'x',
        scales: horizontal ? { x: val, y: cat } : { x: cat, y: val },
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${PR.fmt.usd(c.parsed[horizontal ? 'x' : 'y'])}` } } } };
    }
    const mk = (id, c) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), c); return charts[id]; };
    const legendOn = (on) => ({ display: on, position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, color: css('--ink-2') } });

    function render() {
      Chart.defaults.font.family = css('--font'); Chart.defaults.color = css('--ink-2');
      renderChips(); renderKpis(); renderMes(); renderEnt(); renderPago(); renderCuentas(); renderTabla();
      $('note').textContent = cfg.note;
    }

    function renderChips() {
      const items = [];
      if (S.sel.mes !== null) items.push(['mes', 'Mes: ' + PR.MESES[S.sel.mes]]);
      if (S.sel.ent) items.push(['ent', E.singular + ': ' + trunc(PR.cleanName(S.sel.ent), 28)]);
      if (S.sel.estado) items.push(['estado', 'Pago: ' + S.sel.estado]);
      if (S.sel.cuenta) items.push(['cuenta', 'Cuenta: ' + trunc(S.sel.cuenta, 28)]);
      $('chips').innerHTML = items.map(([k, t]) => `<span class="chip">${PR.esc(t)}<button type="button" data-k="${k}" aria-label="Quitar filtro">×</button></span>`).join('') +
        (items.length > 1 ? '<button class="linkbtn" type="button" data-k="all">Limpiar todo</button>' : '');
    }

    function renderKpis() {
      const rows = sub(), K = PR.baseKpis(rows);
      const yearTotal = PR.baseKpis(S.rows.filter((r) => r.y === S.year && (!S.empresa || r.empresa === S.empresa))).usd;
      const lastM = S.sel.mes !== null ? S.sel.mes : Math.max(...rows.map((r) => r.m), 0);
      const py = S.rows.filter((r) => pass(r, { year: true, mes: true }) && r.y === S.year - 1 && (S.sel.mes !== null ? r.m === S.sel.mes : r.m <= lastM));
      let delta = '';
      if (py.length) {
        const pu = PR.baseKpis(py).usd;
        if (pu) { const dv = (K.usd - pu) / Math.abs(pu) * 100;
          delta = `<div class="d ${dv >= 0 ? 'up' : 'down'}">${dv >= 0 ? '▲' : '▼'} ${PR.fmt.pct(Math.abs(dv))} vs ${S.year - 1}</div>`; }
      }
      const tiles = cfg.kpiTiles(K, { delta, yearTotal });
      $('kpis').innerHTML = tiles.map(([v, l, d]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${d || '<div class="d">&nbsp;</div>'}</div>`).join('');
    }

    function renderMes() {
      const cur = new Array(12).fill(0), prev = new Array(12).fill(0);
      sub({ mes: true }).forEach((r) => { cur[r.m] += r.usd; });
      const pyRows = S.rows.filter((r) => pass(r, { year: true, mes: true }) && r.y === S.year - 1);
      pyRows.forEach((r) => { prev[r.m] += r.usd; });
      const last = Math.max(...cur.map((v, i) => (v !== 0 || prev[i] !== 0 ? i : 0)), 0);
      const idx = [...Array(last + 1).keys()];
      const dim = (i) => (S.sel.mes !== null && S.sel.mes !== i ? 0.35 : 1);
      const ds = [];
      if (pyRows.length) ds.push({ label: String(S.year - 1), data: idx.map((i) => prev[i]), backgroundColor: css('--py'), borderRadius: 3, categoryPercentage: .8, barPercentage: .9 });
      ds.push({ label: String(S.year), data: idx.map((i) => cur[i]), backgroundColor: idx.map((i) => hexA(css('--s1'), dim(i))), borderRadius: 3, categoryPercentage: .8, barPercentage: .9 });
      const o = baseOpts(false);
      o.layout = { padding: { top: 18 } };
      o.plugins.legend = legendOn(pyRows.length > 0);
      o.plugins.endLabels = pyRows.length ? { values: [] } : { values: idx.map((i) => cur[i]), horizontal: false };
      o.onClick = (_e, els) => { if (els.length) toggle('mes', els[0].index); };
      mk('chMes', { type: 'bar', data: { labels: idx.map((i) => PR.MESES[i]), datasets: ds }, options: o });
    }

    function renderEnt() {
      const rows = sub({ ent: true });
      const top = [...PR.groupSum(rows, (r) => r.ent).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      const keys = top.map((t) => t[0]), s1 = css('--s1'), s2 = css('--s2');
      const sel = (k) => (S.sel.ent && S.sel.ent !== k ? 0.35 : 1);
      const o = baseOpts(true);
      o.layout = { padding: { right: 56 } };
      const stack = cfg.tipoFilter && cfg.rankStack;
      if (stack) { o.scales.x.stacked = true; o.scales.y.stacked = true; }
      o.scales.y.ticks = { ...o.scales.y.ticks, callback(v) { return trunc(PR.cleanName(keys[v] || ''), 26); } };
      o.plugins.legend = legendOn(!!stack);
      o.plugins.tooltip = { callbacks: { title: (it) => PR.cleanName(keys[it[0].dataIndex]), label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${PR.fmt.usd(c.parsed.x)}` } };
      o.plugins.endLabels = { values: top.map((t) => t[1]), horizontal: true };
      o.onClick = (_e, els) => { if (els.length) toggle('ent', keys[els[0].index]); };
      let datasets;
      if (stack) {
        const by = (t) => { const m = PR.groupSum(rows.filter((r) => r.tipo === t), (r) => r.ent); return keys.map((k) => m.get(k) || 0); };
        datasets = [
          { label: cfg.tipoFilter[0], data: by(cfg.tipoFilter[0]), backgroundColor: keys.map((k) => hexA(s1, sel(k))), borderColor: css('--surface'), borderWidth: { right: 2 } },
          { label: cfg.tipoFilter[1], data: by(cfg.tipoFilter[1]), backgroundColor: keys.map((k) => hexA(s2, sel(k))), borderRadius: { topRight: 3, bottomRight: 3 } }];
      } else {
        datasets = [{ data: top.map((t) => t[1]), backgroundColor: keys.map((k) => hexA(s1, sel(k))), borderRadius: { topRight: 3, bottomRight: 3 } }];
      }
      mk('chEnt', { type: 'bar', data: { labels: keys.map((_, i) => i), datasets }, options: o });
    }

    function renderPago() {
      const tot = PR.groupSum(sub({ estado: true }), (r) => r.estado);
      const all = [...tot.values()].reduce((a, b) => a + Math.max(b, 0), 0) || 1;
      const list = ['Pagado', 'Pago Parcial', 'Impago', ...[...tot.keys()].filter((k) => !ESTADOS[k])].filter((k) => tot.has(k));
      $('pay').innerHTML =
        `<div class="paybar" role="img" aria-label="Distribución del estado de pago">` +
        list.map((k) => `<span style="flex:${Math.max(tot.get(k), 0)};background:${css(ESTADOS[k] ? ESTADOS[k][0] : '--muted')}" title="${PR.esc(k)}"></span>`).join('') + `</div>` +
        list.map((k) => { const [c, ic] = ESTADOS[k] || ['--muted', '•'];
          return `<button type="button" class="payrow" data-estado="${PR.esc(k)}" aria-pressed="${S.sel.estado === k}">
            <span class="ic" style="background:${css(c)}">${ic}</span><span>${PR.esc(k)}</span>
            <span class="n">${PR.fmt.usd(tot.get(k))}</span><span class="p">${PR.fmt.pct(tot.get(k) / all * 100)}</span></button>`; }).join('');
    }

    function renderCuentas() {
      const tot = [...PR.groupSum(sub({ cuenta: true }), (r) => r.cuenta).entries()].filter((t) => t[1] >= 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const keys = tot.map((t) => t[0]), s1 = css('--s1');
      const o = baseOpts(true);
      o.layout = { padding: { right: 56 } };
      o.scales.y.ticks = { ...o.scales.y.ticks, callback(v) { return trunc(keys[v] || '', 34); } };
      o.plugins.tooltip = { callbacks: { title: (it) => keys[it[0].dataIndex], label: (c) => ' ' + PR.fmt.usd(c.parsed.x) } };
      o.plugins.endLabels = { values: tot.map((t) => t[1]), horizontal: true };
      o.onClick = (_e, els) => { if (els.length) toggle('cuenta', keys[els[0].index]); };
      mk('chCta', { type: 'bar', data: { labels: keys.map((_, i) => i), datasets: [{ data: tot.map((t) => t[1]),
        backgroundColor: keys.map((k) => hexA(s1, S.sel.cuenta && S.sel.cuenta !== k ? 0.35 : 1)), borderRadius: { topRight: 3, bottomRight: 3 } }] }, options: o });
    }

    function renderTabla() {
      const agg = new Map();
      sub().forEach((r) => { const a = agg.get(r.producto) || { producto: r.producto, usd: 0, cant: 0 }; a.usd += r.usd; a.cant += r.cant; agg.set(r.producto, a); });
      const list = [...agg.values()], total = list.reduce((a, r) => a + r.usd, 0), cant = list.reduce((a, r) => a + r.cant, 0);
      list.forEach((r) => { r.pct = total ? r.usd / total * 100 : 0; });
      const { k, dir } = S.sort;
      list.sort((a, b) => (k === 'producto' ? a.producto.localeCompare(b.producto, 'es') * dir : (a[k] - b[k]) * dir));
      const shown = list.slice(0, 300), max = Math.max(...shown.map((r) => Math.abs(r.usd)), 1);
      $('tbody').innerHTML = shown.map((r) => `<tr><td>${PR.esc(r.producto)}</td><td>${PR.fmt.dec2(r.usd)}<span class="bar" style="width:${Math.max(0, r.usd) / max * 60}px"></span></td><td>${PR.fmt.int(r.cant)}</td><td>${PR.fmt.pct(r.pct)}</td></tr>`).join('');
      $('tfoot').innerHTML = `<td>Total</td><td>${PR.fmt.dec2(total)}</td><td>${PR.fmt.int(cant)}</td><td>100 %</td>`;
      $('subTabla').textContent = `${PR.fmt.int(list.length)} ítems` + (list.length > shown.length ? ` · mostrando los primeros ${shown.length}` : '') + ' · clic en el encabezado para ordenar';
    }

    /* ---------- Eventos ---------- */
    $('pickBtn').onclick = $('changeBtn').onclick = () => { $('file').value = ''; $('file').click(); };
    $('file').onchange = (e) => e.target.files.length && loadFiles([...e.target.files]);
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    document.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });
    $('fYear').onchange = (e) => { S.year = +e.target.value; S.sel.mes = null; render(); };
    $('fEmpresa').onchange = (e) => { S.empresa = e.target.value; render(); };
    $('fQ').oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); render(); };
    if ($('fTipo')) $('fTipo').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; S.tipo = b.dataset.v;
      $('fTipo').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); render();
    };
    $('chips').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.k === 'all') S.sel = emptySel(); else S.sel[b.dataset.k] = null; render();
    };
    $('pay').onclick = (e) => { const b = e.target.closest('.payrow'); if (b) toggle('estado', b.dataset.estado); };
    document.querySelector('thead').onclick = (e) => {
      const th = e.target.closest('th'); if (!th) return; const k = th.dataset.k;
      S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : (k === 'producto' ? 1 : -1) }; renderTabla();
    };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!$('app').hidden) render(); });

    window.PRApp = { load: loadFiles, state: S };   // para pruebas / integración
  };
})(window.PR);
