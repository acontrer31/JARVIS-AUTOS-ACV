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
  ("no fake buttons").
- **Módulos reales**: Vehículos, Financiación, Clientes, Tareas, Operaciones,
  Caja, Compras, Reportes (id `analitica`), Redes (id `comunicaciones`),
  Administración, Seguridad.
- **Command Center**: `web/components/jarvis/*` (núcleo, red de nodos,
  conexiones, panel). Respeta `prefers-reduced-motion` y pausa con la pestaña
  oculta.

## Base de datos y seguridad

- **RLS por agencia** en todas las tablas: `agencia_id = public.mi_agencia_id()`.
  Roles con `public.mi_rol()` (`admin` / `vendedor`).
- `mi_agencia_id()` y `mi_rol()` son `security definer` y **deben** conservar
  `execute` para `authenticated` (las usan las policies). Solo se les revoca a
  `anon`/`public` — ver `supabase/security-hardening.sql`.
- Auditoría en `audit_log` vía trigger `registrar_auditoria()`.
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
- `POST /api/redes/publicar` — publica en Facebook/Instagram.
- `POST /api/redes/retirar` — retira las publicaciones de un vehículo vendido.

## Voz (ElevenLabs)

Las herramientas se declaran en el dashboard del agente como **Client Tools** y
el nombre debe coincidir **exacto** con la clave del objeto `clientTools` en
`web/components/JarvisCore.tsx`. Patrón: "Esperar respuesta" ON, parámetros
`String` con tipo de valor **LLM Prompt** y no requeridos.

Tools actuales: `consultar_inventario`, `simular_financiacion`,
`estimar_transferencia_dnrpa`, `mostrar_modulo`, `cambiar_tema`,
`consultar_clima`, `mis_tareas`, `agregar_tarea`, `datos_cliente`,
`resumen_del_dia`, `estado_caja`, `registrar_movimiento_caja`,
`agregar_cliente`, `publicar_en_redes`.

Todas devuelven **texto hablado sobre datos reales**; si falta un dato lo dicen,
no lo inventan.

## Redes sociales

- Formatos: Facebook (Post, Reel) · Instagram (Feed, Historia, Reel).
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
