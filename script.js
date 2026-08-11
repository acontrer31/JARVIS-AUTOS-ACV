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
  return `images/${auto.dominio}/${n}.webp`;
}
function thumbHtml(auto, className) {
  if (auto.fotos) {
    return `<img class="${className}-img" src="${fotoUrl(auto, 1)}" alt="${nombreAuto(auto)}" loading="lazy">`;
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
          <span class="car-name">${nombreAuto(auto)} ${auto.anio || ""}</span>
          <span class="car-views">${formatearKm(auto)} · ${formatearMoneda(auto.precio)}</span>
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

// Modal de inventario completo
const modal = document.getElementById("inventarioModal");
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
          <div class="inv-name">${nombreAuto(auto)} ${auto.anio || ""}</div>
          <div class="inv-version">${auto.version || ""}</div>
        </div>
        <div class="inv-specs">${formatearKm(auto)}</div>
        <div><span class="inv-badge ${auto.esCero ? "cero" : ""}">${auto.esCero ? "0KM" : "USADO"}</span>${auto.fotos ? `<span class="inv-fotos">${auto.fotos} fotos</span>` : `<span class="inv-fotos sinfoto">sin fotos</span>`}</div>
        <div class="inv-price">${formatearMoneda(auto.precio)}</div>`;
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

if (openModalBtn && modal) {
  openModalBtn.addEventListener("click", async () => {
    await catalogoListo;
    renderInventarioCompleto();
    modal.classList.add("open");
  });
}
if (closeModalBtn && modal) {
  closeModalBtn.addEventListener("click", () => modal.classList.remove("open"));
}
if (modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
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

// Navegación lateral: resaltar item activo
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
  });
});

document.querySelectorAll(".bn-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".bn-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
  });
});

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
