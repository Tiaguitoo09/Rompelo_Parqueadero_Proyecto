// Pruebas de cada módulo por separado. Correr con: node --test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as espacios from '../src/espacios.js';
import * as ingresos from '../src/ingresos.js';
import * as cobro from '../src/cobro.js';

const H = 60 * 60000;
const t0 = new Date('2026-09-21T08:00:00');

beforeEach(() => {
  espacios.crearCupos(3);
  ingresos.reiniciarRegistro();
  cobro.configurarTarifa();
});

test('espacios · un cupo ocupado no se puede volver a ocupar', () => {
  espacios.ocupar('C1');
  assert.throws(() => espacios.ocupar('C1'), /ya está ocupado/);
  assert.equal(espacios.cuposLibres(), 2);
  espacios.liberar('C1');
  assert.equal(espacios.cuposLibres(), 3);
});

test('espacios · sin cupos libres, primerCupoLibre devuelve null', () => {
  ['C1', 'C2', 'C3'].forEach(espacios.ocupar);
  assert.equal(espacios.primerCupoLibre(), null);
});

test('ingresos · un vehículo no puede entrar dos veces ni salir sin haber entrado', () => {
  ingresos.registrarEntrada('abc123', 'C1', t0);
  assert.throws(() => ingresos.registrarEntrada('ABC123', 'C2', t0), /ya está adentro/);
  assert.throws(() => ingresos.registrarSalida('XYZ999', t0), /no tiene una entrada abierta/);
});

test('ingresos · rechaza placas inválidas', () => {
  assert.throws(() => ingresos.registrarEntrada('', 'C1', t0), /Placa inválida/);
  assert.throws(() => ingresos.registrarEntrada('A B C', 'C1', t0), /Placa inválida/);
});

test('ingresos · un oyente que falla no tumba el registro, y su falla se reporta', t => {
  let reportada = null;
  t.after(ingresos.alRegistrar(() => { throw new Error('oyente roto'); }, e => { reportada = e; }));
  assert.doesNotThrow(() => ingresos.registrarEntrada('ABC123', 'C1', t0));
  assert.equal(ingresos.vehiculosAdentro().length, 1);
  assert.equal(reportada?.message, 'oyente roto');
});

test('ingresos · el oyente recibe una copia: cambiarla no altera el registro', t => {
  t.after(ingresos.alRegistrar(evento => { evento.salida = new Date(); evento.placa = 'OTRA'; }));
  ingresos.registrarEntrada('ABC123', 'C1', t0);
  assert.deepEqual(ingresos.vehiculosAdentro().map(f => f.placa), ['ABC123']);
});

test('ingresos · cuando anuncia, el registro ya quedó hecho', t => {
  const loQueVioElOyente = [];
  t.after(ingresos.alRegistrar(evento => {
    loQueVioElOyente.push(ingresos.vehiculosAdentro().some(f => f.placa === evento.placa));
  }));
  ingresos.registrarEntrada('ABC123', 'C1', t0);
  assert.deepEqual(loQueVioElOyente, [true]);
});

test('ingresos · anuncia la entrada y la salida, en ese orden', t => {
  const tipos = [];
  t.after(ingresos.alRegistrar(evento => tipos.push(evento.tipo + ':' + evento.placa)));
  ingresos.registrarEntrada('ABC123', 'C1', t0);
  ingresos.registrarSalida('ABC123', new Date(+t0 + H));
  assert.deepEqual(tipos, ['entrada:ABC123', 'salida:ABC123']);
});

test('cobro · se cobra por hora o fracción, con mínimo de una hora', () => {
  const tarifa = cobro.tarifaActual();
  assert.equal(cobro.calcularCobro({ placa: 'A1B', entrada: t0, salida: new Date(+t0 + 5 * 60000) }).valor, tarifa);
  assert.equal(cobro.calcularCobro({ placa: 'A1B', entrada: t0, salida: new Date(+t0 + H) }).valor, tarifa);
  assert.equal(cobro.calcularCobro({ placa: 'A1B', entrada: t0, salida: new Date(+t0 + H + 60000) }).valor, 2 * tarifa);
});

test('cobro · con la tarifa mal configurada, falla con un mensaje que se entiende', () => {
  cobro.configurarTarifa(null);
  assert.throws(() => cobro.calcularCobro({ placa: 'A1B', entrada: t0, salida: new Date(+t0 + H) }), /tarifa no está configurada/);
});
