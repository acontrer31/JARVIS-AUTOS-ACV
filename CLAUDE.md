# JARVIS AUTO — guía del proyecto

Sistema operativo de IA para agencias de autos. Multi-tenant (una fila por
agencia, aislada por RLS), con asistente de voz, ERP + CRM y publicación en
redes sociales. Agencia inicial: **Alcover Automotores**.

## Mapa del repo

```
/                     Sitio estático original (PWA): index.html, script.js,
                      data.js, db.js, config.js, login.html, service-worker.js.
                      Sigue vivo; no romperlo.
/web                  App nueva: Next.js 16 (App Router + Turbopack). Es donde
                      se desarrolla hoy. Deploy en Vercel con root dir = web.
/supabase             schema.sql (esquema completo, idempotente),
                      storage-policies.sql, security-hardening.sql.
/docs                 architecture/decisiones.md, phases/roadmap.md,
                      phases/pendientes.md.
/icons /images        Assets del sitio original.
```

Producción: **https://jarvis-autos-acv.vercel.app/**

## Stack

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript 5.
- **Tailwind v4 CSS-first**: no hay `tailwind.config.js`; los tokens viven en
  `web/app/globals.css` dentro de `@theme inline`.
- **Supabase**: Postgres + Auth + Storage. Proyecto `qmkhiqkwiduufilkqnlt`.
- **ElevenLabs Conversational AI** para la voz.
- **Sin librerías de animación/3D**: el Command Center es Canvas 2D + SVG + CSS.
  No agregar Three/R3F/Framer/GSAP.

## Identidad visual (fija)

- `--dorado: #d4a72c` · `--verde-core: #0e4d3c` · `--core-text: #f5f0e6`
- Tema día/noche automático por hora de Argentina, con override manual
  (`web/lib/tema.ts`, clave `jarvis-tema` en localStorage).
- Fuentes: Geist Sans/Mono, Plastik (solo el "AA" del isologo), Orbitron (solo
  los dígitos del reloj).

## Arquitectura de la app

`web/app/page.tsx` (gate de login + agencia) → `JarvisCore` (voz + estado +
Command Center) → `ModuleWorkspace` (overlay que despacha por `moduloId`).

- **Registro de módulos**: `web/lib/modules.ts`. Cada módulo tiene
  `real: true|false`. Los `real: false` muestran un placeholder explícito — la
  regla es **nunca inventar datos ni simular funciones que no existen**
  ("no fake buttons"). El mecanismo se conserva para lo que venga, pero **hoy
  los 16 módulos son `real: true`**: no queda ningún placeholder.
- Los 16: Vehículos, Financiación, Clientes, Tareas, Operaciones, Caja,
  Compras, CRM, Redes (id `comunicaciones`), Marketing, Conocimiento, Voz,
  Automatización, Reportes (id `analitica`), Administración, Seguridad.
- **Command Center**: `web/components/jarvis/*` (núcleo, red de nodos,
  conexiones, panel). Respeta `prefers-reduced-motion` y pausa con la pestaña
  oculta.

## Base de datos y seguridad

- **RLS por agencia** en todas las tablas: `agencia_id = public.mi_agencia_id()`.
  Roles con `public.mi_rol()` (`admin` / `vendedor`).
- `mi_agencia_id()` y `mi_rol()` son `security definer` y **deben** conservar
  `execute` para `authenticated` (las usan las policies). Solo se les revoca a
  `anon`/`public` — ver `supabase/security-hardening.sql`.
- **Auditoría**: `audit_log` vía el trigger `registrar_auditoria()`, colgado en
  las 13 tablas del negocio (incluida `movimientos_caja`). `eventos_sesion`
  guarda cada ingreso/salida con IP y dispositivo. Las dos son **de solo lectura
  desde el cliente** — sin policy de insert/update/delete y sin `truncate`, para
  que "el log no se puede borrar" sea cierto — y solo las lee un `admin`.
  `eventos_sesion` la escribe únicamente `POST /api/sesion` con service role.
- `costo_interno` vive en `vehiculo_costos` (policy solo-admin), **no** en
  `vehiculos`.
- Storage: bucket público `vehiculos`; las rutas arrancan con `<agencia_id>/…` y
  las policies de escritura comparan esa primera carpeta contra la agencia.
- **SQL siempre idempotente**: `create table if not exists`,
  `alter … add column if not exists`, `drop policy if exists` antes de
  `create policy`.

