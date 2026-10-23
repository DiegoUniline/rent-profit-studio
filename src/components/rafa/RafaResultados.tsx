import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateShort } from "@/lib/date-utils";
import {
  ETIQUETA_ESTADO_ACCION,
  type AccionRafa,
  type AlcanceRafa,
  type HerramientaUsada,
  type TablaRafa,
} from "@/lib/rafa-chat";
import type { PlanRafa } from "@/lib/rafa-types";
import { exportarExcel, exportarPdf } from "@/lib/rafa-exportar";
import { AlertTriangle, CheckCircle2, ChevronDown, Database, ExternalLink, FileSpreadsheet, FileText, Loader2, XCircle } from "lucide-react";

const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function formatear(valor: unknown, tipo?: string): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (tipo === "moneda" && typeof valor === "number") return moneda.format(valor);
  if (tipo === "porcentaje" && typeof valor === "number") return `${valor.toFixed(2)}%`;
  if (tipo === "numero" && typeof valor === "number") return valor.toLocaleString("es-MX");
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatDateShort(valor);
  if (typeof valor === "number") return valor.toLocaleString("es-MX");
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

const MAX_FILAS = 50;

export function TablaResultado({ tabla }: { tabla: TablaRafa }) {
  if (!tabla.filas?.length) return null;
  const columnas = tabla.columnas.filter((c) => !c.clave.startsWith("_"));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <p className="flex-1 text-xs font-medium text-muted-foreground">{tabla.titulo}</p>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => void exportarExcel(tabla)} aria-label={`Exportar ${tabla.titulo} a Excel`}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel
        </Button>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => void exportarPdf(tabla)} aria-label={`Exportar ${tabla.titulo} a PDF`}>
          <FileText className="h-3.5 w-3.5" />
          PDF
        </Button>
      </div>
      <div className="max-h-80 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columnas.map((c) => (
                <TableHead key={c.clave} className={`whitespace-nowrap text-xs ${c.tipo === "moneda" || c.tipo === "numero" ? "text-right" : ""}`}>
                  {c.etiqueta}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tabla.filas.slice(0, MAX_FILAS).map((fila, i) => (
              <TableRow key={i}>
                {columnas.map((c, j) => {
                  const texto = formatear(fila[c.clave], c.tipo);
                  const enlace = j === 0 && typeof fila._enlace === "string" ? fila._enlace : null;
                  return (
                    <TableCell key={c.clave} className={`py-1.5 text-xs ${c.tipo === "moneda" || c.tipo === "numero" ? "text-right font-mono" : ""}`}>
                      {enlace ? (
                        <Link to={enlace} className="text-primary underline-offset-2 hover:underline">
                          {texto}
                        </Link>
                      ) : (
                        texto
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          {tabla.totales && (
            <TableFooter>
              <TableRow>
                {columnas.map((c, j) => (
                  <TableCell key={c.clave} className={`py-1.5 text-xs font-semibold ${c.tipo === "moneda" || c.tipo === "numero" ? "text-right font-mono" : ""}`}>
                    {tabla.totales && c.clave in tabla.totales ? formatear(tabla.totales[c.clave], c.tipo) : j === 0 ? "Total" : ""}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {tabla.filas.length > MAX_FILAS && (
        <p className="text-xs text-muted-foreground">
          Se muestran {MAX_FILAS} de {tabla.filas.length} filas.
        </p>
      )}
    </div>
  );
}

export function AlcanceTexto({ alcance }: { alcance: AlcanceRafa | null }) {
  if (!alcance) return null;
  const partes = [
    alcance.empresa?.nombre,
    alcance.proyecto?.nombre ? `Proyecto ${alcance.proyecto.nombre}` : null,
    alcance.periodo && (alcance.periodo.desde || alcance.periodo.hasta)
      ? `${alcance.periodo.desde ? formatDateShort(alcance.periodo.desde) : "inicio"} – ${alcance.periodo.hasta ? formatDateShort(alcance.periodo.hasta) : "hoy"}`
      : null,
    `${alcance.registros} registros${typeof alcance.total === "number" && alcance.total !== alcance.registros ? ` de ${alcance.total}` : ""}`,
  ].filter(Boolean);
  return (
    <p className="text-xs text-muted-foreground">
      Alcance: {partes.join(" · ")}
      {alcance.truncado && (
        <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">· Resultado parcial: no cubre todos los registros</span>
      )}
      {alcance.nota && <span className="block">{alcance.nota}</span>}
    </p>
  );
}

const ESTILO_ESTADO: Record<string, string> = {
  propuesta: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
  ejecutada: "bg-green-50 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800",
  fallida: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800",
  desactualizada: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800",
};

export function TarjetaAccion({
  accion,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  accion: AccionRafa;
  procesando: boolean;
  onConfirmar: (a: AccionRafa) => void;
  onCancelar: (a: AccionRafa) => void;
}) {
  const vp = accion.vista_previa || {};
  const pendiente = accion.estado === "propuesta" && accion.requiere_confirmacion;
  return (
    <div className="space-y-2 rounded-lg border-2 border-primary/30 bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{accion.descripcion}</p>
        <Badge variant="outline" className={ESTILO_ESTADO[accion.estado] || ""}>
          {ETIQUETA_ESTADO_ACCION[accion.estado] || accion.estado}
        </Badge>
      </div>
      {vp.resumen && <p className="text-sm text-muted-foreground">{vp.resumen}</p>}
      {(vp.tablas || []).map((t, i) => (
        <TablaResultado key={i} tabla={t} />
      ))}
      {(vp.advertencias || []).map((a, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {a}
        </p>
      ))}
      {(vp.efectos || []).length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {(vp.efectos || []).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {accion.error && accion.estado !== "ejecutada" && <p className="text-xs text-destructive">{accion.error}</p>}
      {pendiente && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={() => onConfirmar(accion)} disabled={procesando} className="gap-1.5">
            {procesando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Confirmar y ejecutar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCancelar(accion)} disabled={procesando} className="gap-1.5">
            <XCircle className="h-3.5 w-3.5" />
            Cancelar
          </Button>
          <span className="text-xs text-muted-foreground">Al confirmar se vuelven a verificar datos y permisos.</span>
        </div>
      )}
    </div>
  );
}

const NOMBRES: Record<string, string> = {
  buscar_conocimiento: "Documentación del sistema",
  describir_entidad: "Esquema de tabla",
  confirmacion_usuario: "Confirmación",
  cancelacion_usuario: "Cancelación",
};

export function ResultadosHerramientas({
  herramientas,
  acciones,
  procesando,
  onConfirmar,
  onCancelar,
  onAbrirPlan,
}: {
  herramientas: HerramientaUsada[];
  acciones: Map<string, AccionRafa>;
  procesando: string | null;
  onConfirmar: (a: AccionRafa) => void;
  onCancelar: (a: AccionRafa) => void;
  onAbrirPlan?: (plan: PlanRafa) => void;
}) {
  if (!herramientas?.length) return null;
  const conAccion = herramientas.filter((h) => h.accion && !["confirmacion_usuario", "cancelacion_usuario"].includes(h.nombre));
  const conPlan = herramientas.filter((h) => h.plan);
  const consultas = herramientas.filter((h) => !h.accion && !h.plan);
  const tablas = consultas.filter((h) => h.ok).flatMap((h) => h.tablas || []);
  const referencias = Array.from(
    new Map(
      herramientas
        .flatMap((h) => h.referencias || [])
        .filter((r) => r.enlace && r.entidad !== "documento" && r.entidad !== "empresa")
        .map((r) => [`${r.entidad}:${r.id}`, r])
    ).values()
  ).slice(0, 12);

  return (
    <div className="mt-2 space-y-3">
      {conAccion.map((h, i) => {
        const accion = acciones.get(h.accion!.id) || h.accion!;
        return <TarjetaAccion key={i} accion={accion} procesando={procesando === accion.id} onConfirmar={onConfirmar} onCancelar={onCancelar} />;
      })}
      {conPlan.map((h, i) => (
        <div key={`plan-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm">Propuesta de presupuesto con {h.plan?.partidas?.length ?? 0} partidas (sin guardar).</span>
          {onAbrirPlan && (
            <Button size="sm" variant="outline" onClick={() => onAbrirPlan(h.plan!)}>
              Abrir en el editor
            </Button>
          )}
        </div>
      ))}
      {consultas
        .filter((h) => h.ok && h.alcance && (h.alcance.empresa || h.alcance.proyecto || h.alcance.periodo || h.alcance.truncado))
        .slice(0, 3)
        .map((h, i) => (
          <AlcanceTexto key={`a-${i}`} alcance={h.alcance} />
        ))}
      {consultas
        .filter((h) => !h.ok && !h.opciones?.length && (h.faltantes?.length || h.error))
        .map((h, i) => (
          <p key={`e-${i}`} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {h.resumen}
          </p>
        ))}
      {tablas.slice(0, 4).map((t, i) => (
        <TablaResultado key={`t-${i}`} tabla={t} />
      ))}
      {referencias.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {referencias.map((r) => (
            <Link key={`${r.entidad}-${r.id}`} to={r.enlace!} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted">
              <ExternalLink className="h-3 w-3" />
              {r.etiqueta}
            </Link>
          ))}
        </div>
      )}
      {consultas.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Database className="h-3.5 w-3.5" />
            Fuentes consultadas ({consultas.length})
            <ChevronDown className="h-3.5 w-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {consultas.map((h, i) => (
              <div key={i} className="rounded-md border px-3 py-2">
                <p className="text-xs font-medium">
                  {NOMBRES[h.nombre] || h.nombre}
                  {!h.ok && <span className="ml-1 text-destructive">· no completada</span>}
                </p>
                <p className="text-xs text-muted-foreground">{h.resumen}</p>
                <AlcanceTexto alcance={h.alcance} />
                {(h.advertencias || []).map((a, j) => (
                  <p key={j} className="text-xs text-amber-700 dark:text-amber-300">{a}</p>
                ))}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
