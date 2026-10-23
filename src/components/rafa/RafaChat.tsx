import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toBase64, validarPesoAdjuntos } from "@/lib/archivos";
import { formatDateObj } from "@/lib/date-utils";
import {
  asignarCentro,
  cancelarAccion,
  cargarMensajes,
  confirmarAccion,
  eliminarConversacion,
  enviarMensaje,
  estadoAcciones,
  generarAvisosSemana,
  listarArchivos,
  listarCentros,
  listarConversaciones,
  conversacionVisible,
  nombreEmpresa,
  obtenerCentro,
  urlArchivo,
  type AccionRafa,
  type ArchivoRafa,
  type CentroRafa,
  type EmpresaDeCentro,
  type ContextoPantalla,
  type ConversacionRafa,
  type MensajeRafa,
} from "@/lib/rafa-chat";
import type { PlanRafa } from "@/lib/rafa-types";
import { ResultadosHerramientas } from "./RafaResultados";
import { RafaResumenCentro } from "./RafaResumenCentro";
import {
  Building2,
  Download,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";

interface Props {
  contextoPantalla?: ContextoPantalla;
  /** Abre el editor del plan; recibe el centro de la conversación para preseleccionarlo. */
  onAbrirPlan?: (plan: PlanRafa, centroId?: string | null) => void;
  /** Centro con el que se abre Rafa (p. ej. /rafa?centro=ID): abre la página del centro. */
  centroInicial?: string | null;
  /** Avisa el centro de la conversación abierta (p. ej. para "Cargar presupuesto"). */
  onCentroActual?: (centroId: string | null) => void;
  /** Panel lateral: oculta la lista de conversaciones. */
  compacto?: boolean;
  /** Contenido extra al inicio de la barra lateral (p. ej. acceso a "Cargar presupuesto"). */
  lateral?: ReactNode;
}

const PATRON_OPCIONES = /\[\[\s*opciones\s*:([^\]]*)\]\]/i;

/** Separa la línea [[opciones: A | B]] que Rafa usa para ofrecer botones. */
function separarOpciones(texto: string): { texto: string; opciones: string[] } {
  const m = texto.match(PATRON_OPCIONES);
  if (!m) return { texto, opciones: [] };
  const opciones = m[1]
    .split("|")
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 8);
  return { texto: texto.replace(PATRON_OPCIONES, "").trim(), opciones };
}

/** Negritas, código y enlaces internos [texto](/ruta) como hipervínculos. */
function enLinea(texto: string, clave: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(\/[^)\s]*\))/g).map((p, j) => {
    const k = `${clave}-${j}`;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={k}>{enLinea(p.slice(2, -2), k)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return (
        <code key={k} className="rounded bg-muted px-1 text-xs">
          {p.slice(1, -1)}
        </code>
      );
    const enlace = p.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    if (enlace)
      return (
        <Link key={k} to={enlace[2]} className="font-medium text-primary underline underline-offset-2 hover:opacity-80">
          {enlace[1]}
        </Link>
      );
    return <span key={k}>{p}</span>;
  });
}

