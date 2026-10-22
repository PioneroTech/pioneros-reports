# Pioneros Reports

Tableros propios en HTML + JS puro (Chart.js + SheetJS). Sin backend: el Excel se carga en el navegador y **no se sube a ningún servidor**.

## Estructura
- `ventas.html` — tablero de Ventas (informe "Ventas detalladas" de Synagro)
- `compras.html` — tablero de Compras (informe "Compras detalladas en Peso" de Synagro)
- `shared/core.js` — lectura de Excel (detecta la fila de encabezados), formato es-AR, utilidades
- `shared/dashboard.js` — motor común de los tableros (filtros, KPIs, gráficos, tabla); cada página solo le pasa una configuración
- `shared/ventas-model.js`, `shared/compras-model.js` — reglas de negocio de cada informe
- `shared/theme.css` — tema claro/oscuro común a todos los tableros

## Publicar en GitHub Pages
Repo en PioneroTech → Settings → Pages → Deploy from branch (`main`, `/root`).
**GitHub Pages es público: no commitear los Excel** (el `.gitignore` ya los excluye).

## Reglas de cálculo (Ventas)
- El informe "Ventas detalladas" trae **todos** los importes en USD (la columna Moneda es la del comprobante, no la del importe). Verificado contra el Balance de Sumas y Saldos.
- USD = `Subtotal c/ IVA`; pesos = USD × `Cotización`.
- Las Notas de Crédito ya vienen en negativo y restan.
- Servicios = rubro `HORAS TECNICAS` (editable en `PR.SERVICE_RUBROS`); el resto es Productos.

## Reglas de cálculo (Compras)
- El informe "en Peso" trae **todos** los importes en pesos (incluso líneas con Moneda = Dólar).
- USD = `Subtotal c/ IVA` ÷ `Cotización` del comprobante, para todas las líneas.
- "% pagado" usa el estado del comprobante (Pagado); un pago parcial no cuenta como pagado.

## Agregar un tablero nuevo
Copiar `compras.html`, crear su `shared/<nombre>-model.js` que normalice cada fila a
`{ empresa, y, m, ent, usd, ars, producto, cant, cuenta, estado, comp, tcomp }` y ajustar la configuración.
