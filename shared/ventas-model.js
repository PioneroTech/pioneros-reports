/* Modelo de Ventas: normaliza el informe "Ventas detalladas" de Synagro. */
(function (PR) {
  'use strict';
  // Rubros que se consideran SERVICIOS; todo lo demás es PRODUCTOS.
  PR.SERVICE_RUBROS = ['HORAS TECNICAS'];

  // OJO: el informe "Ventas detalladas" trae TODOS los importes en dólares, incluso las líneas cuya
  // Moneda original figura como "Peso" (la columna Moneda es la del comprobante, no la del importe).
  // Verificado contra el Balance de Sumas y Saldos: con esta regla "Ingreso por ventas" y
  // "Comisiones Lima Grain" coinciden con la contabilidad al peso.
  //   USD   = Subtotal c/ IVA (siempre)      ·      Pesos = USD x Cotización del comprobante
  // Las notas de crédito (NC) ya vienen en negativo y restan solas.
  PR.normalizeVentas = (rec, meta) => {
    const f = PR.toDate(rec['Fecha de Imputación'] ?? rec['Fecha de Comprobante']);
    if (!f) return null;
    const cot = PR.num(rec['Cotización']) || 1;
    const sub = PR.num(rec['Subtotal c/ IVA']);
    const rubro = String(rec['Rubro'] || '').trim();
    return {
      empresa: String(rec['Empresa'] || meta.empresa || 'Sin empresa').trim(),
      y: f.getUTCFullYear(), m: f.getUTCMonth(),
      ent: String(rec['Cliente'] || 'Sin cliente').trim(),
      comp: [rec['Tipo de Comprobante'], rec['Letra'], rec['Punto de Venta'], rec['Número de Comprobante']].join('|'),
      tcomp: String(rec['Tipo de Comprobante'] || ''),
      usd: sub,
      ars: sub * cot,
      producto: String(rec['Detalle/Categoría'] || 'Sin detalle').trim(),
      cant: PR.num(rec['Cantidad']),
      cuenta: String(rec['Cuenta'] || 'Sin cuenta').trim(),
      tipo: PR.SERVICE_RUBROS.includes(rubro.toUpperCase()) ? 'Servicios' : 'Productos',
      estado: String(rec['Estado del Comprobante'] || 'Sin estado').trim(),
    };
  };
})(window.PR);
