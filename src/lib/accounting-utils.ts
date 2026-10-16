// Utilidades para cálculos contables. Las fórmulas base viven en
// supabase/functions/_shared/negocio/contabilidad.ts (compartidas con Rafa).
import {
  getRubroPrincipal,
  type SaldoCuenta,
} from "../../supabase/functions/_shared/negocio/contabilidad";

export type {
  CuentaContable,
  Movimiento,
  AsientoContable,
  SaldoCuenta,
} from "../../supabase/functions/_shared/negocio/contabilidad";
export {
  getRubroPrincipal,
  esNaturalezaDeudora,
  calcularSaldoFinal,
  calcularSaldosCuentas,
} from "../../supabase/functions/_shared/negocio/contabilidad";

export interface RubroAgrupado {
  codigo: string;
  nombre: string;
  cuentas: SaldoCuenta[];
  total: number;
}

// Agrupa cuentas por rubro para reportes
export function agruparPorRubro(saldos: SaldoCuenta[]): Record<string, SaldoCuenta[]> {
  const grupos: Record<string, SaldoCuenta[]> = {
    ACTIVO: [],
    PASIVO: [],
    CAPITAL: [],
    INGRESOS: [],
    COSTOS: [],
    GASTOS: [],
    OTROS: [],
  };
  
  saldos.forEach(saldo => {
    const rubro = getRubroPrincipal(saldo.codigo);
    if (grupos[rubro]) {
      grupos[rubro].push(saldo);
    } else {
      grupos.OTROS.push(saldo);
    }
  });
  
  // Ordenar cada grupo por código
  Object.keys(grupos).forEach(key => {
    grupos[key].sort((a, b) => a.codigo.localeCompare(b.codigo));
  });
  
  return grupos;
}

// Calcula totales por rubro
export function calcularTotalesPorRubro(grupos: Record<string, SaldoCuenta[]>): Record<string, number> {
  const totales: Record<string, number> = {};
  
  Object.keys(grupos).forEach(rubro => {
    // Solo sumar cuentas de tipo "saldo" (no títulos)
    totales[rubro] = grupos[rubro]
      .filter(c => c.clasificacion === 'saldo')
      .reduce((sum, c) => sum + c.saldo_final, 0);
  });
  
  return totales;
}

// Calcula la utilidad del período (Ingresos - Costos - Gastos)
export function calcularUtilidad(totales: Record<string, number>): number {
  const ingresos = totales.INGRESOS || 0;
  const costos = totales.COSTOS || 0;
  const gastos = totales.GASTOS || 0;
  
  return ingresos - costos - gastos;
}

// Formatea un número como moneda
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value);
}

// Obtiene subrubros de un rubro principal
export function getSubrubros(saldos: SaldoCuenta[], rubroPrincipal: string): RubroAgrupado[] {
  const cuentasRubro = saldos.filter(s => getRubroPrincipal(s.codigo) === rubroPrincipal);
  
  // Agrupar por cuenta de nivel 1 (primer segmento del código)
  const subrubrosMap = new Map<string, SaldoCuenta[]>();
  
  cuentasRubro.forEach(cuenta => {
    // Obtener el código del nivel 1 (ej: "100" de "100-001-001")
    const codigoNivel1 = cuenta.codigo.split('-')[0];
    
    if (!subrubrosMap.has(codigoNivel1)) {
      subrubrosMap.set(codigoNivel1, []);
    }
    subrubrosMap.get(codigoNivel1)!.push(cuenta);
  });
  
  // Convertir a array de RubroAgrupado
  const subrubros: RubroAgrupado[] = [];
  subrubrosMap.forEach((cuentas, codigo) => {
    // Buscar el nombre del título de nivel 1
    const titulo = cuentas.find(c => c.clasificacion === 'titulo' && c.nivel === 1);
    
    subrubros.push({
      codigo,
      nombre: titulo?.nombre || codigo,
      cuentas: cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo)),
      total: cuentas
        .filter(c => c.clasificacion === 'saldo')
        .reduce((sum, c) => sum + c.saldo_final, 0),
    });
  });
  
  return subrubros.sort((a, b) => a.codigo.localeCompare(b.codigo));
}
