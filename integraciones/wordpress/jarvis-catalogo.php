<?php
/**
 * Plugin Name: JARVIS · Catálogo
 * Description: Muestra en el sitio el stock cargado en JARVIS. El catálogo se actualiza solo: lo que se carga, se edita o se vende en el sistema se refleja acá sin tocar el sitio.
 * Version: 1.0.0
 * Requires PHP: 7.4
 * License: MIT
 *
 * USO
 * ---
 * 1. Subir esta carpeta a wp-content/plugins/ y activar el plugin.
 * 2. En la página del catálogo, poner el shortcode:  [jarvis_catalogo]
 * 3. Ajustes → JARVIS Catálogo para cargar la URL de la app y el id de agencia.
 *
 * POR QUÉ SE DIBUJA EN EL SERVIDOR Y NO CON JAVASCRIPT
 * ---------------------------------------------------
 * Un catálogo dibujado en el navegador no lo indexa bien Google y no se ve si
 * el visitante tiene JS lento o bloqueado. Justo en la página que tiene que
 * traer clientes, eso importa. Acá el HTML sale ya armado desde PHP.
 *
 * QUÉ PASA SI LA APP NO CONTESTA
 * ------------------------------
 * Nunca se le muestra un error al visitante. Se sirve la última copia buena
 * guardada; si tampoco hay, no se dibuja nada y queda un comentario HTML para
 * que quien administre el sitio lo vea en "ver código fuente".
 */

// Cortar el acceso directo al archivo: WordPress define ABSPATH al cargar.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'JARVIS_CATALOGO_VERSION', '1.0.0' );

/** Cuánto se guarda la respuesta antes de volver a pedirla (segundos). */
define( 'JARVIS_CATALOGO_CACHE', 300 );

/** La copia de respaldo dura mucho más: solo se usa si la app no contesta. */
define( 'JARVIS_CATALOGO_RESPALDO', DAY_IN_SECONDS );

/* -------------------------------------------------------------------------
 * Ajustes
 * ---------------------------------------------------------------------- */

function jarvis_catalogo_opciones() {
	return wp_parse_args(
		get_option( 'jarvis_catalogo_opciones', array() ),
		array(
			'api'     => 'https://jarvis-autos-acv.vercel.app',
			'agencia' => '',
			'estilos' => '1',
		)
	);
}

add_action( 'admin_menu', function () {
	add_options_page(
		'JARVIS Catálogo',
		'JARVIS Catálogo',
		'manage_options',
		'jarvis-catalogo',
		'jarvis_catalogo_pantalla_ajustes'
	);
} );

add_action( 'admin_init', function () {
	register_setting(
		'jarvis_catalogo',
		'jarvis_catalogo_opciones',
		array( 'sanitize_callback' => 'jarvis_catalogo_sanitizar' )
	);
} );

function jarvis_catalogo_sanitizar( $entrada ) {
	// Al guardar cambia de dónde se lee, así que lo cacheado ya no sirve.
	jarvis_catalogo_limpiar_cache();

	return array(
		'api'     => untrailingslashit( esc_url_raw( $entrada['api'] ?? '' ) ),
		'agencia' => sanitize_text_field( $entrada['agencia'] ?? '' ),
		'estilos' => empty( $entrada['estilos'] ) ? '0' : '1',
	);
}

function jarvis_catalogo_pantalla_ajustes() {
	$o = jarvis_catalogo_opciones();
	?>
	<div class="wrap">
		<h1>JARVIS · Catálogo</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'jarvis_catalogo' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="jc-api">Dirección de la app</label></th>
					<td>
						<input id="jc-api" class="regular-text" type="url" name="jarvis_catalogo_opciones[api]"
							value="<?php echo esc_attr( $o['api'] ); ?>" placeholder="https://jarvis-autos-acv.vercel.app">
						<p class="description">Sin barra al final.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="jc-agencia">Id de agencia</label></th>
					<td>
						<input id="jc-agencia" class="regular-text" type="text" name="jarvis_catalogo_opciones[agencia]"
							value="<?php echo esc_attr( $o['agencia'] ); ?>" placeholder="00000000-0000-0000-0000-000000000000">
						<p class="description">Lo da JARVIS. No es secreto: el catálogo es público.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Estilos</th>
					<td>
						<label>
							<input type="checkbox" name="jarvis_catalogo_opciones[estilos]" value="1"
								<?php checked( $o['estilos'], '1' ); ?>>
							Usar los estilos que trae el plugin
						</label>
						<p class="description">
							Destildalo si el tema ya tiene su propio diseño de tarjetas y preferís maquetarlo vos.
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>

		<h2>Estado</h2>
		<?php
		$datos = jarvis_catalogo_traer( true );
		if ( is_wp_error( $datos ) ) {
			echo '<p style="color:#b32d2e">No se pudo leer el catálogo: '
				. esc_html( $datos->get_error_message() ) . '</p>';
		} else {
			printf(
				'<p>Se leyeron <strong>%d</strong> vehículos publicables.</p>',
				count( $datos )
			);
		}
		?>
		<p>Poné <code>[jarvis_catalogo]</code> en la página del catálogo.</p>
	</div>
	<?php
}

