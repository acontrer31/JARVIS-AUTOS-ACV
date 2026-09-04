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

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
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
