import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatKilos(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)} kg`;
}

export function formatPeso(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`;
  return `${value.toFixed(1)} kg`;
}

export function formatRendimiento(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Devuelve la fecha de hoy como "YYYY-MM-DD" en hora local (evita desfase UTC). */
export function localDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parsea una fecha sin offset de zona horaria.
 * - Si es solo fecha (YYYY-MM-DD) la construye como local para evitar el desfase UTC.
 * - Si trae hora/timezone la parsea normalmente.
 */
function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // Formato puro: "YYYY-MM-DD" → construir como local
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (dateOnly) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

export function formatFecha(dateStr: string): string {
  const d = parseDate(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatFechaHora(dateStr: string): string {
  const d = parseDate(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoneda(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);
}

export function rendimientoColor(rendimiento: number): string {
  if (rendimiento < 85) return "text-red-600";
  if (rendimiento < 90) return "text-yellow-600";
  if (rendimiento > 105) return "text-red-600";
  return "text-green-600";
}

export function rendimientoBg(rendimiento: number): string {
  if (rendimiento < 85) return "bg-red-50 border-red-200";
  if (rendimiento < 90) return "bg-yellow-50 border-yellow-200";
  if (rendimiento > 105) return "bg-red-50 border-red-200";
  return "bg-green-50 border-green-200";
}

export const CORTES = [
  { key: "pata_muslo",       label: "Pata/Muslo" },
  { key: "pechuga",          label: "Filet fresco" },
  { key: "pechuga_con_piel", label: "Pechuga c/piel" },
  { key: "alitas",           label: "Alitas" },
  { key: "carcasa",          label: "Carcasa" },
  { key: "menudos",          label: "Menudos" },
  { key: "otros",            label: "Otros" },
] as const;

// Calibres de pollo entero: cantidad de pollos por cajón
export const CALIBRES_POLLO = ["5", "6", "7", "8", "9", "10", "11", "12"] as const;

// Peso nominal por tipo de cajón (en kg)
export const PESO_NOMINAL_CAJON: Record<string, number> = {
  pollo_entero: 20,
  filet_fresco: 15,
  filet_congelado: 15,
  pata_muslo_fresca: 15,
  pata_muslo_congelada: 15,
};

export const TIPOS_CAJON = [
  {
    value: "pollo_entero",
    label: "Pollo entero",
    grupo: "Pollo entero",
    requiresCalibration: true,
    pesoNominal: 20,
  },
  {
    value: "filet_fresco",
    label: "Filet fresco",
    grupo: "Filet",
    requiresCalibration: false,
    pesoNominal: 15,
  },
  {
    value: "filet_congelado",
    label: "Filet congelado",
    grupo: "Filet",
    requiresCalibration: false,
    pesoNominal: 15,
  },
  {
    value: "pata_muslo_fresca",
    label: "Pata/Muslo fresca",
    grupo: "Pata-Muslo",
    requiresCalibration: false,
    pesoNominal: 15,
  },
  {
    value: "pata_muslo_congelada",
    label: "Pata/Muslo congelada",
    grupo: "Pata-Muslo",
    requiresCalibration: false,
    pesoNominal: 15,
  },
] as const;

export const TIPO_CAJON_LABELS: Record<string, string> = {
  pollo_entero: "Pollo entero",
  filet_fresco: "Filet fresco",
  filet_congelado: "Filet congelado",
  pata_muslo_fresca: "Pata/Muslo fresca",
  pata_muslo_congelada: "Pata/Muslo congelada",
};

export const ROLES_LABELS: Record<string, string> = {
  admin: "Administrador",
  encargado: "Encargado",
  operario: "Operario",
  cajero: "Cajero",
};

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
};

export const ESTADO_COLORS: Record<string, string> = {
  pendiente: "bg-yellow-100 text-yellow-800",
  en_proceso: "bg-blue-100 text-blue-800",
  completada: "bg-green-100 text-green-800",
  cancelada: "bg-gray-100 text-gray-600",
};
