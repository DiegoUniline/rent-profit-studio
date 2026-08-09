import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/accounting-utils";
import { ProgramacionAutomaticaDialog } from "@/components/dialogs/ProgramacionAutomaticaDialog";
import { ProgramacionManualDialog } from "@/components/dialogs/ProgramacionManualDialog";
import { Wand2, ListPlus, Landmark, Wallet, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

interface Props {
  proyectoId: string;
  empresaId: string;
  presupuestoTotal: number;
  canView: boolean;
  canEdit: boolean;
}

interface Programacion {
  id: string;
  modo: "automatica" | "manual";
  tiene_anticipo: boolean;
  anticipo_monto: number;
  frecuencia: string | null;
}

interface Pago {
  id: string;
  fecha: string;
  monto: number;
}

export function ProgramacionFinancieraProyecto({ proyectoId, empresaId, presupuestoTotal, canView, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [programacion, setProgramacion] = useState<Programacion | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [autoDialogOpen, setAutoDialogOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  useEffect(() => {
    if (canView) fetchAll();
  }, [proyectoId, canView]);

  const fetchAll = async () => {
    setLoading(true);
    const { data: prog } = await supabase
      .from("proyecto_programacion_financiera")
      .select("id, modo, tiene_anticipo, anticipo_monto, frecuencia")
      .eq("proyecto_id", proyectoId)
      .maybeSingle();
    setProgramacion(prog as Programacion | null);

    if (prog) {
      const { data: pagosData } = await supabase
        .from("proyecto_programacion_pagos")
        .select("id, fecha, monto")
        .eq("programacion_id", prog.id)
        .order("fecha");
      setPagos(pagosData || []);
    } else {
      setPagos([]);
    }
    setLoading(false);
  };

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
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">Cargando...</div>
    );
  }

  const anticipo = programacion?.tiene_anticipo ? Number(programacion.anticipo_monto) : 0;
  const saldoAProgramar = Math.max(0, presupuestoTotal - anticipo);
  const programado = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  const pendiente = Math.max(0, saldoAProgramar - programado);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Presupuesto total</p>
              <Landmark className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(presupuestoTotal)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Anticipo</p>
              <Wallet className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(anticipo)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Saldo a programar</p>
              <Clock className="h-4 w-4 text-amber-500/70" />
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(saldoAProgramar)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Programado</p>
              <CheckCircle2 className="h-4 w-4 text-blue-500/70" />
            </div>
            <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(programado)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-primary/30 bg-primary/[0.03]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Pendiente</p>
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(pendiente)}</p>
          </CardContent>
        </Card>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAutoDialogOpen(true)}>
            <Wand2 className="h-3.5 w-3.5" />
            Programar automáticamente
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setManualDialogOpen(true)}>
            <ListPlus className="h-3.5 w-3.5" />
            Agregar programación manual
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Parcialidades
            {programacion && (
              <Badge variant="outline" className="ml-1">
                {programacion.modo === "automatica" ? "Automática" : "Manual"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pagos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Este proyecto todavía no tiene programación financiera propia.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{format(new Date(p.fecha + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(p.monto))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProgramacionAutomaticaDialog
        open={autoDialogOpen}
        onOpenChange={setAutoDialogOpen}
        proyectoId={proyectoId}
        empresaId={empresaId}
        presupuestoTotal={presupuestoTotal}
        onSuccess={fetchAll}
      />
      <ProgramacionManualDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        proyectoId={proyectoId}
        empresaId={empresaId}
        presupuestoTotal={presupuestoTotal}
        onSuccess={fetchAll}
      />
    </div>
  );
}
