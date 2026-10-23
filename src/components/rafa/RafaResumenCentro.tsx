import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, ListChecks, Loader2, PiggyBank } from "lucide-react";
import { resumenDeCentro, type ResumenCentroRafa } from "@/lib/rafa-chat";
import { formatDateShort } from "@/lib/date-utils";

const moneda = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Cuadro({ icono, titulo, children, alerta = false }: { icono: React.ReactNode; titulo: string; children: React.ReactNode; alerta?: boolean }) {
  return (
    <div className={`space-y-1 rounded-lg border p-3 ${alerta ? "border-destructive/50 bg-destructive/5" : "bg-background"}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icono}
        {titulo}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** Resumen del centro: presupuestado vs ejercido, pagos de la semana, excesos y tareas vencidas. */
export function RafaResumenCentro({ centroId }: { centroId: string }) {
  const [r, setR] = useState<ResumenCentroRafa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    setR(null);
    resumenDeCentro(centroId)
      .then((d) => vigente && setR(d))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo calcular el resumen."))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [centroId]);

  if (cargando)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando el resumen del centro…
      </p>
    );
  if (error || !r?.semana) return <p className="text-xs text-destructive">Resumen no disponible{error ? `: ${error}` : "."}</p>;

  const egresosSemana = r.pagos_semana?.lista.filter((p) => p.tipo === "egreso") ?? [];
  const excesos = r.excesos_semana ?? [];
  return (
    <div className="space-y-2" aria-label="Resumen del centro">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Cuadro icono={<PiggyBank className="h-3.5 w-3.5" />} titulo="Presupuesto (egresos)" alerta={Boolean(r.presupuesto?.excedidas.length)}>
          {r.presupuesto ? (
            <>
              <p className="font-semibold">
                {moneda(r.presupuesto.egresos.ejercido)} <span className="font-normal text-muted-foreground">de {moneda(r.presupuesto.egresos.presupuestado)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {pct(r.presupuesto.egresos.ejercido, r.presupuesto.egresos.presupuestado)}% ejercido · por ejercer {moneda(r.presupuesto.egresos.por_ejercer)}
              </p>
              {r.presupuesto.ingresos.presupuestado > 0 && (
                <p className="text-xs text-muted-foreground">
                  Ingresos: {moneda(r.presupuesto.ingresos.ejercido)} de {moneda(r.presupuesto.ingresos.presupuestado)}
                </p>
              )}
              {r.presupuesto.excedidas.length > 0 && (
                <p className="text-xs text-destructive">{r.presupuesto.excedidas.length} partida(s) con ejercido mayor al presupuesto</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No disponible</p>
          )}
        </Cuadro>
        <Cuadro icono={<CalendarClock className="h-3.5 w-3.5" />} titulo={`Pagos de esta semana (${formatDateShort(r.semana.desde)}–${formatDateShort(r.semana.hasta)})`}>
          {r.pagos_semana ? (
            <>
              <p className="font-semibold">
                {moneda(r.pagos_semana.egresos)} <span className="font-normal text-muted-foreground">en {egresosSemana.length} pago(s)</span>
              </p>
              {r.pagos_semana.ingresos > 0 && <p className="text-xs text-muted-foreground">Cobros: {moneda(r.pagos_semana.ingresos)}</p>}
              {r.sin_partida && r.sin_partida.cantidad > 0 && (
                <p className="text-xs text-destructive">
                  {r.sin_partida.cantidad} sin partida ({moneda(r.sin_partida.monto)})
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No disponible</p>
          )}
        </Cuadro>
        <Cuadro icono={<AlertTriangle className="h-3.5 w-3.5" />} titulo="Se pasan del presupuesto" alerta={excesos.length > 0}>
          {r.excesos_semana ? (
            excesos.length ? (
              <ul className="space-y-0.5 text-xs">
                {excesos.slice(0, 4).map((p) => (
                  <li key={p.presupuesto_id} className="flex justify-between gap-2">
                    <Link to={`/presupuestos/${p.presupuesto_id}/ejercido`} className="truncate text-primary underline underline-offset-2">
                      {p.partida}
                    </Link>
                    <span className="shrink-0 text-destructive">{moneda(p.disponible_final)}</span>
                  </li>
                ))}
                {excesos.length > 4 && <li className="text-muted-foreground">y {excesos.length - 4} más</li>}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Ninguna con lo programado a esta semana</p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">No disponible</p>
          )}
        </Cuadro>
        <Cuadro icono={<ListChecks className="h-3.5 w-3.5" />} titulo="Tareas vencidas" alerta={Boolean(r.tareas_vencidas?.length)}>
          {r.tareas_vencidas === null ? (
            <p className="text-xs text-muted-foreground">El centro no tiene proyecto</p>
          ) : r.tareas_vencidas.length ? (
            <ul className="space-y-0.5 text-xs">
              {r.tareas_vencidas.slice(0, 4).map((t) => (
                <li key={t.id} className="truncate">
                  {t.titulo} {t.vence ? <span className="text-destructive">· {formatDateShort(t.vence)}</span> : null}
                </li>
              ))}
              {r.tareas_vencidas.length > 4 && <li className="text-muted-foreground">y {r.tareas_vencidas.length - 4} más</li>}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin tareas vencidas</p>
          )}
        </Cuadro>
      </div>
      {r.avisos.length > 0 && <p className="text-xs text-muted-foreground">{r.avisos.join(" · ")}</p>}
    </div>
  );
}
