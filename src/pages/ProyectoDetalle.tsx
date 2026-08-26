import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FlujoEfectivoPresupuesto,
  SeguimientoPartida,
} from "@/components/reportes/FlujoEfectivoPresupuesto";
import { ProyectoPartidaSeguimientoDialog, PartidaSeguimiento } from "@/components/dialogs/ProyectoPartidaSeguimientoDialog";
import { CronogramaPartidaDialog, CronogramaPartida } from "@/components/dialogs/CronogramaPartidaDialog";
import { ProyectoEditDialog } from "@/components/dialogs/ProyectoEditDialog";
import { ProjectSummaryTable, FilaResumenPartida, avancePonderado } from "@/components/proyectos/ProjectSummaryTable";
import { ProjectGantt } from "@/components/proyectos/ProjectGantt";
import { ProyectoTareas } from "@/components/proyectos/ProyectoTareas";
import { ProgramacionFinancieraProyecto } from "@/components/proyectos/ProgramacionFinancieraProyecto";
import { useProyectoAcceso } from "@/lib/project-permissions";
import { exportarCronogramaPDF, compartirCronogramaWhatsApp, compartirCronogramaCorreo } from "@/lib/cronograma-pdf";
import { formatCurrency, Movimiento, AsientoContable } from "@/lib/accounting-utils";
import {
  calcularEjercidoPorPartida,
  calcularProyectadoPorPartida,
  calcularAvance,
  calcularDisponible,
  programacionPendienteDeAjustar,
  resolverFlujosEfectivos,
} from "@/lib/project-utils";
import {
  ArrowLeft,
  Users,
  X,
  FolderKanban,
  Briefcase,
  Pencil,
  Landmark,
  CheckCircle2,
  Wallet,
  Percent,
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  Settings2,
  Wand2,
  History,
} from "lucide-react";

interface PartidaRow {
  id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  avance_manual: number | null;
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
  editar_cronograma: boolean;
  ver_programacion_financiera: boolean;
  editar_programacion_financiera: boolean;
}

interface AuditoriaRow {
  id: string;
  accion: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  created_at: string;
  user_id: string;
}

