// COBRO · cuánto paga un vehículo al salir. Vive aparte del registro (ADR-003): si esta
// cuenta falla, el carro sale igual y el cobro queda pendiente para revisarlo en caja.

const TARIFA_POR_DEFECTO = 3000; // pesos por hora o fracción

let tarifaPorHora = TARIFA_POR_DEFECTO;

// Una tarifa mal configurada (null, 0, texto) es una falla real de este módulo, no un simulacro.
export function configurarTarifa(valor = TARIFA_POR_DEFECTO) {
  tarifaPorHora = valor;
}

export function tarifaActual() {
  return tarifaPorHora;
}

export function calcularCobro({ placa, entrada, salida }) {
  if (!Number.isFinite(tarifaPorHora) || tarifaPorHora <= 0) {
    throw new Error('La tarifa no está configurada: no se pudo calcular el cobro de ' + placa + '.');
  }
  const minutos = Math.max(0, Math.round((salida - entrada) / 60000));
  const horas = Math.max(1, Math.ceil(minutos / 60));
  return { placa, minutos, horas, valor: horas * tarifaPorHora };
}
