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

    if (!sb) {
      errorEl.textContent = "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
      btn.disabled = false;
      btn.textContent = "INGRESAR";
      return;
    }

    let error;
    try {
      ({ error } = await sb.auth.signInWithPassword({ email, password }));
    } catch (err) {
      errorEl.textContent = "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
      btn.disabled = false;
      btn.textContent = "INGRESAR";
      return;
    }

    if (error) {
      errorEl.textContent = "No se pudo ingresar. Revisá el email y la contraseña.";
      btn.disabled = false;
      btn.textContent = "INGRESAR";
      return;
    }

    window.location.replace("index.html");
  });

  const olvideBtn = document.getElementById("olvideBtn");
  if (olvideBtn) {
    olvideBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      if (!email) {
        errorEl.textContent = "Escribí tu email arriba primero, y volvé a tocar el link.";
        return;
      }
      errorEl.style.color = "";
      errorEl.textContent = "Enviando…";
      const sbClient = window.JARVIS_DB.getClient();
      if (!sbClient) {
        errorEl.textContent = "No se pudo conectar con el servidor. Intentá de nuevo en un momento.";
        return;
      }
      try {
        const { error: err } = await sbClient.auth.resetPasswordForEmail(email, {
          redirectTo: new URL("reset-password.html", window.location.href).toString(),
        });
        if (err) throw err;
        errorEl.style.color = "var(--accent)";
        errorEl.textContent = "Listo, revisá tu email para elegir una contraseña nueva.";
      } catch (err) {
        errorEl.style.color = "";
        errorEl.textContent = "No se pudo enviar el email. Probá de nuevo en un momento.";
      }
    });
  }
})();