### Secretos — regla dura

`SUPABASE_SERVICE_ROLE_KEY`, `ELEVENLABS_API_KEY` y `META_PAGE_TOKEN` son
**server-only**. Nunca `NEXT_PUBLIC_*`, nunca en el cliente. El patrón es
siempre: el navegador manda su token de sesión de Supabase a un endpoint de
`web/app/api/…`, el endpoint valida la sesión con `auth.getUser(token)` y
recién ahí usa el secreto.

### Variables de entorno (Vercel)

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | server (alta de usuarios) |
| `ELEVENLABS_API_KEY` | server (URL firmada de voz) |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | id del agente de voz |
| `META_PAGE_ID` / `META_PAGE_TOKEN` | redes (token de PÁGINA, no de usuario) |
| `IG_USER_ID` / `META_GRAPH_VERSION` | opcionales |

## Endpoints

- `POST /api/elevenlabs-signed-url` — URL firmada para la voz (exige sesión).
- `POST /api/crear-usuario` — alta de usuarios (service role).
- `POST /api/sesion` — registra un ingreso/salida en `eventos_sesion` (service
  role). El usuario y la agencia salen del token, la IP del header: el cliente
  solo elige `tipo`.
- `POST /api/redes/publicar` — publica en Facebook/Instagram.
- `POST /api/redes/retirar` — retira las publicaciones de un vehículo vendido.
- `POST /api/redes/metricas` — refresca desde Meta los contadores de lo que
  sigue publicado, de a 25 por llamada (exige sesión). Lo dispara el usuario
  desde Marketing.
- `GET /api/voz/conversaciones` — historial del agente de ElevenLabs (exige
  sesión). Con `?id=` devuelve la transcripción de una. Pasa por el servidor
  porque `ELEVENLABS_API_KEY` es la misma llave que gasta créditos. Si falta
  configuración contesta **200 con el motivo**, no 500: el panel lo explica en
  vez de mostrar una pantalla rota.
- `GET /api/redes/cron` — publica las programadas que vencieron. Se autentica
  con `CRON_SECRET`, no con sesión: no hay usuario del otro lado. Sin esa
  variable no hace nada.
  **Lo dispara `pg_cron` desde Supabase cada 5 min, no Vercel Cron**: el plan
  Hobby limita los cron a uno por día y un schedule más frecuente hace fallar el
  deploy. Ver `supabase/cron-publicaciones.sql`.
- `GET /api/automatizaciones/cron` — las reglas diarias (seguimientos vencidos y
  stock estancado). Mismo `CRON_SECRET`; lo dispara `pg_cron` a las 11:00 UTC
  (8:00 de Argentina). Ver `supabase/cron-automatizaciones.sql`.

## Automatización

`automatizaciones` guarda una fila por regla y agencia (`activa`, `parametros`,
`ultima_corrida`, `ultimo_resultado`). **Que falte la fila significa
encendida**: una agencia nueva arranca con todo andando y el admin apaga lo que
no quiera. Esa misma regla vale en el panel y en los dos crons — si divergieran,
la pantalla diría una cosa y el servidor haría otra.

- `publicar_programadas` y `retirar_al_vender` ya existían escondidas; ahora se
  ven y se pueden apagar. Apagar la primera **no descarta** lo programado: lo
  deja pendiente para cuando se vuelva a encender.
- `seguimientos_vencidos` y `stock_estancado` crean **tareas reales** (una por
  lead o por auto), deduplicadas por título contra las tareas no hechas. Sin
  vendedor asignado no se inventa un destinatario: se cuenta aparte.
- El trigger de auditoría lleva un `when`: registra encender/apagar y el cambio
  de parámetros, **no** el latido de `ultima_corrida` cada 5 minutos.
- El panel no confía solo en `ultima_corrida`: cuenta contra las tablas del
  negocio (programadas vencidas, pendientes de retiro, leads vencidos, autos
  pasados de tiempo). Si el cron se cuelga, el número acumulado lo delata.

## Voz (ElevenLabs)

Las herramientas se declaran en el dashboard del agente como **Client Tools** y
el nombre debe coincidir **exacto** con la clave del objeto `clientTools` en
`web/components/JarvisCore.tsx`. Patrón: "Esperar respuesta" ON, parámetros
`String` con tipo de valor **LLM Prompt** y no requeridos.

Las 24 tools actuales, por lo que hacen:

