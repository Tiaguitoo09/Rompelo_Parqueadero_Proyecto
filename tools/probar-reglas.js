// PRUEBA POR MUTACIÓN DE LAS REGLAS · no reemplaza a verificar.js: lo pone a prueba.
// Una regla que nunca se pone roja no protege nada, y verificar.js no avisa cuando una regla
// quedó apuntando a algo que no existe: simplemente dice [OK] para siempre.
//
// Para cada regla de arquitectura/reglas.json y cada módulo que prohíbe, este script:
//   1. exige que la regla esté completa y que su ADR exista en arquitectura/adr/;
//   2. exige que existan src/<modulo> y src/<prohibido> (un nombre mal escrito deja la
//      regla en verde para siempre, porque verificar.js nunca encuentra qué revisar);
//   3. copia el proyecto a una carpeta temporal, le agrega al módulo el import prohibido,
//      corre tools/verificar.js ahí y exige que salga 1 nombrando a esa regla.
// Nunca modifica src/. Sale 0 si todas las reglas pueden ponerse rojas, 1 si alguna no.
//
// Uso: node tools/probar-reglas.js
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const RAIZ = 'src';
const REGLAS = 'arquitectura/reglas.json';
const ADRS = 'arquitectura/adr';

const errores = [];
const advertencias = [];
const reglas = JSON.parse(fs.readFileSync(REGLAS, 'utf8'));
const modulosEnSrc = fs.readdirSync(RAIZ, { withFileTypes: true })
  .map(e => (e.isDirectory() ? e.name : e.name.endsWith('.js') ? path.basename(e.name, '.js') : null))
  .filter(Boolean);

console.log('\n  Probando que cada una de las ' + reglas.length + ' regla(s) pueda ponerse roja...\n');

for (const r of reglas) {
  const nombre = r.id || '(regla sin id)';
  const faltan = ['id', 'adr', 'modulo', 'porque'].filter(c => typeof r[c] !== 'string' || !r[c].trim());
  if (!Array.isArray(r.no_puede_importar) || r.no_puede_importar.length === 0) faltan.push('no_puede_importar');
  if (faltan.length) {
    errores.push(nombre + ': le falta ' + faltan.join(', ') + '.');
    continue;
  }
  if (!fs.existsSync(path.join(ADRS, r.adr + '.md'))) {
    errores.push(nombre + ': dice venir de ' + r.adr + ', pero no existe ' + ADRS + '/' + r.adr + '.md.');
  }
  const archivo = archivoDelModulo(r.modulo);
  if (!archivo) {
    errores.push(nombre + ': el módulo "' + r.modulo + '" no existe en ' + RAIZ + '/. Esta regla nunca revisaría nada.');
    continue;
  }
  for (const prohibido of r.no_puede_importar) {
    if (!modulosEnSrc.includes(prohibido)) {
      errores.push(nombre + ': prohíbe importar "' + prohibido + '", que no existe en ' + RAIZ + '/. Nunca podría violarse.');
      continue;
    }
    const tambienAtrapa = modulosEnSrc.filter(m => m !== prohibido && m.includes(prohibido));
    if (tambienAtrapa.length) {
      advertencias.push(nombre + ': verificar.js compara por substring, así que prohibir "' + prohibido +
        '" también prohíbe ' + tambienAtrapa.map(m => '"' + m + '"').join(', ') + '.');
    }
    const resultado = violarEnUnaCopia(archivo, prohibido);
    const nombrada = resultado.salida.includes('[X] ' + r.id + ' VIOLADA');
    if (resultado.codigo === 1 && nombrada) {
      console.log('  [OK] ' + r.id + ' se pone roja si "' + r.modulo + '" importa a "' + prohibido + '"');
    } else {
      errores.push(nombre + ': se agregó el import de "' + prohibido + '" en ' + archivo +
        ' y verificar.js ' + (resultado.codigo === 0 ? 'siguió en verde' : 'no nombró a ' + r.id) + '.');
    }
  }
}

for (const a of advertencias) console.log('\n  [!] ' + a);
if (errores.length) {
  console.log('\n  REGLAS QUE NO PROTEGEN NADA:\n');
  for (const e of errores) console.log('  [X] ' + e);
  console.log('');
  process.exit(1);
}
console.log('\n  TODAS LAS REGLAS PUEDEN PONERSE ROJAS.\n');
process.exit(0);

function archivoDelModulo(modulo) {
  const plano = path.join(RAIZ, modulo + '.js');
  if (fs.existsSync(plano)) return plano;
  const carpeta = path.join(RAIZ, modulo);
  if (!fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) return null;
  const js = fs.readdirSync(carpeta).find(n => n.endsWith('.js'));
  return js ? path.join(carpeta, js) : null;
}

function violarEnUnaCopia(archivo, prohibido) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probar-reglas-'));
  try {
    // package.json va en la copia para que sea fiel al proyecto: declara "type": "module", y
    // sin él un Node anterior a 20.19 no corre verificar.js.
    for (const d of [RAIZ, 'arquitectura', 'tools', 'package.json']) fs.cpSync(d, path.join(tmp, d), { recursive: true });
    const destino = path.join(tmp, archivo);
    const linea = "import * as mutante from './" + prohibido + ".js';\n";
    fs.writeFileSync(destino, linea + fs.readFileSync(destino, 'utf8'));
    const r = spawnSync(process.execPath, [path.join('tools', 'verificar.js')], { cwd: tmp, encoding: 'utf8' });
    return { codigo: r.status, salida: (r.stdout || '') + (r.stderr || '') };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
