# JARVIS AUTOS ACV

Panel de control JARVIS para agencias de autos — pensado para arrancar con Agencia Alcover Automotores y evolucionar a un producto multi-agencia por suscripción. HTML, CSS y JavaScript puro (sin build ni framework), instalable como PWA en celular y PC.

## Dónde está corriendo

- **App nueva (Next.js, JARVIS CORE)** — https://jarvis-autos-acv.vercel.app/ · código en `/web`, desplegada
  en Vercel, se actualiza sola con cada push a `main`.
- **Sitio original (estático, PWA)** — este mismo repo en la raíz, servido por GitHub Pages. Es lo que la
  agencia usa día a día; las dos apps leen del **mismo** proyecto de Supabase.

## Uso

Abrí `index.html` en el navegador, o serví la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
```

Sin configurar nada más, el sitio funciona con el catálogo real de Alcover Automotores cargado en `data.js` (modo estático, sin login).

## Contenido

- `index.html` / `style.css` / `script.js` — el dashboard: sidebar, topbar, tarjetas, gráficos, inventario, galería de fotos, panel de análisis, foco central por servicio.
- `data.js` — catálogo de Alcover (fallback estático, se usa si Supabase no está configurado).
- `manifest.json` / `service-worker.js` / `icons/` — PWA: instalable en Android/PC (botón nativo) y iPhone (Agregar a pantalla de inicio), con caché offline de lo esencial.
- `config.js` — credenciales de conexión a Supabase (vacío por defecto).
- `db.js` — capa de datos: usa Supabase si está configurado, si no cae al catálogo estático.
- `login.html` / `login.js` — pantalla de login (solo se activa si Supabase está configurado).
- `supabase/schema.sql` — esquema de base de datos multi-agencia (tablas, seguridad por fila, seed de Alcover).
- `supabase/functions/elevenlabs-webhook/` — Edge Function que guarda sola cada conversación de voz con JARVIS en `interacciones`.

## Activar el modo multi-agencia con Supabase (opcional)

Por defecto el sitio funciona sin backend, con los datos de `data.js`. Para que cada agencia tenga su propio panel con su propio inventario (el objetivo final: vender esto como suscripción a otras agencias), hay que activar Supabase:

1. **Creá el proyecto**: entrá a [supabase.com](https://supabase.com), creá una cuenta gratis y un proyecto nuevo (elegí una región cercana, ej. São Paulo).
2. **Cargá el esquema**: en el proyecto, andá a **SQL Editor → New query**, pegá todo el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y ejecutalo. Esto crea las tablas (`agencias`, `perfiles`, `vehiculos`), la seguridad por fila (cada agencia solo ve sus propios datos) y carga la agencia Alcover con sus 32 vehículos actuales.
3. **Creá tu usuario**: andá a **Authentication → Users → Add user**, cargá tu email y una contraseña.
4. **Vinculá tu usuario a la agencia**: copiá el UUID del usuario que acabás de crear y, en el SQL Editor, corré (reemplazando `TU-UUID-ACA`):
   ```sql
   insert into public.perfiles (id, agencia_id, nombre)
   select 'TU-UUID-ACA', id, 'Agustín'
   from public.agencias where slug = 'alcover';
   ```
5. **Completá `config.js`**: en **Project Settings → API**, copiá la "Project URL" y la clave "anon public", y pegalas en `config.js`:
   ```js
   window.JARVIS_CONFIG = {
     SUPABASE_URL: "https://tu-proyecto.supabase.co",
     SUPABASE_ANON_KEY: "tu-anon-key",
   };
   ```
6. Subí el cambio (commit + push). A partir de ahí, `index.html` va a pedir login y el catálogo se lee en vivo desde la base.

**Para sumar una agencia nueva** (cliente de suscripción), se inserta una fila más en `agencias`, se cargan sus vehículos en `vehiculos` con ese `agencia_id`, y se crea un usuario vinculado — cada una ve únicamente sus propios datos gracias a las políticas de seguridad por fila. Por ahora esto se hace por SQL; el alta con formulario propio y el cobro con Mercado Pago son los próximos pasos del roadmap.

Los datos mostrados fuera del inventario (ventas, leads, análisis) siguen siendo de ejemplo.

### Recuperación de contraseña

Si alguien olvida su contraseña, ya no hace falta que se la resetees vos a mano desde el dashboard de
Supabase: en `login.html` hay un link "¿Olvidaste tu contraseña?" que manda un email de recuperación
(`supabase.auth.resetPasswordForEmail`). El link del mail lleva a `reset-password.html`, donde la
persona elige una contraseña nueva y queda lista para entrar.

⚠️ No se pudo probar el flujo completo en este entorno de desarrollo porque no tiene acceso de red al
CDN de Supabase JS (`cdn.jsdelivr.net`) ni al proyecto real — se verificó sintaxis y estructura, pero
probalo una vez en la práctica (pedí la recuperación con tu propio email) para confirmar que el link
que llega funciona como se espera.

### Backups y exportación de datos

Supabase hace backups automáticos diarios en el plan gratuito (retenidos unos días; los planes pagos
extienden la retención) — no hay nada que configurar de tu lado. Para un backup manual propio (por si
querés guardar una copia aparte antes de un cambio grande):

```bash
# Necesita la Supabase CLI (npm install -g supabase) y estar logueado (supabase login)
supabase db dump --db-url "postgresql://postgres:[tu-password-db]@[tu-host].supabase.co:5432/postgres" -f backup.sql
```

La "Connection string" completa está en **Project Settings → Database**. Guardá ese `backup.sql` en un
lugar seguro (no en este repo — puede contener datos de clientes).

### Memoria de clientes y operaciones

El esquema incluye `clientes` e `interacciones`: un historial único por cliente (llamadas, WhatsApp, visitas, ventas, conversaciones con JARVIS, lo que sea), opcionalmente vinculado a un vehículo del catálogo. Están con la misma seguridad por agencia que el resto. Ejemplo de carga manual desde el SQL Editor:

```sql
-- cliente nuevo
insert into public.clientes (agencia_id, nombre, telefono, notas)
select id, 'Juan Pérez', '+549387510000', 'Interesado en Hilux 0km'
from public.agencias where slug = 'alcover'
returning id;

