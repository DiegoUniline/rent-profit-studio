import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaldoCuenta, formatCurrency, getRubroPrincipal } from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";

interface BalanzaComprobacionProps {
  saldos: SaldoCuenta[];
  loading?: boolean;
}

const rubroColors: Record<string, string> = {
  ACTIVO: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PASIVO: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  CAPITAL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  INGRESOS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  COSTOS: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  GASTOS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  OTROS: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export function BalanzaComprobacion({ saldos, loading }: BalanzaComprobacionProps) {
  const [nivelDetalle, setNivelDetalle] = useState<string>("todos");
  const [soloConMovimiento, setSoloConMovimiento] = useState(false);

  const saldosFiltrados = useMemo(() => {
    let resultado = [...saldos];

    // Filtrar por nivel
    if (nivelDetalle !== "todos") {
      const nivel = parseInt(nivelDetalle);
      resultado = resultado.filter((s) => s.nivel <= nivel);
    }

    // Filtrar solo cuentas con movimiento
    if (soloConMovimiento) {
      resultado = resultado.filter(
        (s) => s.debe !== 0 || s.haber !== 0 || s.saldo_inicial !== 0
      );
    }

    return resultado.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [saldos, nivelDetalle, soloConMovimiento]);

  // Calcular totales
  const totales = useMemo(() => {
    const cuentasSaldo = saldosFiltrados.filter((s) => s.clasificacion === "saldo");
    return {
      saldoInicialDeudor: cuentasSaldo
        .filter((s) => s.naturaleza === "deudora" && s.saldo_inicial > 0)
        .reduce((sum, s) => sum + s.saldo_inicial, 0),
      saldoInicialAcreedor: cuentasSaldo
        .filter((s) => s.naturaleza === "acreedora" && s.saldo_inicial > 0)
        .reduce((sum, s) => sum + s.saldo_inicial, 0),
      debe: cuentasSaldo.reduce((sum, s) => sum + s.debe, 0),
      haber: cuentasSaldo.reduce((sum, s) => sum + s.haber, 0),
      saldoFinalDeudor: cuentasSaldo
        .filter((s) => s.saldo_final > 0 && s.naturaleza === "deudora")
        .reduce((sum, s) => sum + Math.abs(s.saldo_final), 0) +
        cuentasSaldo
          .filter((s) => s.saldo_final < 0 && s.naturaleza === "acreedora")
          .reduce((sum, s) => sum + Math.abs(s.saldo_final), 0),
      saldoFinalAcreedor: cuentasSaldo
        .filter((s) => s.saldo_final > 0 && s.naturaleza === "acreedora")
        .reduce((sum, s) => sum + Math.abs(s.saldo_final), 0) +
        cuentasSaldo
          .filter((s) => s.saldo_final < 0 && s.naturaleza === "deudora")
          .reduce((sum, s) => sum + Math.abs(s.saldo_final), 0),
    };
  }, [saldosFiltrados]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="nivel">Nivel de detalle:</Label>
              <Select value={nivelDetalle} onValueChange={setNivelDetalle}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="1">Nivel 1</SelectItem>
                  <SelectItem value="2">Nivel 2</SelectItem>
                  <SelectItem value="3">Nivel 3</SelectItem>
                  <SelectItem value="4">Nivel 4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="con-movimiento"
                checked={soloConMovimiento}
                onCheckedChange={setSoloConMovimiento}
              />
              <Label htmlFor="con-movimiento">Solo con movimiento</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Balanza de Comprobación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[120px]">Código</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="w-[100px] text-center">Rubro</TableHead>
                  <TableHead className="w-[130px] text-right">Saldo Inicial</TableHead>
                  <TableHead className="w-[130px] text-right">Debe</TableHead>
                  <TableHead className="w-[130px] text-right">Haber</TableHead>
                  <TableHead className="w-[130px] text-right">Saldo Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saldosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay cuentas para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  saldosFiltrados.map((saldo) => {
                    const rubro = getRubroPrincipal(saldo.codigo);
                    const esTitulo = saldo.clasificacion === "titulo";

                    return (
                      <TableRow
                        key={saldo.cuenta_id}
                        className={cn(
                          esTitulo && "bg-muted/30 font-semibold"
                        )}
                      >
                        <TableCell
                          className="font-mono text-xs"
                          style={{ paddingLeft: `${(saldo.nivel - 1) * 16 + 16}px` }}
                        >
                          {saldo.codigo}
                        </TableCell>
                        <TableCell className={cn(esTitulo && "font-semibold")}>
                          {saldo.nombre}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={cn("text-xs", rubroColors[rubro])}>
                            {rubro}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {saldo.saldo_inicial !== 0 ? formatCurrency(saldo.saldo_inicial) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {saldo.debe !== 0 ? formatCurrency(saldo.debe) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {saldo.haber !== 0 ? formatCurrency(saldo.haber) : "-"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono text-sm font-medium",
                            saldo.saldo_final < 0 && "text-destructive"
                          )}
                        >
                          {saldo.saldo_final !== 0 ? formatCurrency(saldo.saldo_final) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted font-bold">
                  <TableCell colSpan={3}>TOTALES</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totales.saldoInicialDeudor)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totales.debe)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totales.haber)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totales.saldoFinalDeudor)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Verificación de cuadre */}
          <div className="mt-4 flex justify-end">
            <div className="text-sm">
              {totales.debe === totales.haber ? (
                <Badge variant="default" className="bg-green-600">
                  ✓ Balanza cuadrada
                </Badge>
              ) : (
                <Badge variant="destructive">
                  ✗ Descuadre: {formatCurrency(Math.abs(totales.debe - totales.haber))}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
