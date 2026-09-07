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
