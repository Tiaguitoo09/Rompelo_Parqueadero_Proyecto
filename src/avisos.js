// AVISOS · le cuenta a la gente lo que pasó: al cliente, que su carro entró o salió; al
// operario, que el piso se llenó. Solo cuenta, nunca cambia nada (ADR-004, R4): no conoce los
// cupos ni el registro, trabaja con la copia de datos que le entregan.
// Es el módulo menos confiable: depende de un servidor de correo que se cae solo.

let bandeja = [];
let correoDisponible = true;

// El servidor de correo es externo; aquí se simula para poder tumbarlo a propósito.
export function simularCaidaDelCorreo(caido) {
  correoDisponible = !caido;
}

export function correoCaido() {
  return !correoDisponible;
}

export function reiniciarAvisos() {
  bandeja = [];
  correoDisponible = true;
}

export function avisarEntrada({ placa, cupo, hora, libres }) {
  enviar('Cliente ' + placa, 'Su vehículo entró al cupo ' + cupo + ' a las ' + formatoHora(hora) + '.');
  if (libres === 0) enviar('Operario', 'Parqueadero lleno: no quedan cupos libres.');
}

export function avisarSalida({ placa, cupo, hora }) {
  enviar('Cliente ' + placa, 'Su vehículo salió del cupo ' + cupo + ' a las ' + formatoHora(hora) + '.');
}

export function avisarSinCupo({ placa }) {
  enviar('Operario', 'Un vehículo (' + placa + ') llegó y no había cupo.');
}

export function mensajes() {
  return bandeja.map(m => ({ ...m }));
}

function enviar(para, texto) {
  if (!correoDisponible) throw new Error('El servidor de correo no responde: no se avisó a ' + para + '.');
  bandeja.push({ para, texto, hora: new Date() });
}

function formatoHora(hora) {
  return new Date(hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}
