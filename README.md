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

Por ahora esto se carga a mano por SQL — falta la pantalla en el panel para verlo/cargarlo sin entrar a Supabase (siguiente paso), y más adelante capturar automáticamente el resumen de cada conversación de voz con JARVIS.

## Activar la voz de JARVIS (ElevenLabs, opcional)

El botón de micrófono del panel lateral puede conectarse a un agente conversacional real (habla y escucha) de ElevenLabs. Sin configurar, solo muestra un aviso al tocarlo.

1. **Creá tu cuenta**: entrá a [elevenlabs.io](https://elevenlabs.io) y registrate (la Conversational AI tiene minutos limitados en el plan gratis; para uso real de la agencia conviene un plan pago).
2. **Voz para la demo (clon)**: en **Voices → Add Voice → Instant Voice Clone**, subí el audio de referencia y ponele un nombre (ej. "Jarvis Demo"). ⚠️ Este clon es **solo para la demo/prueba interna** — antes de vender el producto a una agencia real hay que reemplazarlo por una voz propia del catálogo de ElevenLabs (sin clonar), para evitar problemas de marca/derechos con terceros.
3. **Creá el agente**: andá a **Conversational AI → Agents → New Agent**. Sugerencia de configuración:
   - **Nombre**: JARVIS
   - **Voz**: para la demo, elegí la voz clonada del paso anterior. Para producción/venta, elegí una voz original del catálogo.
   - **System prompt** (personalidad e instrucciones), por ejemplo:
     > Sos JARVIS, el asistente de voz de Agencia Alcover Automotores en Salta. Respondés de forma breve, profesional y amable en español rioplatense. Podés ayudar a explicar el funcionamiento del panel, dar información general sobre el proceso de compra de autos usados y 0km, financiación, y agendar seguimientos. Si te preguntan datos específicos de stock, precios o leads que no tenés confirmados, aclará que podés consultarlo en el panel y no inventes cifras.
   - **First message** (el saludo que dice JARVIS apenas arranca la conversación, sin esperar que hables primero): escribí ahí literalmente
     > Hola Agustín, buenos días. ¿En qué puedo ayudarte?
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

### Activación por aplauso

El mic del panel lateral también se activa con un aplauso fuerte y seco (detecta el pico brusco de volumen). Dos cosas a tener en cuenta:

- **La primera vez hay que tocar el mic con la mano** — los navegadores no dejan pedir permiso de micrófono sin un click real; después de ese primer toque, queda escuchando aplausos en segundo plano el resto de la visita.
- Es un detector simple (pico de volumen), no un modelo entrenado — un portazo o un golpe fuerte también lo puede disparar. Si da falsos positivos muy seguido, avisame y le subo el umbral.
- Por las políticas de autoplay de los navegadores, es posible que el audio de JARVIS no se escuche hasta que haya habido al menos un click real en la página en esa sesión — probalo y contame si pasa.

## Seguridad

Ningún sitio es "inhackeable", pero esto es lo que está aplicado y por qué (y lo que queda pendiente):

**Ya aplicado:**
- **Content-Security-Policy** en `index.html` y `login.html`: solo permite cargar scripts desde el propio sitio, jsdelivr (Supabase) y unpkg (ElevenLabs) — bloquea que se inyecte y ejecute JavaScript de otro origen. `object-src 'none'` y `base-uri 'self'` cierran vectores clásicos de inyección.
- **Todo el texto dinámico se escapa antes de insertarse en el HTML** (`escapeHtml()` en `script.js`): nombres/versiones de autos, nombre de agencia, etc. Hoy esos datos son propios, pero en el modo multi-agencia van a poder cargarlos otras agencias — así ninguna puede inyectar HTML/JS a través del nombre de un auto.
- **`dominio` (patente) se sanitiza** antes de usarse en una URL de imagen (`sanitizeDominio()`), para que no se pueda manipular la ruta del archivo.
- **RLS (Row Level Security) en Supabase**: cada agencia solo puede leer/escribir sus propios datos (`agencia_id`). No hay política de `insert`/`update` en `agencias` ni `perfiles` desde el cliente — un usuario no puede auto-asignarse a otra agencia ni cambiar su propio rol; esas altas se hacen a mano por SQL. La función que resuelve "tu agencia" usa `security definer` con `search_path` fijo (evita el ataque clásico de hijacking de `search_path` en Postgres).
- **Ninguna clave secreta vive en el repo**: `SUPABASE_ANON_KEY` y `ELEVENLABS_AGENT_ID` son identificadores públicos pensados para exponerse en el cliente (la seguridad real la da RLS del lado de Supabase, no el secreto de esas claves). La clave `service_role` de Supabase, el token de acceso de Mercado Pago y el secreto de la App de Meta **nunca deben pegarse acá** — cuando se necesiten (fases futuras), van como secreto de una función servidor (Edge Function de Supabase), nunca en el código del sitio.
- **HTTPS obligatorio**: GitHub Pages sirve todo por HTTPS automáticamente.

**Limitaciones conocidas (por ser un sitio 100% estático en GitHub Pages):**
- No se puede fijar `X-Frame-Options` / `frame-ancestors` por header real (GitHub Pages no permite headers custom), así que la protección contra clickjacking vía header no está disponible — el CSP vía `<meta>` tampoco puede incluir `frame-ancestors` (el navegador lo ignora ahí). Si esto llegara a importar en producción, la solución es servir el sitio detrás de Cloudflare (gratis) que sí permite agregar headers.
- Las librerías externas (Supabase JS, widget de ElevenLabs) se cargan por versión mayor (`@2`) sin hash de integridad (SRI) — quedó pendiente calcular los hashes exactos porque este entorno de desarrollo no tuvo acceso de red a esos CDNs para generarlos. Se puede agregar más adelante corriendo `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A` y pegando el resultado en un atributo `integrity=""`.

**Recomendado hacer del lado de las cuentas** (no es código, son configuraciones de cada servicio):
- Activar verificación en dos pasos (2FA) en GitHub, Supabase y ElevenLabs.
- En Supabase, revisar periódicamente **Authentication → Rate Limits** y dejar activada la confirmación de email para altas de usuarios.
- Cuando se sume Mercado Pago o Meta, esos tokens van a Supabase Edge Functions (secretos server-side), nunca a `config.js`.
- Mantener las dependencias (versiones de Supabase JS / widget de ElevenLabs) actualizadas de vez en cuando — son la superficie de ataque más probable a mediano plazo (cadena de suministro).
