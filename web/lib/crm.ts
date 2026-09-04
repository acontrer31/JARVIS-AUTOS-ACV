import { cargarClientes, ESTADOS_LEAD, type Cliente, type EstadoLead } from "@/lib/clientes";

// CRM: el embudo comercial sobre los clientes que ya existen. No duplica datos
// — agrupa los mismos leads por etapa y arma la agenda de seguimiento a partir
// de `proximo_contacto`.

export interface EtapaPipeline {
  estado: EstadoLead;
  leads: Cliente[];
  /** Suma de los presupuestos declarados en la etapa. */
  valor: number;
}

export interface Pipeline {
  etapas: EtapaPipeline[];
  total: number;
  /** Leads con seguimiento vencido (fecha anterior a hoy). */
  vencidos: Cliente[];
  /** Leads a contactar hoy. */
  hoy: Cliente[];
}

// Fecha de hoy en formato AAAA-MM-DD, calculada con la hora local. No se usa
// toISOString(): eso devuelve UTC y en Argentina (UTC-3) después de las 21 h el
// "hoy" saltaría al día siguiente, y un seguimiento de hoy aparecería vencido.
export function hoyISO(): string {
  return aISO(new Date());
}

function aISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function sumarDias(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return aISO(fecha);
}

// Números dichos con letras: el agente de voz a veces transcribe "en tres días"
// en vez de "en 3 días".
const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
};

// Domingo primero, igual que getDay(). Sin tildes: el texto ya viene normalizado.
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

// Lee una cantidad escrita en dígitos o en letras.
function cantidad(texto: string): number | null {
  const enNumero = texto.match(/(\d+)/);
  if (enNumero) return Number(enNumero[1]);
  for (const [palabra, valor] of Object.entries(NUMEROS)) {
    if (new RegExp(`\\b${palabra}\\b`).test(texto)) return valor;
  }
  return null;
}

// Convierte una fecha dicha en voz alta a AAAA-MM-DD. Si no la entiende
// devuelve null: preferimos preguntar antes que agendar un día equivocado.
export function interpretarFecha(texto: string): string | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!t) return null;

  if (t.includes("pasado manana")) return sumarDias(2);
  if (t.includes("manana")) return sumarDias(1);
  if (t.includes("hoy")) return sumarDias(0);
  if (t.includes("semana que viene") || t.includes("proxima semana")) return sumarDias(7);

  const enSemanas = t.match(/en\s+(.+?)\s+semana/);
  if (enSemanas) {
    const n = cantidad(enSemanas[1]);
    if (n) return sumarDias(n * 7);
  }

  const enDias = t.match(/en\s+(.+?)\s+dia/);
  if (enDias) {
    const n = cantidad(enDias[1]);
    if (n) return sumarDias(n);
  }

  // Día de la semana ("el jueves"): el próximo que venga. Si cae hoy mismo se
  // entiende como hoy, que es lo que uno quiere decir al nombrarlo.
  const indice = DIAS_SEMANA.findIndex((d) => new RegExp(`\\b${d}s?\\b`).test(t));
  if (indice >= 0) return sumarDias((indice - new Date().getDay() + 7) % 7);

  // Fecha explícita: AAAA-MM-DD tal cual, o DD/MM(/AAAA) como se dice acá.
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  const barras = t.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (barras) {
    const dia = Number(barras[1]);
    const mes = Number(barras[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
    let anio = barras[3] ? Number(barras[3]) : new Date().getFullYear();
    if (anio < 100) anio += 2000;
    return aISO(new Date(anio, mes - 1, dia));
  }

  return null;
}

// Arma el embudo completo. Ganado y perdido también se muestran: sirven para
// ver el resultado del mes, pero no entran en la agenda de seguimiento.
export async function armarPipeline(): Promise<Pipeline> {
  const clientes = await cargarClientes();
  const dia = hoyISO();

  const etapas: EtapaPipeline[] = ESTADOS_LEAD.map((estado) => {
    const leads = clientes.filter((c) => c.estado_lead === estado);
    return {
      estado,
      leads,
      valor: leads.reduce((s, c) => s + (c.presupuesto ?? 0), 0),
    };
  });

  // La agenda solo tiene sentido para leads todavía en juego.
  const enJuego = clientes.filter((c) => c.estado_lead !== "ganado" && c.estado_lead !== "perdido");
  const vencidos = enJuego.filter((c) => c.proximo_contacto && c.proximo_contacto < dia);
  const hoy = enJuego.filter((c) => c.proximo_contacto === dia);

  return {
    etapas,
    total: clientes.length,
    vencidos,
    hoy,
  };
}
