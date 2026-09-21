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
let linea = []; // la línea de tiempo: todo lo que pasó, en orden y con un solo reloj, el de app
let desfaseMinutos = 0; // reloj simulado, para poder mostrar cobros de varias horas

// ADR-002 · ingresos anuncia y quien quiera escucha. Aquí escuchan dos, y ninguno obligó a
// tocar ingresos: sumar un oyente es una línea en app, que es lo que ese ADR dice que ganamos.
// 1) La línea de tiempo anota la entrada o la salida.
ingresos.alRegistrar(evento => {
  const entro = evento.tipo === 'entrada';
  anotarEvento(evento.tipo, 'ingresos', entro ? 'Entrada' : 'Salida',
    evento.placa + (entro ? ' al cupo ' : ' dejó el cupo ') + evento.cupo);
}, error => anotarFalla('app', error));

// 2) avisos le cuenta al cliente. app le agrega a la copia lo que avisos necesita saber
//    (ADR-004: avisos no consulta, recibe). Si el aviso falla, se pierde el aviso, no la operación.
ingresos.alRegistrar(evento => {
  const entro = evento.tipo === 'entrada';
  if (entro) {
    avisos.avisarEntrada({ placa: evento.placa, cupo: evento.cupo, hora: evento.entrada, libres: espacios.cuposLibres() });
  } else {
    avisos.avisarSalida({ placa: evento.placa, cupo: evento.cupo, hora: evento.salida });
  }
  anotarEvento('aviso', 'avisos', 'Aviso enviado', 'A ' + evento.placa + (entro ? ': entró al cupo ' : ': salió del cupo ') + evento.cupo);
}, avisoPerdido);

export function ahora() {
  return new Date(Date.now() + desfaseMinutos * 60000);
}

export function adelantarReloj(minutos) {
  desfaseMinutos += minutos;
}

export function entrar(placa, hora = ahora()) {
  const cupo = espacios.primerCupoLibre();
  if (!cupo) {
    const quien = String(placa ?? '').trim().toUpperCase() || 'Un vehículo';
    anotarEvento('sinCupo', 'espacios', 'Sin cupo', quien + ' llegó y no había cupo');
    avisar(() => avisos.avisarSinCupo({ placa: quien }), 'Al operario: ' + quien + ' llegó y no había cupo');
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
    anotarEvento('cobro', 'cobro', 'Cobro', fila.placa + ' · ' + cuenta.horas + ' h · ' + pesos(cuenta.valor));
  } catch (e) {
    pendientes.push({ placa: fila.placa, entrada: fila.entrada, salida: fila.salida, motivo: e.message });
    anotarFalla('cobro', e);
    anotarEvento('pendiente', 'cobro', 'Cobro pendiente', e.message);
  }
  return { ok: true, fila, cuenta, cobroPendiente: cuenta === null };
}

// Cuando no se registra nada (no había cupo) no hay anuncio de ingresos: app avisa directo,
// con la misma regla de ADR-002: si el aviso falla, se pierde el aviso y queda anotado.
function avisar(enviar, detalle) {
  try {
    enviar();
    anotarEvento('aviso', 'avisos', 'Aviso enviado', detalle);
  } catch (e) {
    avisoPerdido(e);
  }
}

function avisoPerdido(error) {
  anotarFalla('avisos', error);
  anotarEvento('falla', 'avisos', 'Aviso perdido', error.message);
}

function anotarFalla(modulo, error) {
  bitacora.push({ modulo, mensaje: error.message, hora: ahora() });
}

function anotarEvento(tipo, modulo, titulo, detalle) {
  linea.push({ tipo, modulo, titulo, detalle, hora: ahora() });
}

function pesos(valor) {
  return '$' + valor.toLocaleString('es-CO');
}

function tarifaSana() {
  const tarifa = cobro.tarifaActual();
  return Number.isFinite(tarifa) && tarifa > 0;
}

