# Roadmap JARVIS AUTO — fases del prompt de visión vs. estado real

Este documento mapea las 12 fases del prompt de largo plazo del usuario contra lo que **ya existe y
funciona hoy**. Se actualiza al cerrar cada fase — ver también `docs/architecture/decisiones.md`
para el porqué de cada decisión de stack.

Convención de estado: ✅ operativo en producción · 🟡 parcialmente cubierto · ⬜ no iniciado ·
🔒 bloqueado por algo externo al código.

Todo lo marcado 🔒 está detallado en **`docs/phases/pendientes.md`**: qué frena, qué hace falta y
quién lo destraba.

> **Actualizado el 18 de septiembre de 2026.** La versión anterior de este archivo había quedado
> muy atrás de la realidad: daba las Fases 6 y 7 por bloqueadas por una cuota de voz que hacía rato
> se había destrabado, contaba 4 herramientas donde hay 24 y 13 módulos donde hay 16, daba
> Automatización por no iniciada teniendo dos relojes corriendo, y el "próximo paso" era correr un
> schema.sql que ya estaba aplicado. Un roadmap desactualizado es peor que no tenerlo: se planifica
> desde él.

| Fase | Estado | Qué existe / qué falta |
|---|---|---|
| **0 — Fundación** | ✅ | Este documento + `decisiones.md` + la app en `/web` (Next.js 16, TypeScript, Tailwind v4), conectada al Supabase real y desplegada. |
| **1 — JARVIS CORE** | ✅ | Núcleo visual con el isologo girando, estados STANDBY/ESCUCHANDO/RESPONDIENDO/ERROR reales, y **16 módulos** que se abren por voz (`mostrar_modulo`) **o a mano**. Las dos formas a propósito: depender solo de la voz dejaba el sistema entero inalcanzable el día que el proveedor falla. En producción: **https://jarvis-autos-acv.vercel.app/**. Falta 🔒 el archivo del isologo real (pendientes #3). |
| **2 — Fundación de datos** | ✅ | **19 tablas**, todas con RLS multi-tenant por `agencia_id`, verificado contra la base viva en la auditoría de seguridad. El costo interno vive en `vehiculo_costos` aparte, porque RLS es por fila y no por columna. Un lead no es una tabla: es un estado del cliente. |
| **3 — Sistema de vehículos** | ✅ | CRUD completo desde la UI sobre RLS, ciclo de vida real, notas internas, costo separado del precio. Fotos al bucket `vehiculos` bajo `<agencia_id>/<vehiculo_id>/`. Falta migrar las fotos viejas de `/images/<dominio>/` al bucket. |
| **4 — Motor de financiación** | 🟡 | Las cuentas que cuestan plata, determinísticas y con **31 tests**. La fórmula real de la agencia: `valor de tabla × 2,5% + total del presupuesto DNRPA + gestoría`, y si financia, `prenda = (cuota × meses) × 2,5%`, con la gestoría **una sola vez por operación**. Los cuatro errores de septiembre están corregidos y cada uno tiene un test que compara contra el número viejo. El Valor Tabla y el presupuesto se pegan en la pantalla, con el instructivo de la consulta al registro al lado. Falta 🔒 simular la **cuota sola** sin que la ingrese el usuario: eso necesita las tasas de MG Group (pendientes #4). |
| **5 — Clientes y CRM** | ✅ | Lista con buscador y filtro por etapa, alta/edición/borrado, y perfil unificado con contacto, embudo, vehículo de interés, vendedor asignado, historial de interacciones y operaciones. Funciona por voz y a mano. |
| **6 — Sistema de voz** | ✅ | **La cuota se destrabó y la voz funciona en producción.** ElevenLabs Conversational AI: un agente que hace STT + LLM + TTS + turnos. Máquina de estados de activación, wake-word y detección de aplauso del lado del cliente. La URL firmada se pide desde el servidor, exige sesión y está limitada por rate limit (cada conversación gasta cuota, y ya se agotó una vez). |
| **7 — Orquestación de herramientas** | ✅ | **24 client tools**, no 4. Consultar stock, cotizar, cargar clientes, mover leads, agendar seguimientos, registrar operaciones y movimientos de caja, publicar en redes, buscar en el conocimiento, abrir módulos. Ninguna inventa datos: si falta algo, lo dicen. Una guarda en tiempo de compilación obliga a que los nombres del código y los de `lib/voz.ts` no se separen. Falta 🔒 cargar dos textos en el dashboard para que el agente deje de improvisar cuando no encuentra algo (pendientes #11). |
| **8 — Comunicaciones** | 🟡 | **Redes funciona**: publica en Facebook e Instagram (feed, historia, reel y carrusel), con programación y retiro automático al vender. **WhatsApp a medias**: la Edge Function que *recibe* está escrita y probada, inactiva esperando el alta en Meta (pendientes #10); *enviar* necesita plantillas aprobadas. Instagram necesita la cuenta Business vinculada — mismo trámite. |
| **9 — Marketing** | ✅ | Arma el texto del aviso desde la ficha en tres tonos, cada dato entra solo si está cargado. Y el rendimiento de lo publicado por vehículo, **incluidas las publicaciones retiradas**: saber que un auto necesitó seis publicaciones antes de venderse es el dato que sirve para el próximo. Donde no hay números dice "sin datos todavía", nunca cero. |
| **10 — Conocimiento** | ✅ | Trámites, precios, políticas y proveedores: nota escrita, archivo adjunto, o las dos cosas. Bucket privado con enlaces firmados a 5 minutos. La búsqueda full-text en castellano tuvo **dos bugs graves corregidos en septiembre**: el recorte cortaba antes de la respuesta, y la búsqueda exigía *todas* las palabras — así que preguntar como habla la gente devolvía cero. Los dos con tests (**17**). |
| **11 — Automatización** | 🟡 | **Corriendo, no "no iniciado".** Dos relojes en pg_cron: publicar lo programado cada 5 minutos, y las automatizaciones diarias a las 8 de la mañana de Salta (seguimientos vencidos y stock estancado, que crean tareas sin duplicarlas). El módulo deja encender y apagar cada regla por agencia y muestra cuándo corrió y qué hizo. n8n sigue sin usarse: requiere servidor propio y hoy no hace falta. |
| **12 — Seguridad** | ✅ | RLS multi-tenant, RBAC real por comando, audit log inmutable desde el cliente. **Auditoría completa en septiembre de 2026** (ver `pendientes.md` #12): se encontró y cerró un **RCE crítico** de Next.js, dos endpoints que pedían sesión pero no verificaban la agencia —cualquier usuario podía publicar en el Facebook real o leer las conversaciones con clientes—, `anon` con permiso de TRUNCATE sobre las 19 tablas, buckets que aceptaban cualquier tipo de archivo, cero cabeceras de seguridad y cero rate limiting. Todo corregido y verificado contra el servidor corriendo. `npm audit` en 0. Queda 🔒 `script-src` de la CSP (#12.1) y el sitio viejo de la raíz (#12.3). |

## Dónde está parado el proyecto

**Las 12 fases tienen algo real funcionando.** No queda ninguna en cero. Lo que sigue son tres cosas
distintas, y conviene no mezclarlas:

**1. Lo que depende de un trámite o de una decisión del usuario** — están en `pendientes.md` y no se
resuelven escribiendo código:

- Los **dos textos en el dashboard de ElevenLabs** (#11). Es lo más barato y lo que más cambia: sin
  eso el agente puede inventar una respuesta sobre un trámite en vez de decir que no la sabe.
- La **sesión de Meta** para WhatsApp e Instagram (#10). Conviene hacer los dos juntos: es el mismo
  trámite.
- Las **tasas de MG Group** (#4) y el **isologo real** (#3).

**2. Lo que se puede hacer sin depender de nadie:**

- Cerrar `script-src` de la CSP, que necesita cinco minutos de alguien con la consola del navegador
  abierta (#12.1).
- Decidir qué pasa con el **sitio estático viejo** de la raíz (#12.3).
- Los **5 PRs de Dependabot** abiertos.
- Migrar las fotos viejas al bucket.

**3. Lo que es producto, no deuda** — agentes especializados para CRM y Marketing, y la arquitectura
multi-proveedor que el usuario está evaluando. Son decisiones, no pendientes.

## Una nota sobre cómo se rompió este sistema hasta ahora

Los errores caros de este proyecto no fueron caídas. Fueron **respuestas creíbles y equivocadas**:
una transferencia de 19 millones sobre un auto de 18, una gestoría cobrada dos veces, un
procedimiento que el agente completó de su propia cabeza. Ninguno rompió nada; todos se veían bien.

Por eso las dos partes que pueden costar plata —las cuentas de financiación y el material que el
agente lee antes de contestar— son las únicas con tests, y por eso cada corrección deja un test que
compara contra el número viejo. Y por eso el punto más frágil que queda no es código: es el prompt
del agente, que vive en un dashboard sin historial, sin revisión y sin tests.
