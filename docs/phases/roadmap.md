# Roadmap JARVIS AUTO — fases del prompt de visión vs. estado real

Este documento mapea las 12 fases del prompt de largo plazo del usuario contra lo que **ya existe y
funciona hoy** en el sitio actual (producción, Alcover Automotores), para no reconstruir de cero lo
que ya está resuelto. Se actualiza al cerrar cada fase — ver también `docs/architecture/decisiones.md`
para el porqué de cada decisión de stack.

Convención de estado: ✅ operativo en producción · 🟡 parcialmente cubierto por el stack actual · ⬜
no iniciado · 🔒 bloqueado por algo externo al código.

Todo lo marcado 🔒 está detallado en **`docs/phases/pendientes.md`**: qué frena, qué hace falta y quién
lo destraba. Esa es la lista para ir bajando de a uno.

| Fase (prompt del usuario) | Estado | Qué ya existe / qué falta |
|---|---|---|
| **Fase 0 — Fundación** | ✅ | Este documento + `docs/architecture/decisiones.md` + scaffold `/web` (Next.js + TypeScript + Tailwind, conectado al Supabase real, probado con build y login en vivo). |
| **Fase 1 — JARVIS CORE** | 🟡 en curso | Construido en `/web`: núcleo visual grande con el isologo (colores + tipografía Plastik real, licencia GPL v2) girando en el centro, estados STANDBY/ESCUCHANDO/RESPONDIENDO/ERROR reales, y los 13 módulos ocultos por defecto. Se pueden abrir por voz (`mostrar_modulo`) **o manualmente** con el acceso discreto "módulos" bajo el core — agregado en la Fase 3 porque depender solo de la voz dejaba el sistema entero inalcanzable cuando el proveedor de voz falla. Vehículos y Financiación abren workspace con datos reales de Supabase; el resto avisa "próximamente". Desplegado en Vercel. Falta: 🔒 la voz corta por cuota agotada de ElevenLabs (pendientes.md #1) y 🔒 subir el archivo real del isologo (pendientes.md #3); además migrar el resto de pantallas (Clientes, Configuración) que siguen solo en el sitio estático. |
| **Fase 2 — Fundación de datos** | ✅ | Al esquema base (`agencias`, `perfiles`, `vehiculos`, `clientes`, `interacciones`, todo con RLS multi-tenant por `agencia_id`) se sumó: ciclo de vida + `costo_interno` + `notas` en `vehiculos`; tabla **`vehiculo_media`** (fotos/videos/documentos por vehículo); campos de lead en `clientes` (`estado_lead`, `vehiculo_interes_id`, `presupuesto`, `vendedor_id`); y tabla **`operaciones`** (venta/reserva/permuta/consignación). Todo idempotente y con RLS por agencia — verificado corriendo `schema.sql` dos veces seguidas contra un Postgres 16 real. Un lead **no** es tabla aparte a propósito: es un estado del cliente, no otra entidad. Diferidos con criterio: `marketing_assets` (Fase 9) y `audit_log` (Fase 12), que se crean cuando tengan un consumidor real. |
| **Fase 3 — Sistema de vehículos** | ✅ | **CRUD completo desde la UI** (`VehiculosWorkspace` + `VehiculoForm`): alta, edición, borrado, cambio de estado en línea y filtro por estado, sobre la política RLS `"editar vehiculos de mi agencia"` que ya existía sin usarse. Ciclo de vida real (`borrador/disponible/reservado/vendido/no_disponible`), costo interno separado del precio de venta y notas internas. Los 32 vehículos ya cargados quedan en `disponible` por default — el sitio estático en producción no se entera. Se acabó el "solo se carga por SQL". Falta: 🔒 subir fotos desde el formulario, que necesita un bucket de Storage (pendientes.md #7) — hasta entonces siguen como archivos en `/images/<dominio>/`. |
| **Fase 4 — Motor de financiación** | 🔒 | Ya existen dos motores determinísticos reales, sin inventar números: `simular_financiacion` (precio ÷ cuotas, sin interés — deja explícito que no es cotización oficial) y `calcularCostoTransferenciaDNRPA` (1% del valor tabla + arancel fijo, verificado con 3 ejemplos reales de DNRPA). Bloqueado: faltan las tasas/CFT reales de MG Group (pendientes.md #4) — sin ese dato, cualquier número sería inventado. |
| **Fase 5 — Clientes y CRM** | ✅ | **Módulo Clientes real en `/web`**: lista con buscador y filtro por etapa del embudo, alta/edición/borrado (`ClientesWorkspace` + `ClienteForm`) y **perfil unificado** (`PerfilCliente`) que junta en una sola pantalla contacto, etapa, vehículo de interés, presupuesto, vendedor asignado, historial de interacciones y operaciones. El historial se puede anotar a mano (llamada/WhatsApp/visita/email) y convive con las conversaciones que ya cargaba sola la Edge Function de voz (`tipo = 'voz_jarvis'`). `operaciones` deja de ser una tabla vacía: se muestra en el perfil, en solo lectura. Requirió una política RLS nueva — `"ver perfiles de mi agencia"` — porque `perfiles` solo dejaba ver la fila propia y el selector de vendedor asignado mostraba un único nombre; verificado con SQL real que un usuario de otra agencia sigue sin ver nada ajeno. Falta: 🔒 la recuperación por voz ("mostrame el perfil de Carlos"), que depende de la cuota de ElevenLabs (pendientes.md #1). |
| **Fase 6 — Sistema de voz** | 🔒 | ElevenLabs Conversational AI operativo a nivel código (máquina de estados de activación, detección de aplauso y wake-word client-side, gate `requiereSesionJarvis()` — que NO es verificación de identidad por voz). Bloqueado: la cuenta se quedó sin cuota y toda conversación corta a 1-2s con `This request exceeds your quota limit` (pendientes.md #1). La alternativa de voz local (Pipecat + Whisper.cpp + Ollama + Piper) está evaluada y es viable, pero necesita servidor propio (pendientes.md #2). |
| **Fase 7 — Orquestación de herramientas** | 🔒 | 4 client tools reales registradas: `consultar_inventario`, `simular_financiacion`, `estimar_transferencia_dnrpa` y `mostrar_modulo` — todas devuelven datos reales o avisan explícitamente cuando falta información, nunca inventan. Bloqueado por lo mismo que la Fase 6: sin voz no se pueden invocar. |
| **Fase 8 — Comunicaciones** | 🔒 | No iniciado. Requiere cuenta de WhatsApp Business API (costo + aprobación) — ver pendientes.md. |
| **Fase 9 — Marketing** | ⬜ | No iniciado. |
| **Fase 10 — Conocimiento** | ⬜ | No iniciado. Hoy la única "fuente de verdad" externa son los 3 links directos (DNRPA/InfoAuto/MG Group) en Configuración — sin ingesta ni indexación real. |
| **Fase 11 — Automatización** | 🔒 | No iniciado. n8n requiere servidor propio. La única automatización real hoy es la Edge Function que captura conversaciones de voz (`supabase/functions/elevenlabs-webhook`). |
| **Fase 12 — Seguridad** | 🟡 | RLS multi-tenant activo y probado (incluidas las tablas nuevas de la Fase 2); `mi_agencia_id()` restringida a rol `authenticated`; secretos nunca commiteados. Faltan: RBAC más allá de "pertenece a una agencia", audit log real, rate limiting, y dos ítems 🔒 en manos del usuario — la función `rls_auto_enable()` marcada por el Security Advisor (pendientes.md #5) y el toggle de protección de contraseña filtrada (pendientes.md #6). |

## Próximo paso

Fases 2, 3 y 5 cerradas. **Antes de que nada de eso funcione en producción hay que correr
`supabase/schema.sql` en el SQL Editor de Supabase** — hasta entonces Vehículos y Clientes van a mostrar
el error real de Postgres (`column vehiculos.estado does not exist` y equivalentes), porque la app ya pide
las columnas y políticas nuevas. Es un solo paso manual y cubre las tres fases de una.

**Ya no queda ninguna fase que se pueda avanzar entera sin destrabar algo externo.** Lo que sigue son los
bloqueos de `pendientes.md`, para ir bajándolos de a uno:

1. **Cuota de ElevenLabs** (#1) — destraba las Fases 6, 7 y lo que falta de la 1. Es el que más desbloquea.
2. **Política de red del entorno** (#9) — habilita importar el catálogo del sitio de la agencia.
3. **Bucket de Storage** (#7) — habilita subir fotos desde el CRUD, lo último que le falta a la Fase 3.
4. **Tasas reales de MG Group** (#4) — destraba la Fase 4.

Lo único que sí se puede avanzar sin depender de nadie es la parte de **Fase 12** que no está bloqueada:
RBAC (roles admin/vendedor diferenciados) y el `audit_log` con sus triggers.