// Cómo está cada módulo AHORA. Es lo que pinta el mapa vivo: con el correo caído, avisos queda
// fuera de servicio e ingresos sigue en servicio, porque ninguna falla cruza una frontera.
export function estadoDeLosModulos() {
  const libres = espacios.cuposLibres();
  return {
    app: { estado: 'orquesta', texto: 'EN SERVICIO' },
    ingresos: { estado: 'ok', texto: 'EN SERVICIO' },
    espacios: libres === 0
      ? { estado: 'alerta', texto: 'LLENO' }
      : { estado: 'ok', texto: libres + ' DE ' + espacios.totalCupos() + ' LIBRES' },
    cobro: tarifaSana() ? { estado: 'ok', texto: 'EN SERVICIO' } : { estado: 'falla', texto: 'TARIFA DAÑADA' },
    avisos: avisos.correoCaido() ? { estado: 'falla', texto: 'CORREO CAÍDO' } : { estado: 'ok', texto: 'EN SERVICIO' },
  };
}

export function lineaDeTiempo() {
  return linea.map(e => ({ ...e }));
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
  linea = [];
  desfaseMinutos = 0;
}

// ---------- Interfaz: solo en el navegador (en Node los flujos se prueban sin DOM) ----------

if (typeof document !== 'undefined') iniciarInterfaz();

