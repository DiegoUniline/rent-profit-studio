import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toBase64 } from "@/lib/archivos";
import { formatDateObj } from "@/lib/date-utils";
import {
  cancelarAccion,
  cargarMensajes,
  confirmarAccion,
  eliminarConversacion,
  enviarMensaje,
  estadoAcciones,
  listarConversaciones,
  type AccionRafa,
  type ContextoPantalla,
  type ConversacionRafa,
  type MensajeRafa,
} from "@/lib/rafa-chat";
import type { PlanRafa } from "@/lib/rafa-types";
import { ResultadosHerramientas } from "./RafaResultados";
import { Loader2, MessageSquarePlus, Mic, Paperclip, Send, Square, Trash2, X } from "lucide-react";

interface Props {
  contextoPantalla?: ContextoPantalla;
  onAbrirPlan?: (plan: PlanRafa) => void;
  /** Panel lateral: oculta la lista de conversaciones. */
  compacto?: boolean;
}

/** Formato mínimo de markdown: negritas, código en línea y viñetas. */
function TextoRafa({ texto }: { texto: string }) {
  const lineas = texto.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lineas.map((linea, i) => {
        const vineta = /^\s*[-*]\s+/.test(linea);
        const contenido = linea.replace(/^\s*[-*]\s+/, "").replace(/^#+\s*/, "");
        const partes = contenido.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) =>
          p.startsWith("**") ? (
            <strong key={j}>{p.slice(2, -2)}</strong>
          ) : p.startsWith("`") ? (
            <code key={j} className="rounded bg-muted px-1 text-xs">
              {p.slice(1, -1)}
            </code>
          ) : (
            <span key={j}>{p}</span>
          )
        );
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

const SUGERENCIAS = [
  "¿Todos los pagos de esta semana están dentro del presupuesto?",
  "¿Cuánto llevamos ejercido por partida?",
  "Explícame la diferencia entre flujos programados y programaciones",
  "Programa 15 lotes por mes hasta completar 550",
];

export function RafaChat({ contextoPantalla, onAbrirPlan, compacto = false }: Props) {
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

  const cargarConversaciones = useCallback(async () => {
    try {
      setConversaciones(await listarConversaciones());
    } catch {
      setConversaciones([]);
    }
  }, []);

  const recargar = useCallback(async (id: string) => {
    const lista = await cargarMensajes(id);
    setMensajes(lista);
    const ids = lista.flatMap((m) => (m.datos?.herramientas || []).map((h) => h.accion?.id).filter(Boolean) as string[]);
    setAcciones(await estadoAcciones(Array.from(new Set(ids))));
  }, []);

  useEffect(() => {
    cargarConversaciones();
  }, [cargarConversaciones]);

  useEffect(() => {
    finRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [mensajes.length, enviando]);

  const abrir = async (id: string) => {
    setConversacionId(id);
    try {
      await recargar(id);
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo abrir la conversación", description: e instanceof Error ? e.message : "" });
    }
  };

  const nueva = () => {
    setConversacionId(null);
    setMensajes([]);
    setAcciones(new Map());
  };

  const enviar = async (mensajeDirecto?: string) => {
    const mensaje = (mensajeDirecto ?? texto).trim();
    if ((!mensaje && !audioBlob && archivos.length === 0) || enviando) return;
    setEnviando(true);
    const provisional: MensajeRafa = {
      id: `tmp-${Date.now()}`,
      rol: "usuario",
      contenido: mensaje || "(audio/archivos)",
      datos: { adjuntos: archivos.map((a) => a.name) },
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
      const r = await enviarMensaje({ conversacion_id: conversacionId, mensaje, contexto_pantalla: contextoPantalla, archivos: adjuntos, audio });
      setTexto("");
      setArchivos([]);
      setAudioBlob(null);
      setConversacionId(r.conversacion_id);
      await recargar(r.conversacion_id);
      cargarConversaciones();
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
    <div className={`flex gap-4 ${compacto ? "h-full" : "h-[calc(100vh-14rem)] min-h-[520px]"}`}>
      {!compacto && (
        <aside className="hidden w-60 shrink-0 flex-col gap-2 overflow-y-auto md:flex">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={nueva}>
            <MessageSquarePlus className="h-4 w-4" />
            Nueva conversación
          </Button>
          {conversaciones.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${c.id === conversacionId ? "border-primary bg-primary/5" : ""}`}
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => abrir(c.id)}>
                <span className="block truncate">{c.titulo}</span>
                <span className="text-xs text-muted-foreground">{formatDateObj(new Date(c.updated_at))}</span>
              </button>
              <button className="opacity-0 group-hover:opacity-100" onClick={() => borrar(c.id)} aria-label="Eliminar conversación">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {mensajes.length === 0 && !enviando && (
            <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
              <p>Pregúntame por presupuestos, programación, asientos, proyectos o cómo funciona el sistema.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => setTexto(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mensajes.map((m) =>
            m.rol === "usuario" ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                <p className="whitespace-pre-wrap">{m.contenido}</p>
                {(m.datos?.adjuntos || []).length > 0 && <p className="mt-1 text-xs opacity-80">Adjuntos: {(m.datos.adjuntos || []).join(", ")}</p>}
              </div>
            ) : (
              <div key={m.id} className="max-w-full space-y-1">
                <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-2">
                  <TextoRafa texto={m.contenido || ""} />
                </div>
                <ResultadosHerramientas
                  herramientas={m.datos?.herramientas || []}
                  acciones={acciones}
                  procesando={procesando}
                  onConfirmar={(a) => operar(a, "confirmar")}
                  onCancelar={(a) => operar(a, "cancelar")}
                  onAbrirPlan={onAbrirPlan}
                />
                {m.version_conocimiento && <p className="text-[10px] text-muted-foreground">Conocimiento {m.version_conocimiento}</p>}
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

        <div className="space-y-2 border-t p-3">
          {(contextoTexto || audioBlob || archivos.length > 0) && (
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
      </section>
    </div>
  );
}
