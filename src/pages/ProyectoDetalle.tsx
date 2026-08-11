import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Progress } from "@/components/ui/progress";
import {
  FlujoEfectivoPresupuesto,
  SeguimientoPartida,
} from "@/components/reportes/FlujoEfectivoPresupuesto";
import { ProyectoPartidaSeguimientoDialog, PartidaSeguimiento } from "@/components/dialogs/ProyectoPartidaSeguimientoDialog";
import { ProyectoEditDialog } from "@/components/dialogs/ProyectoEditDialog";
import { ProjectSummaryTable, FilaResumenPartida } from "@/components/proyectos/ProjectSummaryTable";
import { ProjectGantt } from "@/components/proyectos/ProjectGantt";
import { ProyectoTareas } from "@/components/proyectos/ProyectoTareas";
import { formatCurrency, Movimiento, AsientoContable } from "@/lib/accounting-utils";
import {
  calcularEjercidoPorPartida,
  calcularProyectadoPorPartida,
  calcularAvance,
  calcularDisponible,
  programacionPendienteDeAjustar,
} from "@/lib/project-utils";
import {
  ArrowLeft,
  Users,
  X,
  FolderKanban,
  Briefcase,
  Pencil,
  Landmark,
  CalendarClock,
  CheckCircle2,
  Wallet,
  Percent,
} from "lucide-react";

interface PartidaRow {
  id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  es_project: boolean;
  responsable_tercero_id: string | null;
  cuenta: { codigo: string; nombre: string } | null;
  responsable: { razon_social: string } | null;
}

interface ProyectoInfo {
  id: string;
  empresa_id: string;
  centro_negocio_id: string;
  nombre: string;
  activo: boolean;
  empresas: { razon_social: string } | null;
  centros_negocio: { codigo: string; nombre: string } | null;
}

interface AccesoUsuario {
  id: string;
  user_id: string;
  nombre: string;
}

