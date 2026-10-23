// Exporta a Excel o PDF cualquier tabla que muestre Rafa (las mismas filas
// que trae el resultado; si el resultado venía truncado, se avisa en el título).
import type { TablaRafa } from "@/lib/rafa-chat";

const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function nombreArchivo(titulo: string, extension: string): string {
  const base = (titulo || "rafa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${base || "rafa"}_${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function texto(valor: unknown, tipo?: string): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (tipo === "moneda" && typeof valor === "number") return moneda.format(valor);
  if (tipo === "porcentaje" && typeof valor === "number") return `${valor.toFixed(2)}%`;
  if (typeof valor === "number") return valor.toLocaleString("es-MX");
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

/** Encabezados y filas sin columnas internas (_enlace…). Excel conserva números; PDF usa texto formateado. */
export function datosParaExportar(tabla: TablaRafa) {
  const columnas = tabla.columnas.filter((c) => !c.clave.startsWith("_"));
  const encabezados = columnas.map((c) => c.etiqueta);
  const filas = tabla.filas.map((f) => columnas.map((c) => (typeof f[c.clave] === "number" ? (f[c.clave] as number) : texto(f[c.clave], c.tipo))));
  const filasTexto = tabla.filas.map((f) => columnas.map((c) => texto(f[c.clave], c.tipo)));
  const totales = tabla.totales
    ? columnas.map((c, i) => (i === 0 && tabla.totales![c.clave] === undefined ? "Total" : tabla.totales![c.clave] ?? ""))
    : null;
  const totalesTexto = tabla.totales
    ? columnas.map((c, i) => (i === 0 && tabla.totales![c.clave] === undefined ? "Total" : texto(tabla.totales![c.clave], c.tipo)))
    : null;
  return { columnas, encabezados, filas, filasTexto, totales, totalesTexto };
}

export async function exportarExcel(tabla: TablaRafa) {
  const XLSX = await import("xlsx");
  const d = datosParaExportar(tabla);
  const hoja = XLSX.utils.aoa_to_sheet([d.encabezados, ...d.filas, ...(d.totales ? [d.totales] : [])]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, (tabla.titulo || "Rafa").replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  XLSX.writeFile(libro, nombreArchivo(tabla.titulo, "xlsx"));
}

export async function exportarPdf(tabla: TablaRafa) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const d = datosParaExportar(tabla);
  const doc = new jsPDF({ orientation: d.columnas.length > 5 ? "landscape" : "portrait" });
  doc.setFontSize(12);
  doc.text(tabla.titulo || "Rafa", 14, 14);
  doc.setFontSize(8);
  doc.text(`Generado por Rafa · ${new Date().toLocaleString("es-MX")}`, 14, 19);
  autoTable(doc, {
    startY: 23,
    head: [d.encabezados],
    body: d.filasTexto,
    foot: d.totalesTexto ? [d.totalesTexto] : undefined,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [41, 98, 255] },
    columnStyles: Object.fromEntries(
      d.columnas.map((c, i) => [i, c.tipo === "moneda" || c.tipo === "numero" || c.tipo === "porcentaje" ? { halign: "right" } : {}])
    ),
  });
  doc.save(nombreArchivo(tabla.titulo, "pdf"));
}
