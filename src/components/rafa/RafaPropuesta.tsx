import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateInput } from "@/components/ui/date-input";
import { RafaPartidasTable } from "@/components/rafa/RafaPartidasTable";
import { formatCurrency } from "@/lib/accounting-utils";
import { formatDateObj } from "@/lib/date-utils";
import { calcularFechasPorFrecuencia, distribuirSaldoEntrePeriodos, type FrecuenciaConCadencia } from "@/lib/project-utils";
import { aplicarFormatoTexto, FORMATOS_TEXTO, importePartida, type FormatoTexto, type PropuestaEditable } from "@/lib/rafa-types";
import { Check, Loader2, RotateCcw } from "lucide-react";
import rafaAvatar from "@/assets/rafa-avatar.png";

interface Props {
  resumen: string;
  transcripcion?: string;
  propuesta: PropuestaEditable;
  empresas: { id: string; nombre: string }[];
  centros: { id: string; nombre: string; empresa_id: string; codigo?: string }[];
  terceros: { id: string; nombre: string; empresa_id: string }[];
  cuentas: { id: string; codigo: string; nombre: string; empresa_id: string }[];
  guardando: boolean;
  soloLectura?: boolean;
  yaGuardado?: boolean;
  onChange: (p: PropuestaEditable) => void;
  onAplicar: () => void;
  onReiniciar: () => void;
}

const FRECUENCIAS: FrecuenciaConCadencia[] = ["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"];

