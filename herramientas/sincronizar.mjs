// Valida reglas.json y copia su contenido en REGLAS_BASE del userscript.
// Uso: node herramientas/sincronizar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const rutaReglas = join(raiz, 'reglas.json');
const rutaScript = join(raiz, 'play-rojo.user.js');

const reglas = JSON.parse(readFileSync(rutaReglas, 'utf8'));
const obligatorios = { version: 'string', reproductor: 'string', video: 'string' };
for (const [clave, tipo] of Object.entries(obligatorios)) {
  if (typeof reglas[clave] !== tipo) throw new Error(`reglas.${clave} debe ser ${tipo}`);
}
for (const clave of ['anuncioActivo', 'botonesOmitir', 'ocultar']) {
  if (!Array.isArray(reglas[clave])) throw new Error(`reglas.${clave} debe ser una lista`);
}
if (!reglas.anuncioActivo.length) throw new Error('reglas.anuncioActivo no puede estar vacía');

const script = readFileSync(rutaScript, 'utf8');
const bloque = /(\/\* REGLAS-INICIO \*\/\n)[\s\S]*?(\n\s*\/\* REGLAS-FIN \*\/)/;
if (!bloque.test(script)) throw new Error('no se encontraron las marcas REGLAS-INICIO/FIN');

const json = JSON.stringify(reglas, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
const nuevo = script.replace(bloque, `$1  const REGLAS_BASE = ${json};$2`);
writeFileSync(rutaScript, nuevo);
console.log(`REGLAS_BASE actualizada a la versión ${reglas.version}`);
