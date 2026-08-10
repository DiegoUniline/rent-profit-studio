import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/accounting-utils";
import { ProgramacionPartidaDialog, PartidaProgramable } from "@/components/dialogs/ProgramacionPartidaDialog";
import { Wand2, Landmark, Wallet, Clock } from "lucide-react";
import { format } from "date-fns";

interface Props {
  proyectoId: string;
  empresaId: string;
  partidas: PartidaProgramable[];
  canView: boolean;
  canEdit: boolean;
}

interface PagoRow {
  id: string;
  fecha: string;
  monto: number;
  concepto: string | null;
  es_anticipo: boolean;
}

export function ProgramacionFinancieraProyecto({ proyectoId, empresaId, partidas, canView, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  // presupuesto_id -> { programacionId, pagos }
  const [porPartida, setPorPartida] = useState<Map<string, { programacionId: string; pagos: PagoRow[] }>>(new Map());
  const [selectedPartidaId, setSelectedPartidaId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (canView && partidas.length > 0) fetchAll();
    else setLoading(false);
  }, [canView, partidas.map((p) => p.id).join(",")]);

  const fetchAll = async () => {
    setLoading(true);
    const ids = partidas.map((p) => p.id);
    const { data: programaciones } = await supabase
      .from("proyecto_programacion_financiera")
      .select("id, presupuesto_id")
      .in("presupuesto_id", ids);

    const map = new Map<string, { programacionId: string; pagos: PagoRow[] }>();
    if (programaciones && programaciones.length > 0) {
      const programacionIds = programaciones.map((p) => p.id);
      const { data: pagosData } = await supabase
        .from("proyecto_programacion_pagos")
        .select("id, programacion_id, fecha, monto, concepto, es_anticipo")
        .in("programacion_id", programacionIds)
        .order("fecha");

      programaciones.forEach((prog) => {
        map.set(prog.presupuesto_id, {
          programacionId: prog.id,
          pagos: (pagosData || [])
            .filter((p) => p.programacion_id === prog.id)
            .map((p) => ({ id: p.id, fecha: p.fecha, monto: Number(p.monto), concepto: p.concepto, es_anticipo: p.es_anticipo })),
        });
      });
    }
    setPorPartida(map);
    setLoading(false);
  };

  const overview = useMemo(
    () =>
      partidas.map((p) => {
        const registro = porPartida.get(p.id);
        const programado = (registro?.pagos || []).reduce((s, pago) => s + pago.monto, 0);
        return { partida: p, programado, pendiente: Math.max(0, p.presupuesto - programado) };
      }),
    [partidas, porPartida]
  );

  const selected = overview.find((o) => o.partida.id === selectedPartidaId) || null;

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No tienes acceso a la programación financiera de este proyecto.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">Cargando...</div>;
  }

  if (partidas.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Este proyecto todavía no tiene partidas de presupuesto marcadas como Project.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partida a programar</CardTitle>
        </CardHeader>
        <CardContent>
          <SearchableSelect
            value={selectedPartidaId}
            onValueChange={setSelectedPartidaId}
            options={partidas.map((p) => ({
              id: p.id,
              label: `${p.cuenta_codigo ? p.cuenta_codigo + " · " : ""}${p.partida}`,
              sublabel: formatCurrency(p.presupuesto),
            }))}
            placeholder="Selecciona una partida del presupuesto"
            searchPlaceholder="Buscar partida..."
            emptyMessage="No hay partidas"
          />
        </CardContent>
      </Card>

      {selected && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Partida</p>
                  <Landmark className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-bold truncate" title={selected.partida.partida}>
                  {selected.partida.partida}
                </p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Importe presupuestado</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(selected.partida.presupuesto)}</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Ya programado</p>
                  <Wallet className="h-4 w-4 text-blue-500/70" />
                </div>
                <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(selected.programado)}</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-primary/30 bg-primary/[0.03]">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Pendiente por programar</p>
                  <Clock className="h-4 w-4 text-amber-500/70" />
                </div>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(selected.pendiente)}</p>
              </CardContent>
            </Card>
          </div>

          {canEdit && (
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Wand2 className="h-3.5 w-3.5" />
              Programar partida
            </Button>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Programación de "{selected.partida.partida}"</CardTitle>
            </CardHeader>
            <CardContent>
              {(porPartida.get(selected.partida.id)?.pagos || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Esta partida todavía no tiene programación financiera.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        let periodo = 0;
                        return (porPartida.get(selected.partida.id)?.pagos || []).map((p) => {
                          if (!p.es_anticipo) periodo += 1;
                          return (
                            <TableRow key={p.id}>
                              <TableCell>{p.es_anticipo ? "Anticipo" : periodo}</TableCell>
                              <TableCell>{format(new Date(p.fecha + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                              <TableCell>{p.concepto || (p.es_anticipo ? "Anticipo" : "—")}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(p.monto)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">Programado</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                  <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t text-sm">
                    <div>
                      <p className="text-muted-foreground">Presupuesto de partida</p>
                      <p className="font-semibold">{formatCurrency(selected.partida.presupuesto)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Programado</p>
                      <p className="font-semibold">{formatCurrency(selected.programado)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pendiente</p>
                      <p className="font-semibold">{formatCurrency(selected.pendiente)}</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas las partidas del proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partida</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">Programado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="w-28">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.map((o) => (
                <TableRow key={o.partida.id} className={o.partida.id === selectedPartidaId ? "bg-muted/40" : ""}>
                  <TableCell>{o.partida.partida}</TableCell>
                  <TableCell className="text-right">{formatCurrency(o.partida.presupuesto)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(o.programado)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(o.pendiente)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPartidaId(o.partida.id)}>
                      {o.programado > 0 ? "Ver" : "Programar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProgramacionPartidaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proyectoId={proyectoId}
        empresaId={empresaId}
        partida={selected?.partida || null}
        onSuccess={fetchAll}
      />
    </div>
  );
}
