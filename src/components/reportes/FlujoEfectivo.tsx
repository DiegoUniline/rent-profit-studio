import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  SaldoCuenta,
  formatCurrency,
  calcularTotalesPorRubro,
  agruparPorRubro,
  calcularUtilidad,
} from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FlujoEfectivoProps {
  saldos: SaldoCuenta[];
  saldosAnteriores?: SaldoCuenta[];
  loading?: boolean;
  fechaInicio: Date;
  fechaFin: Date;
}

export function FlujoEfectivo({
  saldos,
  saldosAnteriores,
  loading,
  fechaInicio,
  fechaFin,
}: FlujoEfectivoProps) {
  const datos = useMemo(() => {
    const grupos = agruparPorRubro(saldos);
    const totales = calcularTotalesPorRubro(grupos);
    const utilidadNeta = calcularUtilidad(totales);

    // Identificar cuentas de efectivo (códigos que empiezan con 100-001 típicamente)
    const cuentasEfectivo = saldos.filter(
      (s) =>
        s.codigo.startsWith("100-001") ||
        s.nombre.toLowerCase().includes("caja") ||
        s.nombre.toLowerCase().includes("banco")
    );

    const saldoInicialEfectivo = cuentasEfectivo.reduce(
      (sum, c) => sum + c.saldo_inicial,
      0
    );
    const saldoFinalEfectivo = cuentasEfectivo.reduce(
      (sum, c) => sum + c.saldo_final,
      0
    );

    // Método indirecto: partimos de la utilidad neta
    // Nota: Este es un cálculo simplificado. Un flujo de efectivo real
    // requeriría comparar saldos de balance entre dos períodos.

    // Flujo de Operación (simplificado)
    const flujoOperacion = utilidadNeta;

    // Flujo de Inversión: cambios en activos fijos (códigos 100-002, 100-003)
    const activosFijos = saldos.filter(
      (s) =>
        s.codigo.startsWith("100-002") ||
        s.codigo.startsWith("100-003") ||
        s.nombre.toLowerCase().includes("fijo") ||
        s.nombre.toLowerCase().includes("diferido")
    );
    const cambioActivosFijos = activosFijos.reduce(
      (sum, c) => sum + (c.haber - c.debe),
      0
    );
    const flujoInversion = cambioActivosFijos;

    // Flujo de Financiamiento: cambios en pasivos y capital
    const pasivoCapital = saldos.filter(
      (s) =>
        s.codigo.startsWith("2") || // Pasivos
        (s.codigo.startsWith("3") && !s.nombre.toLowerCase().includes("resultado"))
    );
    const cambioPasivoCapital = pasivoCapital.reduce(
      (sum, c) => sum + (c.haber - c.debe),
      0
    );
    const flujoFinanciamiento = cambioPasivoCapital;

    const flujoNetoTotal = flujoOperacion + flujoInversion + flujoFinanciamiento;

    return {
      utilidadNeta,
      flujoOperacion,
      flujoInversion,
      flujoFinanciamiento,
      flujoNetoTotal,
      saldoInicialEfectivo,
      saldoFinalEfectivo,
      cuentasEfectivo,
    };
  }, [saldos, saldosAnteriores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const formatPeriodo = () => {
    const inicio = fechaInicio.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const fin = fechaFin.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `Del ${inicio} al ${fin}`;
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Este reporte utiliza el <strong>método indirecto simplificado</strong>. 
          Para un flujo de efectivo completo, se requiere comparar balances de dos períodos consecutivos.
        </AlertDescription>
      </Alert>

      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-xl">Estado de Flujo de Efectivo</CardTitle>
          <p className="text-sm text-muted-foreground">{formatPeriodo()}</p>
          <p className="text-xs text-muted-foreground">(Método Indirecto)</p>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableBody>
              {/* ACTIVIDADES DE OPERACIÓN */}
              <TableRow className="bg-blue-50 dark:bg-blue-950/30">
                <TableCell
                  colSpan={2}
                  className="font-bold text-blue-700 dark:text-blue-400"
                >
                  ACTIVIDADES DE OPERACIÓN
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/50">
                <TableCell className="pl-8">Utilidad neta del ejercicio</TableCell>
                <TableCell className="text-right font-mono w-[150px]">
                  {formatCurrency(datos.utilidadNeta)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t font-semibold bg-muted/30">
                <TableCell className="pl-4">Flujo de Operación</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    datos.flujoOperacion < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.flujoOperacion)}
                </TableCell>
              </TableRow>

              {/* ACTIVIDADES DE INVERSIÓN */}
              <TableRow className="bg-orange-50 dark:bg-orange-950/30">
                <TableCell
                  colSpan={2}
                  className="font-bold text-orange-700 dark:text-orange-400"
                >
                  ACTIVIDADES DE INVERSIÓN
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/50">
                <TableCell className="pl-8">
                  Cambios en activos fijos y diferidos
                </TableCell>
                <TableCell className="text-right font-mono w-[150px]">
                  {formatCurrency(datos.flujoInversion)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t font-semibold bg-muted/30">
                <TableCell className="pl-4">Flujo de Inversión</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    datos.flujoInversion < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.flujoInversion)}
                </TableCell>
              </TableRow>

              {/* ACTIVIDADES DE FINANCIAMIENTO */}
              <TableRow className="bg-purple-50 dark:bg-purple-950/30">
                <TableCell
                  colSpan={2}
                  className="font-bold text-purple-700 dark:text-purple-400"
                >
                  ACTIVIDADES DE FINANCIAMIENTO
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/50">
                <TableCell className="pl-8">
                  Cambios en pasivos y capital
                </TableCell>
                <TableCell className="text-right font-mono w-[150px]">
                  {formatCurrency(datos.flujoFinanciamiento)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t font-semibold bg-muted/30">
                <TableCell className="pl-4">Flujo de Financiamiento</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    datos.flujoFinanciamiento < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.flujoFinanciamiento)}
                </TableCell>
              </TableRow>

              {/* Separador */}
              <TableRow>
                <TableCell colSpan={2} className="h-4"></TableCell>
              </TableRow>

              {/* FLUJO NETO */}
              <TableRow className="bg-primary/10 font-bold text-lg">
                <TableCell className="text-primary">
                  FLUJO NETO DE EFECTIVO
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-primary",
                    datos.flujoNetoTotal < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.flujoNetoTotal)}
                </TableCell>
              </TableRow>

              {/* SALDOS DE EFECTIVO */}
              <TableRow>
                <TableCell colSpan={2} className="h-2"></TableCell>
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="font-medium">
                  Efectivo al inicio del período
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(datos.saldoInicialEfectivo)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/50 font-bold">
                <TableCell>Efectivo al final del período</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(datos.saldoFinalEfectivo)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Resumen visual */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div
              className={cn(
                "p-4 rounded-lg text-center",
                datos.flujoOperacion >= 0
                  ? "bg-blue-100 dark:bg-blue-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
              )}
            >
              <p className="text-xs text-muted-foreground">Operación</p>
              <p
                className={cn(
                  "font-bold",
                  datos.flujoOperacion >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-700"
                )}
              >
                {formatCurrency(datos.flujoOperacion)}
              </p>
            </div>
            <div
              className={cn(
                "p-4 rounded-lg text-center",
                datos.flujoInversion >= 0
                  ? "bg-orange-100 dark:bg-orange-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
              )}
            >
              <p className="text-xs text-muted-foreground">Inversión</p>
              <p
                className={cn(
                  "font-bold",
                  datos.flujoInversion >= 0 ? "text-orange-700 dark:text-orange-300" : "text-red-700"
                )}
              >
                {formatCurrency(datos.flujoInversion)}
              </p>
            </div>
            <div
              className={cn(
                "p-4 rounded-lg text-center",
                datos.flujoFinanciamiento >= 0
                  ? "bg-purple-100 dark:bg-purple-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
              )}
            >
              <p className="text-xs text-muted-foreground">Financiamiento</p>
              <p
                className={cn(
                  "font-bold",
                  datos.flujoFinanciamiento >= 0 ? "text-purple-700 dark:text-purple-300" : "text-red-700"
                )}
              >
                {formatCurrency(datos.flujoFinanciamiento)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
