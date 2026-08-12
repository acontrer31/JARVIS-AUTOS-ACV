// ============ PWA: instalación en celular/PC ============
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

let deferredInstallPrompt = null;
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });
}

window.addEventListener("appinstalled", () => {
  if (installBtn) installBtn.hidden = true;
});

// Aviso manual para iOS (Safari no dispara beforeinstallprompt)
(function iosInstallTip() {
  const tip = document.getElementById("iosInstallTip");
  if (!tip) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  const dismissed = localStorage.getItem("jarvisIosTipDismissed");
  if (isIOS && !isStandalone && !dismissed) {
    tip.hidden = false;
  }
  document.getElementById("iosInstallClose")?.addEventListener("click", () => {
    tip.hidden = true;
    localStorage.setItem("jarvisIosTipDismissed", "1");
  });
})();

// ============ SESIÓN (gate de login cuando Supabase está configurado) ============
(async function gateSesion() {
  if (window.JARVIS_DB && window.JARVIS_DB.supabaseHabilitado) {
    const activa = await window.JARVIS_DB.sesionActiva();
    if (!activa) window.location.replace("login.html");
  }
})();

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    if (window.JARVIS_DB) await window.JARVIS_DB.cerrarSesion();
    window.location.href = window.JARVIS_DB?.supabaseHabilitado ? "login.html" : "index.html";
  });
}

// ============ CATÁLOGO (Supabase si está configurado, si no data.js) ============
let catalogo = [];

// Los datos del catálogo hoy son propios, pero en el modo multi-agencia (Supabase)
// van a poder venir de otras agencias — se escapan igual antes de insertarlos vía
// innerHTML para no dejar abierta una inyección de HTML/XSS si algún campo de texto
// (marca, modelo, versión, nombre de agencia) llegara a tener contenido malicioso.
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Para usar en atributos como src="images/DOMINIO/1.webp": solo letras/números.
function sanitizeDominio(dominio) {
  return String(dominio || "").replace(/[^A-Za-z0-9-]/g, "");
}

function formatearMoneda(valor) {
  if (!valor) return "Consultar precio";
  return "$ " + valor.toLocaleString("es-AR");
}
function formatearKm(auto) {
  if (auto.esCero) return auto.km ? `0km · ${auto.km.toLocaleString("es-AR")} km patentado` : "0km";
  if (auto.km == null) return "Km s/d";
  return `${auto.km.toLocaleString("es-AR")} km`;
}
function nombreAuto(auto) {
  return [auto.marca, auto.modelo].filter(Boolean).join(" ");
}
const carIconSvg = `<svg viewBox="0 0 24 24"><path d="M3 12l1.5-4.5A2 2 0 0 1 6.4 6h11.2a2 2 0 0 1 1.9 1.5L21 12"/><rect x="2.5" y="12" width="19" height="5.5" rx="1.5"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17" cy="18.5" r="1.6"/></svg>`;

function fotoUrl(auto, n) {
  return `images/${sanitizeDominio(auto.dominio)}/${n}.webp`;
}
function thumbHtml(auto, className) {
  if (auto.fotos) {
    return `<img class="${className}-img" src="${fotoUrl(auto, 1)}" alt="${escapeHtml(nombreAuto(auto))}" loading="lazy">`;
  }
  return carIconSvg;
}

const carListEl = document.getElementById("carList");
const stockCountEl = document.getElementById("stockCount");
const stockUpdatedEl = document.getElementById("stockUpdated");
const inventarioTotalEl = document.getElementById("inventarioTotal");
const modalTotalEl = document.getElementById("modalTotal");
const modalFechaEl = document.getElementById("modalFecha");
const stageLabelEl = document.getElementById("stageLabel");
const brandSubEl = document.getElementById("brandSub");

let catalogoListoResolve;
const catalogoListo = new Promise((resolve) => { catalogoListoResolve = resolve; });