-- interacción (usando el id de cliente que devolvió el insert anterior)
insert into public.interacciones (agencia_id, cliente_id, tipo, resumen)
values ('AGENCIA-ID', 'CLIENTE-ID', 'whatsapp', 'Consultó precio y financiación de la Hilux DX 0km');
```

Por ahora la carga de clientes se hace a mano por SQL — falta la pantalla en el panel para verlo/cargarlo sin entrar a Supabase (próximo paso). Las conversaciones de voz con JARVIS, en cambio, ya se pueden capturar solas — ver "Captura automática de conversaciones de voz" más abajo.

## Activar la voz de JARVIS (ElevenLabs, opcional)

El botón de micrófono del panel lateral puede conectarse a un agente conversacional real (habla y escucha) de ElevenLabs. Sin configurar, solo muestra un aviso al tocarlo.

1. **Creá tu cuenta**: entrá a [elevenlabs.io](https://elevenlabs.io) y registrate (la Conversational AI tiene minutos limitados en el plan gratis; para uso real de la agencia conviene un plan pago).
2. **Voz para la demo (clon)**: en **Voices → Add Voice → Instant Voice Clone**, subí el audio de referencia y ponele un nombre (ej. "Jarvis Demo"). ⚠️ Este clon es **solo para la demo/prueba interna** — antes de vender el producto a una agencia real hay que reemplazarlo por una voz propia del catálogo de ElevenLabs (sin clonar), para evitar problemas de marca/derechos con terceros.
3. **Creá el agente**: andá a **Conversational AI → Agents → New Agent**. Sugerencia de configuración:
   - **Nombre**: JARVIS
   - **Voz**: para la demo, elegí la voz clonada del paso anterior. Para producción/venta, elegí una voz original del catálogo.
   - **System prompt** (personalidad e instrucciones). Pensado para que actúe como esos setups de "hablále a tu computadora y se ejecuta al toque" — directo, natural, sin rodeos, y que además celebre los números buenos del negocio en vez de solo informarlos:
     > Sos JARVIS, el asistente de voz de Agencia Alcover Automotores en Salta. Hablás en español rioplatense, de vos, corto y directo — como la mano derecha de Agustín, no como un robot de call center. Nada de repetir la pregunta antes de responder ni de explicaciones largas: confirmá lo que vas a hacer en una frase y listo (ej: "Dale, te abro el inventario", "Ya te paso los leads de hoy").
     >
     > Tenés dos herramientas. consultar_inventario te da el stock REAL de vehículos (marca, modelo, año, km, precio, si está destacado) — usala SIEMPRE que pregunten por un auto puntual, precio, disponibilidad o por el stock en general, nunca respondas de memoria ni digas que no tenés acceso a esos datos. simular_financiacion calcula un valor de cuota aproximado para un auto del stock — usala cuando pidan simular cuotas o financiación, pasándole el modelo y la cantidad de cuotas si la mencionan (si no, se usan 12 por defecto). Si esta herramienta responde que hace falta una sesión iniciada, explicaselo al usuario con naturalidad.
     >
     > Para lo demás (cómo funciona el panel, financiación, proceso de compra en general) respondé con tu criterio, corto y directo, sin inventar cifras que no tengas confirmadas.
     >
     > Cuando haya una buena noticia del negocio (una venta, un objetivo cumplido, muchos leads nuevos), anuncialo con energía y corto, tipo logro conseguido — no como un reporte formal.
   - **First message** (el saludo que dice JARVIS apenas arranca la conversación, sin esperar que hables primero): escribí ahí literalmente
     > Hola Agustín. Pedime lo que necesites — inventario, clientes, lo que sea — y me encargo.
   - Dejá el resto de las opciones (idioma español, modelo, latencia) en su valor por defecto para arrancar.
4. **Copiá el Agent ID**: está en la configuración del agente (o en la pestaña "Embed"). Es un identificador público, seguro para pegar en el código (no es tu API key secreta).
5. **Completá `config.js`**:
   ```js
   window.JARVIS_CONFIG = {
     ...
     ELEVENLABS_AGENT_ID: "tu-agent-id",
   };
   ```
6. Subí el cambio (commit + push). El widget oficial de ElevenLabs se carga solo y aparece como burbuja flotante; el mic del panel lateral hace scroll hacia él.

### Que JARVIS conozca el stock real (herramienta de inventario)

El sitio ya expone una función (`consultar_inventario`) que el agente puede llamar para traer datos reales del catálogo (marca, modelo, precio, km, si está destacado) en vez de responder en general. Falta un paso de tu lado, en el dashboard de ElevenLabs:

1. Entrá al agente → pestaña **Herramientas** (o "Tools").
2. Creá una herramienta nueva de tipo **Cliente** ("Client tool"), con:
   - **Nombre**: `consultar_inventario` (tiene que ser exactamente ese texto, sin espacios).
   - **Descripción**: algo como "Consulta el stock real de vehículos de la agencia. Usarla siempre que pregunten por precio, disponibilidad o características de un auto puntual, o por el stock en general."
   - **Parámetro**: `modelo` (tipo texto, opcional) — "Marca o modelo de auto a buscar, por ejemplo 'Hilux' o 'Amarok'. Dejar vacío para un resumen general del stock."
3. Guardá y probá preguntándole a JARVIS por un auto del catálogo real (ej. "¿Tenés alguna Hilux?").

⚠️ No pude verificar en vivo el nombre exacto del evento/API que usa el widget embebido para registrar herramientas del lado del cliente (sin acceso a la documentación de ElevenLabs esta sesión) — el código está armado con mi mejor entendimiento de cómo funciona. Si al preguntarle por un auto JARVIS no usa el dato real, avisame y lo revisamos con la consola del navegador, igual que hicimos con la voz.

### Simular financiación (herramienta sensible, con autorización)

Además de `consultar_inventario`, el sitio expone `simular_financiacion`: calcula un valor de cuota aproximado (precio dividido en cuotas, sin interés — no tenemos tasas ni condiciones bancarias reales cargadas, así que JARVIS lo aclara siempre como orientativo, no una cotización oficial). A diferencia de la de inventario, esta es una acción "sensible" — antes de calcular nada, el código verifica que haya una sesión de panel iniciada en el dispositivo (`requiereSesionJarvis()` en `script.js`); si no la hay, responde que hace falta iniciar sesión primero, en vez de calcular igual.

Configuración en ElevenLabs (mismo lugar que la anterior, pestaña **Herramientas**):
- **Nombre**: `simular_financiacion` (exacto).
- **Descripción**: "Simula el valor de cuota aproximado de un vehículo del stock. Usar cuando pidan simular financiación, cuotas, o cuánto saldría un auto financiado."
- **Parámetros**: `modelo` (texto) — "Auto a simular, ej. 'Hilux'." y `cuotas` (número, opcional) — "Cantidad de cuotas, ej. 12, 24, 48. Si no se especifica, se usan 12."

⚠️ **Importante sobre "autorización" acá**: esto confirma que hay una sesión de panel abierta en ese dispositivo/navegador — no verifica quién está hablando. No existe forma de identificar a una persona por su voz puntual con este stack (ElevenLabs + navegador). Si en algún momento hace falta saber específicamente qué vendedor está usando JARVIS (no solo que "alguien" está logueado), hay que sumar login por PIN/voz de cada vendedor — no está construido todavía.

### Estimar costo de transferencia por voz

El sitio también expone `estimar_transferencia_dnrpa` — información pública (no requiere sesión iniciada, mismo criterio que `consultar_inventario`). Ver el detalle de la fórmula y de cómo cargar el dato por vehículo en la sección "Estimador de costo de transferencia DNRPA" más abajo.

Configuración en ElevenLabs:
- **Nombre**: `estimar_transferencia_dnrpa` (exacto).
- **Descripción**: "Estima el costo de transferencia de DNRPA para un vehículo del stock. Usar cuando pregunten cuánto sale transferir, patentar o pasar a nombre un auto."
- **Parámetro**: `modelo` (texto) — "Auto a estimar, ej. 'Hilux'."

### Transferencias, valuaciones y financiación reales (DNRPA / InfoAuto / MG Group)

Para el costo real de transferencia (DNRPA), la valuación real de un vehículo (InfoAuto) y la tasa real de financiación (portal de MG Group), el panel **no calcula nada propio** — la sección **Configuración** tiene tres botones que abren cada sitio oficial en una pestaña nueva. Se decidió así (en vez de automatizar la consulta) porque:

- Los tres piden login con usuario/contraseña — nunca hay que cargar esas credenciales en el código del sitio (es público), solo como secreto de un proceso de servidor si algún día se automatiza.
- Ninguno de los tres es accesible desde este entorno de desarrollo, así que no se pudo construir ni probar una integración en vivo.
- Es la opción más segura y siempre exacta: la fuente real, sin mantenimiento de nuestro lado.

`simular_financiacion` (ver arriba) sigue dando un número orientativo rápido por voz, pero ahora aclara que la tasa real hay que confirmarla en el portal de MG Group.

#### Estimador de costo de transferencia DNRPA

A diferencia de InfoAuto y MG Group, para DNRPA sí construimos un cálculo propio — la fórmula del arancel de transferencia es pública y no requiere login. Se armó y verificó con **3 ejemplos reales** del estimador oficial (`www2.jus.gov.ar/dnrpa-site`, provincia Salta): un Ford Ka importado, una VW Nivus importada y un Fiat Cronos nacional. En los tres casos:

```
Total = 1% del Valor Tabla + $1.300 (arancel fijo, Res. 314/02)
```

(La expedición de cédula y título siempre se cancelan al 100% con su bonificación vigente en los tres ejemplos, así que no suman al total. Nacional e importado dan la misma alícuota — no hay que distinguir origen en la fórmula.)

El "Valor Tabla" es un valor de referencia oficial de DNRPA, **distinto del precio de venta**. No hay forma de consultarlo en vivo desde el sitio, así que se carga a mano por vehículo:

```sql
update public.vehiculos set valor_tabla_dnrpa = 18308800 where id = 'uuid-del-auto';
```

Con eso cargado, el estimador aparece en **Configuración → Estimar costo de transferencia (DNRPA)** (elegís el auto o escribís un valor manual) y también como herramienta de voz `estimar_transferencia_dnrpa` (parámetro `modelo`, sin necesidad de sesión iniciada — es información pública). Siempre muestra el disclaimer oficial: pueden sumarse formularios de rentas, certificación de firmas, cédulas adicionales o mora de firma (20% del arancel si se pasan los 90 días).

⚠️ No cubre la **inscripción inicial de 0km** (es un trámite distinto, con otra fórmula) — no se armó porque no tenemos un ejemplo real confirmado todavía. Si hace falta, se agrega aparte con datos reales, no por extrapolación.

### Captura automática de conversaciones de voz

Cada charla por voz con JARVIS (ElevenLabs) se puede guardar sola en la memoria del negocio (`interacciones`, con `tipo = 'voz_jarvis'`), sin cargar nada a mano. Funciona con una Edge Function de Supabase (`supabase/functions/elevenlabs-webhook`) que ElevenLabs llama automáticamente cada vez que termina una conversación.

⚠️ **Esto necesita Supabase activo** (ver más arriba) y, para desplegar la función, la [CLI de Supabase](https://supabase.com/docs/guides/cli) instalada en tu máquina (`npm install -g supabase`) — desde este entorno de desarrollo no tengo acceso a `elevenlabs.io` para confirmar en vivo el formato exacto del webhook, así que la función está armada para tolerar variaciones razonables del payload, pero probémosla juntos la primera vez.

1. **Vinculá tu agente a tu agencia**: en el SQL Editor de Supabase, cargá el Agent ID de tu agente de ElevenLabs (el mismo de `config.js`) en la agencia correspondiente:
   ```sql
   update public.agencias set elevenlabs_agent_id = 'tu-agent-id' where slug = 'alcover';
   ```
   (La agencia Alcover ya viene con esto cargado si corriste el `schema.sql` actualizado.)
2. **Elegí un secreto propio** para que nadie más pueda llamar a tu webhook — cualquier texto largo y random te sirve, por ejemplo generado con `openssl rand -hex 24`.
3. **Desplegá la función** desde la carpeta del proyecto:
   ```bash
   supabase login
   supabase link --project-ref tu-project-ref
   supabase secrets set WEBHOOK_SECRET=tu-secreto-elegido
   supabase functions deploy elevenlabs-webhook --no-verify-jwt
   ```
   Esto te va a dar una URL parecida a `https://tu-project-ref.supabase.co/functions/v1/elevenlabs-webhook`.
