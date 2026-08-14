(async function () {
  if (!window.JARVIS_DB || !window.JARVIS_DB.supabaseHabilitado) {
    window.location.replace("index.html");
    return;
  }

  const form = document.getElementById("resetForm");
  const errorEl = document.getElementById("resetError");
  const btn = document.getElementById("resetBtn");
  const sb = window.JARVIS_DB.getClient();

  if (!sb) {
    errorEl.textContent = "No se pudo conectar con el servidor.";
    return;
  }

  // El link del email trae un token en la URL — supabase-js lo detecta solo al
  // cargar la página (detectSessionInUrl) y dispara este evento con una sesión
  // temporal válida solo para cambiar la contraseña.
  let listo = false;
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") listo = true;
  });
  // Por si el evento ya disparó antes de que este listener se registrara.
  const { data } = await sb.auth.getSession();
  if (data.session) listo = true;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    const password = document.getElementById("password").value;
    const password2 = document.getElementById("password2").value;
    if (password !== password2) {
      errorEl.textContent = "Las contraseñas no coinciden.";
      return;
    }
    if (!listo) {
      errorEl.textContent = "Este link ya no es válido. Pedí uno nuevo desde la pantalla de login.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "GUARDANDO…";
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      errorEl.textContent = "No se pudo guardar la contraseña. Pedí un link nuevo e intentá de nuevo.";
      btn.disabled = false;
      btn.textContent = "GUARDAR";
      return;
    }
    window.location.replace("index.html");
  });
})();
