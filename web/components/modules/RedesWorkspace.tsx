"use client";

import { useEffect, useState } from "react";
import { ETIQUETA_RED, REDES, publicarEnRedes, type Red } from "@/lib/redes";
import { cargarVehiculos, nombreVehiculo, type Vehiculo } from "@/lib/vehiculos";
import { cargarFotos } from "@/lib/media";
import { mensajeDeError } from "@/lib/errores";

export default function RedesWorkspace() {
  const [red, setRed] = useState<Red>("facebook");
  const [texto, setTexto] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vehiculoId, setVehiculoId] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    cargarVehiculos()
      .then(setVehiculos)
      .catch(() => {}); // el stock es opcional acá
  }, []);

  // Al elegir un vehículo, autocompleta la imagen con su primera foto pública.
  async function elegirVehiculo(id: string) {
    setVehiculoId(id);
    setError("");
    if (!id) return;
    try {
      const fotos = await cargarFotos(id);
      if (fotos[0]?.url) setImagenUrl(fotos[0].url);
      else setError("Ese vehículo no tiene fotos cargadas.");
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResultado("");
    if (red === "instagram" && !imagenUrl.trim()) {
      setError("Instagram necesita una imagen. Elegí un vehículo o pegá una URL de imagen.");
      return;
    }
    if (!texto.trim() && !imagenUrl.trim()) {
      setError("Escribí un texto o elegí una imagen.");
      return;
    }
    setPublicando(true);
    try {
      await publicarEnRedes(red, texto.trim(), imagenUrl.trim() || null);
      setResultado(`Publicado en ${ETIQUETA_RED[red]} ✓`);
      setTexto("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setPublicando(false);
    }
  }

  const input = "rounded-lg border px-2 py-1.5 text-sm outline-none";
  const campo = { borderColor: "var(--border)", background: "var(--background)" } as const;

  return (
    <form onSubmit={publicar} className="flex flex-col gap-3">
      {/* Red */}
      <div className="flex gap-2">
        {REDES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRed(r)}
            className="flex-1 rounded-lg border py-1.5 text-sm font-semibold"
            style={{
              borderColor: red === r ? "var(--dorado)" : "var(--border)",
              color: red === r ? "var(--dorado)" : "var(--muted)",
              background: red === r ? "color-mix(in srgb, var(--dorado) 12%, transparent)" : "transparent",
            }}
          >
            {ETIQUETA_RED[r]}
          </button>
        ))}
      </div>

      {/* Texto */}
      <textarea
        className={`${input} min-h-24 resize-y`}
        style={campo}
        placeholder={red === "instagram" ? "Epígrafe del posteo…" : "Texto del posteo…"}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {/* Foto del stock */}
      <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {red === "instagram" ? "Imagen (obligatoria en Instagram)" : "Imagen (opcional)"}
        </p>
        <select className={input} style={campo} value={vehiculoId} onChange={(e) => elegirVehiculo(e.target.value)}>
          <option value="">Elegí un vehículo del stock…</option>
          {vehiculos.map((v) => (
            <option key={v.id} value={v.id}>{nombreVehiculo(v)}</option>
          ))}
        </select>
        <input
          className={input}
          style={campo}
          placeholder="…o pegá una URL de imagen pública"
          value={imagenUrl}
          onChange={(e) => setImagenUrl(e.target.value)}
        />
        {imagenUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagenUrl} alt="Vista previa" className="max-h-40 w-auto self-start rounded-lg border" style={{ borderColor: "var(--border)" }} />
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {resultado && <p className="text-sm" style={{ color: "var(--dorado)" }}>{resultado}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={publicando}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--dorado)", color: "var(--verde-core)" }}
        >
          {publicando ? "Publicando…" : `Publicar en ${ETIQUETA_RED[red]}`}
        </button>
      </div>

      <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
        Publica en tus cuentas conectadas (configuradas en el servidor). El posteo sale de inmediato.
      </p>
    </form>
  );
}
