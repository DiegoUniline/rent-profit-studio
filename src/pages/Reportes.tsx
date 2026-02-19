import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FilterSelect } from "@/components/ui/filter-select";
import { DateInput } from "@/components/ui/date-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { BarChart3, Loader2, Building2, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  CuentaContable,
  Movimiento,
  AsientoContable,
  calcularSaldosCuentas,
} from "@/lib/accounting-utils";
import { EstadoFinanciero } from "@/components/reportes/EstadoFinanciero";
import { FlujoEfectivoPresupuesto } from "@/components/reportes/FlujoEfectivoPresupuesto";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Empresa {
  id: string;
  razon_social: string;
}

interface CentroNegocio {
  id: string;
  codigo: string;
  nombre: string;
  empresa_id: string;
}

export default function Reportes() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centrosNegocio, setCentrosNegocio] = useState<CentroNegocio[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("todas");
  const [centrosSeleccionados, setCentrosSeleccionados] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState<Date>(startOfYear(new Date()));
  const [fechaFin, setFechaFin] = useState<Date>(endOfMonth(new Date()));
  const [centrosPopoverOpen, setCentrosPopoverOpen] = useState(false);
  const [tabActiva, setTabActiva] = useState<string>("financieros");

  // Datos cargados
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [presupuestos, setPresupuestos] = useState<any[]>([]);
  const [flujosProgramados, setFlujosProgramados] = useState<any[]>([]);

  // Cargar empresas al iniciar
  useEffect(() => {
    loadEmpresas();
  }, []);

  // Cargar centros de negocio cuando cambia empresa
  useEffect(() => {
    loadCentrosNegocio();
  }, [empresaId, empresas]);

  // Cargar datos cuando cambian los filtros
  useEffect(() => {
    loadDatosContables();
    loadPresupuestos();
    loadFlujosProgramados();
  }, [empresaId, centrosSeleccionados, fechaInicio, fechaFin, empresas]);

  const loadEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, razon_social")
        .eq("activa", true)
        .order("razon_social");

      if (error) throw error;
      setEmpresas(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar las empresas",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCentrosNegocio = async () => {
    try {
      let query = supabase
        .from("centros_negocio")
        .select("id, codigo, nombre, empresa_id")
        .eq("activo", true)
        .order("codigo");

      if (empresaId !== "todas") {
        query = query.eq("empresa_id", empresaId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCentrosNegocio(data || []);
      // Reset selection when empresa changes
      setCentrosSeleccionados([]);
    } catch (error: any) {
      console.error("Error loading centros:", error);
    }
  };

  const loadDatosContables = async () => {
    if (empresas.length === 0) return;

    setLoadingData(true);
    try {
      // Determinar IDs de empresas a cargar
      const empresaIds = empresaId === "todas" 
        ? empresas.map(e => e.id) 
        : [empresaId];

      // Cargar cuentas de las empresas seleccionadas
      let cuentasQuery = supabase
        .from("cuentas_contables")
        .select("*")
        .eq("activa", true)
        .order("codigo");

      if (empresaId !== "todas") {
        cuentasQuery = cuentasQuery.eq("empresa_id", empresaId);
      } else {
        cuentasQuery = cuentasQuery.in("empresa_id", empresaIds);
      }

      const { data: cuentasData, error: cuentasError } = await cuentasQuery;
      if (cuentasError) throw cuentasError;

      // Cargar asientos aplicados
      let asientosQuery = supabase
        .from("asientos_contables")
        .select("id, fecha, tipo, estado, empresa_id, centro_negocio_id")
        .eq("estado", "aplicado")
        .lte("fecha", format(fechaFin, "yyyy-MM-dd"));

      if (empresaId !== "todas") {
        asientosQuery = asientosQuery.eq("empresa_id", empresaId);
      } else {
        asientosQuery = asientosQuery.in("empresa_id", empresaIds);
      }

      // Filtrar por centros de negocio si hay seleccionados
      if (centrosSeleccionados.length > 0) {
        asientosQuery = asientosQuery.in("centro_negocio_id", centrosSeleccionados);
      }

      const { data: asientosData, error: asientosError } = await asientosQuery;
      if (asientosError) throw asientosError;

      // Cargar movimientos de esos asientos
      const asientosIds = (asientosData || []).map((a) => a.id);
      let movimientosData: any[] = [];

      if (asientosIds.length > 0) {
        // Paginate to get ALL movements (bypass 1000-row limit)
        const PAGE_SIZE = 1000;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data: batch, error: movError } = await supabase
            .from("asiento_movimientos")
            .select("*")
            .in("asiento_id", asientosIds)
            .range(from, from + PAGE_SIZE - 1);

          if (movError) throw movError;
          if (batch && batch.length > 0) {
            movimientosData = movimientosData.concat(batch);
            hasMore = batch.length === PAGE_SIZE;
            from += PAGE_SIZE;
          } else {
            hasMore = false;
          }
        }
      }

      setCuentas(cuentasData as CuentaContable[]);
      setAsientos(asientosData as AsientoContable[]);
      setMovimientos(movimientosData as Movimiento[]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los datos contables",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const loadPresupuestos = async () => {
    if (empresas.length === 0) return;

    try {
      const empresaIds = empresaId === "todas" 
        ? empresas.map(e => e.id) 
        : [empresaId];

      let query = supabase
        .from("presupuestos")
        .select(`
          id,
          partida,
          cantidad,
          precio_unitario,
          fecha_inicio,
          fecha_fin,
          frecuencia,
          orden,
          centro_negocio_id,
          cuentas_contables:cuenta_id (codigo, nombre),
          terceros:tercero_id (razon_social),
          centros_negocio:centro_negocio_id (codigo, nombre)
        `)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (empresaId !== "todas") {
        query = query.eq("empresa_id", empresaId);
      } else {
        query = query.in("empresa_id", empresaIds);
      }

      // Filtrar por centros de negocio si hay seleccionados
      if (centrosSeleccionados.length > 0) {
        query = query.in("centro_negocio_id", centrosSeleccionados);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transform data to match component interface
      const presupuestosTransformados = (data || []).map((p: any) => ({
        id: p.id,
        partida: p.partida,
        cantidad: p.cantidad,
        precio_unitario: p.precio_unitario,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
        frecuencia: p.frecuencia,
        orden: p.orden,
        cuenta: p.cuentas_contables,
        tercero: p.terceros,
        centro_negocio: p.centros_negocio,
      }));

      setPresupuestos(presupuestosTransformados);
    } catch (error: any) {
      console.error("Error loading presupuestos:", error);
    }
  };

  const loadFlujosProgramados = async () => {
    if (empresas.length === 0) return;

    try {
      const empresaIds = empresaId === "todas"
        ? empresas.map(e => e.id)
        : [empresaId];

      // Get presupuesto IDs for the selected empresas
      let presQuery = supabase
        .from("presupuestos")
        .select("id")
        .eq("activo", true);

      if (empresaId !== "todas") {
        presQuery = presQuery.eq("empresa_id", empresaId);
      } else {
        presQuery = presQuery.in("empresa_id", empresaIds);
      }

      if (centrosSeleccionados.length > 0) {
        presQuery = presQuery.in("centro_negocio_id", centrosSeleccionados);
      }

      const { data: presIds, error: presError } = await presQuery;
      if (presError) throw presError;

      const ids = (presIds || []).map((p: any) => p.id);
      if (ids.length === 0) {
        setFlujosProgramados([]);
        return;
      }

      // Paginate flujos_programados
      let allFlujos: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from("flujos_programados")
          .select("*")
          .in("presupuesto_id", ids)
          .order("fecha", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (batch && batch.length > 0) {
          allFlujos = allFlujos.concat(batch);
          hasMore = batch.length === PAGE_SIZE;
          from += PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      setFlujosProgramados(allFlujos);
    } catch (error: any) {
      console.error("Error loading flujos programados:", error);
    }
  };

  // Calcular saldos
  const saldos = useMemo(() => {
    if (!cuentas.length) return [];
    return calcularSaldosCuentas(
      cuentas,
      movimientos,
      asientos,
      fechaInicio,
      fechaFin
    );
  }, [cuentas, movimientos, asientos, fechaInicio, fechaFin]);

  const empresaNombre = useMemo(() => {
    if (empresaId === "todas") return "Todas las Empresas";
    const empresa = empresas.find((e) => e.id === empresaId);
    return empresa?.razon_social || "";
  }, [empresaId, empresas]);

  const centrosLabel = useMemo(() => {
    if (centrosSeleccionados.length === 0) return "Todos los Centros";
    if (centrosSeleccionados.length === 1) {
      const centro = centrosNegocio.find(c => c.id === centrosSeleccionados[0]);
      return centro ? `${centro.codigo} - ${centro.nombre}` : "1 seleccionado";
    }
    return `${centrosSeleccionados.length} centros seleccionados`;
  }, [centrosSeleccionados, centrosNegocio]);

  const toggleCentro = (centroId: string) => {
    setCentrosSeleccionados(prev => {
      if (prev.includes(centroId)) {
        return prev.filter(id => id !== centroId);
      }
      return [...prev, centroId];
    });
  };

  const selectAllCentros = () => {
    setCentrosSeleccionados(centrosNegocio.map(c => c.id));
  };

  const clearCentros = () => {
    setCentrosSeleccionados([]);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Reportes Financieros</h1>
            <p className="text-muted-foreground">
              Estados Financieros y Flujo de Efectivo Presupuestal
            </p>
          </div>
        </div>
      </div>

      {/* Filtros globales */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Empresa */}
            <div className="space-y-2">
              <Label>Empresa</Label>
              <FilterSelect
                value={empresaId}
                onValueChange={setEmpresaId}
                options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
                placeholder="Seleccionar empresa"
                searchPlaceholder="Buscar empresa..."
                allOption={{ value: "todas", label: "Todas las Empresas" }}
                className="w-full"
              />
            </div>

            {/* Centro de Negocios - Multi-select */}
            <div className="space-y-2">
              <Label>Centro de Negocios</Label>
              <Popover open={centrosPopoverOpen} onOpenChange={setCentrosPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{centrosLabel}</span>
                    </div>
                    {centrosSeleccionados.length > 0 && (
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {centrosSeleccionados.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar centro..." />
                    <div className="flex items-center gap-2 p-2 border-b">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllCentros}
                        className="flex-1"
                      >
                        Seleccionar todos
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearCentros}
                        className="flex-1"
                      >
                        Limpiar
                      </Button>
                    </div>
                    <CommandList>
                      <CommandEmpty>No se encontraron centros</CommandEmpty>
                      <CommandGroup>
                        {centrosNegocio.map((centro) => {
                          const isSelected = centrosSeleccionados.includes(centro.id);
                          return (
                            <CommandItem
                              key={centro.id}
                              value={`${centro.codigo} ${centro.nombre}`}
                              onSelect={() => toggleCentro(centro.id)}
                              className="flex items-center gap-2"
                            >
                              <Checkbox checked={isSelected} />
                              <span className="font-mono text-xs text-muted-foreground">
                                {centro.codigo}
                              </span>
                              <span className="truncate">{centro.nombre}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Fecha Inicio */}
            <div className="space-y-2">
              <Label>Fecha Inicio</Label>
              <DateInput
                value={fechaInicio}
                onChange={(date) => date && setFechaInicio(date)}
                placeholder="Inicio"
              />
            </div>

            {/* Fecha Fin */}
            <div className="space-y-2">
              <Label>Fecha Fin</Label>
              <DateInput
                value={fechaFin}
                onChange={(date) => date && setFechaFin(date)}
                placeholder="Fin"
              />
            </div>
          </div>

          {/* Atajos de período */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setFechaInicio(startOfMonth(now));
                setFechaFin(endOfMonth(now));
              }}
            >
              Este mes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setFechaInicio(startOfYear(now));
                setFechaFin(now);
              }}
            >
              Este año
            </Button>

            {loadingData && (
              <div className="flex items-center gap-2 text-muted-foreground ml-auto">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Cargando...</span>
              </div>
            )}
          </div>

          {/* Badges de centros seleccionados */}
          {centrosSeleccionados.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Centros:</span>
              {centrosSeleccionados.map((id) => {
                const centro = centrosNegocio.find(c => c.id === id);
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {centro?.codigo} - {centro?.nombre}
                    <button
                      onClick={() => toggleCentro(id)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCentros}
                className="h-6 text-xs"
              >
                Limpiar todos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs de reportes */}
      <Tabs value={tabActiva} onValueChange={setTabActiva} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="financieros">Estados Financieros</TabsTrigger>
          <TabsTrigger value="flujo">Flujo de Efectivo (Presupuestos)</TabsTrigger>
        </TabsList>
        
        <TabsContent value="financieros" className="mt-4">
          <EstadoFinanciero
            saldos={saldos}
            loading={loadingData}
            empresaNombre={empresaNombre}
            fechaCorte={fechaFin}
          />
        </TabsContent>
        
        <TabsContent value="flujo" className="mt-4">
          <FlujoEfectivoPresupuesto
            presupuestos={presupuestos}
            flujosProgramados={flujosProgramados}
            movimientos={movimientos}
            asientos={asientos}
            loading={loadingData}
            empresaNombre={empresaNombre}
            onOrderUpdate={loadPresupuestos}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
