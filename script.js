// ============ CATÁLOGO REAL (data.js) ============
const catalogo = (typeof CATALOGO_ALCOVER !== "undefined" ? CATALOGO_ALCOVER : []);

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

// Top autos destacados (panel principal)
const carListEl = document.getElementById("carList");
if (carListEl && catalogo.length) {
  const destacados = catalogo.filter((a) => a.destacado);
  destacados.forEach((auto) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="car-thumb">${carIconSvg}</div>
      <div class="car-info">
        <span class="car-name">${nombreAuto(auto)} ${auto.anio || ""}</span>
        <span class="car-views">${formatearKm(auto)} · ${formatearMoneda(auto.precio)}</span>
      </div>`;
    carListEl.appendChild(li);
  });
}

// Contadores reales de stock
const stockCountEl = document.getElementById("stockCount");
const stockUpdatedEl = document.getElementById("stockUpdated");
const inventarioTotalEl = document.getElementById("inventarioTotal");
const modalTotalEl = document.getElementById("modalTotal");
const modalFechaEl = document.getElementById("modalFecha");
const fechaCatalogo = typeof CATALOGO_ACTUALIZADO !== "undefined" ? CATALOGO_ACTUALIZADO : "";
if (stockCountEl) stockCountEl.textContent = catalogo.length;
if (stockUpdatedEl) stockUpdatedEl.textContent = fechaCatalogo;
if (inventarioTotalEl) inventarioTotalEl.textContent = catalogo.length;
if (modalTotalEl) modalTotalEl.textContent = catalogo.length;
if (modalFechaEl) modalFechaEl.textContent = fechaCatalogo;

// Auto destacado en el escenario central
const stageLabelEl = document.getElementById("stageLabel");
if (stageLabelEl && catalogo.length) {
  const hero = catalogo.find((a) => a.destacado) || catalogo[0];
  stageLabelEl.textContent = `ALCOVER · ${nombreAuto(hero).toUpperCase()} ${hero.anio || ""}`;
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
        <div class="inv-icon">${carIconSvg}</div>
        <div>
          <div class="inv-name">${nombreAuto(auto)} ${auto.anio || ""}</div>
          <div class="inv-version">${auto.version || ""}</div>
        </div>
        <div class="inv-specs">${formatearKm(auto)}</div>
        <div><span class="inv-badge ${auto.esCero ? "cero" : ""}">${auto.esCero ? "0KM" : "USADO"}</span></div>
        <div class="inv-price">${formatearMoneda(auto.precio)}</div>`;
      modalList.appendChild(row);
    });
}

if (openModalBtn && modal) {
  openModalBtn.addEventListener("click", () => {
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
if (micBtn) {
  micBtn.addEventListener("click", () => {
    micBtn.classList.toggle("listening");
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
