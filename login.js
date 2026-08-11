(async function () {
  // Sin Supabase configurado: no hay login real todavía, se pasa directo al dashboard.
  if (!window.JARVIS_DB || !window.JARVIS_DB.supabaseHabilitado) {
    window.location.replace("index.html");
    return;
  }

  // Si ya hay sesión activa, no mostrar el login de nuevo.
  if (await window.JARVIS_DB.sesionActiva()) {
    window.location.replace("index.html");
    return;
  }

  const form = document.getElementById("loginForm");
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "INGRESANDO…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const sb = window.JARVIS_DB.getClient();

    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      errorEl.textContent = "No se pudo ingresar. Revisá el email y la contraseña.";
      btn.disabled = false;
      btn.textContent = "INGRESAR";
      return;
    }

    window.location.replace("index.html");
  });
})();
