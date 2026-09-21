// INGRESOS · el registro de entradas y salidas: el libro contable del parqueadero.
// Es el único módulo que lo escribe (ADR-001). No calcula tarifas (ADR-003, R3) ni le avisa
// a nadie (ADR-002, R2): cierra su registro y ahí termina su trabajo.

let registro = [];

export function reiniciarRegistro() {
  registro = [];
}

export function registrarEntrada(placa, cupo, hora = new Date()) {
  const p = normalizarPlaca(placa);
  if (buscarAdentro(p)) throw new Error('El vehículo ' + p + ' ya está adentro.');
  const fila = { placa: p, cupo, entrada: new Date(hora), salida: null };
  registro.push(fila);
  return copia(fila);
}

export function registrarSalida(placa, hora = new Date()) {
  const p = normalizarPlaca(placa);
  const fila = buscarAdentro(p);
  if (!fila) throw new Error('El vehículo ' + p + ' no tiene una entrada abierta.');
  fila.salida = new Date(hora);
  return copia(fila);
}

export function vehiculosAdentro() {
  return registro.filter(f => f.salida === null).map(copia);
}

export function historial() {
  return registro.map(copia);
}

function buscarAdentro(placa) {
  return registro.find(f => f.placa === placa && f.salida === null);
}

function normalizarPlaca(placa) {
  const p = String(placa ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,8}$/.test(p)) throw new Error('Placa inválida: "' + String(placa ?? '') + '".');
  return p;
}

// Hacia afuera solo salen copias (también de las fechas): nadie corrige el libro desde fuera.
function copia(fila) {
  return {
    placa: fila.placa,
    cupo: fila.cupo,
    entrada: new Date(fila.entrada),
    salida: fila.salida ? new Date(fila.salida) : null,
  };
}