export function RafaPropuesta({
  resumen,
  transcripcion,
  propuesta,
  empresas,
  centros,
  terceros,
  cuentas,
  guardando,
  soloLectura = false,
  yaGuardado = false,
  onChange,
  onAplicar,
  onReiniciar,
}: Props) {
  const set = (cambios: Partial<PropuestaEditable>) => onChange({ ...propuesta, ...cambios });

  const centrosEmpresa = centros.filter((c) => c.empresa_id === propuesta.empresaId);
  const tercerosEmpresa = terceros.filter((t) => t.empresa_id === propuesta.empresaId);
  const cuentasEmpresa = cuentas.filter((c) => c.empresa_id === propuesta.empresaId);

  const total = propuesta.partidas.reduce((s, p) => s + importePartida(p, propuesta.ivaIncluir, propuesta.ivaTasa), 0);
  const fechas = propuesta.programacion.fechaInicio
    ? calcularFechasPorFrecuencia(
        new Date(propuesta.programacion.fechaInicio + "T00:00:00"),
        propuesta.programacion.frecuencia,
        propuesta.programacion.numeroPagos
      )
    : [];
  const montos = distribuirSaldoEntrePeriodos(total, fechas.length);

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-3 flex-row items-center gap-3 space-y-0">
          <img
            src={rafaAvatar}
            alt="Rafa"
            loading="lazy"
            width={816}
            height={816}
            className="h-10 w-10 rounded-full object-cover object-top bg-primary/10 ring-2 ring-primary/30"
          />
          <CardTitle className="text-base">Rafa entendió esto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{resumen}</p>
          {transcripcion && (
            <p className="text-muted-foreground italic border-l-2 border-primary/40 pl-3">“{transcripcion}”</p>
          )}
          <p className="text-xs text-muted-foreground">
            {yaGuardado
              ? "Esta interpretación ya está guardada: al confirmar se actualizan las partidas y flujos existentes, no se duplican."
              : "Nada se guarda hasta que confirmes. Revisa y ajusta las coincidencias sugeridas."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coincidencias</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <SearchableSelect
              value={propuesta.empresaId}
              onValueChange={(v) =>
                set({
                  empresaId: v,
                  centro: { ...propuesta.centro, modo: "nuevo", id: "" },
                  tercero: { ...propuesta.tercero, modo: propuesta.tercero.nombre ? "nuevo" : "ninguno", id: "" },
                  partidas: propuesta.partidas.map((p) => ({ ...p, cuentaId: "" })),
                })
              }
              options={empresas.map((e) => ({ id: e.id, label: e.nombre }))}
              placeholder="Selecciona empresa"
              searchPlaceholder="Buscar empresa..."
              emptyMessage="Sin empresas"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Centro de negocio</Label>
              <Badge variant={propuesta.centro.modo === "nuevo" ? "default" : "secondary"} className="text-[10px]">
                {propuesta.centro.modo === "nuevo" ? "Se creará" : "Existente"}
              </Badge>
            </div>
            {propuesta.centro.modo === "existente" ? (
              <SearchableSelect
                value={propuesta.centro.id}
                onValueChange={(v) => set({ centro: { ...propuesta.centro, id: v } })}
                options={centrosEmpresa.map((c) => ({ id: c.id, label: c.nombre, sublabel: c.codigo }))}
                placeholder="Selecciona centro"
                searchPlaceholder="Buscar centro..."
                emptyMessage="Sin centros"
              />
            ) : (
              <Input
                value={propuesta.centro.nombre}
                onChange={(e) => set({ centro: { ...propuesta.centro, nombre: e.target.value } })}
                placeholder="Nombre del nuevo centro"
              />
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() =>
                set({
                  centro: { ...propuesta.centro, modo: propuesta.centro.modo === "nuevo" ? "existente" : "nuevo" },
                })
              }
            >
              {propuesta.centro.modo === "nuevo" ? "Usar uno existente" : "Crear uno nuevo"}
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Tercero (contratista)</Label>
              <Badge
                variant={propuesta.tercero.modo === "nuevo" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {propuesta.tercero.modo === "nuevo" ? "Se creará" : propuesta.tercero.modo === "ninguno" ? "Sin tercero" : "Existente"}
              </Badge>
            </div>
            {propuesta.tercero.modo === "existente" ? (
              <SearchableSelect
                value={propuesta.tercero.id}
                onValueChange={(v) => set({ tercero: { ...propuesta.tercero, id: v } })}
                options={tercerosEmpresa.map((t) => ({ id: t.id, label: t.nombre }))}
                placeholder="Selecciona tercero"
                searchPlaceholder="Buscar tercero..."
                emptyMessage="Sin terceros"
              />
            ) : (
              <Input
                value={propuesta.tercero.nombre}
                onChange={(e) =>
                  set({ tercero: { ...propuesta.tercero, nombre: e.target.value, modo: e.target.value ? "nuevo" : "ninguno" } })
                }
                placeholder="Nombre del contratista"
              />
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() =>
                set({
                  tercero: { ...propuesta.tercero, modo: propuesta.tercero.modo === "existente" ? "nuevo" : "existente" },
                })
              }
            >
              {propuesta.tercero.modo === "existente" ? "Crear uno nuevo" : "Usar uno existente"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Partidas del presupuesto</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Formato global</span>
              <Select
                value={propuesta.formatoTexto || "original"}
                onValueChange={(v: FormatoTexto) =>
                  set({
                    formatoTexto: v,
                    partidas: propuesta.partidas.map((p) => ({ ...p, descripcion: aplicarFormatoTexto(p.descripcion, v) })),
                  })
                }
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Como viene" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {FORMATOS_TEXTO.map((f) => (
                    <SelectItem key={f.valor} value={f.valor} className="text-xs">{f.etiqueta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El formato elegido se aplica a todas las partidas de la propuesta, incluidas las que edites manualmente.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={propuesta.ivaIncluir} onCheckedChange={(v) => set({ ivaIncluir: v })} id="rafa-iva" />
              <Label htmlFor="rafa-iva" className="text-xs">Sumar IVA</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs whitespace-nowrap">Tasa IVA %</Label>
              <Input
                type="number"
                className="h-9 w-24"
                value={propuesta.ivaTasa}
                disabled={!propuesta.ivaIncluir}
                onChange={(e) => set({ ivaTasa: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RafaPartidasTable
            partidas={propuesta.partidas}
            cuentas={cuentasEmpresa}
            ivaIncluir={propuesta.ivaIncluir}
            ivaTasa={propuesta.ivaTasa}
            formatoTexto={propuesta.formatoTexto || "original"}
            onChange={(partidas) => set({ partidas })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Programación de flujo de efectivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={propuesta.programacion.tipo}
                onValueChange={(v: "ingreso" | "egreso") => set({ programacion: { ...propuesta.programacion, tipo: v } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="egreso">Egreso</SelectItem>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frecuencia</Label>
              <Select
                value={propuesta.programacion.frecuencia}
                onValueChange={(v: FrecuenciaConCadencia) => set({ programacion: { ...propuesta.programacion, frecuencia: v } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FRECUENCIAS.map((f) => (
                    <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Primer pago</Label>
              <DateInput
                value={propuesta.programacion.fechaInicio ? new Date(propuesta.programacion.fechaInicio + "T00:00:00") : undefined}
                onChange={(d) =>
                  set({
                    programacion: {
                      ...propuesta.programacion,
                      fechaInicio: d ? formatISO(d) : "",
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Número de pagos</Label>
              <Input
                type="number"
                min={1}
                value={propuesta.programacion.numeroPagos}
                onChange={(e) => set({ programacion: { ...propuesta.programacion, numeroPagos: Number(e.target.value) } })}
              />
            </div>
          </div>

          {fechas.length > 0 && (
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground mb-2">
                {fechas.length} pagos · total {formatCurrency(total)}
              </p>
              <div className="flex flex-wrap gap-2">
                {fechas.map((f, i) => (
                  <Badge key={i} variant="outline" className="font-normal">
                    {formatDateObj(f)} · {formatCurrency(montos[i])}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onAplicar} disabled={guardando || soloLectura} className="gap-1.5">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {yaGuardado ? "Actualizar lo guardado" : "Confirmar y guardar"}
        </Button>
        {soloLectura && (
          <p className="self-center text-xs text-muted-foreground">
            Solo los usuarios con permiso para editar presupuestos pueden guardar.
          </p>
        )}
        <Button variant="outline" onClick={onReiniciar} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Empezar de nuevo
        </Button>
      </div>
    </div>
  );
}

function formatISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}
