// Aplica el plan confirmado de Rafa: crea (si hace falta) centro de negocio y
// tercero, guarda las partidas de presupuesto y programa los flujos de efectivo.
// Si la sesión ya se había guardado antes, ACTUALIZA lo existente en vez de
// duplicarlo (usa propuesta.aplicado como rastro de lo ya creado).

import { supabase } from "@/integrations/supabase/client";
import { calcularFechasPorFrecuencia, distribuirSaldoEntrePeriodos } from "@/lib/project-utils";
import {
  aplicarFormatoTexto,
  importePartida,
  precioUnitarioFinal,
  type PropuestaEditable,
} from "@/lib/rafa-types";

export interface ResultadoAplicar {
  centroId: string;
  terceroId: string | null;
  partidasCreadas: number;
  partidasActualizadas: number;
  flujosCreados: number;
  /** Propuesta con el rastro de lo guardado, para persistir en la sesión. */
  propuesta: PropuestaEditable;
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

  const formato = p.formatoTexto || "original";

  // 1. Centro de negocio
  let centroId = p.centro.modo === "existente" ? p.centro.id : p.aplicado?.centroId || "";
  if (p.centro.modo === "nuevo") {
    if (!p.centro.nombre.trim()) throw new Error("Escribe el nombre del centro de negocio.");
    if (centroId) {
      // Ya se había creado en un guardado previo: se actualiza, no se duplica.
      const { error } = await supabase
        .from("centros_negocio")
        .update({ nombre: p.centro.nombre.trim(), tipo_actividad: p.centro.tipoActividad || null })
        .eq("id", centroId);
      if (error) throw new Error(`No se pudo actualizar el centro de negocio: ${error.message}`);
    } else {
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
  }
  if (!centroId) throw new Error("Selecciona o crea un centro de negocio.");

  // 2. Tercero (contratista)
  let terceroId: string | null = p.tercero.modo === "ninguno" ? null : p.tercero.id || null;
  if (p.tercero.modo === "nuevo") {
    const previo = p.aplicado?.terceroId || null;
    if (!p.tercero.nombre.trim()) throw new Error("Escribe el nombre del tercero.");
    if (previo) {
      const { error } = await supabase
        .from("terceros")
        .update({ razon_social: p.tercero.nombre.trim() })
        .eq("id", previo);
      if (error) throw new Error(`No se pudo actualizar el tercero: ${error.message}`);
      terceroId = previo;
    } else {
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
  }

  // 3. Partidas de presupuesto: actualizar las que ya existen, insertar las nuevas
  const ordenBase = await siguienteOrdenPresupuesto(p.empresaId);
  const partidas = p.partidas.map((partida) => ({
    ...partida,
    descripcion: aplicarFormatoTexto(partida.descripcion, formato),
  }));

  const fila = (partida: (typeof partidas)[number], i: number) => ({
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
  });

  const idsFinales: (string | undefined)[] = [];
  let actualizadas = 0;
  let creadas = 0;

  for (let i = 0; i < partidas.length; i++) {
    const partida = partidas[i];
    if (partida.presupuestoId) {
      const { partida: texto, cuenta_id, tercero_id, cantidad, precio_unitario, notas, centro_negocio_id } = fila(partida, i);
      const { error } = await supabase
        .from("presupuestos")
        .update({ partida: texto, cuenta_id, tercero_id, cantidad, precio_unitario, notas, centro_negocio_id })
        .eq("id", partida.presupuestoId);
      if (error) throw new Error(`No se pudo actualizar la partida: ${error.message}`);
      idsFinales.push(partida.presupuestoId);
      actualizadas++;
    } else {
      const { data, error } = await supabase.from("presupuestos").insert(fila(partida, i)).select("id").single();
      if (error) throw new Error(`No se pudo crear la partida: ${error.message}`);
      idsFinales.push(data.id);
      creadas++;
    }
  }

  // Partidas que estaban guardadas y el usuario eliminó de la propuesta: se dan de baja.
  const vigentes = new Set(idsFinales.filter(Boolean) as string[]);
  const sobrantes = (p.aplicado?.presupuestoIds || []).filter((id) => !vigentes.has(id));
  if (sobrantes.length > 0) {
    await supabase.from("flujos_programados").delete().in("presupuesto_id", sobrantes);
    await supabase.from("presupuestos").update({ activo: false }).in("id", sobrantes);
  }

  // 4. Flujos programados por partida (se regeneran sobre las partidas vigentes)
  const idsVigentes = Array.from(vigentes);
  if (idsVigentes.length > 0) {
    const { error: errDel } = await supabase
      .from("flujos_programados")
      .delete()
      .in("presupuesto_id", idsVigentes)
      .eq("auto_generado", false);
    if (errDel) throw new Error(`No se pudieron limpiar los flujos anteriores: ${errDel.message}`);
  }

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

  partidas.forEach((partida, i) => {
    const presupuestoId = idsFinales[i];
    if (!presupuestoId) return;
    const total = importePartida(partida, p.ivaIncluir, p.ivaTasa);
    const montos = distribuirSaldoEntrePeriodos(total, fechas.length);
    fechas.forEach((fecha, j) => {
      if (montos[j] <= 0) return;
      flujos.push({
        presupuesto_id: presupuestoId,
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

  const propuesta: PropuestaEditable = {
    ...p,
    centro: { ...p.centro, id: centroId },
    tercero: { ...p.tercero, id: terceroId || "" },
    partidas: p.partidas.map((partida, i) => ({
      ...partida,
      descripcion: partidas[i].descripcion,
      presupuestoId: idsFinales[i],
    })),
    aplicado: { centroId, terceroId, presupuestoIds: idsVigentes },
  };

  return {
    centroId,
    terceroId,
    partidasCreadas: creadas,
    partidasActualizadas: actualizadas,
    flujosCreados: flujos.length,
    propuesta,
  };
}
