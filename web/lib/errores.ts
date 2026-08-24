// Los errores del cliente de Supabase NO son instancias de Error: son objetos
// planos ({ message, code, details, hint }). Por eso `String(err)` sobre ellos
// devuelve "[object Object]" y se pierde justo lo único que sirve — el mensaje
// de Postgres, que suele decir exactamente qué columna o restricción falló.
//
// Esta función existe para que ningún error termine en pantalla como
// "[object Object]".
export function mensajeDeError(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (err && typeof err === "object") {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    const partes = [e.message, e.details, e.hint]
      .filter((p): p is string => typeof p === "string" && p.trim() !== "");
    if (partes.length > 0) return partes.join(" · ");

    // Objeto con una forma inesperada: mejor volcarlo entero que ocultarlo.
    try {
      return JSON.stringify(err);
    } catch {
      return "Error desconocido.";
    }
  }

  if (typeof err === "string" && err.trim() !== "") return err;
  return "Error desconocido.";
}
