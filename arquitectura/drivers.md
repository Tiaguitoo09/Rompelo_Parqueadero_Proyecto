# Drivers de arquitectura — Sistema de Parqueadero

## Módulos propuestos

Los 4 drivers protegen los límites entre estos módulos (un archivo por módulo en `src/`; `index.html` importa `src/app.js`):

| Módulo | Responsabilidad |
|---|---|
| `src/espacios.js` | Estado de los cupos (libre / ocupado). Hacia afuera solo entrega copias. |
| `src/ingresos.js` | Registro de entradas y salidas: el libro contable. Es el único que lo escribe. |
| `src/cobro.js` | Tarifa y cobro de la salida. Vive aparte del registro por ADR-003. |
| `src/avisos.js` | Notificaciones (correo, "parqueadero lleno"). Solo cuenta lo que pasó: recibe los datos, no los consulta. |
| `src/app.js` | Capa de orquestación. Es el único módulo que importa a los otros cuatro y los conecta. |

Regla general: `espacios`, `ingresos`, `cobro` y `avisos` no se importan entre sí — solo `app` los conecta. Los 4 drivers de abajo son las restricciones concretas que hacen cumplir esto.

## Los 4 drivers

| # | Driver | Relación de arquitectura que protege |
|---|---|---|
| D1 | `espacios` solo consulta cupos disponibles, nunca modifica el registro de ingresos | `ingresos` no puede depender de que `espacios` le devuelva algo distinto a lectura |
| D2 | Si `avisos` falla (correo, notificación de cupo lleno), `ingresos` no se puede caer | `ingresos` no puede importar `avisos` directamente |
| D3 | Si el cálculo de tarifa/cobro falla, el registro de salida del vehículo no se debe bloquear | separa la lógica de cobro de la lógica de registro dentro de `ingresos`/`app` |
| D4 | `avisos` solo cuenta lo que pasó, nunca lo cambia: un aviso que falla, o que está mal programado, no puede mover un cupo ni tocar un registro | `avisos` no puede importar `espacios` ni `ingresos`: no los consulta, recibe de `app` una copia de los datos |

D1 y D2 son los "seguros" (mínimo del taller). D3 y D4 son el plus — si D3 no se sostiene con solo 4 archivos, se puede botar y quedarse en 3 reglas; el mínimo son 2.

## División del equipo

1 persona = 1 driver = 1 ADR completo. Cada uno decide qué módulo no puede importar a cuál para su propio driver, y escribe las 5 secciones de su ADR — incluyendo un "qué pagamos" que de verdad le duela a su propia decisión, no a la de otro.

| Persona | Driver que elige y defiende | ADR |
|---|---|---|
| Jesús | D1 — responsabilidad de `espacios` | [ADR-001](adr/ADR-001.md) |
| Santiago | D2 — disponibilidad frente a `avisos` | [ADR-002](adr/ADR-002.md) |
| Julián | D3 — aislar el cobro de fallos de registro | [ADR-003](adr/ADR-003.md) |
| Sergio (Azapipas) | D4 — `avisos` solo cuenta, nunca cambia | [ADR-004](adr/ADR-004.md) |

## Qué sigue

1. **`reglas.json`**: cada uno agrega su propia entrada (su `id`, su `adr`, su `porque` en lenguaje de negocio). Son 4 objetos en el mismo array — nadie escribe la regla de otro.
2. **Los 3 commits**: se hacen una sola vez para todo el repo, entre los 4:
   - Alguien sube el sistema sano primero (verde).
   - Entre todos agregan los 4 imports prohibidos a la vez para el commit rojo.
   - Los quitan para el verde final.
   No hace falta repetir el ciclo 4 veces — un solo rojo que rompa las 4 reglas ya es evidencia.
