// Capa de datos de JARVIS.
// Si config.js tiene SUPABASE_URL/ANON_KEY completos, trae los datos reales desde Supabase
// (agencia y catálogo del usuario logueado, acotados por RLS). Si no, usa el catálogo
// estático de data.js como fallback, para que el sitio nunca quede roto sin backend.

(function () {
  const cfg = window.JARVIS_CONFIG || {};
  const supabaseHabilitado = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  let client = null;
  function getClient() {
    if (!supabaseHabilitado) return null;
    if (!client && window.supabase) {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    return client;
  }

  function filaAVehiculo(row) {
    return {
      marca: row.marca,
      modelo: row.modelo,
      version: row.version,
      anio: row.anio,
      km: row.km,
      esCero: row.es_cero,
      dominio: row.dominio,
      precio: row.precio,
      condicion: row.condicion,
      motor: row.motor,
      caja: row.caja,
      traccion: row.traccion,
      specs: row.specs || [],
      destacado: row.destacado,
      fotos: row.fotos || 0,
      carroceria: row.carroceria,
    };
  }

  async function cargarCatalogo() {
    const sb = getClient();
    if (!sb) {
      return {
        vehiculos: typeof CATALOGO_ALCOVER !== "undefined" ? CATALOGO_ALCOVER : [],
        fuente: "estatico",
      };
    }
    try {
      const { data, error } = await sb.from("vehiculos").select("*").order("precio", { ascending: false });
      if (error) throw error;
      return { vehiculos: data.map(filaAVehiculo), fuente: "supabase" };
    } catch (err) {
      console.error("No se pudo cargar el catálogo desde Supabase, uso el estático:", err);
      return {
        vehiculos: typeof CATALOGO_ALCOVER !== "undefined" ? CATALOGO_ALCOVER : [],
        fuente: "estatico",
      };
    }
  }

  async function cargarAgencia() {
    const sb = getClient();
    if (!sb) {
      return { nombre: "Agencia Alcover Automotores", telefono_whatsapp: "5493875105956" };
    }
    try {
      const { data, error } = await sb.from("agencias").select("*").single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error("No se pudo cargar la agencia desde Supabase:", err);
      return { nombre: "Agencia Alcover Automotores", telefono_whatsapp: "5493875105956" };
    }
  }

  async function sesionActiva() {
    const sb = getClient();
    if (!sb) return true; // sin Supabase configurado, no hay gate de login (fase estática)
    const { data } = await sb.auth.getSession();
    return Boolean(data.session);
  }

  async function cerrarSesion() {
    const sb = getClient();
    if (!sb) return;
    await sb.auth.signOut();
  }

  window.JARVIS_DB = {
    supabaseHabilitado,
    getClient,
    cargarCatalogo,
    cargarAgencia,
    sesionActiva,
    cerrarSesion,
  };
})();
