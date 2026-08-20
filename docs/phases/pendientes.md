# Pendientes bloqueados — JARVIS AUTO

Lista única de todo lo que **no se puede resolver escribiendo código** en este repo. Cada entrada dice
qué fase frena, qué hace falta exactamente y **quién** lo destraba. Se actualiza al cerrar cada uno; la
idea es ir bajándolos de a uno cuando cada bloqueo se levante.

Estado del resto del proyecto: ver `docs/phases/roadmap.md`.

---

## 1. Cuota de ElevenLabs agotada — bloquea Fases 1, 6 y 7

**Síntoma:** la conversación de voz arranca, el agente alcanza a emitir el saludo y corta a 1-2 segundos.

**Causa confirmada** (no es un bug del código): el panel de ElevenLabs → Historial de conversaciones
muestra todas las pruebas recientes en estado `Error`. El detalle de `conv_9901m0d28y3defvvvknxmetcxcd3`
(19 ago 2026, 10:09, agente Jarvis, entorno production) dice textual:

> La conversación terminó debido a un error: **This request exceeds your quota limit.**

Coste de la conversación: 0 créditos — ni siquiera llegó a facturar, cortó antes de arrancar.

Esto descarta el código: `web/app/api/elevenlabs-signed-url/route.ts` firma bien la URL y
`web/components/JarvisCore.tsx` conecta bien; el corte viene del lado de ElevenLabs.

**Qué falta (lo hace el usuario):** revisar Uso / Facturación en la cuenta de ElevenLabs y determinar si es
- créditos del plan mensual agotados → upgrade o esperar el reset del ciclo, o
- límite de conversaciones concurrentes del plan → cerrar sesiones colgadas de pruebas anteriores.

**Cómo se verifica cuando se destrabe:** repetir la prueba en producción y confirmar en el Historial de
conversaciones que la nueva conversación queda en estado distinto de `Error` y con duración real.

---

## 2. Voz local (Pipecat + Whisper.cpp + Ollama + Piper) — alternativa evaluada, no descartada

Propuesta del usuario para no depender de la cuota de un proveedor cloud:

```
FRONTEND JARVIS → PIPECAT → (Whisper.cpp · Ollama · Piper TTS) → herramientas de JARVIS
```

**Es viable** y coincide con lo ya anotado como diferido en `docs/architecture/decisiones.md`
(Whisper/openWakeWord). **No se puede construir hoy** porque:

- Necesita un **servidor propio corriendo 24/7**, idealmente con GPU — no corre en Vercel (serverless).
  En CPU pura la latencia hace que la conversación se sienta lenta.
- Implica **reescribir las 3 client tools** (`consultar_inventario`, `simular_financiacion`,
  `estimar_transferencia_dnrpa`) al esquema de function-calling de Pipecat, no es un cambio menor: es
  rehacer la Fase 6 completa.

**Qué falta (lo hace el usuario):** decidir dónde y con qué presupuesto se contrata ese servidor (VPS con
GPU tipo Hetzner, droplet, etc.). Recién ahí tiene sentido planificarlo en detalle. Es la misma limitación
real que hubo con la cuenta de Supabase al inicio del proyecto: no se puede crear ni pagar esa
infraestructura desde acá.

---

## 3. Isologo real de la agencia — bloquea el cierre de Fase 1

Hoy `/web` usa una **recreación fiel en SVG** del isologo (círculo con anillo dorado, relleno verde inglés,
letras "AA"), no el archivo original.

**Qué falta (lo hace el usuario):** subir el archivo real (PNG/SVG) como archivo adjunto para guardarlo en
`web/public/` y usarlo en `JarvisCore.tsx`. Pegarlo en el chat como imagen no alcanza — no queda accesible
como archivo en este entorno.

---

## 4. Tasas y CFT reales de MG Group — bloquea Fase 4

`simular_financiacion` hoy calcula **precio ÷ cuotas, sin interés**, y lo aclara explícitamente como
orientativo (no es una cotización oficial). No se inventan tasas.

**Qué falta (lo hace el usuario):** conseguir de MG Group las tasas reales, el CFT y los plazos habilitados
por producto de financiación. Sin ese dato real, cualquier número que agreguemos sería inventado — y eso
va contra la regla base del proyecto.

---

## 5. Función `rls_auto_enable()` marcada por el Security Advisor de Supabase — bloquea el cierre de Fase 12

El Security Advisor de Supabase marca esta función. **No fue creada por este proyecto** — no aparece en
`supabase/schema.sql`.

**Qué falta (lo hace el usuario):** compartir su definición desde el dashboard de Supabase (SQL Editor)
para revisarla juntos y decidir si se corrige o se elimina.

---

## 6. Protección de contraseña filtrada en Supabase — bloquea el cierre de Fase 12

Es un toggle del dashboard (Authentication → Policies), no algo que se configure por SQL.

**Qué falta (lo hace el usuario):** activarlo manualmente en el dashboard de Supabase.

---

## 7. Bucket de Supabase Storage para fotos — bloquea la subida de fotos desde la UI (Fase 3)

La Fase 3 dejó el CRUD de vehículos funcionando para todos los campos de texto, números y estado, y la
tabla `vehiculo_media` ya existe en el esquema. Lo que **no** está es subir la foto desde el formulario:
eso necesita un bucket de Storage con sus políticas.

Mientras tanto las fotos siguen como estaban: archivos estáticos en `/images/<dominio>/`, contados en la
columna `vehiculos.fotos` (esa columna **no se borra** todavía para no romper el sitio estático que la
agencia usa hoy en producción).

**Qué falta (lo hace el usuario):** crear el bucket en el dashboard de Supabase (Storage → New bucket) y
avisar el nombre, para escribir las políticas de acceso por agencia y conectar la subida al formulario.

---

## 8. Tablas diferidas a propósito — `marketing_assets` y `audit_log`

No es un bloqueo externo, es una decisión de diseño que queda anotada acá para que no se pierda:

- **`marketing_assets`** (Fase 9): no hay requisitos definidos todavía.
- **`audit_log`** (Fase 12): necesita diseño de triggers, no solo la tabla.

Se crean cuando arranque su fase, con un consumidor real. Crearlas ahora sin nadie que las use contradice
la regla de "no sobre-ingeniería" ya escrita en `docs/architecture/decisiones.md`.