/* -------------------------------------------------------------------------
 * Lectura
 * ---------------------------------------------------------------------- */

function jarvis_catalogo_limpiar_cache() {
	delete_transient( 'jarvis_catalogo_datos' );
	delete_transient( 'jarvis_catalogo_respaldo' );
}

/**
 * Devuelve el array de vehículos, o un WP_Error.
 *
 * @param bool $forzar Saltear la caché (se usa en la pantalla de ajustes).
 * @return array|WP_Error
 */
function jarvis_catalogo_traer( $forzar = false ) {
	if ( ! $forzar ) {
		$cache = get_transient( 'jarvis_catalogo_datos' );
		if ( false !== $cache ) {
			return $cache;
		}
	}

	$o = jarvis_catalogo_opciones();
	if ( empty( $o['api'] ) || empty( $o['agencia'] ) ) {
		return new WP_Error( 'sin_config', 'Falta cargar la dirección de la app o el id de agencia en Ajustes.' );
	}

	$url = add_query_arg(
		array( 'agencia' => rawurlencode( $o['agencia'] ) ),
		$o['api'] . '/api/catalogo'
	);

	$resp = wp_remote_get( $url, array( 'timeout' => 10 ) );

	if ( is_wp_error( $resp ) ) {
		return jarvis_catalogo_respaldo( $resp->get_error_message() );
	}
	$codigo = wp_remote_retrieve_response_code( $resp );
	if ( 200 !== $codigo ) {
		return jarvis_catalogo_respaldo( 'la app respondió ' . $codigo );
	}

	$cuerpo = json_decode( wp_remote_retrieve_body( $resp ), true );
	if ( ! is_array( $cuerpo ) || empty( $cuerpo['ok'] ) || ! isset( $cuerpo['vehiculos'] ) ) {
		return jarvis_catalogo_respaldo( 'la respuesta no tenía el formato esperado' );
	}

	$vehiculos = $cuerpo['vehiculos'];
	set_transient( 'jarvis_catalogo_datos', $vehiculos, JARVIS_CATALOGO_CACHE );
	// La copia de respaldo se pisa solo cuando la lectura salió bien: es lo que
	// permite que una caída de la app no vacíe el catálogo del sitio.
	set_transient( 'jarvis_catalogo_respaldo', $vehiculos, JARVIS_CATALOGO_RESPALDO );

	return $vehiculos;
}

/** Última copia buena. Que el catálogo quede viejo es mucho mejor que vacío. */
function jarvis_catalogo_respaldo( $motivo ) {
	$viejo = get_transient( 'jarvis_catalogo_respaldo' );
	if ( false !== $viejo ) {
		return $viejo;
	}
	return new WP_Error( 'sin_datos', $motivo );
}

/* -------------------------------------------------------------------------
 * Formato
 * ---------------------------------------------------------------------- */

function jarvis_catalogo_precio( $precio ) {
	if ( empty( $precio ) || ! is_numeric( $precio ) ) {
		return 'Consultar precio';
	}
	// Formato argentino: punto para los miles, sin centavos.
	return '$ ' . number_format( (float) $precio, 0, ',', '.' );
}

function jarvis_catalogo_kilometraje( $vehiculo ) {
	if ( ! empty( $vehiculo['es_cero'] ) ) {
		return '0 km';
	}
	if ( ! isset( $vehiculo['km'] ) || null === $vehiculo['km'] ) {
		return '';
	}
	return number_format( (float) $vehiculo['km'], 0, ',', '.' ) . ' km';
}

/**
 * Los datos cortos que van debajo del título. Solo entra lo que está cargado:
 * un auto sin año no muestra un año vacío ni un guion.
 */
function jarvis_catalogo_datos( $v ) {
	$partes = array();
	if ( ! empty( $v['anio'] ) ) {
		$partes[] = (int) $v['anio'];
	}
	$km = jarvis_catalogo_kilometraje( $v );
	if ( $km ) {
		$partes[] = $km;
	}
	foreach ( array( 'motor', 'caja', 'traccion', 'carroceria' ) as $campo ) {
		if ( ! empty( $v[ $campo ] ) ) {
			$partes[] = $v[ $campo ];
		}
	}
	return $partes;
}

/* -------------------------------------------------------------------------
 * Salida
 * ---------------------------------------------------------------------- */

add_shortcode( 'jarvis_catalogo', 'jarvis_catalogo_shortcode' );

