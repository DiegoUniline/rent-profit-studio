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
  getSubrubros,
  calcularTotalesPorRubro,
  agruparPorRubro,
} from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";

interface EstadoResultadosProps {
  saldos: SaldoCuenta[];
  loading?: boolean;
  fechaInicio: Date;
  fechaFin: Date;
}

export function EstadoResultados({ saldos, loading, fechaInicio, fechaFin }: EstadoResultadosProps) {
  const datos = useMemo(() => {
    const grupos = agruparPorRubro(saldos);
    const totales = calcularTotalesPorRubro(grupos);

    const ingresosSubrubros = getSubrubros(saldos, "INGRESOS");
    const costosSubrubros = getSubrubros(saldos, "COSTOS");
    const gastosSubrubros = getSubrubros(saldos, "GASTOS");

    const totalIngresos = totales.INGRESOS || 0;
    const totalCostos = totales.COSTOS || 0;
    const totalGastos = totales.GASTOS || 0;

    const utilidadBruta = totalIngresos - totalCostos;
    const utilidadOperacion = utilidadBruta - totalGastos;
    // Por ahora, utilidad neta = utilidad de operación (sin ISR/PTU registrados)
    const utilidadNeta = utilidadOperacion;

    return {
      ingresosSubrubros,
      costosSubrubros,
      gastosSubrubros,
      totalIngresos,
      totalCostos,
      totalGastos,
      utilidadBruta,
      utilidadOperacion,
      utilidadNeta,
    };
  }, [saldos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const formatPeriodo = () => {
    const inicio = fechaInicio.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
    const fin = fechaFin.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
    return `Del ${inicio} al ${fin}`;
  };

  return (
    <div className="space-y-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-xl">Estado de Resultados</CardTitle>
          <p className="text-sm text-muted-foreground">{formatPeriodo()}</p>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableBody>
              {/* INGRESOS */}
              <TableRow className="bg-green-50 dark:bg-green-950/30">
                <TableCell className="font-bold text-green-700 dark:text-green-400">
                  INGRESOS
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
              {datos.ingresosSubrubros.map((subrubro) => (
                <TableRow key={subrubro.codigo} className="hover:bg-muted/50">
                  <TableCell className="pl-8">{subrubro.nombre}</TableCell>
                  <TableCell className="text-right font-mono w-[150px]">
                    {formatCurrency(subrubro.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t font-semibold">
                <TableCell className="pl-4">Total Ingresos</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(datos.totalIngresos)}
                </TableCell>
              </TableRow>

              {/* COSTOS */}
              <TableRow className="bg-red-50 dark:bg-red-950/30">
                <TableCell className="font-bold text-red-700 dark:text-red-400">
                  COSTOS
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
              {datos.costosSubrubros.map((subrubro) => (
                <TableRow key={subrubro.codigo} className="hover:bg-muted/50">
                  <TableCell className="pl-8">{subrubro.nombre}</TableCell>
                  <TableCell className="text-right font-mono w-[150px]">
                    ({formatCurrency(subrubro.total)})
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t font-semibold">
                <TableCell className="pl-4">Total Costos</TableCell>
                <TableCell className="text-right font-mono">
                  ({formatCurrency(datos.totalCostos)})
                </TableCell>
              </TableRow>

              {/* UTILIDAD BRUTA */}
              <TableRow className="bg-muted font-bold text-lg">
                <TableCell>UTILIDAD BRUTA</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    datos.utilidadBruta < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.utilidadBruta)}
                </TableCell>
              </TableRow>

              {/* GASTOS */}
              <TableRow className="bg-yellow-50 dark:bg-yellow-950/30">
                <TableCell className="font-bold text-yellow-700 dark:text-yellow-500">
                  GASTOS DE OPERACIÓN
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
              {datos.gastosSubrubros.map((subrubro) => (
                <TableRow key={subrubro.codigo} className="hover:bg-muted/50">
                  <TableCell className="pl-8">{subrubro.nombre}</TableCell>
                  <TableCell className="text-right font-mono w-[150px]">
                    ({formatCurrency(subrubro.total)})
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t font-semibold">
                <TableCell className="pl-4">Total Gastos</TableCell>
                <TableCell className="text-right font-mono">
                  ({formatCurrency(datos.totalGastos)})
                </TableCell>
              </TableRow>

              {/* UTILIDAD DE OPERACIÓN */}
              <TableRow className="bg-muted font-bold text-lg">
                <TableCell>UTILIDAD DE OPERACIÓN</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    datos.utilidadOperacion < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.utilidadOperacion)}
                </TableCell>
              </TableRow>

              {/* Separador */}
              <TableRow>
                <TableCell colSpan={2} className="h-4"></TableCell>
              </TableRow>

              {/* UTILIDAD NETA */}
              <TableRow className="bg-primary/10 font-bold text-xl">
                <TableCell className="text-primary">UTILIDAD NETA</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-primary",
                    datos.utilidadNeta < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(datos.utilidadNeta)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Indicador visual */}
          <div className="mt-6 p-4 rounded-lg bg-muted text-center">
            <p className="text-sm text-muted-foreground mb-1">Resultado del período</p>
            <p
              className={cn(
                "text-2xl font-bold",
                datos.utilidadNeta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              )}
            >
              {datos.utilidadNeta >= 0 ? "UTILIDAD" : "PÉRDIDA"}: {formatCurrency(Math.abs(datos.utilidadNeta))}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
