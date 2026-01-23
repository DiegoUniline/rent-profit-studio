import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tercero } from "@/pages/Terceros";

interface TerceroViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tercero: Tercero | null;
}

const tipoLabels: Record<string, string> = {
  cliente: "Cliente",
  proveedor: "Proveedor",
  ambos: "Cliente/Proveedor",
};

export function TerceroViewDialog({
  open,
  onOpenChange,
  tercero,
}: TerceroViewDialogProps) {
  if (!tercero) return null;

  const address = [
    tercero.calle,
    tercero.numero_exterior && `No. ${tercero.numero_exterior}`,
    tercero.numero_interior && `Int. ${tercero.numero_interior}`,
    tercero.colonia && `Col. ${tercero.colonia}`,
    tercero.codigo_postal && `C.P. ${tercero.codigo_postal}`,
    tercero.ciudad,
    tercero.estado,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tercero.razon_social}
            <Badge variant={tercero.activo ? "default" : "secondary"}>
              {tercero.activo ? "Activo" : "Inactivo"}
            </Badge>
          </DialogTitle>
          <DialogDescription>{tercero.rfc}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {/* Datos Generales */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Datos Generales</h4>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Tipo:</span>
                <span>
                  <Badge variant="outline">{tipoLabels[tercero.tipo]}</Badge>
                </span>
                <span className="text-muted-foreground">Empresa:</span>
                <span>{tercero.empresas?.razon_social || "-"}</span>
                {tercero.nombre_comercial && (
                  <>
                    <span className="text-muted-foreground">Nombre Comercial:</span>
                    <span>{tercero.nombre_comercial}</span>
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Dirección */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Dirección</h4>
              <p className="text-sm">{address || "-"}</p>
            </div>

            <Separator />

            {/* Contacto */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Contacto</h4>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Teléfono:</span>
                <span>{tercero.telefono || "-"}</span>
                <span className="text-muted-foreground">Email:</span>
                <span>{tercero.email || "-"}</span>
                <span className="text-muted-foreground">Contacto:</span>
                <span>{tercero.contacto_nombre || "-"}</span>
              </div>
            </div>

            <Separator />

            {/* Datos Bancarios */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Datos Bancarios</h4>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Banco:</span>
                <span>{tercero.banco || "-"}</span>
                <span className="text-muted-foreground">Cuenta:</span>
                <span>{tercero.numero_cuenta || "-"}</span>
                <span className="text-muted-foreground">CLABE:</span>
                <span>{tercero.clabe || "-"}</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
