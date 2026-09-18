# Pendientes bloqueados — JARVIS AUTO

Lista única de todo lo que **no se puede resolver escribiendo código** en este repo. Cada entrada dice
qué fase frena, qué hace falta exactamente y **quién** lo destraba. Se actualiza al cerrar cada uno; la
idea es ir bajándolos de a uno cuando cada bloqueo se levante.

Estado del resto del proyecto: ver `docs/phases/roadmap.md`.

---

## 1. ~~Cuota de ElevenLabs agotada~~ — RESUELTO (septiembre de 2026)

Bloqueaba las Fases 1, 6 y 7: la conversación arrancaba, el agente alcanzaba a saludar y cortaba a
1-2 segundos con `This request exceeds your quota limit`. No era un bug del código — la firma de la
URL y la conexión del cliente estaban bien; el corte venía de ElevenLabs.

**Está destrabado.** La voz funciona en producción: se mantienen conversaciones completas, el agente
invoca herramientas y contesta. Verificado en uso real.

Lo que quedó de esa etapa, y conviene no perder:

- **El endpoint que firma la URL ahora exige sesión Y tiene rate limit.** Cada conversación gasta
  cuota, o sea plata. Antes cualquiera con la URL podía pedir URLs firmadas; después de eso, un
  usuario legítimo con una pestaña en bucle podía vaciar la cuenta igual. Hoy son 20 cada 5 minutos
  por usuario (ver `lib/server/sesion.ts`).
- **Los módulos se abren por voz y también a mano.** Se agregó justamente porque este bloqueo dejó el
  sistema entero inalcanzable mientras duró. Esa decisión se queda aunque la voz ande.

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

## 5. ~~Función `rls_auto_enable()` marcada por el Security Advisor~~ — RESUELTO

Ya no aparece en el Security Advisor (verificado con `get_advisors` en septiembre de 2026). La función no
existe más en la base. Se cierra.

---

## 6. Las advertencias del Security Advisor que quedan abiertas **a propósito**

Revisadas una por una en septiembre de 2026, con la base en la mano. **El objetivo NO es dejar el panel en
cero**: tres de las cinco son decisiones correctas que el linter no puede saber que son correctas, y
perseguir el cero rompería cosas que hoy funcionan.

### 6.1 `pg_net` en el esquema `public` — NO SE PUEDE CORREGIR

Las 12 funciones del esquema `net` tienen el ACL por defecto `{=X/supabase_admin}`, o sea **EXECUTE para
`PUBLIC`**, que `anon` y `authenticated` heredan. Entre ellas `http_get`, `http_post` y también
`wake`/`worker_restart`.

**El riesgo, si alguna vez fuera alcanzable, es SSRF**: cualquiera con la anon key —que vive en el
navegador— haciendo que la base dispare pedidos HTTP arbitrarios desde la red de Supabase.

**Hoy no es alcanzable**: PostgREST solo expone `public`, `graphql_public` y `storage`. `net` no está en
esa lista y no hay que agregarlo nunca.

**No se puede revocar desde acá.** Se intentó dos veces y las dos migraciones devolvieron "éxito" sin
cambiar nada: en Postgres solo el dueño de un objeto puede revocarle permisos, el dueño es
`supabase_admin`, y el rol que nos da Supabase (`postgres`) no es superusuario ni miembro de ese rol.
Verificado con `pg_has_role` y comparando el `proacl` antes y después. Es un permiso por defecto de
Supabase sobre su propia extensión.

**Lo único que hay que sostener:** no exponer el esquema `net` en Settings → API → Exposed schemas.

### 6.2 Bucket `vehiculos` público — ES POR DISEÑO

Las fotos del catálogo tienen que verse sin login. Y hay una segunda razón más dura: **cuando se publica
en Facebook o Instagram, Meta descarga la foto desde esa URL pública**. Hacer el bucket privado rompe el
catálogo del sitio *y* la publicación en redes.

Para contraste, el bucket `documentos` (base de conocimiento) **sí es privado**, con URLs firmadas a 5
minutos. Ahí sí correspondía.

### 6.3 y 6.4 `mi_agencia_id()` / `mi_rol()` ejecutables — FALSO POSITIVO

El linter detecta el patrón "función `security definer` invocable por un usuario logueado" sin mirar qué
hace. Estas dos **no reciben argumentos**: devuelven la agencia y el rol *del que llama*. Invocarlas por
RPC no revela nada de nadie más.