- **Consulta**: `consultar_inventario`, `simular_financiacion`,
  `estimar_transferencia_dnrpa`, `datos_cliente`, `resumen_del_dia`,
  `estado_caja`, `reporte_del_mes`, `mis_tareas`, `mis_seguimientos`,
  `auditoria_usuario`, `consultar_clima`, `consultar_conocimiento`.
- **Acción**: `agregar_tarea`, `agregar_cliente`, `registrar_movimiento_caja`,
  `registrar_operacion`, `cambiar_estado_vehiculo`, `cambiar_estado_operacion`,
  `cambiar_estado_lead`, `agendar_seguimiento`, `publicar_en_redes`,
  `publicar_vehiculo_en_redes`.
- **Interfaz**: `mostrar_modulo`, `cambiar_tema`.

El **módulo Voz** publica ese catálogo con una frase de ejemplo por herramienta
(`CATALOGO_VOZ` en `web/lib/voz.ts`) y el historial real de conversaciones vía
`GET /api/voz/conversaciones`. Un catálogo desactualizado sería peor que no
tenerlo, así que `JarvisCore.tsx` termina con una **guarda de tipos**: el tipo
`MismasTools` vale `true` solo si las claves de `clientTools` y `NOMBRES_TOOL`
son el mismo conjunto — agregar una tool en un lado y no en el otro **no
compila**. Lo que ningún tipo puede garantizar es la declaración en el
dashboard de ElevenLabs; por eso el panel muestra los nombres.

Todas devuelven **texto hablado sobre datos reales**; si falta un dato lo dicen,
no lo inventan. Las fechas habladas ("mañana", "en tres días", "el jueves") las
resuelve `interpretarFecha` en `web/lib/crm.ts`, que devuelve `null` cuando no
entiende — ahí JARVIS pregunta en vez de agendar un día equivocado.

## Marketing

Las dos preguntas que Redes no contesta: qué escribo, y qué pasó con lo que ya
publiqué (`web/lib/marketing.ts`).

- `armarPieza(vehiculo, tono, agencia)` compone el texto **desde la ficha**, en
  tres tonos (ficha / aviso / historia). Cada dato entra solo si está cargado:
  un aviso que dice "0 km" sobre un usado sin kilometraje cargado es peor que
  uno que no lo menciona. No hay LLM ni relleno.
- El rendimiento agrupa `publicaciones_redes` por vehículo, **incluidas las
  retiradas**: saber que un auto necesitó seis publicaciones antes de venderse
  es el dato que sirve para el próximo parecido.
- Sin métricas se muestra "sin datos todavía", **nunca un cero** — un cero
  diría "nadie lo tocó" cuando en realidad nunca se preguntó. Igual del lado
  del servidor: si Meta no contesta, no se pisa el último número bueno.
- `metricasFacebook` / `datosInstagram` viven en `lib/server/meta.ts` porque
  ahora las usan dos rutas (retirar y métricas).

## Conocimiento

`documentos` es la base de conocimiento de la agencia: trámites, precios,
políticas, proveedores. Un documento es una nota escrita adentro, un archivo, o
las dos cosas (un `check` impide la fila vacía con solo título).

- La búsqueda es **full-text en castellano** sobre una **columna generada**
  `busqueda tsvector`, no sobre un índice de expresión: desde PostgREST solo se
  puede buscar sobre una columna, así que con la expresión suelta el índice
  existía pero el cliente no lo usaba. Se consulta con
  `textSearch("busqueda", …, { type: "websearch", config: "spanish" })` —
  `websearch` aguanta lo que la gente tipea de verdad, donde `plain` explota con
  un guion suelto.
- El bucket `documentos` es **privado**, al revés que el de fotos: una lista de
  precios o un contrato no tiene por qué leerse sin login. Se abre con
  `createSignedUrl` a 5 minutos. Las rutas arrancan igual con `<agencia_id>/`.
- Borrar es **solo del admin**; corregir lo puede hacer cualquiera y queda en la
  auditoría con su antes → después. Borrar no deja qué comparar.
- `consultar_conocimiento` (voz) busca acá y devuelve un extracto recortado
  alrededor de lo buscado. Si no encuentra, lo dice: inventar el costo de un
  trámite es peor que no contestar.

## Redes sociales

- Formatos: Facebook (Post, **Carrusel**, Reel) · Instagram (Feed, **Carrusel**,
  Historia, Reel). El carrusel va de 2 a 10 fotos; el orden de tildado es el
  orden en que se ven.
