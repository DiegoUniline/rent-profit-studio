import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Empresa {
  id: string;
  tipo_persona: "fisica" | "moral";
  rfc: string;
  razon_social: string;
  nombre_comercial?: string | null;
  regimen_fiscal?: string | null;
  uso_cfdi?: string | null;
  calle?: string | null;
  numero_exterior?: string | null;
  numero_interior?: string | null;
  colonia?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  telefono_principal?: string | null;
  email_fiscal?: string | null;
  representante_legal?: string | null;
  banco?: string | null;
  numero_cuenta?: string | null;
  clabe?: string | null;
}

interface EmpresaViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: Empresa | null;
}

export function EmpresaViewDialog({ open, onOpenChange, empresa }: EmpresaViewDialogProps) {
  if (!empresa) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{empresa.razon_social}</DialogTitle>
          <DialogDescription>Detalles de la empresa</DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">RFC</p>
              <p className="font-mono">{empresa.rfc}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Tipo</p>
              <p>{empresa.tipo_persona === "moral" ? "Persona Moral" : "Persona Física"}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Régimen Fiscal</p>
              <p>{empresa.regimen_fiscal || "-"}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Uso CFDI</p>
              <p>{empresa.uso_cfdi || "-"}</p>
            </div>
          </div>
          
          <div className="border-t pt-4">
            <h4 className="mb-2 font-semibold">Dirección</h4>
            <p className="text-sm">
              {[empresa.calle, empresa.numero_exterior && `#${empresa.numero_exterior}`, empresa.numero_interior && `Int. ${empresa.numero_interior}`].filter(Boolean).join(" ") || "-"}
            </p>
            <p className="text-sm">
              {[empresa.colonia, empresa.codigo_postal && `C.P. ${empresa.codigo_postal}`].filter(Boolean).join(", ") || "-"}
            </p>
            <p className="text-sm">
              {[empresa.ciudad, empresa.estado].filter(Boolean).join(", ") || "-"}
            </p>
          </div>
          
          <div className="border-t pt-4">
            <h4 className="mb-2 font-semibold">Contacto</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Teléfono</p>
                <p>{empresa.telefono_principal || "-"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Email</p>
                <p>{empresa.email_fiscal || "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="font-medium text-muted-foreground">Representante Legal</p>
                <p>{empresa.representante_legal || "-"}</p>
              </div>
            </div>
          </div>
          
          <div className="border-t pt-4">
            <h4 className="mb-2 font-semibold">Datos Bancarios</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Banco</p>
                <p>{empresa.banco || "-"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Cuenta</p>
                <p>{empresa.numero_cuenta || "-"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">CLABE</p>
                <p className="font-mono text-xs">{empresa.clabe || "-"}</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
