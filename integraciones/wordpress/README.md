# JARVIS · Catálogo — plugin de WordPress

Hace que el catálogo de **alcoverautomotores.com.ar** muestre el stock que se
carga en JARVIS. Después de instalarlo, **el sitio no se toca más**: cargar un
auto en el sistema lo publica, editarle el precio lo actualiza, y marcarlo como
vendido lo saca del sitio solo.

---

## Instalación (5 minutos)

1. Comprimir la carpeta `wordpress/` en un `.zip` (o subir el archivo
   `jarvis-catalogo.php` por FTP a `wp-content/plugins/jarvis-catalogo/`).
2. En WordPress: **Plugins → Añadir nuevo → Subir plugin** → elegir el zip →
   **Instalar** → **Activar**.
3. Ir a **Ajustes → JARVIS Catálogo** y completar:

   | Campo | Valor |
   |---|---|
   | Dirección de la app | `https://jarvis-autos-acv.vercel.app` |
   | Id de agencia | `5288264a-2858-4135-9621-dc2774a5ca7e` |

   Al guardar, la misma pantalla dice cuántos vehículos leyó. Si dice un número,
   ya está andando.

4. Editar la página del catálogo y **reemplazar el listado actual** por el
   shortcode:

   ```
   [jarvis_catalogo]
   ```

Listo. El catálogo pasa a salir de JARVIS.

### Opciones del shortcode

```
[jarvis_catalogo limite="6"]                  Solo los primeros 6 (para un home)
[jarvis_catalogo clase="mi-grilla"]           Agrega una clase CSS propia
```

---

## Para que quede con el diseño actual del sitio

El plugin trae estilos propios mínimos, pensados para no chocar: **no define
tipografía ni colores de texto**, los hereda del tema.

Hay dos formas de dejarlo idéntico a como se ve hoy:

**a) Escribir el CSS sobre las clases del plugin.** Cada tarjeta sale así:

```html
<article class="jarvis-auto">
  <div class="jarvis-auto__foto"><img …><span class="jarvis-auto__cinta">Reservado</span></div>
  <div class="jarvis-auto__cuerpo">
    <h3 class="jarvis-auto__titulo">…</h3>
    <p class="jarvis-auto__datos">2022 · 116.000 km · 1.4 TSI</p>
    <ul class="jarvis-auto__specs">…</ul>
    <p class="jarvis-auto__precio">$ 43.000.000</p>
  </div>
</article>
```

**b) Reemplazar el HTML entero por el del tema**, sin tocar el plugin. En el
`functions.php` del tema hijo:

```php
add_filter( 'jarvis_catalogo_tarjeta', function ( $html, $v ) {
    ob_start(); ?>
    <!-- acá el markup exacto que ya usa el sitio -->
    <div class="card-vehiculo">
        <img src="<?php echo esc_url( $v['fotos'][0] ?? '' ); ?>" alt="">
        <h3><?php echo esc_html( $v['titulo'] ); ?></h3>
        <span class="precio"><?php echo esc_html( jarvis_catalogo_precio( $v['precio'] ) ); ?></span>
    </div>
    <?php return ob_get_clean();
}, 10, 2 );
```

Y en **Ajustes → JARVIS Catálogo**, destildar "Usar los estilos que trae el
plugin".

### Datos disponibles de cada vehículo

`titulo` · `marca` · `modelo` · `version` · `anio` · `km` · `es_cero` ·
`precio` · `condicion` · `motor` · `caja` · `traccion` · `carroceria` ·
`specs` (lista) · `destacado` · `estado` · `fotos` (lista de URLs)

---

## Cosas que conviene saber

**No hace falta ninguna clave.** El catálogo es información pública. El plugin
solo lee; no puede modificar nada en JARVIS.

**No se publica todo.** Salen únicamente los autos en estado *disponible* y
*reservado*. Los vendidos, los borradores y los dados de baja no aparecen. El
sistema tampoco manda la patente ni las notas internas: no viajan al sitio.

**Si la app se cae, el catálogo no se vacía.** Se guarda una copia de la última
lectura buena y se sigue mostrando esa. Al visitante nunca se le muestra un
mensaje de error: si no hubiera absolutamente nada, no se dibuja el bloque y
queda un comentario en el código fuente explicando el motivo.

**Los cambios tardan hasta 5 minutos** en verse. El plugin guarda la respuesta
para no consultar en cada visita. Si hace falta verlo ya, alcanza con entrar a
Ajustes → JARVIS Catálogo (esa pantalla lee siempre lo último) y guardar.

**El orden** es: primero los destacados, después por precio de mayor a menor.

---

## Si algo no anda

En **Ajustes → JARVIS Catálogo** la sección "Estado" dice exactamente qué pasa.
Si el catálogo no aparece en la página, mirar el código fuente y buscar
`JARVIS Catálogo`: el comentario dice el motivo.

| Dice | Qué pasa |
|---|---|
| `Falta cargar la dirección de la app o el id de agencia` | Faltan completar los Ajustes |
| `la app respondió 400` | El id de agencia está mal escrito |
| `la app respondió 500` | Problema del lado de JARVIS, avisar |
| No se ve nada y no hay comentario | El shortcode no quedó en la página |
