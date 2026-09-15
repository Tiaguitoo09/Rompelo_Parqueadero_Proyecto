# Rómpelo a propósito · kit del taller

## Qué hay aquí

- `tools/verificar.js` — revisa que su código respete sus ADR. **No lo toquen.**
- `arquitectura/reglas.json` — **aquí escriben ustedes.** Una regla por ADR.
- `.github/workflows/pipeline.yml` — hace correr el verificador en cada push.

## Los drivers vigentes

| Driver | ADR | Qué dice |
|---|---|---|
| D1 | ADR-001 | `espacios` no puede escribir en el registro de `ingresos`; `ingresos` no puede depender de que `espacios` le devuelva algo distinto a lectura |
| D2 | ADR-002 | `ingresos` no puede importar `avisos` directamente |
| D3 | ADR-003 | se separa la lógica de cobro de la lógica de registro dentro de `ingresos`/`app` |
| D4 | ADR-004 | `avisos` no puede escribir en `espacios` ni en `ingresos` |

D1 y D2 son los "seguros" (mínimo del taller). D3 y D4 son el plus — el mínimo son 2.

## Qué falta

La carpeta `src/` con los archivos que les generó la IA. Péguenlos ahí.

## Cómo se corre en su máquina

```
node tools/verificar.js
```

Sale **0** si todo está bien, **1** si violaron una regla.

Si no tienen Node instalado, no importa: **el pipeline de GitHub lo corre por ustedes**
en cada push. Vayan a la pestaña Actions.

## La prueba que hay que hacer

1. Con la arquitectura sana → verde.
2. Agreguen a mano el import que su regla prohíbe → rojo.
3. Quítenlo → verde otra vez.

**Una regla que nunca se violó a propósito no se sabe si funciona.**
