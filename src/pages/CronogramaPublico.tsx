import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProjectGantt, FilaGantt } from "@/components/proyectos/ProjectGantt";
import { exportarCronogramaPDF } from "@/lib/cronograma-pdf";
import { FolderKanban, Loader2 } from "lucide-react";

/**
 * Página pública (sin login) para compartir el cronograma de un Project con
 * terceros vía link. Consume únicamente la función get_cronograma_publico
 * (SECURITY DEFINER), que nunca expone montos, presupuesto ni programación
 * financiera — solo partidas, fechas y avance.
 */
export default function CronogramaPublico() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proyectoNombre, setProyectoNombre] = useState("");
  const [filas, setFilas] = useState<FilaGantt[]>([]);

  useEffect(() => {
    if (token) fetchCronograma(token);
  }, [token]);

  const fetchCronograma = async (t: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_cronograma_publico", { _token: t });
    if (error || !data || data.length === 0) {
      setError("Este link no es válido o fue revocado.");
      setLoading(false);
      return;
    }
    setProyectoNombre(data[0].proyecto_nombre);
    setFilas(
      data.map((d, i) => ({
        id: String(i),
        partida: d.partida,
        cuentaCodigo: d.cuenta_codigo || "",
        cuentaNombre: d.cuenta_nombre || undefined,
        fechaInicio: d.fecha_inicio,
        fechaFin: d.fecha_fin,
        avance: Number(d.avance),
        vencida: d.vencida,
      }))
    );
    setError(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
            <FolderKanban className="h-5 w-5" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold">{proyectoNombre}</h1>
        </div>

        <ProjectGantt
          filas={filas}
          acciones={{ onExportarPDF: () => exportarCronogramaPDF(proyectoNombre, null, filas) }}
        />
      </div>
    </div>
  );
}