function iniciarInterfaz() {
  const $ = id => document.getElementById(id);
  // Con espacios que no parten la línea: «04:17 p. m.» nunca queda cortada en dos renglones.
  const hhmm = d => new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }).replace(/\s/g, ' ');
  const placaVisible = p => p.slice(0, 3) + ' ' + p.slice(3);
  let eventosPintados = 0;

  $('form-entrada').addEventListener('submit', ev => {
    ev.preventDefault();
    const r = entrar($('placa').value);
    if (!r.ok) {
      mostrarEstado(r.motivo, 'error');
    } else {
      $('placa').value = '';
      if (avisos.correoCaido()) mostrarEstado(r.fila.placa + ' entró al cupo ' + r.fila.cupo + '. El correo no respondió: se perdió el aviso, no la entrada.', 'aviso');
      else mostrarEstado(r.fila.placa + ' entró al cupo ' + r.fila.cupo + '.', 'ok');
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
    eventosPintados = 0;
    mostrarEstado('Día reiniciado.', 'ok');
    pintar();
  });

  function registrarSalidaDe(placa) {
    const r = salir(placa);
    if (!r.ok) mostrarEstado(r.motivo, 'error');
    else if (r.cobroPendiente) mostrarEstado(r.fila.placa + ' salió. La tarifa falló: el cobro quedó pendiente y el carro no se quedó atrapado.', 'aviso');
    else mostrarEstado(r.fila.placa + ' salió. Cobro: ' + pesos(r.cuenta.valor) + ' (' + r.cuenta.horas + ' h).', 'ok');
    pintar();
  }

  function mostrarEstado(texto, tipo) {
    $('estado').textContent = texto;
    $('estado').className = 'estado ' + tipo;
  }

  function pintar() {
    const modulos = estadoDeLosModulos();
    const eventos = lineaDeTiempo();
    const nuevos = eventos.slice(eventosPintados);
    eventosPintados = eventos.length;
    pintarCabecera(modulos);
    pintarIndicadores();
    pintarPlano();
    pintarRompelo(modulos);
    pintarCaja();
    pintarMapa(modulos, new Set(nuevos.length ? ['app', ...nuevos.map(e => e.modulo)] : []));
    pintarLinea(eventos);
  }

  function caidos(modulos) {
    return Object.values(modulos).filter(m => m.estado === 'falla').length;
  }

  function pintarCabecera(modulos) {
    $('reloj').textContent = hhmm(ahora());
    const n = caidos(modulos);
    $('salud').textContent = n === 0 ? 'TODO EN SERVICIO' : n + (n === 1 ? ' MÓDULO' : ' MÓDULOS') + ' FUERA DE SERVICIO';
    $('salud').className = 'salud ' + (n === 0 ? 'ok' : 'falla');
  }

  function pintarIndicadores() {
    const cupos = espacios.estadoCupos();
    const libres = cupos.filter(c => !c.ocupado).map(c => c.id);
    $('kpi-libres').textContent = libres.length;
    $('kpi-total').textContent = '/ ' + cupos.length;
    $('kpi-libres-sub').textContent = libres.length ? libres.join(' · ') : 'Parqueadero lleno';

    const adentro = ingresos.vehiculosAdentro();
    $('kpi-adentro').textContent = adentro.length;
    const antiguo = adentro.reduce((a, f) => (!a || f.entrada < a.entrada ? f : a), null);
    $('kpi-adentro-sub').textContent = antiguo ? 'El más antiguo: ' + placaVisible(antiguo.placa) + ', desde ' + hhmm(antiguo.entrada) : 'Nadie adentro';

    const hechos = cobrosHechos();
    $('kpi-recaudo').textContent = pesos(hechos.reduce((s, c) => s + c.valor, 0));
    $('kpi-recaudo-sub').textContent = hechos.length + (hechos.length === 1 ? ' cobro · ' : ' cobros · ') +
      (tarifaSana() ? pesos(cobro.tarifaActual()) + ' por hora o fracción' : 'tarifa sin configurar');

    const porCobrar = cobrosPendientes();
    $('kpi-pendientes').textContent = porCobrar.length;
    $('kpi-pendientes-sub').textContent = porCobrar.length ? porCobrar.map(p => p.placa).join(' · ') + ' · revisar en caja' : 'Nada pendiente';
    $('letrero-pendientes').className = 'letrero' + (porCobrar.length ? ' amarillo' : '');
  }

  function pintarPlano() {
    const cupos = espacios.estadoCupos();
    const quien = Object.fromEntries(ingresos.vehiculosAdentro().map(f => [f.cupo, f]));
    const mitad = Math.ceil(cupos.length / 2);
    llenar($('fila-a'), cupos.slice(0, mitad), c => puesto(c, quien[c.id]));
    llenar($('fila-b'), cupos.slice(mitad), c => puesto(c, quien[c.id]));
  }

  function puesto(cupo, fila) {
    const caja = el('li', 'puesto ' + (fila ? 'ocupado' : 'libre'));
    const cabecera = el('div', 'puesto-cabecera');
    cabecera.append(el('span', 'puesto-id', cupo.id), el('span', 'puesto-hora', fila ? hhmm(fila.entrada) : ''));
    caja.append(cabecera);
    if (!fila) {
      caja.append(el('span', 'puesto-libre', 'LIBRE'));
      return caja;
    }
    const boton = el('button', 'boton-salida', 'SALIDA');
    boton.type = 'button';
    boton.setAttribute('aria-label', 'Registrar la salida de ' + fila.placa);
    boton.addEventListener('click', () => registrarSalidaDe(fila.placa));
    caja.append(carro(colorDelCarro(fila.placa)), el('span', 'placa', placaVisible(fila.placa)), boton);
    return caja;
  }

  function pintarRompelo(modulos) {
    const n = caidos(modulos);
    $('fallas-activas').textContent = n === 0 ? 'sin fallas activas' : n + (n === 1 ? ' falla activa' : ' fallas activas');
    $('fallas-activas').className = 'nota' + (n ? ' nota-roja' : '');
    $('correo-caido').checked = avisos.correoCaido();
    $('tarifa-rota').checked = !tarifaSana();
  }

  function pintarCaja() {
    llenar($('cobrados'), cobrosHechos().reverse(), c => {
      const fila = el('li');
      fila.append(el('span', '', c.placa + ' · ' + c.horas + ' h'), el('span', 'caja-valor', pesos(c.valor)));
      return fila;
    }, 'Sin cobros todavía.');
    llenar($('pendientes'), cobrosPendientes(), p => {
      const fila = el('li', 'pendiente');
      fila.append(el('span', '', p.placa + ' · salió ' + hhmm(p.salida) + ' · tarifa sin configurar'), el('span', 'chip-cobrar', 'POR COBRAR'));
      return fila;
    });
  }

  function pintarMapa(modulos, tocados) {
    for (const [nombre, m] of Object.entries(modulos)) {
      const nodo = $('nodo-' + nombre);
      nodo.setAttribute('class', 'nodo ' + m.estado);
      nodo.querySelector('.nodo-estado').textContent = m.texto;
      if (tocados.has(nombre)) {
        nodo.getBoundingClientRect(); // reinicia la animación aunque el nodo ya pulsara
        nodo.setAttribute('class', 'nodo ' + m.estado + ' pulso');
      }
    }
    llenar($('mapa-lista'), Object.entries(modulos), ([nombre, m]) => {
      const fila = el('li', m.estado);
      fila.append(el('strong', '', nombre), el('span', '', m.texto));
      return fila;
    });
    const n = caidos(modulos);
    $('mapa-leyenda').textContent = n === 0
      ? 'Todo en servicio. Tumba el correo o daña la tarifa y mira qué se cae y qué no.'
      : n + (n === 1 ? ' módulo fuera de servicio' : ' módulos fuera de servicio') + ' y el registro sigue en pie: ninguna falla cruza una frontera prohibida.';
  }

  function pintarLinea(eventos) {
    llenar($('linea'), eventos.slice(-8).reverse(), e => {
      const fila = el('li', 'evento tono-' + TONO[e.tipo]);
      const icono = el('span', 'evento-icono');
      icono.append(iconoDe(e.tipo));
      const texto = el('div', 'evento-texto');
      const titulo = el('div', 'evento-titulo');
      titulo.append(el('span', '', e.titulo), el('span', 'evento-modulo', e.modulo));
      texto.append(titulo, el('div', 'evento-detalle', e.detalle));
      const hora = el('time', 'evento-hora', hhmm(e.hora));
      fila.append(icono, texto, hora);
      return fila;
    }, 'Todavía no pasa nada. Registre una entrada.');
  }

  document.documentElement.dataset.app = 'lista';
  pintar();
}