export default function ProyectoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { toast } = useToast();

  const canEdit = role === "admin" || role === "contador";
  const isAdmin = role === "admin";
  const isArquitecto = role === "arquitecto";
  const readOnly = role === "usuario";
  // El arquitecto puede editar fecha_inicio/fecha_fin de las partidas, pero no
  // los montos ni la programación financiera (flujos_programados).
  const canEditFechas = canEdit || isArquitecto;

  const [loading, setLoading] = useState(true);
  const [proyecto, setProyecto] = useState<ProyectoInfo | null>(null);
  const [partidas, setPartidas] = useState<PartidaRow[]>([]);
  const [flujos, setFlujos] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);

  const [filtroResponsable, setFiltroResponsable] = useState<string>("todos");
  const [dialogPartida, setDialogPartida] = useState<PartidaSeguimiento | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [accesos, setAccesos] = useState<AccesoUsuario[]>([]);
  const [usuariosDisponibles, setUsuariosDisponibles] = useState<{ id: string; label: string }[]>([]);
  const [nuevoAccesoId, setNuevoAccesoId] = useState("");

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  const fetchAll = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: proyectoData, error: proyectoError } = await supabase
        .from("proyectos")
        .select("id, empresa_id, centro_negocio_id, nombre, activo, empresas(razon_social), centros_negocio(codigo, nombre)")
        .eq("id", id)
        .single();
      if (proyectoError) throw proyectoError;

      if (readOnly) {
        const { data: acceso } = await supabase
          .from("proyecto_usuarios")
          .select("id")
          .eq("proyecto_id", id)
          .eq("user_id", user?.id)
          .maybeSingle();
        if (!acceso) {
          toast({ title: "No autorizado", description: "No tienes acceso a este Project", variant: "destructive" });
          navigate("/proyectos");
          return;
        }
      }

      setProyecto(proyectoData as any);

      const { data: partidasData, error: partidasError } = await supabase
        .from("presupuestos")
        .select(`
          id, partida, cantidad, precio_unitario, fecha_inicio, fecha_fin, es_project, responsable_tercero_id,
          cuenta:cuenta_id (codigo, nombre),
          responsable:terceros!presupuestos_responsable_tercero_id_fkey (razon_social)
        `)
        .eq("centro_negocio_id", proyectoData.centro_negocio_id)
        .eq("activo", true)
        .order("partida");
      if (partidasError) throw partidasError;
      setPartidas((partidasData || []) as any);

      const idsProject = (partidasData || []).filter((p: any) => p.es_project).map((p: any) => p.id);

      if (idsProject.length > 0) {
        const [{ data: flujosData }, { data: movData }] = await Promise.all([
          supabase.from("flujos_programados").select("*").in("presupuesto_id", idsProject),
          supabase
            .from("asiento_movimientos")
            .select("*, asientos_contables:asiento_id(id, fecha, estado, tipo, empresa_id)")
            .in("presupuesto_id", idsProject),
        ]);

        setFlujos(flujosData || []);

        const movs: Movimiento[] = [];
        const asientosMap = new Map<string, AsientoContable>();
        (movData || []).forEach((m: any) => {
          movs.push({
            id: m.id,
            asiento_id: m.asiento_id,
            cuenta_id: m.cuenta_id,
            debe: m.debe,
            haber: m.haber,
            partida: m.partida,
            orden: m.orden,
            presupuesto_id: m.presupuesto_id,
          } as any);
          if (m.asientos_contables) {
            asientosMap.set(m.asientos_contables.id, m.asientos_contables);
          }
        });
        setMovimientos(movs);
        setAsientos([...asientosMap.values()]);
      } else {
        setFlujos([]);
        setMovimientos([]);
        setAsientos([]);
      }

      if (isAdmin) await fetchAccesos();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchAccesos = async () => {
    if (!id) return;
    const { data: accesoRows } = await supabase
      .from("proyecto_usuarios")
      .select("id, user_id")
      .eq("proyecto_id", id);

    const userIds = (accesoRows || []).map((a) => a.user_id);
    const profilesMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nombre_completo")
        .in("user_id", userIds);
      (profiles || []).forEach((p) => profilesMap.set(p.user_id, p.nombre_completo));
    }
    setAccesos((accesoRows || []).map((a) => ({ id: a.id, user_id: a.user_id, nombre: profilesMap.get(a.user_id) || "Usuario" })));

    const { data: rolesUsuario } = await supabase.from("user_roles").select("user_id").eq("role", "usuario");
    const idsUsuario = (rolesUsuario || []).map((r) => r.user_id);
    if (idsUsuario.length > 0) {
      const { data: profilesUsuario } = await supabase
        .from("profiles")
        .select("user_id, nombre_completo")
        .in("user_id", idsUsuario);
      const asignados = new Set((accesoRows || []).map((a) => a.user_id));
      setUsuariosDisponibles(
        (profilesUsuario || [])
          .filter((p) => !asignados.has(p.user_id))
          .map((p) => ({ id: p.user_id, label: p.nombre_completo }))
      );
    } else {
      setUsuariosDisponibles([]);
    }
  };

  const toggleEsProject = async (partida: PartidaRow) => {
    const { error } = await supabase
      .from("presupuestos")
      .update({ es_project: !partida.es_project })
      .eq("id", partida.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    fetchAll();
  };

  const agregarAcceso = async () => {
    if (!nuevoAccesoId || !id || !proyecto) return;
    const { error } = await supabase.from("proyecto_usuarios").insert({
      proyecto_id: id,
      user_id: nuevoAccesoId,
      empresa_id: proyecto.empresa_id,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setNuevoAccesoId("");
    fetchAccesos();
  };

  const quitarAcceso = async (accesoId: string) => {
    const { error } = await supabase.from("proyecto_usuarios").delete().eq("id", accesoId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    fetchAccesos();
  };

  const partidasProject = useMemo(() => partidas.filter((p) => p.es_project), [partidas]);

  const responsablesDisponibles = useMemo(() => {
    const set = new Map<string, string>();
    partidasProject.forEach((p) => {
      if (p.responsable_tercero_id && p.responsable) {
        set.set(p.responsable_tercero_id, p.responsable.razon_social);
      }
    });
    return [...set.entries()];
  }, [partidasProject]);

  const partidasFiltradas = useMemo(() => {
    if (filtroResponsable === "todos") return partidasProject;
    if (filtroResponsable === "sin_responsable") return partidasProject.filter((p) => !p.responsable_tercero_id);
    return partidasProject.filter((p) => p.responsable_tercero_id === filtroResponsable);
  }, [partidasProject, filtroResponsable]);

  const ejercidoMap = useMemo(() => calcularEjercidoPorPartida(movimientos as any, asientos), [movimientos, asientos]);
  const proyectadoMap = useMemo(() => calcularProyectadoPorPartida(flujos), [flujos]);
  const proyectadoAcumuladoMap = useMemo(() => calcularProyectadoPorPartida(flujos, new Date()), [flujos]);

  const kpis = useMemo(() => {
    let presupuesto = 0;
    let proyectadoAcumulado = 0;
    let ejercido = 0;
    partidasFiltradas.forEach((p) => {
      presupuesto += p.cantidad * p.precio_unitario;
      proyectadoAcumulado += proyectadoAcumuladoMap.get(p.id) || 0;
      ejercido += ejercidoMap.get(p.id) || 0;
    });
    return {
      presupuesto,
      proyectadoAcumulado,
      ejercido,
      disponible: calcularDisponible(presupuesto, ejercido),
      avance: calcularAvance(ejercido, presupuesto),
    };
  }, [partidasFiltradas, proyectadoAcumuladoMap, ejercidoMap]);

  const indicadores = useMemo(() => {
    const hoy = new Date();
    return {
      total: partidasProject.length,
      sinResponsable: partidasProject.filter((p) => !p.responsable_tercero_id).length,
      vencidas: partidasProject.filter((p) => p.fecha_fin && new Date(p.fecha_fin + "T00:00:00") < hoy).length,
    };
  }, [partidasProject]);

  const seguimientoPorPartida = useMemo(() => {
    const map = new Map<string, SeguimientoPartida>();
    partidasFiltradas.forEach((p) => {
      const presupuestoMonto = p.cantidad * p.precio_unitario;
      const ejercido = ejercidoMap.get(p.id) || 0;
      const totalProgramado = proyectadoMap.get(p.id) || 0;
      map.set(p.id, {
        responsable: p.responsable?.razon_social || null,
        fechaInicio: p.fecha_inicio,
        fechaFin: p.fecha_fin,
        avance: calcularAvance(ejercido, presupuestoMonto),
        pendienteAjustar: programacionPendienteDeAjustar(totalProgramado, presupuestoMonto),
        vencida: !!p.fecha_fin && new Date(p.fecha_fin + "T00:00:00") < new Date(),
      });
    });
    return map;
  }, [partidasFiltradas, ejercidoMap, proyectadoMap]);

  const filasResumen: FilaResumenPartida[] = useMemo(() => {
    return partidasFiltradas.map((p) => {
      const presupuesto = p.cantidad * p.precio_unitario;
      const ejercido = ejercidoMap.get(p.id) || 0;
      const proyectado = proyectadoAcumuladoMap.get(p.id) || 0;
      const totalProgramado = proyectadoMap.get(p.id) || 0;
      return {
        id: p.id,
        partida: p.partida,
        cuentaCodigo: p.cuenta?.codigo || "",
        cuentaNombre: p.cuenta?.nombre || "Sin cuenta",
        responsable: p.responsable?.razon_social || null,
        fechaInicio: p.fecha_inicio,
        fechaFin: p.fecha_fin,
        presupuesto,
        proyectado,
        ejercido,
        avance: calcularAvance(ejercido, presupuesto),
        pendienteAjustar: programacionPendienteDeAjustar(totalProgramado, presupuesto),
        vencida: !!p.fecha_fin && new Date(p.fecha_fin + "T00:00:00") < new Date(),
      };
    });
  }, [partidasFiltradas, ejercidoMap, proyectadoMap, proyectadoAcumuladoMap]);

  const presupuestosParaTree = useMemo(
    () =>
      partidasFiltradas.map((p) => ({
        id: p.id,
        partida: p.partida,
        cantidad: p.cantidad,
        precio_unitario: p.precio_unitario,
        orden: 0,
        cuenta: p.cuenta,
        centro_negocio: proyecto?.centros_negocio || null,
      })),
    [partidasFiltradas, proyecto]
  );

  const openSeguimiento = (presupuestoId: string) => {
    const p = partidas.find((x) => x.id === presupuestoId);
    if (!p) return;
    setDialogPartida({
      id: p.id,
      empresa_id: proyecto!.empresa_id,
      partida: p.partida,
      cantidad: p.cantidad,
      precio_unitario: p.precio_unitario,
      cuenta_codigo: p.cuenta?.codigo,
      cuenta_nombre: p.cuenta?.nombre,
      responsable_tercero_id: p.responsable_tercero_id,
      fecha_inicio: p.fecha_inicio,
      fecha_fin: p.fecha_fin,
    });
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!proyecto) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/proyectos")} className="mt-1.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
          <FolderKanban className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-gradient text-2xl sm:text-3xl font-bold truncate">{proyecto.nombre}</h1>
            {!proyecto.activo && <Badge variant="secondary">Inactivo</Badge>}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Editar Project"
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Briefcase className="h-3.5 w-3.5" />
            {proyecto.centros_negocio?.codigo} · {proyecto.centros_negocio?.nombre} · {proyecto.empresas?.razon_social}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Presupuesto total</p>
              <Landmark className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(kpis.presupuesto)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Proyectado acumulado</p>
              <CalendarClock className="h-4 w-4 text-amber-500/70" />
            </div>
            <p className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(kpis.proyectadoAcumulado)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Ejercido acumulado</p>
              <CheckCircle2 className="h-4 w-4 text-blue-500/70" />
            </div>
            <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(kpis.ejercido)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Disponible</p>
              <Wallet className={`h-4 w-4 ${kpis.disponible >= 0 ? "text-green-500/70" : "text-red-500/70"}`} />
            </div>
            <p className={`text-lg font-bold tabular-nums ${kpis.disponible >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(kpis.disponible)}
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-primary/30 bg-primary/[0.03]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Avance financiero</p>
              <Percent className="h-4 w-4 text-primary/70" />
            </div>
            <p className="text-lg font-bold tabular-nums">{kpis.avance.toFixed(1)}%</p>
            <Progress value={Math.min(100, kpis.avance)} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Indicadores + filtro responsable */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">{indicadores.total} partidas</Badge>
        <Badge variant="outline" className={indicadores.sinResponsable > 0 ? "text-amber-600 border-amber-300" : ""}>
          {indicadores.sinResponsable} sin responsable
        </Badge>
        <Badge variant="outline" className={indicadores.vencidas > 0 ? "text-red-600 border-red-300" : ""}>
          {indicadores.vencidas} vencidas
        </Badge>
        <div className="ml-auto w-full sm:w-64">
          <Select value={filtroResponsable} onValueChange={setFiltroResponsable}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="sin_responsable">Sin responsable</SelectItem>
              {responsablesDisponibles.map(([idr, nombre]) => (
                <SelectItem key={idr} value={idr}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tareas del Project: independientes de las partidas presupuestales */}
      <ProyectoTareas proyectoId={proyecto.id} empresaId={proyecto.empresa_id} canEdit={canEdit} />

      {partidasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Ninguna partida de este centro está marcada como Project todavía. Actívalas abajo en "Partidas del centro".
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cronograma (Gantt) */}
          <ProjectGantt filas={filasResumen} />

          {/* Resumen Presupuesto / Proyectado / Ejercido / Disponible / Avance por cuenta y partida */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                Presupuesto vs. Ejercido por partida
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectSummaryTable
                filas={filasResumen}
                onEdit={canEditFechas ? openSeguimiento : undefined}
                readOnly={!canEditFechas}
              />
            </CardContent>
          </Card>

          {/* Árbol Cuenta -> Partida con calendario mensual (reutiliza el Reporte de Flujo) */}
          <FlujoEfectivoPresupuesto
            presupuestos={presupuestosParaTree}
            flujosProgramados={flujos}
            movimientos={movimientos}
            asientos={asientos}
            empresaNombre={proyecto.nombre}
            seguimientoPorPartida={seguimientoPorPartida}
            onEditSeguimiento={canEditFechas ? openSeguimiento : undefined}
            readOnlySeguimiento={!canEditFechas}
          />
        </>
      )}

      {/* Gestión de partidas incluidas (solo admin/contador) */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Partidas del centro de negocio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Project</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Partida</TableHead>
                  <TableHead className="text-right">Presupuesto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partidas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Checkbox checked={p.es_project} onCheckedChange={() => toggleEsProject(p)} />
                    </TableCell>
                    <TableCell>{p.cuenta ? `${p.cuenta.codigo} ${p.cuenta.nombre}` : "-"}</TableCell>
                    <TableCell>{p.partida}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.cantidad * p.precio_unitario)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Gestión de accesos (solo admin) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Accesos de solo lectura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  value={nuevoAccesoId}
                  onValueChange={setNuevoAccesoId}
                  options={usuariosDisponibles}
                  placeholder="Seleccionar usuario"
                  searchPlaceholder="Buscar usuario..."
                  emptyMessage="No hay usuarios disponibles"
                />
              </div>
              <Button onClick={agregarAcceso} disabled={!nuevoAccesoId}>
                Agregar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {accesos.map((a) => (
                <Badge key={a.id} variant="secondary" className="gap-1.5">
                  {a.nombre}
                  <button onClick={() => quitarAcceso(a.id)} title="Quitar acceso">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {accesos.length === 0 && <p className="text-sm text-muted-foreground">Sin usuarios asignados.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <ProyectoPartidaSeguimientoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        partida={dialogPartida}
        onSuccess={fetchAll}
        mode={isArquitecto ? "fechas" : "full"}
      />

      <ProyectoEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        proyecto={proyecto ? { id: proyecto.id, nombre: proyecto.nombre, activo: proyecto.activo } : null}
        onSuccess={fetchAll}
      />
    </div>
  );
}
