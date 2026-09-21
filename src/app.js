// APP · la capa de orquestación. Es el único módulo que conoce a los otros cuatro y el único
// que los conecta: los módulos de dominio no se importan entre sí (ADR-001, ADR-003, ADR-004).
// Por eso es también el que más hay que cuidar: aquí se concentra toda la coordinación.

import * as espacios from './espacios.js';
import * as ingresos from './ingresos.js';
import * as cobro from './cobro.js';
import * as avisos from './avisos.js';

let cobrados = [];
let pendientes = []; // ADR-003: «salida registrada, cobro pendiente», para revisar en caja
let bitacora = []; // cada falla queda escrita: nada se pierde en silencio
let desfaseMinutos = 0; // reloj simulado, para poder mostrar cobros de varias horas

// ADR-002 · ingresos anuncia, avisos escucha. app hace la conexión una sola vez y le agrega a
// la copia lo que avisos necesita saber (ADR-004: avisos no consulta, recibe). Si el aviso
// falla, se pierde el aviso, no la operación, y queda anotado en la bitácora.
ingresos.alRegistrar(evento => {
  if (evento.tipo === 'entrada') {
    avisos.avisarEntrada({ placa: evento.placa, cupo: evento.cupo, hora: evento.entrada, libres: espacios.cuposLibres() });
  } else {
    avisos.avisarSalida({ placa: evento.placa, cupo: evento.cupo, hora: evento.salida });
  }
}, error => anotarFalla('avisos', error));

export function ahora() {
  return new Date(Date.now() + desfaseMinutos * 60000);
}

export function adelantarReloj(minutos) {
  desfaseMinutos += minutos;
}

export function entrar(placa, hora = ahora()) {
  const cupo = espacios.primerCupoLibre();
  if (!cupo) {
    avisar(() => avisos.avisarSinCupo({ placa: String(placa ?? '').trim().toUpperCase() }));
    return { ok: false, motivo: 'No hay cupos libres.' };
  }
  espacios.ocupar(cupo);
  let fila;
  try {
    fila = ingresos.registrarEntrada(placa, cupo, hora);
  } catch (e) {
    espacios.liberar(cupo); // compensar: el registro no se hizo, el cupo apartado se devuelve
    return { ok: false, motivo: e.message };
  }
  return { ok: true, fila };
}

