import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/accounting-utils";
import { aplicarFormatoTexto, importePartida, type FormatoTexto, type PartidaEditable } from "@/lib/rafa-types";
import { Trash2 } from "lucide-react";

interface CuentaOpcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  partidas: PartidaEditable[];
  cuentas: CuentaOpcion[];
  ivaIncluir: boolean;
  ivaTasa: number;
  formatoTexto?: FormatoTexto;
  onChange: (partidas: PartidaEditable[]) => void;
}

export function RafaPartidasTable({ partidas, cuentas, ivaIncluir, ivaTasa, formatoTexto = "original", onChange }: Props) {
  const actualizar = (key: string, cambios: Partial<PartidaEditable>) => {
    if (cambios.descripcion !== undefined) {
      cambios.descripcion = aplicarFormatoTexto(cambios.descripcion, formatoTexto);
    }
    onChange(partidas.map((p) => (p.key === key ? { ...p, ...cambios } : p)));
  };

  const opciones = cuentas.map((c) => ({ id: c.id, label: `${c.codigo} · ${c.nombre}` }));
  const total = partidas.reduce((s, p) => s + importePartida(p, ivaIncluir, ivaTasa), 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Partida</TableHead>
              <TableHead className="w-24">Unidad</TableHead>
              <TableHead className="w-28 text-right">Cantidad</TableHead>
              <TableHead className="w-32 text-right">P. Unitario</TableHead>
              <TableHead className="min-w-[220px]">Cuenta contable</TableHead>
              <TableHead className="w-36 text-right">Importe{ivaIncluir ? " c/IVA" : ""}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {partidas.map((p) => (
              <TableRow key={p.key}>
                <TableCell>
                  <Input
                    className="h-8"
                    value={p.descripcion}
                    onChange={(e) => actualizar(p.key, { descripcion: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input className="h-8" value={p.unidad} onChange={(e) => actualizar(p.key, { unidad: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right"
                    type="number"
                    value={p.cantidad}
                    onChange={(e) => actualizar(p.key, { cantidad: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right"
                    type="number"
                    value={p.precioUnitario}
                    onChange={(e) => actualizar(p.key, { precioUnitario: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <SearchableSelect
                    value={p.cuentaId}
                    onValueChange={(v) => actualizar(p.key, { cuentaId: v })}
                    options={opciones}
                    placeholder="Sin cuenta"
                    searchPlaceholder="Buscar cuenta..."
                    emptyMessage="Sin resultados"
                  />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(importePartida(p, ivaIncluir, ivaTasa))}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onChange(partidas.filter((x) => x.key !== p.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end gap-6 border-t pt-3 text-sm">
        <span className="text-muted-foreground">Total del presupuesto</span>
        <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
