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