export function salir(placa, hora = ahora()) {
  let fila;
  try {
    fila = ingresos.registrarSalida(placa, hora);
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
  espacios.liberar(fila.cupo); // el carro ya salió: el cupo se libera pase lo que pase con el cobro
  let cuenta = null;
  try {
    cuenta = cobro.calcularCobro(fila);
    cobrados.push(cuenta);
  } catch (e) {
    pendientes.push({ placa: fila.placa, entrada: fila.entrada, salida: fila.salida, motivo: e.message });
    anotarFalla('cobro', e);
  }
  return { ok: true, fila, cuenta, cobroPendiente: cuenta === null };
}

// Cuando no se registra nada (no había cupo) no hay anuncio de ingresos: app avisa directo,
// con la misma regla de ADR-002: si el aviso falla, se pierde el aviso y queda anotado.
function avisar(enviar) {
  try {
    enviar();
  } catch (e) {
    anotarFalla('avisos', e);
  }
}

function anotarFalla(modulo, error) {
  bitacora.push({ modulo, mensaje: error.message, hora: ahora() });
}

export function cobrosHechos() {
  return cobrados.map(c => ({ ...c }));
}

export function cobrosPendientes() {
  return pendientes.map(p => ({ ...p }));
}

export function fallas() {
  return bitacora.map(f => ({ ...f }));
}

export function reiniciar() {
  espacios.crearCupos();
  ingresos.reiniciarRegistro();
  avisos.reiniciarAvisos();
  cobro.configurarTarifa();
  cobrados = [];
  pendientes = [];
  bitacora = [];
  desfaseMinutos = 0;
}

// ---------- Interfaz: solo en el navegador (en Node los flujos se prueban sin DOM) ----------

if (typeof document !== 'undefined') iniciarInterfaz();

function iniciarInterfaz() {
  const $ = id => document.getElementById(id);
  const pesos = v => '$' + v.toLocaleString('es-CO');
  const hhmm = d => new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  $('form-entrada').addEventListener('submit', ev => {
    ev.preventDefault();
    const r = entrar($('placa').value);
    if (r.ok) {
      $('placa').value = '';
      mostrarEstado('Entró ' + r.fila.placa + ' al cupo ' + r.fila.cupo + '.', true);
    } else {
      mostrarEstado(r.motivo, false);
    }
    pintar();
  });
  $('correo-caido').addEventListener('change', ev => {
    avisos.simularCaidaDelCorreo(ev.target.checked);
    pintar();
  });
  $('tarifa-rota').addEventListener('change', ev => {
    cobro.configurarTarifa(ev.target.checked ? null : undefined);
    pintar();
  });
  $('adelantar').addEventListener('click', () => {
    adelantarReloj(60);
    pintar();
  });
  $('reiniciar').addEventListener('click', () => {
    reiniciar();
    $('correo-caido').checked = false;
    $('tarifa-rota').checked = false;
    mostrarEstado('Día reiniciado.', true);
    pintar();
  });

  function registrarSalidaDe(placa) {
    const r = salir(placa);
    if (!r.ok) mostrarEstado(r.motivo, false);
    else if (r.cobroPendiente) mostrarEstado(r.fila.placa + ' salió. La tarifa falló: el cobro quedó pendiente y el carro no se quedó atrapado.', true);
    else mostrarEstado(r.fila.placa + ' salió. Cobro: ' + pesos(r.cuenta.valor) + ' (' + r.cuenta.horas + ' h).', true);
    pintar();
  }

  function mostrarEstado(texto, ok) {
    $('estado').textContent = texto;
    $('estado').className = ok ? 'ok' : 'error';
  }

  function pintar() {
    $('reloj').textContent = hhmm(ahora());
    const adentro = ingresos.vehiculosAdentro();
    const placaDelCupo = Object.fromEntries(adentro.map(f => [f.cupo, f.placa]));
    llenar($('cupos'), espacios.estadoCupos(), c => {
      const caja = el('div', 'cupo ' + (c.ocupado ? 'ocupado' : 'libre'));
      caja.append(el('strong', '', c.id), el('span', '', c.ocupado ? placaDelCupo[c.id] || '—' : 'libre'));
      return caja;
    });
    $('libres').textContent = espacios.cuposLibres() + ' de ' + espacios.totalCupos() + ' libres';
    llenar($('adentro'), adentro, f => {
      const fila = el('li', '', f.placa + ' · ' + f.cupo + ' · entró ' + hhmm(f.entrada));
      const boton = el('button', '', 'Registrar salida');
      boton.type = 'button';
      boton.addEventListener('click', () => registrarSalidaDe(f.placa));
      fila.append(boton);
      return fila;
    }, 'No hay vehículos adentro.');
    llenar($('cobrados'), cobrosHechos(), c => el('li', '', c.placa + ' · ' + c.horas + ' h · ' + pesos(c.valor)), 'Sin cobros todavía.');
    llenar($('pendientes'), cobrosPendientes(), p => el('li', 'pendiente', p.placa + ' · salió ' + hhmm(p.salida) + ' · ' + p.motivo), 'Ninguno.');
    llenar($('mensajes'), avisos.mensajes().reverse(), m => el('li', '', m.para + ': ' + m.texto), 'Sin avisos todavía.');
    llenar($('fallas'), fallas().reverse(), f => el('li', 'falla', hhmm(f.hora) + ' · [' + f.modulo + '] ' + f.mensaje), 'Sin fallas.');
  }

  document.documentElement.dataset.app = 'lista';
  pintar();
}

function el(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function llenar(contenedor, items, pintarItem, textoSiVacio) {
  const nodos = items.length ? items.map(pintarItem) : textoSiVacio ? [el('li', 'vacio', textoSiVacio)] : [];
  contenedor.replaceChildren(...nodos);
}
