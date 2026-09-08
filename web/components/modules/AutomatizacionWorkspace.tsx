"use client";

import { useEffect, useState } from "react";
import {
  alternarAutomatizacion,
  cargarAutomatizaciones,
  cargarSalud,
  diasEstancado,
  guardarParametros,
  type Automatizacion,
  type ClaveAutomatizacion,
  type Salud,
} from "@/lib/automatizaciones";
import { miPerfil } from "@/lib/seguridad";
import { mensajeDeError } from "@/lib/errores";
import { useConfirmar } from "@/lib/confirmar";

// Qué se muestra debajo de cada regla como "estado real". No sale de un campo
// guardado sino de contar contra las tablas del negocio: si el cron se cuelga,
// `ultima_corrida` sigue diciendo lo de ayer, pero el trabajo acumulado crece y
// se ve acá.
function pendienteDe(clave: ClaveAutomatizacion, salud: Salud): { texto: string; alerta: boolean } {
  switch (clave) {
    case "publicar_programadas": {
      const partes = [`${salud.programadasPendientes} agendada${salud.programadasPendientes === 1 ? "" : "s"}`];
      if (salud.programadasFallidas) partes.push(`${salud.programadasFallidas} con error`);
      if (salud.programadasVencidas) partes.push(`${salud.programadasVencidas} pasada${salud.programadasVencidas === 1 ? "" : "s"} de hora`);
      return { texto: partes.join(" · "), alerta: salud.programadasVencidas > 0 || salud.programadasFallidas > 0 };
    }
    case "retirar_al_vender":
      return {
        texto: salud.pendientesRetiro
          ? `${salud.pendientesRetiro} publicación${salud.pendientesRetiro === 1 ? "" : "es"} de Instagram esperando que la borres a mano`
          : "Sin publicaciones esperando retiro manual",
        alerta: salud.pendientesRetiro > 0,
      };
    case "seguimientos_vencidos":
      return {
        texto: `${salud.seguimientosVencidos} lead${salud.seguimientosVencidos === 1 ? "" : "s"} con el contacto vencido`,
        alerta: salud.seguimientosVencidos > 0,
      };
    case "stock_estancado":
      return {
        texto: `${salud.autosEstancados} auto${salud.autosEstancados === 1 ? "" : "s"} pasado${salud.autosEstancados === 1 ? "" : "s"} de tiempo`,
        alerta: salud.autosEstancados > 0,
      };
  }
}

