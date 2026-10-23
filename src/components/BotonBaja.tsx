import { useState } from "react";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { cambiarActivo, impactoBajaCentro, type EntidadBaja } from "@/lib/bajas";

const ETIQUETAS: Record<EntidadBaja, string> = {
  centro_negocio: "el centro",
  presupuesto: "la partida",
  tercero: "el tercero",
  cuenta: "la cuenta",
  proyecto: "el proyecto",
  empresa: "la empresa",
  unidad: "la unidad",
};

interface Props {
  entidad: EntidadBaja;
  id: string;
  nombre: string;
  activo: boolean;
  onCambio: () => void;
  /** Botón con texto (true) o solo ícono. */
  conTexto?: boolean;
}

/** Dar de baja / reactivar con confirmación. Los centros se dan de baja con sus partidas y proyecto. */
export function BotonBaja({ entidad, id, nombre, activo, onCambio, conTexto = false }: Props) {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [impacto, setImpacto] = useState<{ partidas: number; proyecto: string | null } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const accion = activo ? "Dar de baja" : "Reactivar";

  const abrir = async () => {
    setImpacto(null);
    setAbierto(true);
    if (entidad === "centro_negocio" && activo) setImpacto(await impactoBajaCentro(id).catch(() => null));
  };

  const confirmar = async () => {
    setProcesando(true);
    try {
      const r = await cambiarActivo(entidad, id, !activo, entidad === "centro_negocio");
      const extra = r.partidas || r.proyectos ? ` Con él: ${r.partidas} partida(s) y ${r.proyectos} proyecto(s).` : "";
      toast({ title: activo ? "Dado de baja" : "Reactivado", description: `${nombre}.${extra}` });
      setAbierto(false);
      onCambio();
    } catch (e) {
      toast({ variant: "destructive", title: `No se pudo ${accion.toLowerCase()}`, description: e instanceof Error ? e.message : "" });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={abrir} title={`${accion} ${ETIQUETAS[entidad]}`} aria-label={`${accion} ${nombre}`}>
        <Power className={`h-4 w-4 ${activo ? "" : "text-primary"}`} />
        {conTexto && <span className="ml-1">{accion}</span>}
      </Button>
      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accion} {ETIQUETAS[entidad]} {nombre}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {activo
                ? "Deja de aparecer en listas, selectores y en Rafa. Sus datos e historial se conservan y se puede reactivar."
                : "Vuelve a aparecer en listas, selectores y en Rafa."}
              {entidad === "centro_negocio" && activo && impacto && (impacto.partidas > 0 || impacto.proyecto) && (
                <>
                  {" "}También se darán de baja sus {impacto.partidas} partida(s) activas{impacto.proyecto ? ` y el proyecto ${impacto.proyecto}` : ""}; al reactivar el centro vuelven exactamente esos.
                </>
              )}
              {entidad === "centro_negocio" && !activo && " Se reactivan también las partidas y el proyecto que se dieron de baja con él."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={procesando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              disabled={procesando}
              className={activo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {accion}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
