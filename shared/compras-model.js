/* Modelo de Compras: normaliza el informe "Compras detalladas en: Peso" de Synagro. */
(function (PR) {
  'use strict';
  // OJO: el informe "en Peso" trae TODOS los importes ya expresados en pesos, incluso las líneas
  // cuya Moneda figura como "Dólar" (el importe es el equivalente en pesos). Por eso:
  //   pesos = Subtotal c/ IVA   ·   USD = pesos / Cotización del comprobante   (para todas las líneas)
  // Las notas de crédito (NC) ya vienen en negativo.
  PR.normalizeCompras = (rec, meta) => {
    const f = PR.toDate(rec['Fecha de Imputación'] ?? rec['Fecha de Comprobante']);
    if (!f) return null;
    const cot = PR.num(rec['Cotización']) || 1;
    const ars = PR.num(rec['Subtotal c/ IVA']);
    return {
      empresa: String(rec['Empresa'] || meta.empresa || 'Sin empresa').trim(),
      y: f.getUTCFullYear(), m: f.getUTCMonth(),
      ent: String(rec['Proveedor'] || 'Sin proveedor').trim(),
      // el encabezado de Synagro trae "Nímero" (typo); se aceptan ambas grafías
      comp: [rec['Tipo de Comprobante'], rec['Letra'], rec['Punto de Venta'], rec['Número de Comprobante'] ?? rec['Nímero de Comprobante']].join('|'),
      tcomp: String(rec['Tipo de Comprobante'] || ''),
      usd: ars / cot, ars,
      producto: String(rec['Detalle / Categoría'] ?? rec['Detalle/Categoría'] ?? 'Sin detalle').trim() || 'Sin detalle',
      cant: PR.num(rec['Cantidad']),
      cuenta: String(rec['Cuenta'] || 'Sin cuenta').trim(),
      estado: String(rec['Estado del Comprobante'] || 'Sin estado').trim(),
    };
  };
})(window.PR);

