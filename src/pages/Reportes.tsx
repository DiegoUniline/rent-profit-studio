import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  CalendarIcon,
  FileSpreadsheet,
  Scale,
  TrendingUp,
  Wallet,
  Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  CuentaContable,
  Movimiento,
  AsientoContable,
  calcularSaldosCuentas,
} from "@/lib/accounting-utils";
import { BalanzaComprobacion } from "@/components/reportes/BalanzaComprobacion";
import { BalanceGeneral } from "@/components/reportes/BalanceGeneral";
import { EstadoResultados } from "@/components/reportes/EstadoResultados";
import { FlujoEfectivo } from "@/components/reportes/FlujoEfectivo";

interface Empresa {
  id: string;
  razon_social: string;
}

export default function Reportes() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState<Date>(startOfYear(new Date()));
  const [fechaFin, setFechaFin] = useState<Date>(endOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState("balanza");

  // Datos cargados
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);

  // Cargar empresas al iniciar
  useEffect(() => {
    loadEmpresas();
  }, []);

  // Cargar datos cuando cambia empresa o fechas
  useEffect(() => {
    if (empresaId) {
      loadDatosContables();
    }
  }, [empresaId, fechaInicio, fechaFin]);

  const loadEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, razon_social")
        .eq("activa", true)
        .order("razon_social");

      if (error) throw error;
      setEmpresas(data || []);

      // Seleccionar primera empresa por defecto
      if (data && data.length > 0 && !empresaId) {
        setEmpresaId(data[0].id);
      }
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

  const loadDatosContables = async () => {
    if (!empresaId) return;

    setLoadingData(true);
    try {
      // Cargar cuentas de la empresa
      const { data: cuentasData, error: cuentasError } = await supabase
        .from("cuentas_contables")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("activa", true)
        .order("codigo");

      if (cuentasError) throw cuentasError;

      // Cargar asientos de la empresa
      const { data: asientosData, error: asientosError } = await supabase
        .from("asientos_contables")
        .select("id, fecha, tipo, estado, empresa_id")
        .eq("empresa_id", empresaId)
        .eq("estado", "aplicado")
        .lte("fecha", format(fechaFin, "yyyy-MM-dd"));

      if (asientosError) throw asientosError;

      // Cargar movimientos de esos asientos
      const asientosIds = (asientosData || []).map((a) => a.id);
      let movimientosData: any[] = [];

      if (asientosIds.length > 0) {
        const { data: movData, error: movError } = await supabase
          .from("asiento_movimientos")
          .select("*")
          .in("asiento_id", asientosIds);

        if (movError) throw movError;
        movimientosData = movData || [];
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

  const empresaSeleccionada = empresas.find((e) => e.id === empresaId);

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
              Balanza, Balance General, Estado de Resultados y Flujo de Efectivo
            </p>
          </div>
        </div>
      </div>

      {/* Filtros globales */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Empresa */}
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha Inicio */}
            <div className="space-y-2">
              <Label>Fecha Inicio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[180px] justify-start text-left font-normal",
                      !fechaInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fechaInicio
                      ? format(fechaInicio, "dd MMM yyyy", { locale: es })
                      : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaInicio}
                    onSelect={(date) => date && setFechaInicio(date)}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Fecha Fin */}
            <div className="space-y-2">
              <Label>Fecha Fin</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[180px] justify-start text-left font-normal",
                      !fechaFin && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fechaFin
                      ? format(fechaFin, "dd MMM yyyy", { locale: es })
                      : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaFin}
                    onSelect={(date) => date && setFechaFin(date)}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Atajos de período */}
            <div className="flex gap-2">
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
            </div>

            {loadingData && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Cargando...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs de reportes */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="balanza" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Balanza</span>
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span className="hidden sm:inline">Balance General</span>
          </TabsTrigger>
          <TabsTrigger value="resultados" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Estado de Resultados</span>
          </TabsTrigger>
          <TabsTrigger value="flujo" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Flujo de Efectivo</span>
          </TabsTrigger>
        </TabsList>

        {!empresaId ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Selecciona una empresa para ver los reportes
            </CardContent>
          </Card>
        ) : (
          <>
            <TabsContent value="balanza">
              <BalanzaComprobacion saldos={saldos} loading={loadingData} />
            </TabsContent>

            <TabsContent value="balance">
              <BalanceGeneral
                saldos={saldos}
                loading={loadingData}
                fechaCorte={fechaFin}
              />
            </TabsContent>

            <TabsContent value="resultados">
              <EstadoResultados
                saldos={saldos}
                loading={loadingData}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
              />
            </TabsContent>

            <TabsContent value="flujo">
              <FlujoEfectivo
                saldos={saldos}
                loading={loadingData}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