4. **Configurá el webhook en ElevenLabs**: en el agente (Conversational AI → tu agente → Webhooks o Analysis/Post-call webhooks, el nombre exacto puede variar según la versión del dashboard), pegá:
   ```
   https://tu-project-ref.supabase.co/functions/v1/elevenlabs-webhook?token=tu-secreto-elegido
   ```
5. Probá una conversación de voz con JARVIS y fijate en Supabase (**Table Editor → interacciones**) que haya aparecido la fila nueva. Si no aparece, revisá **Edge Functions → elevenlabs-webhook → Logs** en Supabase — ahí se ve el motivo (agente no vinculado, formato de payload distinto al esperado, etc.) y lo ajustamos juntos.

La función nunca inventa nada: si no logra armar un resumen automático, guarda igual la conversación con un texto genérico y el payload completo en `datos_origen`, para no perder información aunque falle la extracción.

### Activación por aplauso o diciendo "Jarvis"

El mic del panel también se activa solo, sin tocar nada, de dos formas:

- **Aplauso**: detecta un pico de volumen breve que sube y baja rápido (100-300ms) — un sonido sostenido tipo TV, música o charla no lo dispara porque no "baja" a tiempo. No es un modelo entrenado, así que un golpe seco y corto (un portazo) igual lo puede confundir con un aplauso; si da falsos positivos muy seguido, avisame y le subo el umbral.
- **Decir "Jarvis"** (solo o en cualquier frase, ej. "hola Jarvis"): usa reconocimiento de voz del navegador — solo funciona en Chrome/Android, no en Safari/iPhone. Al ser un detector simple de palabra, también puede dispararse si alguien nombra "Jarvis" sin dirigirse al asistente (charlando de la película, por ejemplo) — es una limitación real, no hay forma de eliminarla del todo sin un modelo de wake-word entrenado.

