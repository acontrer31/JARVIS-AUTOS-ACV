// Registro de los 13 módulos de JARVIS CORE. `real: true` = el módulo abre un
// workspace con datos/lógica reales (Supabase, cálculos determinísticos).
// El resto se muestra igual en el core (para que se sienta el sistema
// completo), pero al activarlos avisan explícitamente que todavía no tienen
// nada real conectado — nunca se inventan datos ni se simula una función que
// no existe (regla del prompt original: "no fake buttons").
export type ModuloId =
  | "vehiculos"
  | "clientes"
  | "financiacion"
  | "operaciones"
  | "crm"
  | "comunicaciones"
  | "marketing"
  | "conocimiento"
  | "voz"
  | "automatizacion"
  | "analitica"
  | "administracion"
  | "seguridad";

export interface Modulo {
  id: ModuloId;
  label: string;
  descripcion: string;
  real: boolean;
}

export const MODULOS: Modulo[] = [
  { id: "vehiculos", label: "Vehículos", descripcion: "Stock real de la agencia", real: true },
  { id: "financiacion", label: "Financiación", descripcion: "Simulación de cuotas y transferencia DNRPA", real: true },
  { id: "clientes", label: "Clientes", descripcion: "Perfiles e historial de contacto", real: false },
  { id: "operaciones", label: "Operaciones", descripcion: "Ventas y trámites en curso", real: false },
  { id: "crm", label: "CRM", descripcion: "Leads y seguimiento comercial", real: false },
  { id: "comunicaciones", label: "Comunicaciones", descripcion: "WhatsApp, redes, email", real: false },
  { id: "marketing", label: "Marketing", descripcion: "Piezas y campañas por vehículo", real: false },
  { id: "conocimiento", label: "Conocimiento", descripcion: "Documentos e información de referencia", real: false },
  { id: "voz", label: "Voz", descripcion: "Asistente conversacional JARVIS", real: false },
  { id: "automatizacion", label: "Automatización", descripcion: "Flujos automáticos del negocio", real: false },
  { id: "analitica", label: "Analítica", descripcion: "Métricas y predicciones", real: false },
  { id: "administracion", label: "Administración", descripcion: "Usuarios, roles y agencia", real: false },
  { id: "seguridad", label: "Seguridad", descripcion: "Auditoría y control de acceso", real: false },
];
