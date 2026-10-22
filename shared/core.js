/* Pioneros Reports - núcleo compartido: lectura de Excel (SheetJS), formato y utilidades.
   Todo se procesa en el navegador; los archivos NO se suben a ningún servidor. */
(function (global) {
  'use strict';
  const PR = {};

  /* ---------- Formato (es-AR) ---------- */
  const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  PR.fmt = {
    int: (n) => nf0.format(n),
    dec2: (n) => nf2.format(n),
    pct: (n) => nf1.format(n) + ' %',
    // 1.234.567 -> "1,23 M" · 575.700 -> "575,7K"
    compact(n) {
      const a = Math.abs(n), s = n < 0 ? '-' : '';
      if (a >= 1e9) return s + nf2.format(a / 1e9) + ' mil M';
      if (a >= 1e6) return s + nf2.format(a / 1e6) + ' M';
      if (a >= 1e3) return s + nf1.format(a / 1e3) + 'K';
      return s + nf0.format(a);
    },
    usd: (n) => 'USD ' + nf0.format(n),
  };
  PR.MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  /* ---------- Utilidades ---------- */
  PR.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  PR.num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  // Las fechas de SheetJS pueden llegar corridas unas horas por zona horaria: se compensa.
  PR.toDate = (v) => {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600e3);
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400e3) + 12 * 3600e3);
    if (typeof v === 'string') {
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (m) return new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], 12));
    }
    return null;
  };
  PR.cleanName = (s) => String(s || '').replace(/\s*\(\d+\)\s*$/, '').trim();   // "COU S.A. (23)" -> "COU S.A."

  /* ---------- Lectura de Excel ---------- */
  PR.readFile = (file, mustHave) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('No se pudo leer el archivo'));
    fr.onload = () => {
      try { resolve(PR.parseWorkbook(new Uint8Array(fr.result), file.name, mustHave)); }
      catch (e) { reject(e); }
    };
    fr.readAsArrayBuffer(file);
  });

  // Devuelve { meta:{empresa,periodo,archivo}, header:[...], records:[{col:valor}] }
  // Detecta sola la fila de encabezados (los informes de Synagro traen título y filtros arriba).
  PR.parseWorkbook = (bytes, fileName, mustHave) => {
    mustHave = mustHave || ['Subtotal c/ IVA'];
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const hi = grid.findIndex((r) => mustHave.every((c) => r.includes(c)));
    if (hi < 0) throw new Error(`No encontré la fila de encabezados (busqué: ${mustHave.join(', ')}). ¿Es el informe correcto?`);
    const header = grid[hi];
    const meta = { archivo: fileName, empresa: '', periodo: '' };
    grid.slice(0, hi).forEach((r) => {
      const t = String(r[0] ?? '');
      if (/^Empresa:/i.test(t)) meta.empresa = t.replace(/^Empresa:\s*/i, '').trim();
      if (/^Per[ií]odo:/i.test(t)) meta.periodo = t.replace(/^Per[ií]odo:\s*/i, '').trim();
    });
    const records = [];
    for (let i = hi + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r || r.every((c) => c === null || c === '')) continue;
      const o = {};
      header.forEach((h, j) => { if (h) o[h] = r[j] ?? null; });
      records.push(o);
    }
    return { meta, header, records };
  };

  global.PR = PR;
})(window);