Notas generales:

- **La primera vez hay que tocar el mic con la mano** — los navegadores no dejan pedir permiso de micrófono sin un click real; después de ese primer toque, queda escuchando en segundo plano el resto de la visita.
- Por las políticas de autoplay de los navegadores, es posible que el audio de JARVIS no se escuche hasta que haya habido al menos un click real en la página en esa sesión — probalo y contame si pasa.
- Si no hay actividad nueva por 90 segundos, la conversación se corta sola y JARVIS vuelve a esperar en silencio (no queda escuchando innecesariamente).
- La activación (aplauso o palabra clave) **no da acceso a nada sensible por sí sola** — es solo el disparador para empezar a hablar. Cualquier herramienta que en el futuro toque datos sensibles (precios, financiación, datos personales) debería verificar que haya una sesión de panel iniciada en el dispositivo antes de ejecutar algo (`requiereSesionJarvis()` en `script.js`) — ojo, esto confirma que hay una sesión abierta en el dispositivo, **no quién está hablando**: no hay forma de verificar la identidad de una voz puntual con este stack.

### Cuidar el saldo de las APIs

Ni Supabase ni ElevenLabs son gratis a partir de cierto uso — para que JARVIS no se corte en medio de una conversación o se quede sin base de datos justo cuando más se usa:

