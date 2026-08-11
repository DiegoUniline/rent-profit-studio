// Exportar/compartir el Cronograma de un Project — reutiliza el mismo patrón
// de jsPDF + jspdf-autotable ya usado en CuentaDetalle.tsx y EstadoFinanciero.tsx,
// y el mismo esquema de wa.me/mailto usado para compartir por WhatsApp.
// Nunca incluye montos, presupuesto ni programación financiera (solo calendario y avance).
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { FilaGantt } from "@/components/proyectos/ProjectGantt";

function estadoDe(fila: FilaGantt): string {
  if (fila.vencida) return "Vencida";
  if (fila.avance >= 100) return "Completada";
  return "En curso";
}

export async function exportarCronogramaPDF(proyectoNombre: string, clienteNombre: string | null, filas: FilaGantt[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Cronograma — ${proyectoNombre}`, 14, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (clienteNombre) doc.text(`Cliente: ${clienteNombre}`, 14, 22);

  doc.setFontSize(8);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - 14, 15, { align: "right" });
  doc.text(`${filas.length} partidas`, pageWidth - 14, 21, { align: "right" });

  const conFechas = filas.filter((f) => f.fechaInicio && f.fechaFin);
  if (conFechas.length > 0) {
    const inicio = conFechas.reduce((min, f) => (f.fechaInicio! < min ? f.fechaInicio! : min), conFechas[0].fechaInicio!);
    const fin = conFechas.reduce((max, f) => (f.fechaFin! > max ? f.fechaFin! : max), conFechas[0].fechaFin!);
    doc.text(
      `Período: ${format(new Date(inicio + "T00:00:00"), "dd/MM/yyyy")} — ${format(new Date(fin + "T00:00:00"), "dd/MM/yyyy")}`,
      14,
      clienteNombre ? 28 : 22
    );
  }

  const tableData = filas.map((f) => [
    f.cuentaCodigo ? `${f.cuentaCodigo}${f.cuentaNombre ? " · " + f.cuentaNombre : ""}` : "Sin cuenta",
    f.partida,
    f.fechaInicio ? format(new Date(f.fechaInicio + "T00:00:00"), "dd/MM/yyyy") : "—",
    f.fechaFin ? format(new Date(f.fechaFin + "T00:00:00"), "dd/MM/yyyy") : "—",
    `${f.avance.toFixed(0)}%`,
    estadoDe(f),
  ]);

  autoTable(doc, {
    startY: (clienteNombre ? 28 : 22) + (conFechas.length > 0 ? 8 : 4),
    head: [["Cuenta", "Partida", "Inicio", "Fin", "Avance", "Estado"]],
    body: tableData,
    headStyles: { fillColor: [63, 81, 181] },
    styles: { fontSize: 8 },
  });

  doc.save(`Cronograma_${proyectoNombre.replace(/\s+/g, "_")}.pdf`);
}

export function compartirCronogramaWhatsApp(proyectoNombre: string, filas: FilaGantt[]) {
  const lines: string[] = [];
  lines.push(`*Cronograma — ${proyectoNombre}*`);
  lines.push("─────────────────");

  filas.forEach((f) => {
    const inicio = f.fechaInicio ? format(new Date(f.fechaInicio + "T00:00:00"), "dd MMM yyyy", { locale: es }) : "—";
    const fin = f.fechaFin ? format(new Date(f.fechaFin + "T00:00:00"), "dd MMM yyyy", { locale: es }) : "—";
    lines.push(`${f.partida}: ${inicio} a ${fin} · ${f.avance.toFixed(0)}% · ${estadoDe(f)}`);
  });

  lines.push("─────────────────");
  lines.push(`_${filas.length} partidas_`);

  const encoded = encodeURIComponent(lines.join("\n"));
  window.open(`https://wa.me/?text=${encoded}`, "_blank");
}

export function compartirCronogramaCorreo(proyectoNombre: string, filas: FilaGantt[]) {
  const subject = encodeURIComponent(`Cronograma — ${proyectoNombre}`);
  const lines = filas.map((f) => {
    const inicio = f.fechaInicio ? format(new Date(f.fechaInicio + "T00:00:00"), "dd/MM/yyyy") : "—";
    const fin = f.fechaFin ? format(new Date(f.fechaFin + "T00:00:00"), "dd/MM/yyyy") : "—";
    return `${f.partida}: ${inicio} a ${fin} (${f.avance.toFixed(0)}%, ${estadoDe(f)})`;
  });
  const body = encodeURIComponent(lines.join("\n"));
  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
}