const TONO = { entrada: 'ok', salida: 'ok', cobro: 'info', aviso: 'info', falla: 'falla', pendiente: 'pendiente', sinCupo: 'pendiente' };

const ICONOS = {
  entrada: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
  salida: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  cobro: 'M2 7h20v10H2z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  aviso: 'M3 5h18v14H3z M3 7l9 6 9-6',
  falla: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  pendiente: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  sinCupo: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M5 5l14 14',
};

const COLORES_CARRO = ['#4F7CC9', '#D0453C', '#D9D9D6', '#3FA37A', '#8C6BB1', '#E08A2E'];

// Siempre el mismo color para la misma placa, repartido entre los seis.
function colorDelCarro(placa) {
  let mezcla = 7;
  for (const letra of placa) mezcla = (mezcla * 31 + letra.charCodeAt(0)) % 1009;
  return COLORES_CARRO[mezcla % COLORES_CARRO.length];
}

function svg(etiqueta, atributos) {
  const nodo = document.createElementNS('http://www.w3.org/2000/svg', etiqueta);
  for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
  return nodo;
}

function iconoDe(tipo) {
  const dibujo = svg('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  dibujo.append(svg('path', { d: ICONOS[tipo] }));
  return dibujo;
}

// Un carro visto desde arriba: carrocería, parabrisas, vidrio trasero y espejos.
function carro(color) {
  const dibujo = svg('svg', { class: 'carro', width: 38, height: 66, viewBox: '0 0 40 70', 'aria-hidden': 'true' });
  dibujo.append(
    svg('rect', { x: 3, y: 2, width: 34, height: 66, rx: 11, fill: color }),
    svg('rect', { x: 8, y: 15, width: 24, height: 13, rx: 3, fill: '#1B1D20', 'fill-opacity': 0.6 }),
    svg('rect', { x: 8, y: 48, width: 24, height: 9, rx: 3, fill: '#1B1D20', 'fill-opacity': 0.5 }),
    svg('rect', { x: 0, y: 20, width: 4, height: 7, rx: 2, fill: color }),
    svg('rect', { x: 36, y: 20, width: 4, height: 7, rx: 2, fill: color }),
  );
  return dibujo;
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
