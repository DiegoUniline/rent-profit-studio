// Cálculos contables puros compartidos por los reportes de la aplicación
// (src/lib/accounting-utils.ts los reexporta) y por las herramientas de Rafa.


export interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
  naturaleza: 'deudora' | 'acreedora';
  clasificacion: 'titulo' | 'saldo';
  nivel: number;
  cuenta_padre_id: string | null;
  activa: boolean;
}

export interface Movimiento {
  id: string;
  asiento_id: string;
  cuenta_id: string;
  debe: number;
  haber: number;
  partida: string;
  orden: number;
}

export interface AsientoContable {
  id: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso' | 'diario';
  estado: 'borrador' | 'aplicado' | 'cancelado';
  empresa_id: string;
}

export interface SaldoCuenta {
  cuenta_id: string;
  codigo: string;
  nombre: string;
  naturaleza: 'deudora' | 'acreedora';
  clasificacion: 'titulo' | 'saldo';
  nivel: number;
  saldo_inicial: number;
  debe: number;
  haber: number;
  saldo_final: number;
}

// Determina el rubro principal de una cuenta basándose en su código
export function getRubroPrincipal(codigo: string): string {
  const primerDigito = codigo.charAt(0);
  switch (primerDigito) {
    case '1': return 'ACTIVO';
    case '2': return 'PASIVO';
    case '3': return 'CAPITAL';
    case '4': return 'INGRESOS';
    case '5': return 'COSTOS';
    case '6': return 'GASTOS';
    case '7': return 'OTROS';
    default: return 'OTROS';
  }
}

// Determina si una cuenta es de naturaleza deudora según su código
export function esNaturalezaDeudora(codigo: string): boolean {
  const primerDigito = codigo.charAt(0);
  // Activo (1), Costos (5), Gastos (6) son deudoras
  return ['1', '5', '6'].includes(primerDigito);
}

// Calcula el saldo final según la naturaleza de la cuenta
export function calcularSaldoFinal(
  saldoInicial: number,
  debe: number,
  haber: number,
  naturaleza: 'deudora' | 'acreedora'
): number {
  if (naturaleza === 'deudora') {
    // Para cuentas deudoras: saldo aumenta con débitos, disminuye con créditos
    return saldoInicial + debe - haber;
  } else {
    // Para cuentas acreedoras: saldo aumenta con créditos, disminuye con débitos
    return saldoInicial - debe + haber;
  }
}

// Calcula los saldos de todas las cuentas para un período
export function calcularSaldosCuentas(
  cuentas: CuentaContable[],
  movimientos: Movimiento[],
  asientos: AsientoContable[],
  fechaInicio: Date | null,
  fechaFin: Date
): SaldoCuenta[] {
  // Filtrar solo asientos aplicados
  const asientosAplicados = asientos.filter(a => a.estado === 'aplicado');
  const asientosIds = new Set(asientosAplicados.map(a => a.id));
  
  // Crear mapa de asientos para acceder a fechas
  const asientoMap = new Map(asientosAplicados.map(a => [a.id, a]));
  
  // Filtrar movimientos de asientos aplicados
  const movimientosValidos = movimientos.filter(m => asientosIds.has(m.asiento_id));
  
  // Separar movimientos en anteriores al período (para saldo inicial) y del período
  const movimientosAnteriores: Movimiento[] = [];
  const movimientosPeriodo: Movimiento[] = [];
  
  movimientosValidos.forEach(mov => {
    const asiento = asientoMap.get(mov.asiento_id);
    if (!asiento) return;
    
    const fechaAsiento = new Date(asiento.fecha + "T00:00:00");
    
    if (fechaInicio && fechaAsiento < fechaInicio) {
      movimientosAnteriores.push(mov);
    } else if (fechaAsiento <= fechaFin) {
      movimientosPeriodo.push(mov);
    }
  });
  
  // Calcular saldos por cuenta
  return cuentas.map(cuenta => {
    // Calcular saldo inicial (movimientos anteriores al período)
    let saldoInicial = 0;
    movimientosAnteriores
      .filter(m => m.cuenta_id === cuenta.id)
      .forEach(m => {
        if (cuenta.naturaleza === 'deudora') {
          saldoInicial += Number(m.debe) - Number(m.haber);
        } else {
          saldoInicial += Number(m.haber) - Number(m.debe);
        }
      });
    
    // Calcular movimientos del período
    let debe = 0;
    let haber = 0;
    movimientosPeriodo
      .filter(m => m.cuenta_id === cuenta.id)
      .forEach(m => {
        debe += Number(m.debe);
        haber += Number(m.haber);
      });
    
    // Calcular saldo final
    const saldoFinal = calcularSaldoFinal(saldoInicial, debe, haber, cuenta.naturaleza);
    
    return {
      cuenta_id: cuenta.id,
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      naturaleza: cuenta.naturaleza,
      clasificacion: cuenta.clasificacion,
      nivel: cuenta.nivel,
      saldo_inicial: saldoInicial,
      debe,
      haber,
      saldo_final: saldoFinal,
    };
  });
}
