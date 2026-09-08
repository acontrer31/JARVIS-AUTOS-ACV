import { supabase } from "@/lib/supabase";

// Reglas de contraseña que pidió la agencia: entre 6 y 10 caracteres, con
// letras, números y al menos un símbolo. El tope de 10 es una decisión del
// negocio, no una recomendación de seguridad — normalmente conviene permitir
// contraseñas largas — pero es lo que se pidió y es lo que se valida.
export const LARGO_MIN = 6;
export const LARGO_MAX = 10;

export const REGLA_PASSWORD =
  "Entre 6 y 10 caracteres, con letras, números y al menos un símbolo (por ejemplo: Auto2026!).";

// Devuelve "" si está bien, o el motivo concreto por el que no sirve. Un
// mensaje que dice exactamente qué falta ahorra el juego de adivinanzas.
export function validarPassword(password: string): string {
  if (password.length < LARGO_MIN) return `La contraseña necesita al menos ${LARGO_MIN} caracteres.`;
  if (password.length > LARGO_MAX) return `La contraseña no puede pasar de ${LARGO_MAX} caracteres.`;
  if (!/[a-zA-Z]/.test(password)) return "Le falta al menos una letra.";
  if (!/[0-9]/.test(password)) return "Le falta al menos un número.";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Le falta al menos un símbolo (! @ # $ % & * . -).";
  return "";
}

/**
 * Pide el correo con el enlace para poner una contraseña nueva.
 *
 * `redirectTo` apunta a la misma app: al volver del correo, el SDK de Supabase
 * levanta la sesión temporal que trae el enlace y dispara `PASSWORD_RECOVERY`,
 * que es lo que `page.tsx` escucha para mostrar el formulario.
 *
 * Ojo con el mensaje que se muestra después: Supabase contesta lo mismo exista
 * o no la cuenta, y así tiene que quedar. Decir "ese email no está registrado"
 * le confirmaría a cualquiera qué direcciones tienen usuario en el sistema.
 */
export async function pedirRecuperacion(email: string): Promise<void> {
  const limpio = email.trim();
  if (!limpio) throw new Error("Escribí tu email para que podamos mandarte el enlace.");
  const { error } = await supabase.auth.resetPasswordForEmail(limpio, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}