- **Publicaciones programadas**: `publicaciones_programadas` guarda el texto y
  las fotos *congelados* al programar — no se releen del vehículo al publicar,
  para que salga lo que se aprobó y no una versión que nadie revisó. El cron las
  marca como publicadas ANTES de intentar (condicionado a que sigan pendientes),
  así dos corridas superpuestas no publican dos veces.
- La lógica de Meta vive en `web/lib/server/meta.ts`, compartida por la ruta que
  dispara el usuario y la del cron: dos copias terminarían publicando distinto.
- Las fotos salen del stock (URL pública de Supabase Storage). Los Reels usan un
  video: se puede pegar la URL o subirlo desde la compu (`subirVideo` en
  `web/lib/media.ts`).
- Cada publicación se registra en `publicaciones_redes` con su `post_id`.
- **Al pasar un vehículo a `vendido`** (hook único en `cambiarEstado` de
  `web/lib/vehiculos.ts`) se dispara `/api/redes/retirar`:
  - **Facebook se borra por API** (con snapshot de métricas).
  - **Instagram y TikTok NO se pueden borrar por API** → quedan en
    `pendiente_retiro` con su permalink, para borrarlos a mano. Es una
    limitación de Meta/TikTok, no del código.
- El historial nunca se borra: alimenta los reportes.

## Convenciones de código

- **Todo en español**: nombres de funciones, variables, comentarios y textos de
  UI. Los identificadores de la base también (`vehiculos`, `agencia_id`, …).
- Comentarios que explican **el por qué**, no el qué. Densidad similar a la del
  código existente.
- Errores al usuario: claros y accionables (`web/lib/errores.ts` →
  `mensajeDeError`). Nunca tragarse un error en silencio si el usuario va a ver
  una pantalla vacía sin explicación.
- Reusar las libs existentes (`lib/vehiculos.ts`, `lib/clientes.ts`,
  `lib/operaciones.ts`, `lib/caja.ts`, `lib/compras.ts`, `lib/tareas.ts`,
  `lib/reportes.ts`, `lib/media.ts`, `lib/redes.ts`) antes de escribir código
  nuevo.
- El lint prohíbe `setState` sincrónico dentro de un `useEffect`: usar
  inicializador perezoso de `useState` o `useSyncExternalStore`.

## Verificación antes de cada commit

```bash
cd web
npx eslint <archivos tocados>
npm run build          # Next.js 16 / Turbopack — tiene que quedar verde
```

El entorno de desarrollo remoto **no tiene red saliente**: no se puede probar en
vivo Supabase, ElevenLabs ni las APIs de Meta. Se valida con lint + build (+
Playwright para render con datos vacíos) y la prueba real la hace el usuario en
producción.

## Flujo de trabajo

1. Rama de desarrollo: `claude/humanizer-repo-o66dsx` (partiendo siempre del
   último `main`; si el PR anterior ya se mergeó, reiniciar la rama desde `main`).
2. Commit por paso, con mensaje que explique el porqué.
3. PR contra `main`; mergear a producción solo cuando el usuario lo pide.
4. Las migraciones de base se aplican al proyecto de Supabase **y** se agregan a
   `supabase/schema.sql` para que queden versionadas.

## Catálogo público (sitio oficial de la agencia)

`GET /api/catalogo?agencia=<uuid>` devuelve el stock publicable en JSON, **sin
sesión**, con CORS abierto, para que `alcoverautomotores.com.ar` lo lea.

- **Es un endpoint y no una policy pública en `vehiculos`** a propósito: darle
  `select` a `anon` sobre la tabla dejaría ver todas las columnas de todas las
  filas — notas internas, el dominio (la patente), borradores y vendidos. Acá
  se elige qué sale, con la lista de campos escrita a mano y **nunca**
  `select("*")`, que filtraría una columna nueva sin que nadie lo note.
- **La regla de negocio**: el catálogo son los `disponible` y `reservado`. Por
  eso marcar un auto como vendido en JARVIS lo saca del sitio solo — el mismo
  hook que ya retira las publicaciones de redes.
- Caché de 60 s en el borde con `stale-while-revalidate`: sin eso cada visita
  al sitio pega en la base.
- **La dirección es Jarvis → sitio, nunca al revés.** Ver "Fuente de verdad del
  stock" en `docs/architecture/decisiones.md`: una sincronización que lea del
  sitio pisaría cada edición hecha en el CRUD y lo dejaría de adorno.