function TextoRafa({ texto }: { texto: string }) {
  const lineas = texto.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lineas.map((linea, i) => {
        const vineta = /^\s*[-*]\s+/.test(linea);
        const contenido = linea.replace(/^\s*[-*]\s+/, "").replace(/^#+\s*/, "");
        const partes = enLinea(contenido, String(i));
        if (!linea.trim()) return <div key={i} className="h-1" />;
        return vineta ? (
          <div key={i} className="flex gap-2 pl-2">
            <span>•</span>
            <span>{partes}</span>
          </div>
        ) : (
          <p key={i} className={/^#+\s/.test(linea) ? "font-semibold" : ""}>
            {partes}
          </p>
        );
      })}
    </div>
  );
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

interface Opcion {
  etiqueta: string;
  contexto?: Partial<ContextoPantalla>;
}

/** Botones de respuesta rápida de un mensaje: los que Rafa propone y los que exige una herramienta (p. ej. elegir empresa). */
function opcionesDe(m: MensajeRafa): Opcion[] {
  const { opciones } = separarOpciones(m.contenido || "");
  const herramientas = m.datos?.herramientas || [];
  const empresas = new Map<string, string>();
  herramientas.forEach((h) => {
    (h.opciones || []).forEach((o) => empresas.set(normalizar(o.nombre), o.id));
    (h.referencias || []).filter((r) => r.entidad === "empresa").forEach((r) => empresas.set(normalizar(r.etiqueta), r.id));
  });
  const etiquetas = opciones.length
    ? opciones
    : herramientas.flatMap((h) => (h.faltantes?.includes("empresa_id") ? (h.opciones || []).map((o) => o.nombre) : []));
  return Array.from(new Set(etiquetas)).map((etiqueta) => {
    const empresaId = empresas.get(normalizar(etiqueta));
    return { etiqueta, contexto: empresaId ? { empresa_id: empresaId } : undefined };
  });
}

const SIN_CENTRO = "sin";

/** "CN002 · Oficina Central — Empresa": la empresa distingue centros con el mismo nombre. */
const etiquetaCentro = (c?: { codigo?: string | null; nombre?: string | null; empresas?: EmpresaDeCentro } | null) => {
  if (!c) return "Sin centro";
  const empresa = nombreEmpresa(c.empresas);
  return `${c.codigo ? `${c.codigo} · ` : ""}${c.nombre ?? ""}${empresa ? ` — ${empresa}` : ""}`;
};

/** Búsqueda sin acentos ni mayúsculas. */
const coincide = (texto: string, busqueda: string) => !busqueda.trim() || normalizar(texto).includes(normalizar(busqueda));

interface CentroConCharlas {
  centro: CentroRafa;
  charlas: ConversacionRafa[];
  ultima: string | null;
}

const SUGERENCIAS = [
  "¿Todos los pagos de esta semana están dentro del presupuesto?",
  "¿Cuánto llevamos ejercido por partida?",
  "Explícame la diferencia entre flujos programados y programaciones",
  "Programa 15 lotes por mes hasta completar 550",
];

export function RafaChat({ contextoPantalla, onAbrirPlan, centroInicial, onCentroActual, compacto = false, lateral }: Props) {
  const { toast } = useToast();
  const [conversaciones, setConversaciones] = useState<ConversacionRafa[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeRafa[]>([]);
  const [acciones, setAcciones] = useState<Map<string, AccionRafa>>(new Map());
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number | null>(null);
  const inicializadoRef = useRef(false);
  const [centros, setCentros] = useState<CentroRafa[]>([]);
  // Buscador de la barra (centros y charlas) y vista de cuadros de centros.
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"chat" | "centros">("chat");
  // Centros dados de baja: ocultos; se pueden ver en la vista de cuadros.
  const [verBajas, setVerBajas] = useState(false);
  const [centrosBaja, setCentrosBaja] = useState<CentroRafa[]>([]);
  // Centro elegido para una conversación nueva que aún no tiene mensajes.
  const [centroNueva, setCentroNueva] = useState<string | null>(null);
  const [archivosConv, setArchivosConv] = useState<ArchivoRafa[]>([]);
  const [verArchivos, setVerArchivos] = useState(false);
  const [reusar, setReusar] = useState<ArchivoRafa[]>([]);

  // En página completa el chat ocupa exactamente el espacio visible restante:
  // la página no hace scroll, solo la lista de mensajes, y el cuadro de texto
  // siempre queda a la vista.
  useLayoutEffect(() => {
    if (compacto) return;
    const medir = () => {
      const el = contenedorRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setAlto(Math.max(320, Math.floor(window.innerHeight - top - 24)));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [compacto]);

  const cargarConversaciones = useCallback(async () => {
    try {
      const lista = await listarConversaciones();
      setConversaciones(lista);
      return lista;
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo cargar el historial", description: e instanceof Error ? e.message : "Intenta volver a abrir Rafa." });
      return [];
    }
  }, [toast]);

  const recargar = useCallback(async (id: string) => {
    const lista = await cargarMensajes(id);
    setMensajes(lista);
    const ids = lista.flatMap((m) => (m.datos?.herramientas || []).map((h) => h.accion?.id).filter(Boolean) as string[]);
    setAcciones(await estadoAcciones(Array.from(new Set(ids))));
    // Los archivos son complementarios: si fallan no se pierde la conversación.
    setArchivosConv(await listarArchivos(id).catch(() => []));
  }, []);

  useEffect(() => {
    listarCentros()
      .then(setCentros)
      .catch(() => setCentros([]));
  }, []);

  // Aviso semanal: al abrir Rafa, el servidor deja (una vez por semana) el aviso
  // en la charla de cada centro. En segundo plano; si falla no estorba al chat.
  useEffect(() => {
    if (compacto) return;
    generarAvisosSemana()
      .then((r) => {
        if (r.generados > 0) void cargarConversaciones();
      })
      .catch(() => undefined);
  }, [compacto, cargarConversaciones]);

  useEffect(() => {
    if (inicializadoRef.current) return;
    inicializadoRef.current = true;
    void (async () => {
      const lista = await cargarConversaciones();
      if (centroInicial) return; // la abre el efecto del centro
      const ultima = lista.find(conversacionVisible);
      if (!ultima) return;
      try {
        await recargar(ultima.id);
        setConversacionId(ultima.id);
      } catch (e) {
        toast({ variant: "destructive", title: "No se pudo abrir la última conversación", description: e instanceof Error ? e.message : "" });
      }
    })();
  }, [cargarConversaciones, recargar, toast, centroInicial]);

  // Abrir Rafa desde un centro: su conversación más reciente o una nueva anclada.
  useEffect(() => {
    if (!centroInicial) return;
    void (async () => {
      try {
        const centro = await obtenerCentro(centroInicial);
        if (!centro) throw new Error("El centro de negocio no existe.");
        setCentros((prev) => (prev.some((c) => c.id === centro.id) ? prev : [...prev, centro]));
        // Página del centro: sus charlas en cuadros y el cuadro de texto para una nueva.
        abrirCentro(centro.id);
        await cargarConversaciones();
      } catch (e) {
        toast({ variant: "destructive", title: "No se pudo abrir la conversación del centro", description: e instanceof Error ? e.message : "" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroInicial, cargarConversaciones, toast]);

  useEffect(() => {
    finRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [mensajes.length, enviando]);

  const abrir = async (id: string) => {
    setVista("chat");
    setConversacionId(id);
    setReusar([]);
    try {
      await recargar(id);
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo abrir la conversación", description: e instanceof Error ? e.message : "" });
    }
  };

  /** Charla nueva; con centro, abre la página del centro (sus charlas + cuadro de texto). */
  const nueva = (centroId: string | null = null) => {
    setVista("chat");
    setConversacionId(null);
    setMensajes([]);
    setAcciones(new Map());
    setArchivosConv([]);
    setReusar([]);
    setVerArchivos(false);
    setCentroNueva(centroId);
  };
  const abrirCentro = (centroId: string) => nueva(centroId);

  const conversacionActual = conversaciones.find((c) => c.id === conversacionId) || null;
  const centroActualId = conversacionId ? conversacionActual?.centro_negocio_id ?? null : centroNueva;

  const cambiarCentro = async (valor: string) => {
    const centroId = valor === SIN_CENTRO ? null : valor;
    if (!conversacionId) {
      setCentroNueva(centroId);
      return;
    }
    try {
      await asignarCentro(conversacionId, centroId);
      await cargarConversaciones();
    } catch (e) {
      toast({ variant: "destructive", title: "No se cambió el centro", description: e instanceof Error ? e.message : "" });
    }
  };

  const descargar = async (a: ArchivoRafa) => {
    try {
      window.open(await urlArchivo(a.ruta), "_blank", "noopener");
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo abrir el archivo", description: e instanceof Error ? e.message : "" });
    }
  };

  useEffect(() => {
    if (!verBajas) return;
    listarCentros(true)
      .then(setCentrosBaja)
      .catch(() => setCentrosBaja([]));
  }, [verBajas]);
  const visibles = useMemo(() => conversaciones.filter(conversacionVisible), [conversaciones]);

  // Centros como "proyectos": cada uno con sus charlas, los de actividad reciente primero.
  const centrosConCharlas = useMemo<CentroConCharlas[]>(() => {
    const lista = centros.map((centro) => {
      const charlas = conversaciones.filter((c) => c.centro_negocio_id === centro.id);
      return { centro, charlas, ultima: charlas[0]?.updated_at ?? null };
    });
    return lista.sort((a, b) => (b.ultima || "").localeCompare(a.ultima || "") || a.centro.nombre.localeCompare(b.centro.nombre));
  }, [centros, conversaciones]);

  const centrosVisibles = useMemo(
    () =>
      centrosConCharlas.filter(
        (g) => coincide(etiquetaCentro(g.centro), busqueda) || g.charlas.some((c) => coincide(c.titulo, busqueda))
      ),
    [centrosConCharlas, busqueda]
  );
  const charlasSinCentro = useMemo(
    () => visibles.filter((c) => !c.centro_negocio_id && coincide(c.titulo, busqueda)),
    [visibles, busqueda]
  );
  const bajasVisibles = useMemo(
    () =>
      verBajas
        ? centrosBaja
            .map((centro) => {
              const charlas = conversaciones.filter((c) => c.centro_negocio_id === centro.id);
              return { centro, charlas, ultima: charlas[0]?.updated_at ?? null };
            })
            .filter((g) => coincide(etiquetaCentro(g.centro), busqueda))
        : [],
    [verBajas, centrosBaja, conversaciones, busqueda]
  );
  const centroActual = [...centros, ...centrosBaja].find((c) => c.id === centroActualId) || null;
  useEffect(() => {
    onCentroActual?.(centroActualId);
  }, [centroActualId, onCentroActual]);
  const charlasDelCentro = centroActualId ? conversaciones.filter((c) => c.centro_negocio_id === centroActualId) : [];
  const opcionesCentro = useMemo(
    () => [{ id: SIN_CENTRO, label: "Sin centro (conversación general)" }, ...centros.map((c) => ({ id: c.id, label: etiquetaCentro(c) }))],
    [centros]
  );

  const enviar = async (mensajeDirecto?: string, contextoExtra?: Partial<ContextoPantalla>) => {
    const mensaje = (mensajeDirecto ?? texto).trim();
    if ((!mensaje && !audioBlob && archivos.length === 0 && reusar.length === 0) || enviando) return;
    const errorPeso = validarPesoAdjuntos(audioBlob ? [...archivos, audioBlob] : archivos);
    if (errorPeso) {
      toast({ variant: "destructive", title: "Archivo demasiado pesado", description: errorPeso });
      return;
    }
    setEnviando(true);
    const provisional: MensajeRafa = {
      id: `tmp-${Date.now()}`,
      rol: "usuario",
      contenido: mensaje || "(audio/archivos)",
      datos: { adjuntos: [...archivos.map((a) => a.name), ...reusar.map((a) => a.nombre)] },
      version_conocimiento: null,
      created_at: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, provisional]);
    try {
      const adjuntos = await Promise.all(
        archivos.filter((f) => !f.type.startsWith("audio/")).map(async (f) => ({ filename: f.name, mime: f.type || "application/pdf", data: await toBase64(f) }))
      );
      const audioArchivo = archivos.find((f) => f.type.startsWith("audio/"));
      const audio = audioBlob
        ? { data: await toBase64(audioBlob), format: audioBlob.type.includes("mp4") ? "m4a" : "webm" }
        : audioArchivo
        ? { data: await toBase64(audioArchivo), format: (audioArchivo.name.split(".").pop() || "mp3").toLowerCase() }
        : undefined;
      const contexto = contextoExtra ? { ...(contextoPantalla || {}), ...contextoExtra } : contextoPantalla;
      const r = await enviarMensaje({
        conversacion_id: conversacionId,
        mensaje,
        contexto_pantalla: contexto,
        archivos: adjuntos,
        archivos_guardados: reusar.map((a) => a.id),
        audio,
        centro_negocio_id: conversacionId ? undefined : centroNueva,
      });
      if (mensajeDirecto === undefined) setTexto("");
      setArchivos([]);
      setReusar([]);
      setAudioBlob(null);
      setConversacionId(r.conversacion_id);
      try {
        await recargar(r.conversacion_id);
      } catch (e) {
        toast({ variant: "destructive", title: "Charla enviada; no se pudo cargar el historial", description: e instanceof Error ? e.message : "Vuelve a abrir esta conversación." });
      }
      void cargarConversaciones();
    } catch (e) {
      setMensajes((prev) => prev.filter((m) => m.id !== provisional.id));
      toast({ variant: "destructive", title: "Rafa no pudo responder", description: e instanceof Error ? e.message : "Error inesperado" });
    } finally {
      setEnviando(false);
    }
  };

  const operar = async (accion: AccionRafa, tipo: "confirmar" | "cancelar") => {
    setProcesando(accion.id);
    try {
      const r = tipo === "confirmar" ? await confirmarAccion(accion) : await cancelarAccion(accion.id);
      toast({
        variant: r.ok ? "default" : "destructive",
        title: r.accion ? r.accion.estado === "ejecutada" ? "Operación ejecutada" : "Operación no ejecutada" : "Sin cambios",
        description: r.resumen,
      });
      if (conversacionId) await recargar(conversacionId);
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo completar", description: e instanceof Error ? e.message : "" });
    } finally {
      setProcesando(null);
    }
  };

  const borrar = async (id: string) => {
    try {
      await eliminarConversacion(id);
      if (id === conversacionId) nueva();
      cargarConversaciones();
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo eliminar", description: e instanceof Error ? e.message : "" });
    }
  };

  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: mime }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setGrabando(true);
    } catch {
      toast({ variant: "destructive", title: "No se pudo acceder al micrófono" });
    }
  };

  const contextoTexto = useMemo(() => {
    if (!contextoPantalla?.registro && !contextoPantalla?.empresa_id) return null;
    const r = contextoPantalla.registro;
    return r ? `Pantalla actual: ${r.entidad}` : "Pantalla actual con empresa filtrada";
  }, [contextoPantalla]);

  return (
    <div
      ref={contenedorRef}
      className={`flex min-h-0 gap-4 ${compacto ? "h-full" : ""}`}
      style={!compacto && alto ? { height: alto } : undefined}
    >
      {!compacto && (
        <aside className="hidden w-60 shrink-0 flex-col gap-2 overflow-y-auto md:flex">
          {lateral}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar centro o charla…"
              aria-label="Buscar centro o charla"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => nueva()}>
              <MessageSquarePlus className="h-4 w-4" />
              Nueva
            </Button>
            <Button variant={vista === "centros" ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setVista("centros")} aria-label="Ver centros en cuadros">
              <LayoutGrid className="h-4 w-4" />
              Centros
            </Button>
          </div>
          <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Centros</p>
          {centrosVisibles.map((g) => {
            const activo = vista === "chat" && g.centro.id === centroActualId;
            const charlas = busqueda.trim() ? g.charlas.filter((c) => coincide(c.titulo, busqueda) || coincide(etiquetaCentro(g.centro), busqueda)) : g.charlas;
            return (
              <div key={g.centro.id}>
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${activo ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => abrirCentro(g.centro.id)}
                  title={etiquetaCentro(g.centro)}
                >
                  {activo ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{g.centro.nombre}</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">{nombreEmpresa(g.centro.empresas)}</span>
                  </span>
                  {g.charlas.length > 0 && <span className="text-[11px] text-muted-foreground">{g.charlas.length}</span>}
                </button>
                {(activo || busqueda.trim()) && charlas.length > 0 && (
                  <div className="ml-4 space-y-0.5 border-l pl-2">
                    {charlas.map((c) => (
                      <div key={c.id} className={`group flex items-center gap-1 rounded px-1.5 py-1 text-xs ${c.id === conversacionId ? "bg-primary/5 font-medium" : "hover:bg-muted"}`}>
                        <button className="min-w-0 flex-1 truncate text-left" onClick={() => abrir(c.id)}>
                          {c.titulo}
                        </button>
                        <button className="opacity-0 group-hover:opacity-100" onClick={() => borrar(c.id)} aria-label="Eliminar conversación">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {centrosVisibles.length === 0 && <p className="px-1 text-xs text-muted-foreground">Ningún centro coincide.</p>}
          {charlasSinCentro.length > 0 && (
            <>
              <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sin centro</p>
              {charlasSinCentro.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${c.id === conversacionId ? "bg-primary/5 font-medium" : "hover:bg-muted"}`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => abrir(c.id)}>
                    <span className="block truncate">{c.titulo}</span>
                    <span className="text-xs text-muted-foreground">{formatDateObj(new Date(c.updated_at))}</span>
                  </button>
                  <button className="opacity-0 group-hover:opacity-100" onClick={() => borrar(c.id)} aria-label="Eliminar conversación">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </>
          )}
        </aside>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card">
        {!compacto && (
          <div className="shrink-0 space-y-2 border-b p-3 md:hidden">
            {lateral}
            <div className="flex min-w-0 items-center gap-2">
              <Select value={conversacionId || "nueva"} onValueChange={(id) => (id === "nueva" ? nueva() : void abrir(id))} disabled={enviando}>
                <SelectTrigger aria-label="Conversaciones guardadas" className="min-w-0 flex-1">
                  <SelectValue placeholder="Conversaciones guardadas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nueva">Nueva conversación</SelectItem>
                  {visibles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.centro_negocio_id && !c.titulo.startsWith("Centro ") ? `${etiquetaCentro(c.centros_negocio)} — ` : ""}
                      {c.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" disabled={enviando} onClick={() => nueva()} aria-label="Nueva conversación">
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button variant={vista === "centros" ? "secondary" : "outline"} size="icon" onClick={() => setVista("centros")} aria-label="Centros">
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {vista === "chat" && (
        <div className="shrink-0 space-y-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SearchableSelect
              value={centroActualId || SIN_CENTRO}
              onValueChange={(v) => void cambiarCentro(v)}
              options={opcionesCentro}
              placeholder="Centro de negocio"
              searchPlaceholder="Buscar centro o empresa…"
              emptyMessage="Ningún centro coincide"
              disabled={enviando}
              className="min-w-0 flex-1 text-xs [&_button]:h-8"
            />
            <Button
              variant={verArchivos ? "secondary" : "ghost"}
              size="sm"
              className="h-8 shrink-0 gap-1 px-2 text-xs"
              onClick={() => setVerArchivos((v) => !v)}
              disabled={!conversacionId}
              aria-label="Archivos de la conversación"
            >
              <FileText className="h-3.5 w-3.5" />
              Archivos ({archivosConv.length})
            </Button>
          </div>
          {verArchivos && conversacionId && (
            <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {archivosConv.length === 0 && <p className="text-muted-foreground">Aún no hay archivos en esta conversación. Los que adjuntes se guardan aquí.</p>}
              {archivosConv.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded border px-2 py-1">
                  <span className="min-w-0 flex-1 truncate" title={a.nombre}>
                    {a.nombre}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatDateObj(new Date(a.created_at))}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => descargar(a)} aria-label={`Descargar ${a.nombre}`}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-xs"
                    disabled={reusar.some((r) => r.id === a.id) || reusar.length >= 5}
                    onClick={() => setReusar((prev) => [...prev, a])}
                    aria-label={`Usar ${a.nombre}`}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Usar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        {vista === "centros" ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-base font-semibold">Centros</h2>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} aria-label="Mostrar centros dados de baja" />
                Mostrar dados de baja
              </label>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar centro, empresa o charla…" aria-label="Buscar centros" className="pl-8" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {centrosVisibles.map((g) => (
                <button
                  key={g.centro.id}
                  onClick={() => abrirCentro(g.centro.id)}
                  className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-left transition hover:border-primary hover:shadow-sm"
                  aria-label={`Abrir centro ${etiquetaCentro(g.centro)}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Folder className="h-4 w-4 shrink-0 text-primary" />
                    <span className="line-clamp-2">{g.centro.nombre}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {g.centro.codigo} · {nombreEmpresa(g.centro.empresas) || "Sin empresa"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.charlas.length} {g.charlas.length === 1 ? "charla" : "charlas"}
                    {g.ultima ? ` · ${formatDateObj(new Date(g.ultima))}` : ""}
                  </span>
                </button>
              ))}
            </div>
            {centrosVisibles.length === 0 && <p className="text-sm text-muted-foreground">Ningún centro coincide con la búsqueda.</p>}
            {bajasVisibles.length > 0 && (
              <>
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados de baja</p>
                <div className="grid grid-cols-1 gap-3 opacity-70 sm:grid-cols-2 xl:grid-cols-3">
                  {bajasVisibles.map((g) => (
                    <button
                      key={g.centro.id}
                      onClick={() => abrirCentro(g.centro.id)}
                      className="flex flex-col gap-1 rounded-lg border border-dashed bg-background p-3 text-left hover:border-primary"
                      aria-label={`Abrir centro dado de baja ${etiquetaCentro(g.centro)}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-2">{g.centro.nombre}</span>
                        <Badge variant="secondary" className="ml-auto text-[10px]">Baja</Badge>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {g.centro.codigo} · {nombreEmpresa(g.centro.empresas) || "Sin empresa"} · {g.charlas.length} {g.charlas.length === 1 ? "charla" : "charlas"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {!conversacionId && centroActual && mensajes.length === 0 && !enviando && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <FolderOpen className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{centroActual.nombre}</h2>
                  {centroActual.activo === false && (
                    <p className="text-xs font-medium text-destructive">Centro dado de baja: sus charlas se conservan; reactívalo en Centros de negocio o pídeselo a Rafa.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {centroActual.codigo} · {nombreEmpresa(centroActual.empresas)} · Escribe abajo para empezar una charla nueva en este centro.
                  </p>
                </div>
              </div>
              {!compacto && <RafaResumenCentro centroId={centroActual.id} />}
              {charlasDelCentro.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {charlasDelCentro.map((c) => (
                    <div key={c.id} className="group flex items-start gap-2 rounded-lg border p-3 hover:border-primary">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <button className="min-w-0 flex-1 text-left" onClick={() => abrir(c.id)} aria-label={`Abrir charla ${c.titulo}`}>
                        <span className="block truncate text-sm font-medium">{c.titulo}</span>
                        <span className="text-xs text-muted-foreground">{formatDateObj(new Date(c.updated_at))}</span>
                      </button>
                      <button className="opacity-0 group-hover:opacity-100" onClick={() => borrar(c.id)} aria-label="Eliminar conversación">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {mensajes.length === 0 && !enviando && (conversacionId || !centroActual) && (
            <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
              <p>
                {centroActualId
                  ? `Todo lo que preguntes aquí se refiere al centro ${etiquetaCentro(centros.find((c) => c.id === centroActualId))}.`
                  : "Pregúntame por presupuestos, programación, asientos, proyectos o cómo funciona el sistema. Elige arriba un centro para trabajar ordenado por centro."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => setTexto(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mensajes.map((m, indice) =>
            m.rol === "usuario" ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                <p className="whitespace-pre-wrap">{m.contenido}</p>
                {(m.datos?.adjuntos || []).length > 0 && <p className="mt-1 text-xs opacity-80">Adjuntos: {(m.datos.adjuntos || []).join(", ")}</p>}
              </div>
            ) : (
              <div key={m.id} className="max-w-full space-y-1">
                <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-2">
                  <TextoRafa texto={separarOpciones(m.contenido || "").texto} />
                </div>
                {indice === mensajes.length - 1 && !enviando && opcionesDe(m).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {opcionesDe(m).map((o) => (
                      <Button key={o.etiqueta} size="sm" variant="outline" className="h-8 rounded-full" onClick={() => enviar(o.etiqueta, o.contexto)}>
                        {o.etiqueta}
                      </Button>
                    ))}
                  </div>
                )}
                <ResultadosHerramientas
                  herramientas={m.datos?.herramientas || []}
                  acciones={acciones}
                  procesando={procesando}
                  onConfirmar={(a) => operar(a, "confirmar")}
                  onCancelar={(a) => operar(a, "cancelar")}
                  onAbrirPlan={onAbrirPlan ? (plan) => onAbrirPlan(plan, centroActualId) : undefined}
                />
              </div>
            )
          )}
          {enviando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rafa está consultando el sistema…
            </div>
          )}
          <div ref={finRef} />
        </div>
        )}

        {vista === "chat" && (
        <div className="shrink-0 space-y-2 border-t p-3">
          {(contextoTexto || audioBlob || archivos.length > 0 || reusar.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {contextoTexto && <Badge variant="outline">{contextoTexto}</Badge>}
              {audioBlob && (
                <Badge variant="secondary" className="gap-1">
                  Audio grabado
                  <button onClick={() => setAudioBlob(null)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {reusar.map((a) => (
                <Badge key={a.id} variant="secondary" className="gap-1">
                  <RotateCcw className="h-3 w-3" />
                  {a.nombre}
                  <button onClick={() => setReusar((prev) => prev.filter((r) => r.id !== a.id))} aria-label={`Quitar ${a.nombre}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {archivos.map((f, i) => (
                <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1">
                  {f.name}
                  <button onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escribe a Rafa… (Enter para enviar, Shift+Enter para nueva línea)"
              className="min-h-[44px] resize-none"
            />
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Adjuntar archivos">
                <Paperclip className="h-4 w-4" />
              </Button>
              {!grabando ? (
                <Button type="button" variant="ghost" size="icon" onClick={iniciarGrabacion} aria-label="Grabar audio">
                  <Mic className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    recorderRef.current?.stop();
                    setGrabando(false);
                  }}
                  aria-label="Detener grabación"
                >
                  <Square className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" onClick={() => enviar()} disabled={enviando} aria-label="Enviar">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,audio/*"
              className="hidden"
              onChange={(e) => {
                setArchivos((prev) => [...prev, ...Array.from(e.target.files || [])].slice(0, 5));
                e.target.value = "";
              }}
            />
          </div>
        </div>
        )}
      </section>
    </div>
  );
}