export default function ProyectoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { toast } = useToast();

  const canEdit = role === "admin" || role === "contador";
  const isAdmin = role === "admin";
  const readOnly = role === "usuario";

  const acceso = useProyectoAcceso(id);
  const canEditCronograma = canEdit || acceso.canEditCronograma;
  const canViewProgramacionFinanciera = canEdit || acceso.canViewProgramacionFinanciera;
  const canEditProgramacionFinanciera = canEdit || acceso.canEditProgramacionFinanciera;

  const [loading, setLoading] = useState(true);
  const [proyecto, setProyecto] = useState<ProyectoInfo | null>(null);
  const [partidas, setPartidas] = useState<PartidaRow[]>([]);
  const [flujos, setFlujos] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [programacionesPorPartida, setProgramacionesPorPartida] = useState<
    Map<string, { programacionId: string; pagos: { fecha: string; monto: number }[] }>
  >(new Map());
  const [auditoria, setAuditoria] = useState<AuditoriaRow[]>([]);

  const [filtroResponsable, setFiltroResponsable] = useState<string>("todos");
  const [dialogPartida, setDialogPartida] = useState<PartidaSeguimiento | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cronogramaDialogPartida, setCronogramaDialogPartida] = useState<CronogramaPartida | null>(null);
  const [cronogramaDialogOpen, setCronogramaDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [tab, setTab] = useState<"resumen" | "flujo" | "programacion_financiera" | "tareas" | "configuracion">(
    () => (localStorage.getItem("proyecto_detalle_tab") as any) || "resumen"
  );

  useEffect(() => {
    localStorage.setItem("proyecto_detalle_tab", tab);
  }, [tab]);

  useEffect(() => {
    if (tab === "configuracion" && !canEdit) setTab("resumen");
    if (tab === "programacion_financiera" && !canViewProgramacionFinanciera) setTab("resumen");
  }, [tab, canEdit, canViewProgramacionFinanciera]);

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
          id, partida, cantidad, precio_unitario, fecha_inicio, fecha_fin, avance_manual, es_project, responsable_tercero_id,
          cuenta:cuenta_id (codigo, nombre),
          responsable:terceros!presupuestos_responsable_tercero_id_fkey (razon_social)
        `)
        .eq("centro_negocio_id", proyectoData.centro_negocio_id)
        .eq("activo", true)
        .order("partida");
      if (partidasError) throw partidasError;
      setPartidas((partidasData || []) as any);

      const idsProject = (partidasData || []).filter((p: any) => p.es_project).map((p: any) => p.id);

      // Programación financiera propia POR PARTIDA: si una partida tiene su
      // propia programación, es la única fuente activa para ella (evita
      // duplicar su flujo); las partidas sin programación propia siguen
      // usando su flujos_programados normal (sin cambios).
      if (idsProject.length > 0) {
        const { data: programacionesData } = await supabase
          .from("proyecto_programacion_financiera")
          .select("id, presupuesto_id")
          .in("presupuesto_id", idsProject);

        const map = new Map<string, { programacionId: string; pagos: { fecha: string; monto: number }[] }>();
        if (programacionesData && programacionesData.length > 0) {
          const programacionIds = programacionesData.map((p) => p.id);
          const { data: pagosData } = await supabase
            .from("proyecto_programacion_pagos")
            .select("programacion_id, fecha, monto")
            .in("programacion_id", programacionIds);
          programacionesData.forEach((prog) => {
            map.set(prog.presupuesto_id, {
              programacionId: prog.id,
              pagos: (pagosData || [])
                .filter((p) => p.programacion_id === prog.id)
                .map((p) => ({ fecha: p.fecha, monto: Number(p.monto) })),
            });
          });
        }
        setProgramacionesPorPartida(map);
      } else {
        setProgramacionesPorPartida(new Map());
      }

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
      if (canEdit) await fetchAuditoria();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditoria = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("proyecto_auditoria")
      .select("id, accion, valor_anterior, valor_nuevo, created_at, user_id")
      .eq("proyecto_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditoria(data || []);
  };

  const fetchAccesos = async () => {
    if (!id) return;
    const { data: accesoRows } = await supabase
      .from("proyecto_usuarios")
      .select("id, user_id, editar_cronograma, ver_programacion_financiera, editar_programacion_financiera")
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
    setAccesos(
      (accesoRows || []).map((a) => ({
        id: a.id,
        user_id: a.user_id,
        nombre: profilesMap.get(a.user_id) || "Usuario",
        editar_cronograma: a.editar_cronograma,
        ver_programacion_financiera: a.ver_programacion_financiera,
        editar_programacion_financiera: a.editar_programacion_financiera,
      }))
    );

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

  const togglePermisoAcceso = async (
    acceso: AccesoUsuario,
    campo: "editar_cronograma" | "ver_programacion_financiera" | "editar_programacion_financiera"
  ) => {
    const { error } = await supabase
      .from("proyecto_usuarios")
      .update({ [campo]: !acceso[campo] })
      .eq("id", acceso.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    fetchAccesos();
  };

  const partidasProject = useMemo(() => partidas.filter((p) => p.es_project), [partidas]);

  const partidasProgramables = useMemo(
    () =>
      partidasProject.map((p) => ({
        id: p.id,
        partida: p.partida,
        cuenta_codigo: p.cuenta?.codigo,
        cuenta_nombre: p.cuenta?.nombre,
        presupuesto: p.cantidad * p.precio_unitario,
      })),
    [partidasProject]
  );

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

  // Si una partida tiene programación financiera propia, es la única fuente
  // activa para ella (sus pagos, no sus flujos_programados); las partidas sin
  // programación propia siguen usando su flujos_programados real, sin cambios.
  // Misma regla que usa el Reporte de Flujo global (src/pages/Reportes.tsx).
  const flujosEfectivos = useMemo(
    () => resolverFlujosEfectivos(flujos, programacionesPorPartida),
    [programacionesPorPartida, flujos]
  );

  const proyectadoMap = useMemo(() => calcularProyectadoPorPartida(flujosEfectivos), [flujosEfectivos]);
  const proyectadoAcumuladoMap = useMemo(() => calcularProyectadoPorPartida(flujosEfectivos, new Date()), [flujosEfectivos]);

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
    // Una partida no se considera vencida si ya está al 100% (avance manual
    // "Completada" o ejercido completo): se terminó, aunque la fecha ya pasó.
    const estaCompleta = (p: (typeof partidasProject)[number]) =>
      (p.avance_manual ?? calcularAvance(ejercidoMap.get(p.id) || 0, p.cantidad * p.precio_unitario)) >= 100;
    return {
      total: partidasProject.length,
      sinResponsable: partidasProject.filter((p) => !p.responsable_tercero_id).length,
      vencidas: partidasProject.filter(
        (p) => p.fecha_fin && new Date(p.fecha_fin + "T00:00:00") < hoy && !estaCompleta(p),
      ).length,
    };
  }, [partidasProject, ejercidoMap]);


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
        avance: p.avance_manual ?? calcularAvance(ejercido, presupuestoMonto),
        pendienteAjustar: programacionPendienteDeAjustar(totalProgramado, presupuestoMonto),
        vencida:
          !!p.fecha_fin &&
          new Date(p.fecha_fin + "T00:00:00") < new Date() &&
          (p.avance_manual ?? calcularAvance(ejercido, presupuestoMonto)) < 100,

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
        avance: p.avance_manual ?? calcularAvance(ejercido, presupuesto),
        pendienteAjustar: programacionPendienteDeAjustar(totalProgramado, presupuesto),
        vencida:
          !!p.fecha_fin &&
          new Date(p.fecha_fin + "T00:00:00") < new Date() &&
          (p.avance_manual ?? calcularAvance(ejercido, presupuesto)) < 100,

      };
    });
  }, [partidasFiltradas, ejercidoMap, proyectadoMap, proyectadoAcumuladoMap]);

  // Avance del Project: promedio ponderado por presupuesto de los avances de
  // cada partida, respetando el avance manual ("Completada" = 100%).
  const avanceProject = useMemo(() => avancePonderado(filasResumen), [filasResumen]);

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

    // admin/contador: diálogo completo (fechas, responsable, avance, flujo). Usuarios
    // con permiso editar_cronograma únicamente: diálogo reducido vía RPC.
    if (!canEdit) {
      setCronogramaDialogPartida({
        id: p.id,
        partida: p.partida,
        cuenta_codigo: p.cuenta?.codigo,
        cuenta_nombre: p.cuenta?.nombre,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
        avance_manual: p.avance_manual,
      });
      setCronogramaDialogOpen(true);
      return;
    }

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
      avance_manual: p.avance_manual,
    });
    setDialogOpen(true);
  };

  const [shareToken, setShareToken] = useState<string | null>(null);

  const obtenerOCrearShareToken = async (): Promise<string | null> => {
    if (!id) return null;
    const { data: existente } = await supabase
      .from("proyecto_cronograma_shares")
      .select("token")
      .eq("proyecto_id", id)
      .eq("activo", true)
      .maybeSingle();
    if (existente) return existente.token;

    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("proyecto_cronograma_shares").insert({
      proyecto_id: id,
      token,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    }
    return token;
  };

  const handleCopiarLink = async () => {
    const token = shareToken || (await obtenerOCrearShareToken());
    if (!token) return;
    setShareToken(token);
    const url = `${window.location.origin}/cronograma/${token}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", description: "Cualquier persona con este link puede ver el cronograma (sin datos financieros)." });
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              <p className="text-xs text-muted-foreground">Pagado</p>
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
            <p className="text-lg font-bold tabular-nums">{avanceProject.toFixed(1)}%</p>
            <Progress value={Math.min(100, avanceProject)} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumen" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="flujo" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Flujo mensual
          </TabsTrigger>
          {canViewProgramacionFinanciera && (
            <TabsTrigger value="programacion_financiera" className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Programación financiera
            </TabsTrigger>
          )}
          <TabsTrigger value="tareas" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Tareas
          </TabsTrigger>
          {canEdit && (
            <TabsTrigger value="configuracion" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Configuración
            </TabsTrigger>
          )}
        </TabsList>

        {/* Resumen: indicadores, Cronograma y Presupuesto vs. Ejercido */}
        <TabsContent value="resumen" className="space-y-6 mt-4">
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

          {partidasFiltradas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Ninguna partida de este centro está marcada como Project todavía.
                {canEdit && ' Actívalas en la pestaña "Configuración".'}
              </CardContent>
            </Card>
          ) : (
            <>
              <ProjectGantt
                filas={filasResumen}
                acciones={{
                  onExportarPDF: () => exportarCronogramaPDF(proyecto.nombre, null, filasResumen),
                  onCompartirWhatsApp: () => compartirCronogramaWhatsApp(proyecto.nombre, filasResumen),
                  onCompartirCorreo: () => compartirCronogramaCorreo(proyecto.nombre, filasResumen),
                  onCopiarLink: canEditCronograma ? handleCopiarLink : undefined,
                }}
              />

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
                    onEdit={canEditCronograma ? openSeguimiento : undefined}
                    readOnly={!canEditCronograma}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Flujo mensual: árbol Cuenta -> Partida (reutiliza el Reporte de Flujo) */}
        <TabsContent value="flujo" className="mt-4">
          {partidasFiltradas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Ninguna partida de este centro está marcada como Project todavía.
              </CardContent>
            </Card>
          ) : (
            <FlujoEfectivoPresupuesto
              presupuestos={presupuestosParaTree}
              flujosProgramados={flujosEfectivos}
              movimientos={movimientos}
              asientos={asientos}
              empresaNombre={proyecto.nombre}
              seguimientoPorPartida={seguimientoPorPartida}
              onEditSeguimiento={canEditCronograma ? openSeguimiento : undefined}
              readOnlySeguimiento={!canEditCronograma}
            />
          )}
        </TabsContent>

        {/* Programación financiera propia del proyecto */}
        {canViewProgramacionFinanciera && (
          <TabsContent value="programacion_financiera" className="mt-4">
            <ProgramacionFinancieraProyecto
              proyectoId={proyecto.id}
              empresaId={proyecto.empresa_id}
              partidas={partidasProgramables}
              canView={canViewProgramacionFinanciera}
              canEdit={canEditProgramacionFinanciera}
            />
          </TabsContent>
        )}

        {/* Tareas del Project: independientes de las partidas presupuestales */}
        <TabsContent value="tareas" className="mt-4">
          <ProyectoTareas proyectoId={proyecto.id} empresaId={proyecto.empresa_id} canEdit={canEdit} />
        </TabsContent>

        {/* Configuración: partidas incluidas y accesos (solo admin/contador) */}
        {canEdit && (
          <TabsContent value="configuracion" className="space-y-6 mt-4">
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
                      <TableHead className="w-32">Convertir en Proyecto</TableHead>
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
                  {accesos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin usuarios asignados.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead className="text-center">Editar cronograma</TableHead>
                          <TableHead className="text-center">Ver prog. financiera</TableHead>
                          <TableHead className="text-center">Editar prog. financiera</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accesos.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>{a.nombre}</TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={a.editar_cronograma}
                                onCheckedChange={() => togglePermisoAcceso(a, "editar_cronograma")}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={a.ver_programacion_financiera}
                                onCheckedChange={() => togglePermisoAcceso(a, "ver_programacion_financiera")}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={a.editar_programacion_financiera}
                                onCheckedChange={() => togglePermisoAcceso(a, "editar_programacion_financiera")}
                              />
                            </TableCell>
                            <TableCell>
                              <button onClick={() => quitarAcceso(a.id)} title="Quitar acceso">
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Auditoría
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditoria.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin cambios registrados todavía.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {auditoria.map((a) => (
                      <div key={a.id} className="text-xs border-b border-border/50 pb-1.5 last:border-0">
                        <span className="font-medium">{a.accion}</span>
                        {a.valor_anterior && a.valor_nuevo && (
                          <span className="text-muted-foreground"> · {a.valor_anterior} → {a.valor_nuevo}</span>
                        )}
                        <span className="text-muted-foreground"> · {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <ProyectoPartidaSeguimientoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        partida={dialogPartida}
        proyectoId={proyecto.id}
        onSuccess={fetchAll}
      />

      <CronogramaPartidaDialog
        open={cronogramaDialogOpen}
        onOpenChange={setCronogramaDialogOpen}
        proyectoId={proyecto.id}
        partida={cronogramaDialogPartida}
        onSuccess={fetchAll}
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