async function initCatalogo() {
  const { vehiculos, fuente } = await window.JARVIS_DB.cargarCatalogo();
  catalogo = vehiculos;
  const fechaCatalogo = fuente === "supabase" ? "en vivo" : (typeof CATALOGO_ACTUALIZADO !== "undefined" ? CATALOGO_ACTUALIZADO : "");

  // Top autos destacados (panel principal)
  if (carListEl) {
    const destacados = catalogo.filter((a) => a.destacado);
    destacados.forEach((auto) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="car-thumb${auto.fotos ? " has-photo" : ""}">${thumbHtml(auto, "car-thumb")}</div>
        <div class="car-info">
          <span class="car-name">${escapeHtml(nombreAuto(auto))} ${escapeHtml(auto.anio || "")}</span>
          <span class="car-views">${escapeHtml(formatearKm(auto))} · ${escapeHtml(formatearMoneda(auto.precio))}</span>
        </div>`;
      if (auto.fotos) {
        li.querySelector(".car-thumb").addEventListener("click", () => abrirGaleria(auto));
      }
      carListEl.appendChild(li);
    });
  }

  // Contadores reales de stock
  if (stockCountEl) stockCountEl.textContent = catalogo.length;
  if (stockUpdatedEl) stockUpdatedEl.textContent = fechaCatalogo;
  if (inventarioTotalEl) inventarioTotalEl.textContent = catalogo.length;
  if (modalTotalEl) modalTotalEl.textContent = catalogo.length;
  if (modalFechaEl) modalFechaEl.textContent = fechaCatalogo;

  // Auto destacado en el escenario central
  if (stageLabelEl && catalogo.length) {
    const hero = catalogo.find((a) => a.destacado) || catalogo[0];
    stageLabelEl.textContent = `${nombreAuto(hero).toUpperCase()} ${hero.anio || ""}`;
  }

  catalogoListoResolve();
}

async function initAgencia() {
  const agencia = await window.JARVIS_DB.cargarAgencia();
  if (brandSubEl && agencia?.nombre) brandSubEl.textContent = agencia.nombre.toUpperCase();
}

if (window.JARVIS_DB) {
  initCatalogo();
  initAgencia();
}

// Inventario completo (contenido movido dentro del foco central al abrirse)
const modalList = document.getElementById("modalList");
const openModalBtn = document.getElementById("verInventarioBtn");
const closeModalBtn = document.getElementById("closeModal");

function renderInventarioCompleto() {
  if (!modalList || modalList.childElementCount) return;
  catalogo
    .slice()
    .sort((a, b) => (b.precio || 0) - (a.precio || 0))
    .forEach((auto) => {
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `
        <div class="inv-icon${auto.fotos ? " has-photo" : ""}">${thumbHtml(auto, "inv-icon")}</div>
        <div>
          <div class="inv-name">${escapeHtml(nombreAuto(auto))} ${escapeHtml(auto.anio || "")}</div>
          <div class="inv-version">${escapeHtml(auto.version || "")}</div>
        </div>
        <div class="inv-specs">${escapeHtml(formatearKm(auto))}</div>
        <div><span class="inv-badge ${auto.esCero ? "cero" : ""}">${auto.esCero ? "0KM" : "USADO"}</span>${auto.fotos ? `<span class="inv-fotos">${escapeHtml(auto.fotos)} fotos</span>` : `<span class="inv-fotos sinfoto">sin fotos</span>`}</div>
        <div class="inv-price">${escapeHtml(formatearMoneda(auto.precio))}</div>`;
      if (auto.fotos) {
        row.querySelector(".inv-icon").addEventListener("click", () => abrirGaleria(auto));
      }
      modalList.appendChild(row);
    });
}

// ============ GALERÍA DE FOTOS (lightbox) ============
const galeria = document.getElementById("galeriaModal");
const galeriaImg = document.getElementById("galeriaImg");
const galeriaTitulo = document.getElementById("galeriaTitulo");
const galeriaContador = document.getElementById("galeriaContador");
let galeriaAuto = null;
let galeriaIndex = 0;

function abrirGaleria(auto) {
  galeriaAuto = auto;
  galeriaIndex = 0;
  actualizarGaleria();
  galeria.classList.add("open");
}
function actualizarGaleria() {
  if (!galeriaAuto) return;
  galeriaImg.src = fotoUrl(galeriaAuto, galeriaIndex + 1);
  galeriaTitulo.textContent = `${nombreAuto(galeriaAuto)} ${galeriaAuto.anio || ""}`;
  galeriaContador.textContent = `${galeriaIndex + 1} / ${galeriaAuto.fotos}`;
}
function moverGaleria(delta) {
  if (!galeriaAuto) return;
  galeriaIndex = (galeriaIndex + delta + galeriaAuto.fotos) % galeriaAuto.fotos;
  actualizarGaleria();
}
document.getElementById("galeriaPrev")?.addEventListener("click", () => moverGaleria(-1));
document.getElementById("galeriaNext")?.addEventListener("click", () => moverGaleria(1));
document.getElementById("galeriaClose")?.addEventListener("click", () => galeria.classList.remove("open"));
galeria?.addEventListener("click", (e) => {
  if (e.target === galeria) galeria.classList.remove("open");
});
document.addEventListener("keydown", (e) => {
  if (!galeria || !galeria.classList.contains("open")) return;
  if (e.key === "Escape") galeria.classList.remove("open");
  if (e.key === "ArrowRight") moverGaleria(1);
  if (e.key === "ArrowLeft") moverGaleria(-1);
});

// El inventario completo se abre dentro del foco central (avatar + panel grande),
// no como modal propio — así queda consistente con el resto de los servicios.
if (openModalBtn) {
  openModalBtn.addEventListener("click", async () => {
    await catalogoListo;
    renderInventarioCompleto();
    abrirFoco("inventario");
  });
}
if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => cerrarFoco());
}

// Reloj y fecha en vivo
const meses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
const dias = ["DOMINGO","LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO"];

function actualizarReloj() {
  const ahora = new Date();
  const fechaEl = document.getElementById("topDate");
  const horaEl = document.getElementById("topTime");
  if (fechaEl) {
    fechaEl.textContent = `${dias[ahora.getDay()]} ${ahora.getDate()} DE ${meses[ahora.getMonth()]} ${ahora.getFullYear()}`;
  }
  if (horaEl) {
    horaEl.textContent = ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
}
actualizarReloj();
setInterval(actualizarReloj, 1000);

// ============ FOCO CENTRAL: cada servicio se abre grande y solo, con el avatar ============
// En vez de mostrar todo el dashboard junto, cada opción del menú (o un pedido por voz)
// mueve su panel real al centro de la pantalla junto al avatar, y lo devuelve a su lugar
// original al cerrar — así no se duplica contenido ni se rompen los listeners existentes.
const focoOverlay = document.getElementById("focoOverlay");
const focoContent = document.getElementById("focoContent");
const focoTitle = document.getElementById("focoTitle");
const focoAvatarSlot = document.getElementById("focoAvatarSlot");
const focoClose = document.getElementById("focoClose");
const focoAvatarEl = document.querySelector(".jarvis-avatar");
const focoAvatarAnchor = document.createComment("jarvis-avatar-anchor");
focoAvatarEl?.parentNode.insertBefore(focoAvatarAnchor, focoAvatarEl);

const SERVICIOS = {
  inventario: { titulo: "INVENTARIO", selectores: ["#inventarioModal .modal-box"] },
  clientes: { titulo: "CLIENTES", selectores: ["#panelRecordatorios", "#panelTestDrive"] },
  leads: { titulo: "LEADS", selectores: ["#panelLeads"] },
  ventas: { titulo: "VENTAS", selectores: ["#panelRendimiento"] },
  finanzas: { titulo: "FINANZAS", selectores: ["#statsRow"] },
  marketing: { titulo: "MARKETING", selectores: ["#panelLeads", "#panelActividad"] },
  analisis: { titulo: "ANÁLISIS INTELIGENTE", selectores: [".insight-panel"] },
  tareas: { titulo: "TAREAS", selectores: ["#panelRecordatorios"] },
  configuracion: {
    titulo: "CONFIGURACIÓN",
    html: `<div class="panel">
      <p style="margin-bottom:.75rem">Panel JARVIS · Agencia Alcover Automotores</p>
      <p class="muted" style="font-size:.75rem;line-height:1.6">
        La conexión a Supabase, la voz (ElevenLabs) y el resto de la configuración avanzada
        se administran desde <code>config.js</code> y el <code>README</code> del proyecto.
      </p>
    </div>`,
  },
};

let focoMovidos = [];

function moverAFoco(selector) {
  const nodo = document.querySelector(selector);
  if (!nodo) return;
  focoMovidos.push({ nodo, padre: nodo.parentNode, siguiente: nodo.nextSibling });
  nodo.classList.add("en-foco");
  focoContent.appendChild(nodo);
}

function restaurarFoco() {
  focoMovidos.reverse().forEach(({ nodo, padre, siguiente }) => {
    nodo.classList.remove("en-foco");
    if (siguiente && siguiente.parentNode === padre) padre.insertBefore(nodo, siguiente);
    else padre.appendChild(nodo);
  });
  focoMovidos = [];
  focoContent.innerHTML = "";
}

function marcarNavActivo(view) {
  document.querySelectorAll(".nav-item, .bn-item").forEach((i) => i.classList.remove("active"));
  document.querySelectorAll(`[data-view="${view}"]`).forEach((i) => i.classList.add("active"));
}

function abrirFoco(view) {
  const servicio = SERVICIOS[view];
  if (!servicio || !focoOverlay) return;
  restaurarFoco();
  focoTitle.textContent = servicio.titulo;
  if (focoAvatarEl) {
    focoAvatarSlot.appendChild(focoAvatarEl);
    focoAvatarEl.classList.add("foco-grande");
  }
  if (servicio.selectores) {
    servicio.selectores.forEach(moverAFoco);
    if (view === "inventario") catalogoListo.then(renderInventarioCompleto);
  } else if (servicio.html) {
    focoContent.innerHTML = servicio.html;
  }
  focoOverlay.classList.add("open");
  marcarNavActivo(view);
}

function cerrarFoco() {
  if (!focoOverlay || !focoOverlay.classList.contains("open")) return;
  focoOverlay.classList.remove("open");
  if (focoAvatarEl) {
    focoAvatarEl.classList.remove("foco-grande");
    focoAvatarAnchor.parentNode.insertBefore(focoAvatarEl, focoAvatarAnchor.nextSibling);
  }
  restaurarFoco();
  marcarNavActivo("dashboard");
}

document.querySelectorAll(".nav-item[data-view], .bn-item[data-view]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const view = item.getAttribute("data-view");
    if (view === "dashboard") cerrarFoco();
    else abrirFoco(view);
  });
});
document.querySelectorAll(".bn-item:not([data-view])").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".bn-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
  });
});
focoClose?.addEventListener("click", cerrarFoco);
focoOverlay?.addEventListener("click", (e) => { if (e.target === focoOverlay) cerrarFoco(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && focoOverlay?.classList.contains("open")) cerrarFoco();
});

// Pedidos por voz ("mostrame el inventario", "cómo vienen las ventas") abren el mismo foco.
function buscarServicioMencionado(texto) {
  const t = texto.toLowerCase();
  const mapa = [
    [["inventario", "stock", "autos disponibles", "vehículos disponibles"], "inventario"],
    [["cliente"], "clientes"],
    [["lead"], "leads"],
    [["venta", "rendimiento"], "ventas"],
    [["finanza", "ingreso"], "finanzas"],
    [["marketing"], "marketing"],
    [["análisis", "analisis", "insight"], "analisis"],
    [["tarea", "recordatorio"], "tareas"],
    [["configuración", "configuracion", "ajuste"], "configuracion"],
    [["inicio", "dashboard", "cerrá", "cerrar", "volvé", "volver"], "dashboard"],
  ];
  for (const [palabras, view] of mapa) {
    if (palabras.some((p) => t.includes(p))) return view;
  }
  return null;
}

// Waveform decorativo del panel JARVIS AI (mini)
const waveform = document.getElementById("waveform");
if (waveform) {
  for (let i = 0; i < 24; i++) {
    const bar = document.createElement("span");
    bar.style.animation = `wave ${0.6 + Math.random() * 0.8}s ease-in-out infinite`;
    bar.style.animationDelay = `${Math.random() * 0.6}s`;
    bar.style.height = `${20 + Math.random() * 80}%`;
    waveform.appendChild(bar);
  }
}

// Botón de micrófono: activa/desactiva estado "escuchando" (mock, sin reconocimiento real)
const micBtn = document.getElementById("micBtn");
const voiceStatusEl = document.getElementById("voiceStatus");
const elevenlabsSlot = document.getElementById("elevenlabsWidgetSlot");
const agentId = window.JARVIS_CONFIG?.ELEVENLABS_AGENT_ID;

if (agentId) {
  // Inyecta el widget oficial de ElevenLabs Conversational AI (voz real: habla y escucha).
  const widgetScript = document.createElement("script");
  widgetScript.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
  widgetScript.async = true;
  document.body.appendChild(widgetScript);

  const widgetEl = document.createElement("elevenlabs-convai");
  widgetEl.setAttribute("agent-id", agentId);
  elevenlabsSlot.appendChild(widgetEl);

  if (voiceStatusEl) {
    voiceStatusEl.textContent = "Voz activa (ElevenLabs) — tocá el ícono flotante para hablar con JARVIS.";
    voiceStatusEl.classList.add("active");
  }
  if (micBtn) {
    micBtn.addEventListener("click", () => {
      micBtn.classList.toggle("listening");
      widgetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
} else if (micBtn) {
  micBtn.addEventListener("click", () => {
    micBtn.classList.toggle("listening");
    alert("La voz de JARVIS (ElevenLabs) todavía no está configurada. Mirá el README para activarla — es un paso rápido.");
  });
}

// ============ Activación por aplauso ============
// Detecta un pico brusco de volumen (aplauso) y "clickea" el mic por vos.
// La primera vez necesita que toques el mic una vez para dar permiso al micrófono
// (los navegadores no dejan pedirlo solo con un aplauso); después queda escuchando
// aplausos en segundo plano el resto de la sesión.
(function activacionPorAplauso() {
  if (!agentId || !micBtn) return;

  let escuchando = false;
  let ultimoAplauso = 0;

  async function iniciarEscuchaAplausos() {
    if (escuchando) return;
    escuchando = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("No se pudo activar la detección de aplausos:", err);
      escuchando = false;
      return;
    }
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const datos = new Uint8Array(analyser.frequencyBinCount);
    let promedioAnterior = 0;

    function loop() {
      analyser.getByteFrequencyData(datos);
      const promedio = datos.reduce((a, b) => a + b, 0) / datos.length;
      const salto = promedio - promedioAnterior;
      const ahora = performance.now();
      // Aplauso = subida muy brusca de volumen en un solo frame, con cooldown para no disparar seguido.
      if (salto > 35 && promedio > 45 && ahora - ultimoAplauso > 1500) {
        ultimoAplauso = ahora;
        micBtn.click();
      }
      promedioAnterior = promedio;
      requestAnimationFrame(loop);
    }
    loop();
  }

  micBtn.addEventListener("click", () => { iniciarEscuchaAplausos(); });
})();

// ============ Siluetas por tipo de carrocería (pickup / suv / sedán-hatch) ============
// El avatar cambia de forma según el auto real detectado, no solo la foto.
const SILUETAS = {
  sedan: `
    <path class="car-silhouette" d="M5 58 Q6 50 16 47 Q25 34 40 28 Q50 24 60 25 Q71 27 80 38 Q88 45 94 54 L94 61 L5 61 Z"
      fill="#0c1a2b" stroke="#22d3ee" stroke-width="2"/>
    <path d="M31 44 Q38 31 48 27 Q56 25 62 27 Q71 30 77 40 L78 44 Z" fill="none" stroke="#22d3ee" stroke-width="1.2" opacity="0.8"/>
    <circle cx="27" cy="61" r="9.5" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="27" cy="61" r="4" fill="none" stroke="#22d3ee" stroke-width="1"/>
    <circle cx="76" cy="61" r="9.5" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="76" cy="61" r="4" fill="none" stroke="#22d3ee" stroke-width="1"/>`,
  hatch: `
    <path class="car-silhouette" d="M5 58 Q6 51 15 48 Q22 36 34 30 Q42 26 50 27 Q60 28 68 36 Q78 40 88 46 Q93 49 94 54 L94 61 L5 61 Z"
      fill="#0c1a2b" stroke="#22d3ee" stroke-width="2"/>
    <path d="M27 46 Q33 33 42 29 Q49 27 55 29 Q64 33 70 40 L72 44 Z" fill="none" stroke="#22d3ee" stroke-width="1.2" opacity="0.8"/>
    <circle cx="26" cy="61" r="9.5" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="26" cy="61" r="4" fill="none" stroke="#22d3ee" stroke-width="1"/>
    <circle cx="75" cy="61" r="9.5" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="75" cy="61" r="4" fill="none" stroke="#22d3ee" stroke-width="1"/>`,
  suv: `
    <path class="car-silhouette" d="M4 58 Q5 47 15 41 Q22 29 34 25 Q45 21 60 22 Q75 23 85 31 Q92 37 95 47 L95 61 L4 61 Z"
      fill="#0c1a2b" stroke="#22d3ee" stroke-width="2"/>
    <path d="M20 41 Q27 30 36 27 Q46 24 58 25 Q70 26 80 33 L82 41 Z" fill="none" stroke="#22d3ee" stroke-width="1.2" opacity="0.8"/>
    <line x1="46" y1="24" x2="46" y2="41" stroke="#22d3ee" stroke-width="0.9" opacity="0.55"/>
    <circle cx="24" cy="61" r="10" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="24" cy="61" r="4.2" fill="none" stroke="#22d3ee" stroke-width="1"/>
    <circle cx="77" cy="61" r="10" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="77" cy="61" r="4.2" fill="none" stroke="#22d3ee" stroke-width="1"/>`,
  pickup: `
    <path class="car-silhouette" d="M4 58 Q5 50 14 48 Q20 36 32 30 Q40 26 48 27 L58 27 L58 38 L90 38 Q95 40 96 46 L96 58 L4 58 Z"
      fill="#0c1a2b" stroke="#22d3ee" stroke-width="2"/>
    <path d="M22 47 Q28 35 36 30 Q42 27 48 28 L56 28 L56 38 L22 38 Z" fill="none" stroke="#22d3ee" stroke-width="1.2" opacity="0.8"/>
    <line x1="58" y1="27" x2="58" y2="38" stroke="#22d3ee" stroke-width="1.1" opacity="0.7"/>
    <circle cx="24" cy="59" r="9.5" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="24" cy="59" r="4" fill="none" stroke="#22d3ee" stroke-width="1"/>
    <circle cx="82" cy="59" r="9.5" fill="#050a14" stroke="#22d3ee" stroke-width="2.2" class="wheel-avatar"/>
    <circle cx="82" cy="59" r="4" fill="none" stroke="#22d3ee" stroke-width="1"/>`,
};

// ============ Avatar reactivo: se deforma al hablar y muestra autos reales del inventario ============
(function avatarReactivo() {
  if (!micBtn || !agentId) return; // sin voz configurada, no hay nada que reaccionar

  const avatarEl = document.querySelector(".jarvis-avatar");
  const photoCrop = document.getElementById("avatarPhotoCrop");
  const caption = document.getElementById("avatarCarCaption");
  const carGraphic = document.getElementById("carGraphic");
  if (!avatarEl || !photoCrop || !caption || !carGraphic) return;

  let audioCtx, analyser, micStream, rafId, reconocedor;
  let activo = false;
  let cicloIndex = -1;
  let mostrandoEspecifico = false;
  let volverAGenericoTimeout = null;

  function autosParaCiclo() {
    const destacados = catalogo.filter((a) => a.destacado);
    return destacados.length ? destacados : catalogo;
  }

  function cambiarSilueta(tipo) {
    carGraphic.innerHTML = SILUETAS[tipo] || SILUETAS.sedan;
  }

  function mostrarAuto(auto) {
    if (!auto) return;
    if (auto.fotos) {
      // Foto real del auto exacto, con filtro "escaneo holográfico" — insignia y forma reales.
      carGraphic.style.opacity = "0";
      photoCrop.innerHTML = `<img class="holo" src="${fotoUrl(auto, 1)}" alt="${escapeHtml(nombreAuto(auto))}">`;
      photoCrop.classList.add("show");
    } else {
      // Sin foto disponible: cae a la silueta genérica del tipo de carrocería.
      carGraphic.style.opacity = "1";
      cambiarSilueta(auto.carroceria);
      photoCrop.classList.remove("show");
      photoCrop.innerHTML = "";
    }
    caption.innerHTML = `Mostrando: <b>${escapeHtml(nombreAuto(auto))} ${escapeHtml(auto.anio || "")}</b>${auto.fotos ? "" : " <i>(sin foto, silueta genérica)</i>"}`;
  }

  function ocultarAuto() {
    carGraphic.style.opacity = "1";
    cambiarSilueta("sedan");
    photoCrop.classList.remove("show");
    photoCrop.innerHTML = "";
    caption.textContent = "";
  }

  function siguienteDelCiclo() {
    if (mostrandoEspecifico) return;
    const lista = autosParaCiclo();
    if (!lista.length) return;
    cicloIndex = (cicloIndex + 1) % lista.length;
    mostrarAuto(lista[cicloIndex]);
  }

  function buscarAutoMencionado(texto) {
    const t = texto.toLowerCase();
    return catalogo.find((a) => a.modelo && t.includes(a.modelo.toLowerCase()));
  }

  function onFrase(texto) {
    const view = buscarServicioMencionado(texto);
    if (view) {
      if (view === "dashboard") cerrarFoco();
      else abrirFoco(view);
    }
    const auto = buscarAutoMencionado(texto);
    if (!auto) return;
    mostrandoEspecifico = true;
    mostrarAuto(auto);
    clearTimeout(volverAGenericoTimeout);
    volverAGenericoTimeout = setTimeout(() => { mostrandoEspecifico = false; }, 15000);
  }

  // Analiza el volumen del mic en vivo: deforma el avatar mientras hablás, y detecta
  // pausas para ir rotando el auto mostrado (aproximación de "cuando termina de responder").
  function iniciarAnalisisVolumen(stream) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let silencioDesde = null;

    function loop() {
      analyser.getByteFrequencyData(data);
      const promedio = data.reduce((a, b) => a + b, 0) / data.length;
      const hablando = promedio > 12;
      avatarEl.classList.toggle("hablando", hablando);

      if (hablando) {
        silencioDesde = null;
      } else if (silencioDesde === null) {
        silencioDesde = performance.now();
      } else if (performance.now() - silencioDesde > 1800) {
        silencioDesde = performance.now();
        siguienteDelCiclo();
      }
      rafId = requestAnimationFrame(loop);
    }
    loop();
  }

  // Reconocimiento de voz del navegador (Chrome/Android; no disponible en Safari/iOS):
  // detecta si mencionaste un modelo del inventario para mostrar justo ese auto.
  function iniciarReconocimiento() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "es-AR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const texto = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onFrase(texto);
    };
    rec.onerror = () => {};
    rec.onend = () => { if (activo) { try { rec.start(); } catch (_) {} } };
    try { rec.start(); } catch (_) {}
    return rec;
  }

  async function activar() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("No se pudo acceder al micrófono para la reacción visual del avatar:", err);
      return;
    }
    activo = true;
    iniciarAnalisisVolumen(micStream);
    reconocedor = iniciarReconocimiento();
    await catalogoListo;
    siguienteDelCiclo();
  }

  function desactivar() {
    activo = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (audioCtx) audioCtx.close();
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    if (reconocedor) { try { reconocedor.stop(); } catch (_) {} }
    avatarEl.classList.remove("hablando");
    ocultarAuto();
  }

  micBtn.addEventListener("click", () => {
    if (!activo) activar(); else desactivar();
  });
})();

// Botón circular JARVIS AI: pulso visual al hacer clic (mock)
const jarvisBtn = document.getElementById("jarvisBtn");
if (jarvisBtn) {
  jarvisBtn.addEventListener("click", () => {
    jarvisBtn.animate(
      [{ boxShadow: "0 0 40px -4px #22d3ee55" }, { boxShadow: "0 0 80px 10px #22d3eeaa" }, { boxShadow: "0 0 40px -4px #22d3ee55" }],
      { duration: 900, easing: "ease-in-out" }
    );
  });
}

// Cierra tarjetas al hacer clic en la "x"
document.querySelectorAll(".close-x").forEach((btn) => {
  btn.addEventListener("click", () => {
    const panel = btn.closest(".panel");
    if (panel) panel.style.display = "none";
  });
});
