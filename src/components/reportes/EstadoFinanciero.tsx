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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { FileSpreadsheet, FileText, Search, EyeOff, Eye, ChevronRight, ChevronDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface EstadoFinancieroProps {
  saldos: SaldoCuenta[];
  loading?: boolean;
  empresaNombre: string;
  fechaCorte: Date;
}

type TipoReporte = "balance" | "resultados" | "balanza";

const tipoReporteLabels: Record<TipoReporte, string> = {
  balance: "Balance General",
  resultados: "Estado de Resultados",
  balanza: "Balanza de Comprobación",
};

export function EstadoFinanciero({
  saldos,
  loading,
  empresaNombre,
  fechaCorte,
}: EstadoFinancieroProps) {
  const [tipoReporte, setTipoReporte] = useState<TipoReporte>("balance");
  const [nivelDetalle, setNivelDetalle] = useState<string>("1");
  const [ocultarCeros, setOcultarCeros] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  // Filtrar saldos según tipo de reporte
  const saldosFiltradosPorTipo = useMemo(() => {
    switch (tipoReporte) {
      case "balance":
        // Activo (1xx), Pasivo (2xx), Capital (3xx)
        return saldos.filter((s) => ["1", "2", "3"].includes(s.codigo.charAt(0)));
      case "resultados":
        // Ingresos (4xx), Costos (5xx), Gastos (6xx)
        return saldos.filter((s) => ["4", "5", "6"].includes(s.codigo.charAt(0)));
      case "balanza":
        return saldos;
      default:
        return saldos;
    }
  }, [saldos, tipoReporte]);

  // Aplicar filtros de nivel, búsqueda y ceros
  const saldosFiltrados = useMemo(() => {
    let resultado = [...saldosFiltradosPorTipo];
    const nivel = parseInt(nivelDetalle);

    // Filtrar por nivel máximo
    resultado = resultado.filter((s) => s.nivel <= nivel);

    // Filtrar cuentas con cero si está activado
    if (ocultarCeros) {
      resultado = resultado.filter(
        (s) =>
          s.saldo_final !== 0 ||
          s.debe !== 0 ||
          s.haber !== 0 ||
          s.clasificacion === "titulo"
      );
    }

    // Filtrar por búsqueda
    if (busqueda.trim()) {
      const term = busqueda.toLowerCase();
      resultado = resultado.filter(
        (s) =>
          s.codigo.toLowerCase().includes(term) ||
          s.nombre.toLowerCase().includes(term)
      );
    }

    return resultado.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [saldosFiltradosPorTipo, nivelDetalle, ocultarCeros, busqueda]);

  // Calcular totales
  const totales = useMemo(() => {
    const cuentasSaldo = saldosFiltrados.filter((s) => s.clasificacion === "saldo");
    
    const deudoras = cuentasSaldo.filter((s) => s.naturaleza === "deudora");
    const acreedoras = cuentasSaldo.filter((s) => s.naturaleza === "acreedora");

    return {
      deudora: deudoras.reduce((sum, s) => sum + Math.max(0, s.saldo_final), 0) +
               acreedoras.reduce((sum, s) => sum + Math.max(0, -s.saldo_final), 0),
      acreedora: acreedoras.reduce((sum, s) => sum + Math.max(0, s.saldo_final), 0) +
                 deudoras.reduce((sum, s) => sum + Math.max(0, -s.saldo_final), 0),
    };
  }, [saldosFiltrados]);

  // Toggle expand/collapse para jerarquía
  const toggleExpand = (codigo: string) => {
    const newExpanded = new Set(expandedCodes);
    if (newExpanded.has(codigo)) {
      newExpanded.delete(codigo);
    } else {
      newExpanded.add(codigo);
    }
    setExpandedCodes(newExpanded);
  };

  // Verificar si una cuenta tiene hijos visibles
  const hasChildren = (codigo: string) => {
    return saldosFiltradosPorTipo.some(
      (s) => s.codigo.startsWith(codigo + "-") && s.nivel > parseInt(nivelDetalle) === false
    );
  };

  // Exportar a PDF
  const exportarPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Título
    doc.setFontSize(16);
    doc.text(tipoReporteLabels[tipoReporte], pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(11);
    doc.text(empresaNombre, pageWidth / 2, 28, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(
      `Al ${fechaCorte.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`,
      pageWidth / 2,
      35,
      { align: "center" }
    );

    // Tabla
    const tableData = saldosFiltrados.map((s) => {
      const indent = "  ".repeat(s.nivel - 1);
      const deudora = s.naturaleza === "deudora" && s.saldo_final !== 0
        ? formatCurrency(Math.abs(s.saldo_final))
        : "";
      const acreedora = s.naturaleza === "acreedora" && s.saldo_final !== 0
        ? formatCurrency(Math.abs(s.saldo_final))
        : "";

      return [s.codigo, indent + s.nombre, deudora, acreedora];
    });

    // Agregar totales
    tableData.push([
      "Totales:",
      "",
      formatCurrency(totales.deudora),
      formatCurrency(totales.acreedora),
    ]);

    autoTable(doc, {
      startY: 42,
      head: [["Código", "Nombre", "Deudora", "Acreedora"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" },
      },
      didParseCell: (data) => {
        // Negrita para totales
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
    });

    doc.save(`${tipoReporteLabels[tipoReporte]}_${empresaNombre}.pdf`);
  };

  // Exportar a Excel
  const exportarExcel = () => {
    const data = saldosFiltrados.map((s) => ({
      Código: s.codigo,
      Nombre: s.nombre,
      Nivel: s.nivel,
      Naturaleza: s.naturaleza,
      Deudora: s.naturaleza === "deudora" ? s.saldo_final : 0,
      Acreedora: s.naturaleza === "acreedora" ? s.saldo_final : 0,
    }));

    // Agregar totales (como objeto genérico para evitar tipo estricto)
    data.push({
      Código: "TOTALES",
      Nombre: "",
      Nivel: 0,
      Naturaleza: "-" as any,
      Deudora: totales.deudora,
      Acreedora: totales.acreedora,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipoReporteLabels[tipoReporte]);
    XLSX.writeFile(wb, `${tipoReporteLabels[tipoReporte]}_${empresaNombre}.xlsx`);
  };

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
          <div className="flex flex-wrap items-end gap-4">
            {/* Tipo de Reporte */}
            <div className="space-y-2">
              <Label>Estado Financiero</Label>
              <Select
                value={tipoReporte}
                onValueChange={(v) => setTipoReporte(v as TipoReporte)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance">Balance General</SelectItem>
                  <SelectItem value="resultados">Estado de Resultados</SelectItem>
                  <SelectItem value="balanza">Balanza de Comprobación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Nivel */}
            <div className="space-y-2">
              <Label>Nivel</Label>
              <Select value={nivelDetalle} onValueChange={setNivelDetalle}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Nivel 1</SelectItem>
                  <SelectItem value="2">Nivel 2</SelectItem>
                  <SelectItem value="3">Nivel 3</SelectItem>
                  <SelectItem value="4">Nivel 4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Búsqueda */}
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código, nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2">
              <Button
                variant={ocultarCeros ? "default" : "outline"}
                onClick={() => setOcultarCeros(!ocultarCeros)}
                className="gap-2"
              >
                {ocultarCeros ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {ocultarCeros ? "Mostrando sin ceros" : "Ocultar cuentas en cero"}
              </Button>
              <Button variant="default" onClick={exportarPDF} className="gap-2">
                <FileText className="h-4 w-4" />
                Exportar a PDF
              </Button>
              <Button variant="default" onClick={exportarExcel} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Exportar a Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="text-center border-b pb-4">
          <CardTitle className="text-xl">{tipoReporteLabels[tipoReporte]}</CardTitle>
          <p className="text-sm text-muted-foreground">{empresaNombre}</p>
          <p className="text-xs text-muted-foreground">
            Al{" "}
            {fechaCorte.toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[180px]">Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-[150px] text-right">Deudora</TableHead>
                  <TableHead className="w-[150px] text-right">Acreedora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saldosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No hay cuentas para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  saldosFiltrados.map((saldo) => {
                    const esTitulo = saldo.clasificacion === "titulo";
                    const tieneHijos = hasChildren(saldo.codigo);
                    const estaExpandido = expandedCodes.has(saldo.codigo);

                    // Calcular valores para mostrar
                    const valorDeudora =
                      saldo.naturaleza === "deudora" && saldo.saldo_final > 0
                        ? saldo.saldo_final
                        : saldo.naturaleza === "acreedora" && saldo.saldo_final < 0
                        ? Math.abs(saldo.saldo_final)
                        : 0;

                    const valorAcreedora =
                      saldo.naturaleza === "acreedora" && saldo.saldo_final > 0
                        ? saldo.saldo_final
                        : saldo.naturaleza === "deudora" && saldo.saldo_final < 0
                        ? Math.abs(saldo.saldo_final)
                        : 0;

                    return (
                      <TableRow
                        key={saldo.cuenta_id}
                        className={cn(
                          esTitulo && "bg-muted/30 font-semibold",
                          saldo.nivel === 1 && "bg-muted/50"
                        )}
                      >
                        <TableCell className="font-mono text-sm">
                          <div
                            className="flex items-center"
                            style={{ paddingLeft: `${(saldo.nivel - 1) * 20}px` }}
                          >
                            {tieneHijos && (
                              <button
                                onClick={() => toggleExpand(saldo.codigo)}
                                className="mr-2 p-0.5 hover:bg-muted rounded"
                              >
                                {estaExpandido ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {saldo.codigo}
                          </div>
                        </TableCell>
                        <TableCell className={cn(esTitulo && "font-semibold")}>
                          {saldo.nombre}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {valorDeudora !== 0 ? formatCurrency(valorDeudora) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {valorAcreedora !== 0 ? formatCurrency(valorAcreedora) : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted font-bold text-base">
                  <TableCell colSpan={2}>
                    Totales {tipoReporte === "balance" ? "BG" : tipoReporte === "resultados" ? "ER" : "BC"}:
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totales.deudora)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totales.acreedora)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Cuadre */}
          <div className="mt-4 flex justify-end">
            {Math.abs(totales.deudora - totales.acreedora) < 0.01 ? (
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                ✓ Cuadrado
              </span>
            ) : (
              <span className="text-sm text-destructive font-medium">
                ✗ Diferencia: {formatCurrency(Math.abs(totales.deudora - totales.acreedora))}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
