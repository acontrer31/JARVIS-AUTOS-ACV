# Decisiones de arquitectura — JARVIS AUTO

## Contexto

JARVIS empezó como un sitio 100% estático (HTML/CSS/JS sin build, desplegado en GitHub Pages) para
Agencia Alcover Automotores, con Supabase como backend (Postgres + Auth + Edge Functions, esquema
multi-tenant con RLS) y ElevenLabs como capa de voz. Está **en producción real, en uso por la
agencia**.

En agosto de 2026 el usuario trajo una visión de largo plazo mucho más ambiciosa: convertir JARVIS
en un "sistema operativo de IA" real para agencias de autos — un core visual permanente (JARVIS
CORE) con módulos dinámicos (Vehículos, Clientes, Financiación, CRM, Comunicaciones, Marketing,
Conocimiento, Voz, Automatización, Analítica, Administración, Seguridad), sobre un stack sugerido de
Next.js/React/TypeScript/Tailwind + backend propio + PostgreSQL + Docker + n8n.

Regla acordada explícitamente antes de tocar código: **nunca romper lo que ya está en producción**.
Este documento existe para que cualquiera (humano o IA) que retome el proyecto entienda qué se
decidió, por qué, y qué sigue sin resolver.

## Qué se adopta ahora vs. qué se difiere

| Pieza del stack sugerido | Decisión | Por qué |
|---|---|---|
| Frontend: Next.js/React/TypeScript/Tailwind | ✅ Se adopta, en `/web` | Habilita la UX "emergente" que pide la visión (módulos que aparecen como overlay/panel bajo demanda) — muy difícil de sostener a mano en JS vanilla a medida que crecen los módulos. |
| Backend: PostgreSQL + Auth | ✅ Se mantiene **Supabase**, no se reemplaza | Ya está activo, gratis, en producción, con RLS multi-tenant probado. Reemplazarlo por un Postgres propio no aporta nada hoy y suma infraestructura a mantener sin necesidad real. |
| Backend propio (FastAPI/Node API) | ⏸️ Diferido | El prompt lo sugiere para orquestar herramientas/lógica de servidor, pero Supabase (Postgres + RLS + Edge Functions) ya cubre lo que hace falta por ahora. Se reconsidera si aparece una necesidad concreta que RLS/Edge Functions no puedan resolver. |
| Docker | ⏸️ Diferido | Sin backend propio corriendo, no hay nada que contenerizar todavía. |
| n8n (automatización) | ⏸️ Diferido | Fase Once del prompt del usuario — no hay workflows definidos aún que lo justifiquen. |
| Whisper/openWakeWord (voz local) | ⏸️ Diferido | ElevenLabs ya cubre voz conversacional en producción. Reemplazar el detector de wake-word/aplauso (hoy en `script.js`, client-side con Web Audio API) por un servicio local es una optimización futura, no una necesidad actual. |
| Hosting del Next.js nuevo (Vercel u otro) | ⏸️ Sin decidir | Esta fase solo corre y prueba `/web` localmente. Desplegarlo a producción requiere que el usuario cree una cuenta de hosting — no es algo que se pueda hacer por él (misma limitación real que hubo con la cuenta de Supabase al inicio del proyecto). |

## Por qué `/web` y no `/apps/web` (monorepo)

El prompt del usuario sugiere una estructura de monorepo (`/apps/web`, `/apps/api`, `/packages/...`).
No se adopta todavía porque no hay un segundo "app" (backend propio) que justifique la separación —
armar esa estructura ahora sería sobre-ingeniería contra la propia regla del prompt ("Do not
overengineer prematurely"). Si más adelante se suma un backend propio real, ahí se reestructura a
monorepo.

## Cómo conviven las dos apps hoy

- El sitio estático (raíz del repo) sigue desplegándose exactamente igual en GitHub Pages, sin
  cambios. Es lo que Alcover usa día a día.
- `/web` es una app Next.js nueva, independiente, que apunta **al mismo proyecto de Supabase real**
  (mismo `SUPABASE_URL`/`ANON_KEY` que `config.js` del sitio actual) — mismos datos, misma
  autenticación, mismas políticas RLS. No hay dos bases de datos ni datos duplicados.
- `/web` todavía no tiene ninguna pantalla de producto — ver `docs/phases/roadmap.md` para el plan de
  qué se migra y cuándo.

## Fuente de verdad del stock: Jarvis, no el sitio público

La agencia tiene además un sitio público propio (`alcoverautomotores.com.ar`), separado de este repo, con
su catálogo de vehículos.

Decidido con el usuario en agosto de 2026: **la fuente de verdad es Supabase, a través del CRUD de Jarvis**
(Fase 3). El sitio público se importa **una sola vez** para completar lo que falte en la base — vehículos
no cargados, fotos, cuáles ya se vendieron — y de ahí en adelante el stock se carga y edita en Jarvis.

Por qué no una sincronización permanente desde el sitio: sería invertir la dirección del proyecto. El
usuario seguiría cargando en el sitio viejo, Jarvis solo copiaría, y **cada edición hecha en el CRUD se
pisaría con la próxima importación** — el CRUD quedaría de adorno. Además obligaría a un servidor o cron
que corra la sincronización, infraestructura que hoy no existe (ver la tabla de diferidos más arriba).

Dirección de largo plazo: que el sitio público pase a leer de Supabase, como ya lo hace el dashboard
estático de este repo vía `db.js`. Ahí el catálogo público se actualiza solo al cargar un auto en Jarvis,
sin importaciones ni sincronizaciones de ningún tipo.

## Seguridad

- Ningún secreto se commitea. `web/.env.local` (con las claves reales) está gitignoreado; solo
  `web/.env.example` (sin valores) viaja al repo.
- El `ANON_KEY` de Supabase es público por diseño (seguro de exponer client-side) — la seguridad real
  la dan las políticas RLS en Postgres, ya activas y probadas en el sitio actual.
