import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateObj } from "@/lib/date-utils";
import { FolderOpen, Trash2 } from "lucide-react";

export interface SesionRafa {
  id: string;
  titulo: string;
  resumen: string | null;
  estado: string;
  updated_at: string;
}

interface Props {
  sesiones: SesionRafa[];
  activaId: string | null;
  onAbrir: (id: string) => void;
  onEliminar: (id: string) => void;
}

export function RafaSesiones({ sesiones, activaId, onAbrir, onEliminar }: Props) {
  if (sesiones.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Interpretaciones guardadas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sesiones.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
              s.id === activaId ? "border-primary bg-primary/5" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{s.titulo}</span>
                <Badge variant={s.estado === "aplicado" ? "default" : "secondary"} className="shrink-0">
                  {s.estado === "aplicado" ? "Aplicada" : "Borrador"}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDateObj(new Date(s.updated_at))} · {s.resumen || "Sin resumen"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onAbrir(s.id)}>
              <FolderOpen className="mr-1 h-4 w-4" />
              Abrir
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEliminar(s.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
