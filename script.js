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
