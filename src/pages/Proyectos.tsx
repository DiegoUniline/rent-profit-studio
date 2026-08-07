import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterSelect } from "@/components/ui/filter-select";
import { formatCurrency } from "@/lib/accounting-utils";
import { calcularEjercidoPorPartida, agregarFinanciero } from "@/lib/project-utils";
import { FolderKanban, Search } from "lucide-react";

interface ProyectoRow {
  id: string;
  nombre: string;
  centro_negocio_id: string;
  empresas: { razon_social: string } | null;
  centros_negocio: { codigo: string; nombre: string } | null;
}

interface PartidaLite {
  id: string;
  centro_negocio_id: string;
  cantidad: number;
  precio_unitario: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  responsable: { razon_social: string } | null;
}

export default function Proyectos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [proyectos, setProyectos] = useState<ProyectoRow[]>([]);
  const [partidas, setPartidas] = useState<PartidaLite[]>([]);
  const [ejercidoMap, setEjercidoMap] = useState<Map<string, number>>(new Map());

  const [search, setSearch] = useState(() => localStorage.getItem("proyectos_filter_search") || "");
  const [filterEmpresa, setFilterEmpresa] = useState<string>(() => localStorage.getItem("proyectos_filter_empresa") || "all");
  const [empresas, setEmpresas] = useState<{ id: string; razon_social: string }[]>([]);

  useEffect(() => {
    if (search) localStorage.setItem("proyectos_filter_search", search);
    else localStorage.removeItem("proyectos_filter_search");
  }, [search]);

  useEffect(() => {
    if (filterEmpresa !== "all") localStorage.setItem("proyectos_filter_empresa", filterEmpresa);
    else localStorage.removeItem("proyectos_filter_empresa");
  }, [filterEmpresa]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: empresasData } = await supabase.from("empresas").select("id, razon_social").eq("activa", true);
      setEmpresas(empresasData || []);

      // RLS ya restringe esta consulta a los Projects autorizados para el usuario actual.
      const { data: proyectosData, error: proyectosError } = await supabase
        .from("proyectos")
        .select("id, nombre, centro_negocio_id, empresas(razon_social), centros_negocio(codigo, nombre)")
        .eq("activo", true)
        .order("nombre");
      if (proyectosError) throw proyectosError;
      setProyectos((proyectosData || []) as any);

      const centroIds = (proyectosData || []).map((p: any) => p.centro_negocio_id);
      if (centroIds.length === 0) {
        setPartidas([]);
        setEjercidoMap(new Map());
        return;
      }

      const { data: partidasData, error: partidasError } = await supabase
        .from("presupuestos")
        .select("id, centro_negocio_id, cantidad, precio_unitario, fecha_inicio, fecha_fin, responsable:terceros!presupuestos_responsable_tercero_id_fkey(razon_social)")
        .eq("es_project", true)
        .eq("activo", true)
        .in("centro_negocio_id", centroIds);
      if (partidasError) throw partidasError;
      setPartidas((partidasData || []) as any);

      const partidaIds = (partidasData || []).map((p: any) => p.id);
      if (partidaIds.length > 0) {
        const { data: movData } = await supabase
          .from("asiento_movimientos")
          .select("id, asiento_id, cuenta_id, debe, haber, partida, orden, presupuesto_id, asientos_contables:asiento_id(id, fecha, estado, tipo, empresa_id)")
          .in("presupuesto_id", partidaIds);

        const movs: any[] = [];
        const asientosMap = new Map();
        (movData || []).forEach((m: any) => {
          movs.push(m);
          if (m.asientos_contables) asientosMap.set(m.asientos_contables.id, m.asientos_contables);
        });
        setEjercidoMap(calcularEjercidoPorPartida(movs, [...asientosMap.values()]));
      } else {
        setEjercidoMap(new Map());
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filas = useMemo(() => {
    return proyectos.map((proy) => {
      const partidasProy = partidas.filter((p) => p.centro_negocio_id === proy.centro_negocio_id);
      const agregado = agregarFinanciero(
        partidasProy.map((p) => ({
          presupuesto: p.cantidad * p.precio_unitario,
          proyectado: 0,
          ejercido: ejercidoMap.get(p.id) || 0,
        }))
      );
      const fechas = partidasProy.map((p) => p.fecha_inicio).filter(Boolean) as string[];
      const fechasFin = partidasProy.map((p) => p.fecha_fin).filter(Boolean) as string[];
      return {
        proyecto: proy,
        inicio: fechas.length > 0 ? fechas.sort()[0] : null,
        fin: fechasFin.length > 0 ? fechasFin.sort().slice(-1)[0] : null,
        ...agregado,
      };
    });
  }, [proyectos, partidas, ejercidoMap]);

  const filasFiltradas = filas.filter((f) => {
    const matchesSearch =
      f.proyecto.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (f.proyecto.centros_negocio?.codigo || "").toLowerCase().includes(search.toLowerCase());
    const matchesEmpresa = filterEmpresa === "all" || f.proyecto.empresas?.razon_social === empresas.find((e) => e.id === filterEmpresa)?.razon_social;
    return matchesSearch && (filterEmpresa === "all" || matchesEmpresa);
  });

  const pagination = useTablePagination(filasFiltradas);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Proyectos</h1>
        <p className="text-muted-foreground">Seguimiento financiero y operativo por Centro de Negocio</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            Lista de Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o centro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <FilterSelect
              value={filterEmpresa}
              onValueChange={setFilterEmpresa}
              options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
              placeholder="Filtrar por empresa"
              searchPlaceholder="Buscar empresa..."
              allOption={{ value: "all", label: "Todas las empresas" }}
              className="w-full sm:w-[250px]"
            />
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : filasFiltradas.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">No hay Projects generados todavía. Ve a Centro de Negocios y usa "Generar Project".</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Centro de Negocio</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead className="text-right">Presupuesto</TableHead>
                    <TableHead className="text-right">Ejercido</TableHead>
                    <TableHead className="text-right">Avance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((f) => (
                    <TableRow
                      key={f.proyecto.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/proyectos/${f.proyecto.id}`)}
                    >
                      <TableCell className="font-medium">{f.proyecto.nombre}</TableCell>
                      <TableCell>
                        {f.proyecto.centros_negocio?.codigo} {f.proyecto.centros_negocio?.nombre}
                      </TableCell>
                      <TableCell>{f.inicio || "-"}</TableCell>
                      <TableCell>{f.fin || "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(f.presupuesto)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(f.ejercido)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={f.avance > 100 ? "destructive" : "secondary"}>{f.avance.toFixed(0)}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                from={pagination.from}
                to={pagination.to}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setCurrentPage}
                onPageSizeChange={pagination.setPageSize}
                pageSizeOptions={pagination.PAGE_SIZE_OPTIONS}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
