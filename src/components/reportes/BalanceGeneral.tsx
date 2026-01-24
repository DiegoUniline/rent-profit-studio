import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SaldoCuenta,
  formatCurrency,
  getSubrubros,
  calcularTotalesPorRubro,
  agruparPorRubro,
  calcularUtilidad,
} from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";

interface BalanceGeneralProps {
  saldos: SaldoCuenta[];
  loading?: boolean;
  fechaCorte: Date;
}

export function BalanceGeneral({ saldos, loading, fechaCorte }: BalanceGeneralProps) {
  const datos = useMemo(() => {
    const grupos = agruparPorRubro(saldos);
    const totales = calcularTotalesPorRubro(grupos);
    const utilidad = calcularUtilidad(totales);

    // Obtener subrubros para cada sección
    const activoSubrubros = getSubrubros(saldos, "ACTIVO");
    const pasivoSubrubros = getSubrubros(saldos, "PASIVO");
    const capitalSubrubros = getSubrubros(saldos, "CAPITAL");

    const totalActivo = totales.ACTIVO || 0;
    const totalPasivo = totales.PASIVO || 0;
    const totalCapital = (totales.CAPITAL || 0) + utilidad;
    const totalPasivoCapital = totalPasivo + totalCapital;

    return {
      activoSubrubros,
      pasivoSubrubros,
      capitalSubrubros,
      totalActivo,
      totalPasivo,
      totalCapital,
      totalPasivoCapital,
      utilidad,
      cuadra: Math.abs(totalActivo - totalPasivoCapital) < 0.01,
    };
  }, [saldos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const RubroSection = ({
    titulo,
    subrubros,
    total,
    colorClass,
  }: {
    titulo: string;
    subrubros: ReturnType<typeof getSubrubros>;
    total: number;
    colorClass: string;
  }) => (
    <div className="space-y-2">
      <h3 className={cn("font-bold text-lg", colorClass)}>{titulo}</h3>
      <Table>
        <TableBody>
          {subrubros.map((subrubro) => (
            <TableRow key={subrubro.codigo} className="hover:bg-muted/50">
              <TableCell className="pl-4 font-medium">
                {subrubro.nombre}
              </TableCell>
              <TableCell className="text-right font-mono w-[150px]">
                {formatCurrency(subrubro.total)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/50 font-bold">
            <TableCell className="pl-4">Total {titulo}</TableCell>
            <TableCell className="text-right font-mono w-[150px]">
              {formatCurrency(total)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="text-center border-b">
          <CardTitle className="text-xl">Balance General</CardTitle>
          <p className="text-sm text-muted-foreground">
            Al {fechaCorte.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Columna Izquierda - Activo */}
            <div className="space-y-6">
              <RubroSection
                titulo="ACTIVO"
                subrubros={datos.activoSubrubros}
                total={datos.totalActivo}
                colorClass="text-blue-600 dark:text-blue-400"
              />
            </div>

            {/* Columna Derecha - Pasivo y Capital */}
            <div className="space-y-6">
              <RubroSection
                titulo="PASIVO"
                subrubros={datos.pasivoSubrubros}
                total={datos.totalPasivo}
                colorClass="text-orange-600 dark:text-orange-400"
              />

              <div className="space-y-2">
                <h3 className="font-bold text-lg text-purple-600 dark:text-purple-400">
                  CAPITAL CONTABLE
                </h3>
                <Table>
                  <TableBody>
                    {datos.capitalSubrubros.map((subrubro) => (
                      <TableRow key={subrubro.codigo} className="hover:bg-muted/50">
                        <TableCell className="pl-4 font-medium">
                          {subrubro.nombre}
                        </TableCell>
                        <TableCell className="text-right font-mono w-[150px]">
                          {formatCurrency(subrubro.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="hover:bg-muted/50">
                      <TableCell className="pl-4 font-medium italic">
                        Resultado del Ejercicio
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono w-[150px]",
                          datos.utilidad < 0 && "text-destructive"
                        )}
                      >
                        {formatCurrency(datos.utilidad)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="pl-4">Total Capital Contable</TableCell>
                      <TableCell className="text-right font-mono w-[150px]">
                        {formatCurrency(datos.totalCapital)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Total Pasivo + Capital */}
              <div className="border-t-2 pt-4">
                <div className="flex justify-between items-center font-bold text-lg">
                  <span>PASIVO + CAPITAL</span>
                  <span className="font-mono">{formatCurrency(datos.totalPasivoCapital)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Verificación de cuadre */}
          <div className="mt-8 pt-4 border-t flex justify-center">
            {datos.cuadra ? (
              <Badge variant="default" className="bg-green-600 text-base px-4 py-2">
                ✓ Balance cuadrado (Activo = Pasivo + Capital)
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-base px-4 py-2">
                ✗ Descuadre: {formatCurrency(Math.abs(datos.totalActivo - datos.totalPasivoCapital))}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
