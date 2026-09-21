// Los drivers, probados por comportamiento. tools/verificar.js comprueba la forma (quién importa
// a quién); estas pruebas comprueban que el negocio sobrevive cuando algo falla de verdad.
// Correr con: node --test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as app from '../src/app.js';
import * as espacios from '../src/espacios.js';
import * as ingresos from '../src/ingresos.js';
import * as cobro from '../src/cobro.js';
import * as avisos from '../src/avisos.js';

beforeEach(() => app.reiniciar());

test('flujo normal · entra, sale, se cobra y se avisa', () => {
  assert.equal(app.entrar('ABC123').ok, true);
  const r = app.salir('ABC123');
  assert.equal(r.ok, true);
  assert.equal(r.cobroPendiente, false);
  assert.equal(app.cobrosHechos().length, 1);
  assert.equal(avisos.mensajes().length, 2);
  assert.equal(app.fallas().length, 0);
});

test('D2 · si el correo se cae, la entrada y la salida quedan registradas igual', () => {
  avisos.simularCaidaDelCorreo(true);
  assert.equal(app.entrar('ABC123').ok, true);
  assert.equal(ingresos.vehiculosAdentro().length, 1);
  assert.equal(app.salir('ABC123').ok, true);
  assert.equal(ingresos.vehiculosAdentro().length, 0);
  assert.equal(espacios.cuposLibres(), espacios.totalCupos());
  // El aviso se perdió, pero no en silencio: quedó en la bitácora.
  assert.equal(avisos.mensajes().length, 0);
  assert.equal(app.fallas().filter(f => f.modulo === 'avisos').length, 2);
});

test('D3 · si la tarifa está mal configurada, el carro sale y el cobro queda pendiente', () => {
  app.entrar('ABC123');
  cobro.configurarTarifa(null);
  const r = app.salir('ABC123');
  assert.equal(r.ok, true);
  assert.equal(r.cobroPendiente, true);
  assert.equal(ingresos.vehiculosAdentro().length, 0);
  assert.equal(espacios.cuposLibres(), espacios.totalCupos());
  assert.equal(app.cobrosPendientes().length, 1);
  assert.equal(app.cobrosPendientes()[0].placa, 'ABC123');
});

test('D4 · lo que sale hacia afuera son copias: cambiarlas no mueve un cupo ni un registro', () => {
  app.entrar('ABC123');
  const cupos = espacios.estadoCupos();
  cupos.forEach(c => { c.ocupado = false; });
  const registro = ingresos.historial();
  registro[0].salida = new Date();
  registro[0].entrada.setFullYear(2000);
  assert.equal(espacios.cuposLibres(), espacios.totalCupos() - 1);
  assert.equal(ingresos.vehiculosAdentro().length, 1);
  assert.notEqual(ingresos.vehiculosAdentro()[0].entrada.getFullYear(), 2000);
});

test('compensar · si el registro rechaza la placa, el cupo apartado se devuelve', () => {
  const r = app.entrar('   ');
  assert.equal(r.ok, false);
  assert.equal(espacios.cuposLibres(), espacios.totalCupos());
});

test('parqueadero lleno · el siguiente carro no entra y el operario se entera', () => {
  for (let i = 1; i <= espacios.totalCupos(); i++) app.entrar('CAR' + i);
  const r = app.entrar('XYZ999');
  assert.equal(r.ok, false);
  assert.ok(avisos.mensajes().some(m => /no había cupo/.test(m.texto)));
  assert.ok(avisos.mensajes().some(m => /Parqueadero lleno/.test(m.texto)));
});

test('línea de tiempo · el flujo normal queda en orden: entrada, aviso, salida, aviso, cobro', () => {
  app.entrar('ABC123');
  app.salir('ABC123');
  const linea = app.lineaDeTiempo();
  assert.deepEqual(linea.map(e => e.tipo), ['entrada', 'aviso', 'salida', 'aviso', 'cobro']);
  assert.deepEqual(linea.map(e => e.modulo), ['ingresos', 'avisos', 'ingresos', 'avisos', 'cobro']);
});

test('línea de tiempo · con el correo caído y la tarifa dañada, cada falla queda con su módulo', () => {
  avisos.simularCaidaDelCorreo(true);
  cobro.configurarTarifa(null);
  app.entrar('ABC123');
  app.salir('ABC123');
  const linea = app.lineaDeTiempo();
  assert.deepEqual(linea.map(e => e.tipo + ':' + e.modulo),
    ['entrada:ingresos', 'falla:avisos', 'salida:ingresos', 'falla:avisos', 'pendiente:cobro']);
});

test('línea de tiempo · un carro que llega sin cupo queda anotado en espacios', () => {
  for (let i = 1; i <= espacios.totalCupos(); i++) app.entrar('CAR' + i);
  app.entrar('XYZ999');
  const ultimos = app.lineaDeTiempo().slice(-2);
  assert.deepEqual(ultimos.map(e => e.tipo + ':' + e.modulo), ['sinCupo:espacios', 'aviso:avisos']);
});

test('mapa vivo · con el correo caído y la tarifa dañada, caen avisos y cobro; ingresos sigue en servicio', () => {
  assert.ok(Object.values(app.estadoDeLosModulos()).every(m => m.estado !== 'falla'));
  avisos.simularCaidaDelCorreo(true);
  cobro.configurarTarifa(null);
  const m = app.estadoDeLosModulos();
  assert.equal(m.avisos.estado, 'falla');
  assert.equal(m.cobro.estado, 'falla');
  assert.equal(m.ingresos.estado, 'ok');
  assert.equal(m.espacios.estado, 'ok');
});

test('mapa vivo · con el parqueadero lleno, espacios queda en alerta', () => {
  for (let i = 1; i <= espacios.totalCupos(); i++) app.entrar('CAR' + i);
  assert.equal(app.estadoDeLosModulos().espacios.estado, 'alerta');
});

test('D2 · lleno y con el correo caído: el carro no entra, nada revienta y la falla queda anotada', () => {
  for (let i = 1; i <= espacios.totalCupos(); i++) app.entrar('CAR' + i);
  avisos.simularCaidaDelCorreo(true);
  assert.doesNotThrow(() => app.entrar('XYZ999'));
  assert.equal(ingresos.vehiculosAdentro().length, espacios.totalCupos());
  assert.ok(app.fallas().some(f => f.modulo === 'avisos' && /XYZ999|Operario/.test(f.mensaje)));
});