function jarvis_catalogo_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'limite' => 0,     // 0 = todos
			'clase'  => '',    // clase extra para enganchar con el CSS del tema
		),
		$atts,
		'jarvis_catalogo'
	);

	$vehiculos = jarvis_catalogo_traer();

	if ( is_wp_error( $vehiculos ) ) {
		// Al visitante no se le muestra un error de sistema: no es su problema
		// y no puede hacer nada. Queda el comentario para quien administra.
		return '<!-- JARVIS Catálogo: ' . esc_html( $vehiculos->get_error_message() ) . ' -->';
	}

	if ( empty( $vehiculos ) ) {
		return '<p class="jarvis-catalogo-vacio">Por el momento no hay unidades publicadas.</p>';
	}

	$limite = (int) $atts['limite'];
	if ( $limite > 0 ) {
		$vehiculos = array_slice( $vehiculos, 0, $limite );
	}

	$o = jarvis_catalogo_opciones();
	if ( '1' === $o['estilos'] ) {
		jarvis_catalogo_estilos();
	}

	$clase = trim( 'jarvis-catalogo ' . sanitize_html_class( $atts['clase'] ) );

	ob_start();
	echo '<div class="' . esc_attr( $clase ) . '">';
	foreach ( $vehiculos as $v ) {
		echo jarvis_catalogo_tarjeta( $v ); // phpcs:ignore WordPress.Security.EscapeOutput -- escapado adentro.
	}
	echo '</div>';
	return ob_get_clean();
}

/**
 * Una tarjeta.
 *
 * Se puede reemplazar entera desde el tema sin tocar este archivo:
 *
 *     add_filter( 'jarvis_catalogo_tarjeta', function ( $html, $vehiculo ) {
 *         return '…tu propio markup…';
 *     }, 10, 2 );
 *
 * Es el gancho para que el catálogo salga con el markup exacto del tema en vez
 * de con el de acá.
 */
function jarvis_catalogo_tarjeta( $v ) {
	$titulo   = isset( $v['titulo'] ) ? $v['titulo'] : trim( ( $v['marca'] ?? '' ) . ' ' . ( $v['modelo'] ?? '' ) );
	$foto     = ! empty( $v['fotos'][0] ) ? $v['fotos'][0] : '';
	$datos    = jarvis_catalogo_datos( $v );
	$reservado = isset( $v['estado'] ) && 'reservado' === $v['estado'];

	ob_start();
	?>
	<article class="jarvis-auto<?php echo $reservado ? ' jarvis-auto--reservado' : ''; ?>">
		<?php if ( $foto ) : ?>
			<div class="jarvis-auto__foto">
				<img src="<?php echo esc_url( $foto ); ?>"
					alt="<?php echo esc_attr( $titulo ); ?>"
					loading="lazy" decoding="async">
				<?php if ( $reservado ) : ?>
					<span class="jarvis-auto__cinta">Reservado</span>
				<?php endif; ?>
			</div>
		<?php endif; ?>

		<div class="jarvis-auto__cuerpo">
			<h3 class="jarvis-auto__titulo"><?php echo esc_html( $titulo ); ?></h3>

			<?php if ( $datos ) : ?>
				<p class="jarvis-auto__datos"><?php echo esc_html( implode( ' · ', $datos ) ); ?></p>
			<?php endif; ?>

			<?php if ( ! empty( $v['specs'] ) && is_array( $v['specs'] ) ) : ?>
				<ul class="jarvis-auto__specs">
					<?php foreach ( array_slice( $v['specs'], 0, 4 ) as $spec ) : ?>
						<li><?php echo esc_html( $spec ); ?></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>

			<p class="jarvis-auto__precio"><?php echo esc_html( jarvis_catalogo_precio( $v['precio'] ?? null ) ); ?></p>
		</div>
	</article>
	<?php
	$html = ob_get_clean();

	return apply_filters( 'jarvis_catalogo_tarjeta', $html, $v );
}

/**
 * Estilos mínimos, y solo una vez por página. A propósito no definen colores de
 * texto ni tipografía: los hereda del tema, que es lo que hace que el bloque no
 * se vea pegado de otro sitio.
 */
function jarvis_catalogo_estilos() {
	static $puestos = false;
	if ( $puestos ) {
		return;
	}
	$puestos = true;
	?>
	<style id="jarvis-catalogo-css">
		.jarvis-catalogo{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
		.jarvis-auto{display:flex;flex-direction:column;overflow:hidden;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
		.jarvis-auto__foto{position:relative;aspect-ratio:4/3;overflow:hidden}
		.jarvis-auto__foto img{width:100%;height:100%;object-fit:cover;display:block}
		.jarvis-auto__cinta{position:absolute;top:.6rem;left:.6rem;padding:.15rem .6rem;border-radius:999px;font-size:.75rem;background:#d4a72c;color:#0e4d3c}
		.jarvis-auto__cuerpo{display:flex;flex-direction:column;gap:.4rem;padding:.9rem 1rem 1.1rem}
		.jarvis-auto__titulo{margin:0;font-size:1.05rem;line-height:1.3}
		.jarvis-auto__datos{margin:0;font-size:.85rem;opacity:.75}
		.jarvis-auto__specs{margin:0;padding-left:1.1rem;font-size:.8rem;opacity:.75}
		.jarvis-auto__precio{margin:.2rem 0 0;font-weight:700;font-size:1.1rem}
		.jarvis-auto--reservado{opacity:.85}
	</style>
	<?php
}

/* -------------------------------------------------------------------------
 * Limpieza al desactivar
 * ---------------------------------------------------------------------- */

register_deactivation_hook( __FILE__, 'jarvis_catalogo_limpiar_cache' );
