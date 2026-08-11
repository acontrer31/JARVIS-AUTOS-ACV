# JARVIS AUTOS ACV

Panel de control JARVIS para agencias de autos — pensado para arrancar con Agencia Alcover Automotores y evolucionar a un producto multi-agencia por suscripción. HTML, CSS y JavaScript puro (sin build ni framework), instalable como PWA en celular y PC.

## Uso

Abrí `index.html` en el navegador, o serví la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
```

Sin configurar nada más, el sitio funciona con el catálogo real de Alcover Automotores cargado en `data.js` (modo estático, sin login).

## Contenido

- `index.html` / `style.css` / `script.js` — el dashboard: sidebar, topbar, tarjetas, gráficos, inventario, galería de fotos, panel de análisis.
- `data.js` — catálogo de Alcover (fallback estático, se usa si Supabase no está configurado).
- `manifest.json` / `service-worker.js` / `icons/` — PWA: instalable en Android/PC (botón nativo) y iPhone (Agregar a pantalla de inicio), con caché offline de lo esencial.
- `config.js` — credenciales de conexión a Supabase (vacío por defecto).
- `db.js` — capa de datos: usa Supabase si está configurado, si no cae al catálogo estático.
- `login.html` / `login.js` — pantalla de login (solo se activa si Supabase está configurado).
- `supabase/schema.sql` — esquema de base de datos multi-agencia (tablas, seguridad por fila, seed de Alcover).

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

## Activar la voz de JARVIS (ElevenLabs, opcional)

El botón de micrófono del panel lateral puede conectarse a un agente conversacional real (habla y escucha) de ElevenLabs. Sin configurar, solo muestra un aviso al tocarlo.

1. **Creá tu cuenta**: entrá a [elevenlabs.io](https://elevenlabs.io) y registrate (la Conversational AI tiene minutos limitados en el plan gratis; para uso real de la agencia conviene un plan pago).
2. **Voz para la demo (clon)**: en **Voices → Add Voice → Instant Voice Clone**, subí el audio de referencia y ponele un nombre (ej. "Jarvis Demo"). ⚠️ Este clon es **solo para la demo/prueba interna** — antes de vender el producto a una agencia real hay que reemplazarlo por una voz propia del catálogo de ElevenLabs (sin clonar), para evitar problemas de marca/derechos con terceros.
3. **Creá el agente**: andá a **Conversational AI → Agents → New Agent**. Sugerencia de configuración:
   - **Nombre**: JARVIS
   - **Voz**: para la demo, elegí la voz clonada del paso anterior. Para producción/venta, elegí una voz original del catálogo.
   - **System prompt** (personalidad e instrucciones), por ejemplo:
     > Sos JARVIS, el asistente de voz de Agencia Alcover Automotores en Salta. Respondés de forma breve, profesional y amable en español rioplatense. Podés ayudar a explicar el funcionamiento del panel, dar información general sobre el proceso de compra de autos usados y 0km, financiación, y agendar seguimientos. Si te preguntan datos específicos de stock, precios o leads que no tenés confirmados, aclará que podés consultarlo en el panel y no inventes cifras.
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

Por ahora el agente no tiene acceso a los datos reales del panel (stock, ventas, leads) — es conversación general. Darle acceso en vivo a esos datos (por ejemplo vía "tools" del agente contra la base de Supabase) es un paso futuro, una vez que Supabase esté activo.