- **ElevenLabs**: en tu cuenta → Usage, mirá cuántos minutos de conversación te quedan del plan. Si lo usás a diario con clientes reales, conviene un plan pago desde el arranque (el free tiene minutos muy limitados). El panel ya avisa solo si la voz no responde (por saldo agotado u otro motivo) — ver "Titulares grandes" más abajo, o el mensaje debajo del botón de micrófono.
- **Supabase**: el plan free tiene límites de filas, ancho de banda y llamadas — para el volumen de una sola agencia alcanza de sobra, pero conviene revisar **Project Settings → Billing** cada tanto si en algún momento se suman más agencias (el objetivo de venderlo como suscripción).
- Ninguno de los dos corta el sitio entero si se quedan sin saldo: el catálogo cae al modo estático (`data.js`) si Supabase no responde, y la voz muestra un aviso en vez de quedar colgada si ElevenLabs no responde.

### Titulares grandes junto al avatar

Al abrir Ventas, Finanzas, Leads o Inventario, arriba del panel aparece un titular grande y en blanco con el dato real del momento (ej. "18 VENTAS ESTE MES", "32 AUTOS EN STOCK") — al estilo de los videos de setups con IA donde el resultado aparece como logro, no como un dato más perdido en una tabla.

### Foco central: un servicio a la vez, junto al avatar

