import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Paperclip, Sparkles, X, Loader2 } from "lucide-react";

export interface CapturaPayload {
  texto: string;
  audio?: { data: string; format: string };
  archivos: { filename: string; mime: string; data: string }[];
}

interface Props {
  loading: boolean;
  onEnviar: (payload: CapturaPayload) => void;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function RafaCaptura({ loading, onEnviar }: Props) {
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const iniciarGrabacion = async () => {
    setError(null);
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
      setError("No se pudo acceder al micrófono. Puedes subir el audio como archivo o escribir la instrucción.");
    }
  };

  const detenerGrabacion = () => {
    recorderRef.current?.stop();
    setGrabando(false);
  };

  const enviar = async () => {
    const audioFile = archivos.find((f) => f.type.startsWith("audio/"));
    const adjuntos = archivos.filter((f) => !f.type.startsWith("audio/"));

    let audio: CapturaPayload["audio"];
    if (audioBlob) {
      audio = { data: await toBase64(audioBlob), format: audioBlob.type.includes("mp4") ? "m4a" : "webm" };
    } else if (audioFile) {
      const ext = (audioFile.name.split(".").pop() || "mp3").toLowerCase();
      audio = { data: await toBase64(audioFile), format: ext === "mp4" ? "m4a" : ext };
    }

    const archivosB64 = await Promise.all(
      adjuntos.map(async (f) => ({
        filename: f.name,
        mime: f.type || "application/pdf",
        data: await toBase64(f),
      }))
    );

    onEnviar({ texto, audio, archivos: archivosB64 });
  };

  const sinContenido = !texto.trim() && !audioBlob && archivos.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Dile a Rafa qué necesitas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ej: "Rafa, en la empresa Maq Rentable crea un centro de costo Pesquería, Nuevo León con los conceptos del archivo, sumando IVA, a ejercer en 4 meses con pagos semanales al contratista Alberto Delgado Moreno."'
        />

        <div className="flex flex-wrap items-center gap-2">
          {!grabando ? (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={iniciarGrabacion}>
              <Mic className="h-3.5 w-3.5" />
              Grabar instrucción
            </Button>
          ) : (
            <Button type="button" variant="destructive" size="sm" className="gap-1.5" onClick={detenerGrabacion}>
              <Square className="h-3.5 w-3.5" />
              Detener grabación
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" />
            Adjuntar archivos
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,audio/*"
            className="hidden"
            onChange={(e) => {
              setArchivos((prev) => [...prev, ...Array.from(e.target.files || [])]);
              e.target.value = "";
            }}
          />
        </div>

        {(audioBlob || archivos.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {audioBlob && (
              <Badge variant="secondary" className="gap-1.5">
                Audio grabado
                <button type="button" onClick={() => setAudioBlob(null)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {archivos.map((f, i) => (
              <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1.5">
                {f.name}
                <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={enviar} disabled={loading || sinContenido} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Rafa está analizando..." : "Interpretar instrucción"}
        </Button>
      </CardContent>
    </Card>
  );
}
