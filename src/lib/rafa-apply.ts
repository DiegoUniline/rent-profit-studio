// Aplica el plan confirmado de Rafa: crea (si hace falta) centro de negocio y
// tercero, inserta las partidas de presupuesto y programa los flujos de efectivo.

import { supabase } from "@/integrations/supabase/client";
import { calcularFechasPorFrecuencia, distribuirSaldoEntrePeriodos } from "@/lib/project-utils";
import { importePartida, precioUnitarioFinal, type PropuestaEditable } from "@/lib/rafa-types";

export interface ResultadoAplicar {
  centroId: string;
  terceroId: string | null;
  partidasCreadas: number;
  flujosCreados: number;
}

async function siguienteCodigoCentro(empresaId: string): Promise<string> {
  const { data } = await supabase.from("centros_negocio").select("codigo").eq("empresa_id", empresaId);
  const max = (data || []).reduce((m, c) => {
    const n = parseInt(String(c.codigo).replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1).padStart(3, "0");
}

async function siguienteOrdenPresupuesto(empresaId: string): Promise<number> {
  const { data } = await supabase
    .from("presupuestos")
    .select("orden")
    .eq("empresa_id", empresaId)
    .order("orden", { ascending: false })
    .limit(1);
  return (data?.[0]?.orden ?? 0) + 1;
}

export async function aplicarPlanRafa(p: PropuestaEditable): Promise<ResultadoAplicar> {
  if (!p.empresaId) throw new Error("Selecciona la empresa.");
  if (p.partidas.length === 0) throw new Error("No hay partidas que guardar.");

  // 1. Centro de negocio
  let centroId = p.centro.id;
  if (p.centro.modo === "nuevo") {
    if (!p.centro.nombre.trim()) throw new Error("Escribe el nombre del centro de negocio.");
    const codigo = await siguienteCodigoCentro(p.empresaId);
    const { data, error } = await supabase
      .from("centros_negocio")
      .insert({
        empresa_id: p.empresaId,
        codigo,
        nombre: p.centro.nombre.trim(),
        tipo_actividad: p.centro.tipoActividad || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear el centro de negocio: ${error.message}`);
    centroId = data.id;
  }
  if (!centroId) throw new Error("Selecciona o crea un centro de negocio.");

  // 2. Tercero (contratista)
  let terceroId: string | null = p.tercero.modo === "ninguno" ? null : p.tercero.id || null;
  if (p.tercero.modo === "nuevo") {
    if (!p.tercero.nombre.trim()) throw new Error("Escribe el nombre del tercero.");
    const { data, error } = await supabase
      .from("terceros")
      .insert({
        empresa_id: p.empresaId,
        tipo: p.programacion.tipo === "ingreso" ? "cliente" : "proveedor",
        rfc: "XAXX010101000",
        razon_social: p.tercero.nombre.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear el tercero: ${error.message}`);
    terceroId = data.id;
  }

  // 3. Partidas de presupuesto
  const ordenBase = await siguienteOrdenPresupuesto(p.empresaId);
  const filas = p.partidas.map((partida, i) => ({
    empresa_id: p.empresaId,
    centro_negocio_id: centroId!,
    cuenta_id: partida.cuentaId || null,
    tercero_id: terceroId,
    partida: partida.descripcion.trim().slice(0, 500),
    cantidad: partida.cantidad,
    precio_unitario: Number(precioUnitarioFinal(partida, p.ivaIncluir, p.ivaTasa).toFixed(4)),
    notas: partida.unidad ? `Unidad: ${partida.unidad}` : null,
    orden: ordenBase + i,
    activo: true,
  }));

  const { data: creadas, error: errPart } = await supabase.from("presupuestos").insert(filas).select("id");
  if (errPart) throw new Error(`No se pudieron crear las partidas: ${errPart.message}`);

  // 4. Flujos programados por partida
  const fechas = calcularFechasPorFrecuencia(
    new Date(p.programacion.fechaInicio + "T00:00:00"),
    p.programacion.frecuencia,
    p.programacion.numeroPagos
  );

  const flujos: {
    presupuesto_id: string;
    empresa_id: string;
    fecha: string;
    monto: number;
    tipo: string;
    descripcion: string;
  }[] = [];

  (creadas || []).forEach((row, i) => {
    const partida = p.partidas[i];
    const total = importePartida(partida, p.ivaIncluir, p.ivaTasa);
    const montos = distribuirSaldoEntrePeriodos(total, fechas.length);
    fechas.forEach((fecha, j) => {
      if (montos[j] <= 0) return;
      flujos.push({
        presupuesto_id: row.id,
        empresa_id: p.empresaId,
        fecha: fecha.toISOString().slice(0, 10),
        monto: montos[j],
        tipo: p.programacion.tipo,
        descripcion: `Rafa · pago ${j + 1}/${fechas.length} · ${partida.descripcion.slice(0, 80)}`,
      });
    });
  });

  if (flujos.length > 0) {
    for (let i = 0; i < flujos.length; i += 500) {
      const { error } = await supabase.from("flujos_programados").insert(flujos.slice(i, i + 500));
      if (error) throw new Error(`No se pudieron crear los flujos: ${error.message}`);
    }
  }

  return { centroId: centroId!, terceroId, partidasCreadas: filas.length, flujosCreados: flujos.length };
}