En vez de mostrar todo el dashboard mezclado, cada opción del menú (Inventario, Clientes, Leads, Ventas, Finanzas, Marketing, Análisis, Tareas, Configuración) se abre en pantalla grande y centrada, con el avatar de JARVIS animado arriba y solo el contenido de ese servicio debajo. El resto del panel queda atenuado detrás.

- **Por click/toque**: tocá la opción en el menú lateral (o en el menú inferior en celular).
- **Por voz**: si la voz está configurada (ver más abajo) y el navegador soporta reconocimiento de voz (Chrome/Android; no disponible en Safari/iOS), pedirlo con frases como "mostrame el inventario", "cómo vienen las ventas" o "abrí clientes" abre el mismo panel automáticamente. Decir "cerrar" o "volver al inicio" cierra el foco y vuelve al dashboard.
- Se cierra con la "×", tocando fuera del panel, con la tecla Escape, o pidiéndolo por voz.
- "Dashboard" siempre vuelve a la vista normal completa (el estado de inicio).

## Seguridad

Ningún sitio es "inhackeable", pero esto es lo que está aplicado y por qué (y lo que queda pendiente):

**Ya aplicado:**
- **Content-Security-Policy** en `index.html` y `login.html`: solo permite cargar scripts desde el propio sitio, jsdelivr (Supabase) y unpkg (ElevenLabs) — bloquea que se inyecte y ejecute JavaScript de otro origen. `object-src 'none'` y `base-uri 'self'` cierran vectores clásicos de inyección.
- **Todo el texto dinámico se escapa antes de insertarse en el HTML** (`escapeHtml()` en `script.js`): nombres/versiones de autos, nombre de agencia, etc. Hoy esos datos son propios, pero en el modo multi-agencia van a poder cargarlos otras agencias — así ninguna puede inyectar HTML/JS a través del nombre de un auto.
- **`dominio` (patente) se sanitiza** antes de usarse en una URL de imagen (`sanitizeDominio()`), para que no se pueda manipular la ruta del archivo.
- **RLS (Row Level Security) en Supabase**: cada agencia solo puede leer/escribir sus propios datos (`agencia_id`). No hay política de `insert`/`update` en `agencias` ni `perfiles` desde el cliente — un usuario no puede auto-asignarse a otra agencia ni cambiar su propio rol; esas altas se hacen a mano por SQL. La función que resuelve "tu agencia" usa `security definer` con `search_path` fijo (evita el ataque clásico de hijacking de `search_path` en Postgres).
- **Ninguna clave secreta vive en el repo**: `SUPABASE_ANON_KEY` y `ELEVENLABS_AGENT_ID` son identificadores públicos pensados para exponerse en el cliente (la seguridad real la da RLS del lado de Supabase, no el secreto de esas claves). La clave `service_role` de Supabase, el token de acceso de Mercado Pago y el secreto de la App de Meta **nunca deben pegarse acá** — cuando se necesiten (fases futuras), van como secreto de una función servidor (Edge Function de Supabase), nunca en el código del sitio.
- **Webhook de voz protegido**: `supabase/functions/elevenlabs-webhook` usa la clave `service_role` (que nunca sale de Supabase) y exige un secreto propio por query string (`WEBHOOK_SECRET`, configurado con `supabase secrets set`) para aceptar una conversación — sin ese secreto, cualquier llamada se rechaza con 401.
- **HTTPS obligatorio**: GitHub Pages sirve todo por HTTPS automáticamente.
- **Índices y restricciones en la base**: `vehiculos` y `clientes` tienen índice por `agencia_id` (las consultas más frecuentes), y `vehiculos` valida con `CHECK` que `precio`, `km` y `valor_tabla_dnrpa` nunca sean negativos — la base rechaza esos datos inválidos aunque un bug del frontend intente insertarlos.
- **Recuperación de contraseña propia** (ver sección arriba) — nadie necesita compartir su contraseña ni depender de un reseteo manual.
- **`rls_auto_enable()` revisada y cerrada**: es un event trigger que trae Supabase (no es una función de este proyecto) — se dispara solo al crear una tabla nueva en `public` y le prende RLS automáticamente, como red de seguridad extra. El Security Advisor la marcaba como "security definer ejecutable públicamente", pero al devolver `event_trigger` Postgres no permite invocarla directo como una función cualquiera. Igual, como buena práctica, se le sacó el permiso de ejecución público: `revoke execute on function public.rls_auto_enable() from public;` (ya corrido en el proyecto real).