Y **revocarles el `execute` a `authenticated` rompe toda la RLS del sistema**, porque las policies las
llaman en cada consulta. Ya está escrito en `security-hardening.sql` y en `CLAUDE.md`.

Si algún día se quiere la advertencia en cero, la forma correcta es moverlas a un esquema no expuesto y
actualizar todas las policies que las referencian. Es un cambio delicado: si queda a medias, la base deja
de devolver datos.

### 6.5 Protección de contraseña filtrada — REQUIERE PLAN PRO

Corrección de una nota anterior que decía que era "un toggle del dashboard". Lo es, pero la documentación
de Supabase es explícita: *"Leaked password protection is available on the Pro Plan and above."* La
organización está en plan Gratis.

**Qué falta (lo decide el usuario):** pasar a Pro (US$25/mes) si se quiere. Vale aclarar que si alguna vez
se pasa a Pro va a ser por los backups con recuperación a un punto en el tiempo, no por esto — la
protección de contraseñas vendría de regalo.

---

## 7. ~~Bucket de Supabase Storage para fotos~~ — RESUELTO

El usuario creó el bucket `vehiculos` (público para lectura) desde el dashboard de Supabase. Con eso se
construyó la subida de fotos desde el formulario de vehículos: `web/lib/media.ts` +
`web/components/modules/FotosVehiculo.tsx`, guardando en `vehiculos/<agencia_id>/<vehiculo_id>/` y
registrando cada archivo en la tabla `vehiculo_media`.

Las 4 policies que generó el asistente de Supabase daban escritura a **cualquier** usuario autenticado,
sin distinguir agencia — el único rincón del sistema que quedaba fuera del modelo multi-tenant. Se
reemplazaron por versiones acotadas en `supabase/storage-policies.sql`, que exigen que la primera carpeta
de la ruta sea la agencia del usuario. **Pendiente de que el usuario corra ese archivo** en el SQL Editor.

Las fotos viejas siguen como archivos estáticos en `/images/<dominio>/`, contadas en `vehiculos.fotos`.
Migrarlas al bucket es un paso aparte, todavía sin hacer.

## 8. Tablas diferidas a propósito — `marketing_assets` y `audit_log`

No es un bloqueo externo, es una decisión de diseño que queda anotada acá para que no se pierda:

- **`marketing_assets`** (Fase 9): no hay requisitos definidos todavía.
- **`audit_log`** (Fase 12): necesita diseño de triggers, no solo la tabla.

Se crean cuando arranque su fase, con un consumidor real. Crearlas ahora sin nadie que las use contradice
la regla de "no sobre-ingeniería" ya escrita en `docs/architecture/decisiones.md`.

---

## 9. Importación del sitio público — bloqueada por la política de red del entorno

El usuario pidió traer los datos actualizados de vehículos (disponibles, vendidos, fotos, etc.) desde el
sitio público de la agencia: **https://alcoverautomotores.com.ar/**

**Decisión tomada** (ver `docs/architecture/decisiones.md` → "Fuente de verdad del stock"): es una
importación **de una sola vez** para completar Supabase, no una sincronización permanente. Jarvis manda.

**Bloqueo:** el entorno de ejecución tiene una política de red que bloquea todo salvo una lista blanca
(npm, PyPI, GitHub, Anthropic). El dominio de la agencia responde `EGRESS_BLOCKED` desde el proxy, igual
que Supabase y ElevenLabs. No se puede saltear desde la sesión.