function cuandoCorrio(iso: string | null): string {
  if (!iso) return "Todavía no corrió";
  return `Última vez: ${new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function AutomatizacionWorkspace() {
  const [reglas, setReglas] = useState<Automatizacion[] | null>(null);
  const [salud, setSalud] = useState<Salud | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [ocupada, setOcupada] = useState<ClaveAutomatizacion | null>(null);
  const [diasEditados, setDiasEditados] = useState("");

  const confirmar = useConfirmar();

  useEffect(() => {
    // La salud del stock estancado depende del parámetro de días, así que
    // primero las reglas y recién después el conteo.
    cargarAutomatizaciones()
      .then(async (lista) => {
        setReglas(lista);
        const stock = lista.find((r) => r.clave === "stock_estancado");
        const dias = diasEstancado(stock?.parametros ?? {});
        setDiasEditados(String(dias));
        setSalud(await cargarSalud(dias));
      })
      .catch((err) => setError("No se pudieron cargar las automatizaciones: " + mensajeDeError(err)));

    // El rol solo decide si los controles se pueden tocar. Si falla, quedan
    // deshabilitados: es el lado seguro, y la RLS lo rechazaría igual.
    miPerfil()
      .then((p) => setEsAdmin(p.rol === "admin"))
      .catch(() => setEsAdmin(false));
  }, []);

  async function alternar(regla: Automatizacion) {
    const apagando = regla.activa;
    if (
      !(await confirmar({
        titulo: apagando ? `¿Apagar "${regla.nombre}"?` : `¿Encender "${regla.nombre}"?`,
        detalle: apagando
          ? `${regla.hace} Mientras esté apagada el sistema no lo va a hacer solo.`
          : regla.hace,
        textoConfirmar: apagando ? "Apagar" : "Encender",
        tono: apagando ? "peligro" : "normal",
      }))
    ) {
      return;
    }

    const antes = reglas ?? [];
    setReglas((prev) => (prev ?? []).map((r) => (r.clave === regla.clave ? { ...r, activa: !apagando } : r)));
    setOcupada(regla.clave);
    try {
      await alternarAutomatizacion(regla.clave, !apagando);
      setError("");
    } catch (err) {
      setReglas(antes);
      setError(mensajeDeError(err));
    } finally {
      setOcupada(null);
    }
  }

  async function guardarDias(regla: Automatizacion) {
    const dias = Number(diasEditados);
    const actual = diasEstancado(regla.parametros);
    if (!Number.isFinite(dias) || dias < 1) {
      setError("Los días tienen que ser un número mayor a cero.");
      return;
    }
    if (dias === actual) return;
    if (
      !(await confirmar({
        titulo: "¿Guardar el cambio?",
        detalle: `Se va a avisar de los autos disponibles hace más de ${dias} días (antes eran ${actual}).`,
      }))
    ) {
      setDiasEditados(String(actual));
      return;
    }

    setOcupada(regla.clave);
    try {
      await guardarParametros(regla.clave, { ...regla.parametros, dias });
      setReglas((prev) =>
        (prev ?? []).map((r) => (r.clave === regla.clave ? { ...r, parametros: { ...r.parametros, dias } } : r))
      );
      setSalud(await cargarSalud(dias));
      setError("");
    } catch (err) {
      setDiasEditados(String(actual));
      setError(mensajeDeError(err));
    } finally {
      setOcupada(null);
    }
  }

  if (error && !reglas) return <p className="py-6 text-center text-sm text-red-400">{error}</p>;
  if (!reglas || !salud) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        Cargando automatizaciones…
      </p>
    );
  }

  const encendidas = reglas.filter((r) => r.activa).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {encendidas} de {reglas.length} encendidas. Son las cosas que el sistema hace solo, sin que nadie las
        apriete.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {reglas.map((regla) => {
        const estado = pendienteDe(regla.clave, salud);
        return (
          <div
            key={regla.clave}
            className="rounded-lg border p-3"
            style={{
              borderColor: regla.activa ? "var(--border)" : "color-mix(in srgb, var(--border) 50%, transparent)",
              opacity: regla.activa ? 1 : 0.65,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">{regla.nombre}</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                  {regla.hace}
                </p>
              </div>
              <button
                type="button"
                onClick={() => alternar(regla)}
                disabled={!esAdmin || ocupada === regla.clave}
                title={esAdmin ? undefined : "Solo un administrador puede encender o apagar automatizaciones"}
                aria-pressed={regla.activa}
                className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50"
                style={{
                  borderColor: regla.activa ? "var(--dorado)" : "var(--border)",
                  color: regla.activa ? "var(--dorado)" : "var(--muted)",
                }}
              >
                {regla.activa ? "Encendida" : "Apagada"}
              </button>
            </div>

            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem]" style={{ color: "var(--muted)" }}>
              <div>
                <dt className="inline">Se dispara: </dt>
                <dd className="inline">{regla.cuando}</dd>
              </div>
              <div>
                <dt className="inline">Deja: </dt>
                <dd className="inline">{regla.resultado}</dd>
              </div>
            </dl>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span style={{ color: estado.alerta ? "var(--dorado)" : "var(--muted)" }}>{estado.texto}</span>
              {/* Solo para las que corren por reloj: en las de evento
                  `ultima_corrida` quedaría siempre vacío, porque el que las
                  dispara es un vendedor que no puede escribir esta tabla. */}
              {regla.disparo === "reloj" && (
                <span style={{ color: "var(--muted)" }}>
                  · {cuandoCorrio(regla.ultima_corrida)}
                  {regla.ultimo_resultado ? ` (${regla.ultimo_resultado})` : ""}
                </span>
              )}
            </div>

            {regla.clave === "stock_estancado" && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <label htmlFor="dias-estancado" style={{ color: "var(--muted)" }}>
                  Avisar a partir de
                </label>
                <input
                  id="dias-estancado"
                  type="number"
                  min={1}
                  value={diasEditados}
                  onChange={(e) => setDiasEditados(e.target.value)}
                  onBlur={() => guardarDias(regla)}
                  disabled={!esAdmin || ocupada === regla.clave}
                  className="w-16 rounded border px-2 py-1 text-sm outline-none disabled:opacity-50"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                />
                <span style={{ color: "var(--muted)" }}>días en stock</span>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--muted)" }}>
        Encender y apagar queda registrado en Seguridad, con quién lo hizo y cuándo. Las tareas que crean estas
        reglas aparecen en el módulo Tareas como cualquier otra: se pueden corregir, marcar hechas o borrar.
      </p>
    </div>
  );
}
