// ESPACIOS · el estado de los cupos del parqueadero: libre u ocupado.
// Es el único dueño de ese dato. No conoce el registro de entradas y salidas (ADR-001, R1):
// reporta lo que ve y ahí termina su trabajo.

// ROJO A PROPÓSITO: este import viola R1 (ADR-001). Se quita en el siguiente commit.
import { vehiculosAdentro } from './ingresos.js';

const TOTAL_POR_DEFECTO = 8;
let cupos = [];

export function crearCupos(total = TOTAL_POR_DEFECTO) {
  cupos = Array.from({ length: total }, (_, i) => ({ id: 'C' + (i + 1), ocupado: false }));
}

export function primerCupoLibre() {
  const libre = cupos.find(c => !c.ocupado);
  return libre ? libre.id : null;
}

export function cuposLibres() {
  return cupos.filter(c => !c.ocupado).length;
}

export function totalCupos() {
  return cupos.length;
}

export function ocupar(id) {
  const cupo = buscar(id);
  if (cupo.ocupado) throw new Error('El cupo ' + id + ' ya está ocupado.');
  cupo.ocupado = true;
}

export function liberar(id) {
  buscar(id).ocupado = false;
}

// Devuelve copias: quien las reciba puede leerlas, pero no mover un cupo con ellas.
export function estadoCupos() {
  return cupos.map(c => ({ ...c }));
}

function buscar(id) {
  const cupo = cupos.find(c => c.id === id);
  if (!cupo) throw new Error('No existe el cupo ' + id + '.');
  return cupo;
}

crearCupos();