**No disponible en el plan actual de Supabase (no es un pendiente accionable, ni de código ni de configuración):**
- **"Protección de contraseña filtrada" (leaked password protection)**: en **Authentication → Sign In/Providers → Email**, este switch está bloqueado — Supabase lo reserva para planes pagos (chequea contra la base de HaveIBeenPwned). No bloquea nada más: la recuperación de contraseña propia y el resto de la seguridad de Auth funcionan igual en el plan gratuito. Si en algún momento se pasa a un plan pago, es solo activar el switch.

**Limitaciones conocidas (por ser un sitio 100% estático en GitHub Pages):**
- No se puede fijar `X-Frame-Options` / `frame-ancestors` por header real (GitHub Pages no permite headers custom), así que la protección contra clickjacking vía header no está disponible — el CSP vía `<meta>` tampoco puede incluir `frame-ancestors` (el navegador lo ignora ahí). Si esto llegara a importar en producción, la solución es servir el sitio detrás de Cloudflare (gratis) que sí permite agregar headers.
- Las librerías externas (Supabase JS, widget de ElevenLabs) se cargan por versión mayor (`@2`) sin hash de integridad (SRI) — quedó pendiente calcular los hashes exactos porque este entorno de desarrollo no tuvo acceso de red a esos CDNs para generarlos. Se puede agregar más adelante corriendo `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A` y pegando el resultado en un atributo `integrity=""`.

**Recomendado hacer del lado de las cuentas** (no es código, son configuraciones de cada servicio):
- Activar verificación en dos pasos (2FA) en GitHub, Supabase y ElevenLabs.
- En Supabase, revisar periódicamente **Authentication → Rate Limits** y dejar activada la confirmación de email para altas de usuarios.
- Cuando se sume Mercado Pago o Meta, esos tokens van a Supabase Edge Functions (secretos server-side), nunca a `config.js`.
- Mantener las dependencias (versiones de Supabase JS / widget de ElevenLabs) actualizadas de vez en cuando — son la superficie de ataque más probable a mediano plazo (cadena de suministro).
