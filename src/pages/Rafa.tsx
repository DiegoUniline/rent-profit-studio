import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import rafaAvatar from "@/assets/rafa-avatar.png";
import { RafaCaptura, type CapturaPayload } from "@/components/rafa/RafaCaptura";
import { RafaPropuesta } from "@/components/rafa/RafaPropuesta";
import { RafaSesiones, type SesionRafa } from "@/components/rafa/RafaSesiones";
import { aplicarPlanRafa } from "@/lib/rafa-apply";
import { aplicarFormatoTexto, mejorCoincidencia, normalizar, type PlanRafa, type PropuestaEditable } from "@/lib/rafa-types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Empresa { id: string; nombre: string }
interface Centro { id: string; nombre: string; empresa_id: string; codigo?: string }
interface Tercero { id: string; nombre: string; empresa_id: string }
interface Cuenta { id: string; codigo: string; nombre: string; empresa_id: string }

export default function Rafa() {
  const { toast } = useToast();
  const { role } = useAuth();
  // Solo quien puede editar presupuestos puede guardar desde Rafa.
  const puedeEditarPresupuestos = role === "admin" || role === "contador";
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [plan, setPlan] = useState<PlanRafa | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaEditable | null>(null);
  const [sesiones, setSesiones] = useState<SesionRafa[]>([]);
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [reinstruir, setReinstruir] = useState(false);
  const [porEliminar, setPorEliminar] = useState<{ id: string; ids: string[] } | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aplicandoRef = useRef(false);

  const cargarSesiones = useCallback(async () => {
    const { data } = await supabase
      .from("rafa_sesiones")
      .select("id, titulo, resumen, estado, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    setSesiones((data || []) as SesionRafa[]);
  }, []);

  useEffect(() => {
    cargarSesiones();
  }, [cargarSesiones]);


  useEffect(() => {
    (async () => {
      const [e, c, t, cu] = await Promise.all([
        supabase.from("empresas").select("id, razon_social, nombre_comercial").eq("activa", true),
        supabase.from("centros_negocio").select("id, nombre, codigo, empresa_id").eq("activo", true),
        supabase.from("terceros").select("id, razon_social, empresa_id").eq("activo", true),
        supabase.from("cuentas_contables").select("id, codigo, nombre, empresa_id").eq("activa", true).eq("clasificacion", "saldo"),
      ]);
      setEmpresas((e.data || []).map((x) => ({ id: x.id, nombre: x.nombre_comercial || x.razon_social })));
      setCentros((c.data || []) as Centro[]);
      setTerceros((t.data || []).map((x) => ({ id: x.id, nombre: x.razon_social, empresa_id: x.empresa_id })));
      setCuentas((cu.data || []) as Cuenta[]);
    })();
  }, []);

  const construirPropuesta = (p: PlanRafa, previa?: PropuestaEditable | null): PropuestaEditable => {
    const empresa = mejorCoincidencia(p.empresa_detectada || "", empresas) || empresas[0];
    const empresaId = previa?.empresaId || empresa?.id || "";
    const centroMatch = mejorCoincidencia(p.centro_negocio?.nombre || "", centros.filter((c) => c.empresa_id === empresaId), 0.6);
    const terceroMatch = mejorCoincidencia(p.tercero?.nombre || "", terceros.filter((t) => t.empresa_id === empresaId), 0.5);
    const cuentasEmpresa = cuentas.filter((c) => c.empresa_id === empresaId);

    return {
      empresaId,
      centro: {
        modo: centroMatch ? "existente" : "nuevo",
        id: centroMatch?.id || "",
        nombre: p.centro_negocio?.nombre || "",
        tipoActividad: p.centro_negocio?.tipo_actividad || "",
      },
      tercero: {
        modo: terceroMatch ? "existente" : p.tercero?.nombre ? "nuevo" : "ninguno",
        id: terceroMatch?.id || "",
        nombre: p.tercero?.nombre || "",
      },
      ivaIncluir: p.iva?.incluir ?? false,
      ivaTasa: p.iva?.tasa || 16,
      partidas: (p.partidas || []).map((pa, i) => {
        const porCodigo = pa.cuenta_codigo
          ? cuentasEmpresa.find((c) => normalizar(c.codigo) === normalizar(pa.cuenta_codigo || ""))
          : undefined;
        const formato = previa?.formatoTexto || "original";
        return {
          key: `${i}-${pa.clave || pa.descripcion.slice(0, 12)}`,
          // Conserva el vínculo con lo ya guardado para actualizar en vez de duplicar.
          presupuestoId: previa?.partidas[i]?.presupuestoId,
          descripcion: aplicarFormatoTexto(pa.descripcion, formato),
          unidad: pa.unidad || "",
          cantidad: Number(pa.cantidad) || 0,
          precioUnitario: Number(pa.precio_unitario) || 0,
          cuentaId: porCodigo?.id || "",
        };
      }),
      formatoTexto: previa?.formatoTexto || "original",
      aplicado: previa?.aplicado,
      programacion: {
        tipo: p.programacion?.tipo || "egreso",
        frecuencia: p.programacion?.frecuencia || "mensual",
        fechaInicio: p.programacion?.fecha_inicio || new Date().toISOString().slice(0, 10),
        numeroPagos: Math.max(1, Number(p.programacion?.numero_pagos) || 1),
      },
    };
  };

  const interpretar = async (payload: CapturaPayload) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rafa-asistente", {
        body: {
          ...payload,
          hoy: new Date().toISOString().slice(0, 10),
          cuentas: cuentas.slice(0, 400).map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const nuevoPlan = data.plan as PlanRafa;
      const nuevaPropuesta = construirPropuesta(nuevoPlan, propuesta);
      setPlan(nuevoPlan);
      setPropuesta(nuevaPropuesta);
      setReinstruir(false);

      // Si ya hay una sesión abierta, se actualiza esa misma interpretación.
      if (sesionId) {
        await supabase
          .from("rafa_sesiones")
          .update({
            resumen: nuevoPlan.resumen || null,
            transcripcion: nuevoPlan.transcripcion || null,
            plan: nuevoPlan as unknown as never,
            propuesta: nuevaPropuesta as unknown as never,
          })
          .eq("id", sesionId);
        cargarSesiones();
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      if (user?.user) {
        const titulo =
          nuevoPlan.centro_negocio?.nombre?.trim() ||
          nuevoPlan.resumen?.slice(0, 60) ||
          "Interpretación de Rafa";
        const { data: fila, error: errSesion } = await supabase
          .from("rafa_sesiones")
          .insert({
            user_id: user.user.id,
            titulo,
            resumen: nuevoPlan.resumen || null,
            transcripcion: nuevoPlan.transcripcion || null,
            plan: nuevoPlan as unknown as never,
            propuesta: nuevaPropuesta as unknown as never,
            estado: "borrador",
          })
          .select("id")
          .single();
        if (!errSesion && fila) setSesionId(fila.id);
        cargarSesiones();
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Rafa no pudo interpretar la instrucción",
        description: e instanceof Error ? e.message : "Error inesperado",
      });
    } finally {
      setLoading(false);
    }
  };

  // Autoguardado de los cambios que el usuario hace sobre la propuesta.
  useEffect(() => {
    if (!sesionId || !propuesta) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      supabase
        .from("rafa_sesiones")
        .update({ propuesta: propuesta as unknown as never })
        .eq("id", sesionId)
        .then(() => cargarSesiones());
    }, 900);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [propuesta, sesionId, cargarSesiones]);

  const abrirSesion = async (id: string) => {
    const { data, error } = await supabase
      .from("rafa_sesiones")
      .select("id, plan, propuesta")
      .eq("id", id)
      .maybeSingle();
    if (error || !data?.propuesta) {
      toast({ variant: "destructive", title: "No se pudo abrir la interpretación" });
      return;
    }
    setPlan((data.plan as unknown as PlanRafa) || null);
    setPropuesta(data.propuesta as unknown as PropuestaEditable);
    setSesionId(data.id);
  };

  // Paso 1: se consulta qué partidas creó esa interpretación y se pregunta.
  const eliminarSesion = async (id: string) => {
    const { data: fila } = await supabase
      .from("rafa_sesiones")
      .select("propuesta")
      .eq("id", id)
      .maybeSingle();
    const prop = (fila?.propuesta as unknown as PropuestaEditable) || null;
    const ids = Array.from(
      new Set([
        ...(prop?.aplicado?.presupuestoIds || []),
        ...((prop?.partidas || []).map((x) => x.presupuestoId).filter(Boolean) as string[]),
      ])
    );
    setPorEliminar({ id, ids });
  };

  // Paso 2: ejecuta el borrado, con o sin las partidas de presupuesto.
  const ejecutarEliminar = async (conPresupuestos: boolean) => {
    if (!porEliminar) return;
    const { id, ids } = porEliminar;
    setPorEliminar(null);

    if (conPresupuestos && ids.length > 0) {
      await supabase.from("flujos_programados").delete().in("presupuesto_id", ids);
      // Se intenta el borrado real; si alguna partida ya se usó en asientos o
      // programaciones, se deja como baja para no romper la contabilidad.
      const { error: errDel } = await supabase.from("presupuestos").delete().in("id", ids);
      if (errDel) {
        await supabase.from("presupuestos").update({ activo: false }).in("id", ids);
      }
    }

    const { error } = await supabase.from("rafa_sesiones").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "No se pudo eliminar", description: error.message });
      return;
    }
    if (sesionId === id) {
      setSesionId(null);
      setPlan(null);
      setPropuesta(null);
    }
    toast({
      title: "Interpretación eliminada",
      description: conPresupuestos && ids.length > 0
        ? "También se eliminaron sus partidas y flujos."
        : "Las partidas de presupuesto se conservaron.",
    });
    cargarSesiones();
  };


  const aplicar = async () => {
    if (!propuesta) return;
    // Candado contra doble clic / doble envío: nunca dos guardados en paralelo.
    if (aplicandoRef.current) return;
    aplicandoRef.current = true;
    setGuardando(true);
    try {
      const r = await aplicarPlanRafa(propuesta);
      setPropuesta(r.propuesta);
      if (sesionId) {
        await supabase
          .from("rafa_sesiones")
          .update({ estado: "aplicado", propuesta: r.propuesta as unknown as never })
          .eq("id", sesionId);
      }
      toast({
        title: "Listo",
        description: `${r.partidasCreadas} partidas nuevas, ${r.partidasActualizadas} actualizadas y ${r.flujosCreados} flujos programados.`,
      });
      cargarSesiones();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error inesperado",
      });
    } finally {
      aplicandoRef.current = false;
      setGuardando(false);
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <img
            src={rafaAvatar}
            alt="Rafa, asistente de proyectos"
            width={816}
            height={816}
            className="h-20 w-20 rounded-full object-cover object-top bg-primary/10 ring-2 ring-primary/30"
          />
          <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-background" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">Rafa · Asistente de proyectos</h1>
          <div className="relative rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-2.5 text-sm max-w-2xl">
            ¡Hola! Soy Rafa. Dime por voz o por escrito qué necesitas y adjunta el presupuesto o catálogo de
            conceptos: yo te propongo el centro de negocio, el contratista, las partidas y el flujo de pagos.
            Tú nada más revisas y confirmas.
          </div>
        </div>
      </div>


      {!propuesta ? (
        <>
          <RafaCaptura loading={loading} onEnviar={interpretar} />
          <RafaSesiones
            sesiones={sesiones}
            activaId={sesionId}
            onAbrir={abrirSesion}
            onEliminar={eliminarSesion}
          />
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Qué puede hacer Rafa</p>
              <p>· Crear o enlazar un centro de negocio y un tercero (contratista).</p>
              <p>· Cargar las partidas del archivo con cantidad, precio unitario e IVA.</p>
              <p>· Sugerir la cuenta contable de cada partida.</p>
              <p>· Programar los flujos de efectivo por semana, quincena o mes.</p>
              <p>· Guardar cada interpretación para retomarla y corregirla después.</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReinstruir((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" />
              {reinstruir ? "Ocultar instrucción" : "Cambiar instrucción"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Al cambiar la instrucción se corrige esta misma interpretación; no se crea otra.
            </span>
          </div>
          {reinstruir && <RafaCaptura loading={loading} onEnviar={interpretar} />}
          <RafaPropuesta
          resumen={plan?.resumen || ""}
          transcripcion={plan?.transcripcion}
          propuesta={propuesta}
          empresas={empresas}
          centros={centros}
          terceros={terceros}
          cuentas={cuentas}
          guardando={guardando}
          onChange={setPropuesta}
          onAplicar={aplicar}
          soloLectura={!puedeEditarPresupuestos}
          yaGuardado={Boolean(propuesta.aplicado?.presupuestoIds?.length)}
          onReiniciar={() => {
            setPlan(null);
            setPropuesta(null);
            setSesionId(null);
            setReinstruir(false);
          }}
          />
        </>
      )}

      <AlertDialog open={Boolean(porEliminar)} onOpenChange={(o) => !o && setPorEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar interpretación</AlertDialogTitle>
            <AlertDialogDescription>
              {porEliminar && porEliminar.ids.length > 0
                ? `Esta interpretación guardó ${porEliminar.ids.length} partida(s) en presupuestos. ¿Quieres eliminarlas también junto con sus flujos programados?`
                : "Esta interpretación no tiene partidas guardadas en presupuestos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {porEliminar && porEliminar.ids.length > 0 && (
              <Button variant="outline" onClick={() => ejecutarEliminar(false)}>
                Solo la interpretación
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => ejecutarEliminar(true)}
            >
              {porEliminar && porEliminar.ids.length > 0
                ? "Eliminar también de presupuestos"
                : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