**Qué falta (lo hace el usuario):** editar el entorno para permitir ese dominio en la política de red
(https://code.claude.com/docs/en/claude-code-on-the-web) y **abrir una sesión nueva** — el cambio de
entorno no aplica a una sesión ya en curso.

**Qué se hace cuando se destrabe:**
1. Leer el catálogo del sitio y compararlo contra `vehiculos` en Supabase, usando el **dominio (patente)**
   como clave de cruce.
2. Reportar el diff antes de tocar nada: qué autos están en el sitio y no en la base, cuáles están en la
   base y ya no en el sitio (candidatos a `vendido`), y qué precios difieren.
3. Recién con el diff a la vista, aplicar los cambios.

**Limitación conocida:** las fotos que se traigan no se van a poder guardar en `vehiculo_media` hasta que
exista el bucket de Storage (pendiente #7 de este mismo documento). Los datos de texto y precio sí.

---

## 10. Setup de WhatsApp Cloud API en Meta — para activar la recepción de mensajes

El código para **recibir** WhatsApp ya está: la Edge Function `supabase/functions/whatsapp-webhook`,
construida y con toda su lógica verificada (verificación GET de Meta, firma HMAC, mapeo a agencia,
alta/búsqueda de cliente, inserción de la interacción). Está **inactiva** esperando el setup del usuario.

**Por qué está frenado:** la app WhatsApp Business del celular no sirve para que un sistema reciba
mensajes — hace falta la **WhatsApp Cloud API** de Meta, que es un producto aparte. Y hay una decisión
con consecuencia: un número registrado en la Cloud API deja de funcionar en la app normal de WhatsApp, así
que conviene usar un número nuevo dedicado.

**Qué falta (lo hace el usuario), guía completa en el README (sección "WhatsApp: recibir mensajes"):**
1. Crear la app en developers.facebook.com y agregar el producto WhatsApp.
2. Cargar los secretos en Supabase (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`) y desplegar la función.
3. Asociar el Phone Number ID a la agencia por SQL (`update agencias set whatsapp_phone_number_id = ...`).
4. Configurar el webhook en Meta apuntando a la URL de la función y suscribirse al campo `messages`.

**Cuando se destrabe:** se manda un WhatsApp al número y se confirma que aparece como interacción en el
perfil del cliente. Después arranca la **parte 2 — enviar** mensajes desde JARVIS (requiere plantillas
aprobadas por Meta).

---

## 11. Dos textos que van en el dashboard de ElevenLabs — pendientes

Son la mitad de un arreglo que ya está hecho del lado del código (PR #28). Sin ellos, JARVIS
puede volver a inventar una respuesta sobre un trámite.

**Por qué no lo hace nadie desde acá:** el system prompt y las descripciones de las herramientas
viven en el dashboard de ElevenLabs, no en este repo. La API está bloqueada por la política de red
del entorno de desarrollo, así que no hay forma de cargarlo ni de verificarlo programáticamente.

**De dónde salió esto:** probando en producción, a la pregunta *"¿qué pongo en valor declarado
cuando consulto el registro?"* el agente contestó que dependía del vehículo y que podía ser el
valor de tabla o el de la operación. No está escrito en ningún lado: se lo inventó. Dos causas
apiladas — la búsqueda no encontraba el documento (ya corregido), y aun recibiendo "no encontré
nada" el agente contestó igual. Esto último no se arregla buscando mejor.

### 11.1 System prompt del agente

En **Agents → JARVIS → pestaña Agent → campo `System prompt`**, agregar al final:

```
Cuando te pregunten por trámites, costos, plazos, requisitos o
procedimientos de la agencia, SIEMPRE usá consultar_conocimiento
antes de contestar. Nunca contestes de memoria sobre estos temas.

Si la herramienta dice que no hay nada cargado, decí que ese dato
todavía no está en el sistema. No supongas, no completes, no des
una respuesta "probable". Es preferible que la persona sepa que
falta un dato a que se lleve un número inventado.
```

### 11.2 Descripción de la herramienta `consultar_conocimiento`

```
Busca en la base de conocimiento de la agencia: trámites, costos,
plazos, requisitos, políticas internas y datos de proveedores.
Usarla SIEMPRE antes de contestar cualquier pregunta sobre cómo se
hace un trámite o cuánto sale algo. Si devuelve que no hay nada
cargado, decirlo — no completar con conocimiento propio.
```

Y su parámetro `consulta` (string):

```
Lo que la persona quiere saber, en sus palabras. Pasar la pregunta
completa: la búsqueda entiende frases naturales.
```

Ese último renglón recién ahora es cierto. Antes la búsqueda exigía que TODAS las palabras
estuvieran en el documento, así que una pregunta hablada —con un "pongo" o un "sale" que el
documento no usa— devolvía cero.

### Cómo se verifica que quedó

Dos preguntas, y las dos importan:

1. *"¿Qué pongo en valor declarado cuando consulto el registro?"* → tiene que contestar **1**.
2. Algo que NO esté cargado en Conocimiento → tiene que admitir que no lo tiene.

La segunda vale tanto como la primera. Un agente que contesta bien lo que sabe es la mitad; el que
además admite lo que no sabe es el que sirve.
---

## 12. Lo que dejó abierto la auditoría de seguridad (septiembre de 2026)

La auditoría completa corrigió lo que se podía corregir desde el código y la base. Queda esto.

### 12.1 Content-Security-Policy — LA MITAD ACTIVA YA ESTÁ; FALTA `script-src`

**Ya bloquea** (verificado con `curl` contra el server): `frame-ancestors`, `object-src`,
`base-uri`, `form-action` y **`connect-src`**. Esta última es la que importa de esta mitad: aunque
alguien lograra ejecutar un script en la página, el navegador no lo dejaría mandar los datos de la
agencia a ningún lado que no sea Supabase, ElevenLabs u Open-Meteo.

**Falta `script-src`**, que es la que frena el XSS en sí. Va en `Content-Security-Policy-Report-Only`,
que anota en la consola del navegador y **no bloquea nada**.

**Por qué no se enciende de una:** Next inyecta scripts inline para hidratar la página. Bloquearlos
necesita *nonces*, y los nonces obligan a renderizar cada visita en el servidor en vez de servir la
página pregenerada. Eso es un cambio de comportamiento y de costo, no solo de seguridad — es una
decisión del proyecto, no del auditor.

**EL PASO QUE FALTA, y lo tiene que hacer una persona con el sitio abierto:**

1. Abrir https://jarvis-autos-acv.vercel.app/ y abrir la consola del navegador (F12 → Console).
2. Usar la app un rato: entrar a varios módulos, ver fotos de vehículos, **tener una conversación de
   voz completa con JARVIS** y publicar algo en redes.
3. Anotar cada mensaje que diga `Content Security Policy` o `Report Only`.
4. Pasar esa lista. Con eso se ajusta la política y recién ahí se decide si vale la pena el cambio a
   nonces.

Si después de un día de uso real no aparece ninguna violación más allá de los scripts inline de Next,
ya se sabe que lo único que falta resolver es ese punto.

### 12.2 `AGENCIA_PROPIETARIA` — HACE FALTA ANTES DE LA SEGUNDA AGENCIA

Las credenciales de Meta y de ElevenLabs son variables de entorno: una sola cuenta para todo el
despliegue. `/api/redes/publicar` y `/api/voz/conversaciones` ahora exigen que quien llama pertenezca
a la agencia dueña de esas cuentas.

Mientras haya **una sola agencia**, se resuelve sola y no hay nada que hacer. En cuanto se dé de alta
la segunda, los dos endpoints van a devolver 403 hasta que se configure `AGENCIA_PROPIETARIA` en
Vercel con el id de la agencia dueña de las cuentas. Falla cerrado a propósito: es preferible que
Marketing deje de publicar y alguien lo note, a que una agencia publique en el Facebook de otra.

### 12.3 El sitio estático viejo — NO AUDITADO EN PROFUNDIDAD

En la raíz del repositorio sigue el sitio original (`index.html`, `script.js`, `db.js`, `login.js`),
publicado y funcionando. Tiene su propio cliente de Supabase y **14 usos de `innerHTML`**.

No se tocó en esta auditoría: es un sistema aparte, la app nueva vive entera en `/web`, y cambiarlo
sin poder probarlo era más riesgo que beneficio. Su clave embebida es la `anon` (verificado: el JWT
dice `role: "anon"`), que es pública por diseño, y la RLS le devuelve cero filas sin sesión.

**Pendiente:** decidir si se sigue publicando o se reemplaza por `/web`. Mientras siga arriba, sus
`innerHTML` son deuda de seguridad que nadie está mirando.

### 12.4 Protección de contraseña filtrada — REQUIERE PLAN PRO

Ya estaba en el punto 6.5. Sigue igual: es un toggle del dashboard de Supabase disponible desde el
plan Pro, y la organización está en Free.

### 12.5 `pg_net` en el esquema público — NO SE PUEDE CORREGIR

Ya está explicado en el punto 6.1 y en `supabase/security-hardening.sql`. Solo el dueño
(`supabase_admin`) puede revocar, y el rol que da Supabase no lo es.

### Lo que NO hace falta rotar

Se revisaron los **168 commits** del historial completo buscando claves. Lo único que aparece son dos
JWT de Supabase con `role: "anon"` — la clave publicable, diseñada para viajar en el navegador.
**No se encontró ninguna `service_role`, token de Meta, clave de ElevenLabs ni clave privada en
ningún commit.** No hay nada que rotar.
