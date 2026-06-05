import { clsx, type ClassValue } from "clsx";
import type { LoteCajones, OrdenEstado } from "@/types";

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
  { key: "pollo_entero",     label: "Pollo entero" },
] as const;

/** Resumen mínimo de órdenes para nuevo desposte */
export interface OrdenCajonesResumen {
  lote_id: string;
  cantidad_cajones: number;
  estado: OrdenEstado;
}

/**
 * Cajones que aún pueden asignarse (excluye lotes donde todas las ordenes cubren el total).
 * Cruza cantidad original del lote con suma de ordenes activas/completadas.
 */
export function cajonesLibresParaNuevaOrden(lote: LoteCajones, ordenes: OrdenCajonesResumen[]): number {
  const asignados = ordenes
    .filter((o) => o.lote_id === lote.id && o.estado !== "cancelada")
    .reduce((s, o) => s + Number(o.cantidad_cajones ?? 0), 0);
  const totalEnLote = Number(lote.cantidad_cajones ?? 0);
  const enDb = Number(lote.cajones_disponibles ?? 0);
  const porOrdenes = Math.max(0, totalEnLote - asignados);
  return Math.min(enDb, porOrdenes);
}

/** Solo dígitos del escaneo (pistola / pegado desde ticket). */
export function saneDigitosBarcode(scan: string): string {
  return scan.replace(/\D/g, "").trim();
}

/** Si la pistola mandó el mismo bloque dos veces, deja una sola copia. */
export function colapsarDobleLecturaBarcode(d: string): string {
  let v = d;

  // Prioridad máxima: doble disparo de EAN-13.
  // El loop de substrings genera falsos positivos cuando los dos EAN-13
  // comparten un prefijo de longitud par (ej: 25 chars en vez de 26).
  // Con cualquier longitud > 16 que arranque con "20", tomamos los primeros 13.
  if (v.length > 16 && v.startsWith("20")) {
    const head = v.slice(0, 13);
    if (/^20\d{11}$/.test(head)) return head;
  }

  for (let pass = 0; pass < 4; pass++) {
    let cut = false;
    for (let L = Math.floor(v.length / 2); L >= 10; L--) {
      if (v.length >= 2 * L && v.slice(0, L) === v.slice(L, 2 * L)) {
        v = v.slice(0, L);
        cut = true;
        break;
      }
    }
    if (!cut) break;
  }

  return v;
}

function interpretarPeso7Digitos(wt7: string): number | null {
  const n = parseInt(wt7, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const div of [1_000_000, 100_000, 10_000, 1000, 100, 10]) {
    const kg = n / div;
    if (kg >= 0.02 && kg <= 480) return Math.round(kg * 1000) / 1000;
  }
  return null;
}

/**
 * Formato balanza EAN-13: peso en 6 dígitos interpretados como entero / 10000.
 * Ej: "005150" → 5150 / 10000 = 0.515 kg
 * Ej: "011500" → 11500 / 10000 = 1.150 kg
 */
function interpretarPesoKKGGGG(wt6: string): number | null {
  if (wt6.length !== 6 || !/^\d{6}$/.test(wt6)) return null;
  const total = parseInt(wt6, 10) / 10000;
  if (total < 0.02 || total > 480) return null;
  return Math.round(total * 1000) / 1000;
}

/** Fallback EAN-13: intenta los últimos 4 dígitos del código como peso (divisor heurístico). */
function interpretarPesoColaEan13(d: string): number | null {
  if (d.length !== 13 || !d.startsWith("20")) return null;
  const tail4 = d.slice(9, 13);
  const n = parseInt(tail4, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const div of [1000, 100, 10]) {
    const kg = n / div;
    if (kg >= 0.02 && kg <= 480) return Math.round(kg * 1000) / 1000;
  }
  return null;
}

export interface ResolverScanBalanzaResult {
  /** Códigos a comparar con `productos.codigo_plu` (orden de prioridad aproximado) */
  codigosPlu: string[];
  /** Peso en kg si se pudo leer del barcode */
  pesoKg: number | null;
}

/**
 * Decodifica ticket de balanza: prefijo 20 + PLU + peso.
 * Soporta formato EAN-13 (13 dígitos) y formato largo (≥16 dígitos).
 * También colapsa doble disparo de pistola.
 *
 * Formato EAN-13 esperado: 20 + PLU(6) + peso(6)
 *   donde peso(6) / 10000 = kg  →  "005150" = 0.515 kg
 */
export function resolverScanBalanza(raw: string): ResolverScanBalanzaResult {
  let d = colapsarDobleLecturaBarcode(saneDigitosBarcode(raw));
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (s: string | undefined) => {
    const t = (s ?? "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    ordered.push(t);
    const nz = t.replace(/^0+/, "") || "0";
    if (nz !== t && !seen.has(nz)) {
      seen.add(nz);
      ordered.push(nz);
    }
    const n = parseInt(t, 10);
    const ns = String(n);
    if (ns !== t && ns !== nz && ns.length > 0 && !seen.has(ns)) {
      seen.add(ns);
      ordered.push(ns);
    }
  };

  let pesoKg: number | null = null;

  // ── Formato largo: 20 + PLU(7) + peso(7) ──────────────────────────
  if (d.startsWith("20") && d.length >= 16) {
    for (let o = 0; o <= 1; o++) {
      if (d.length < 16 + o) continue;
      const plu7 = d.slice(2 + o, 9 + o);
      const wt7  = d.slice(9 + o, 16 + o);
      if (/^\d{7}$/.test(plu7) && /^\d{7}$/.test(wt7)) {
        push(plu7);
        // Balanza suele mandar PLU en 7 posiciones con un 0 extra (ej. 0000070 → PLU real 000007)
        if (plu7.endsWith("0")) push(d.slice(2 + o, 8 + o));
        pesoKg = interpretarPeso7Digitos(wt7);
        break;
      }
    }
  }

  // ── Formato EAN-13: 20 + PLU(6) + peso(6) ─────────────────────────
  // peso(6) / 10000 = kg  →  "005150" = 0.515 kg | "011500" = 1.150 kg
  if (d.startsWith("20") && d.length === 13) {
    const plu6 = d.slice(1, 7);
    if (/^\d{6}$/.test(plu6)) push(plu6);
    push(d.slice(2, 9));
    const wt6 = d.slice(7, 13);
    // Primario: formato exacto declarado por la balanza (n / 10000)
    if (/^\d{6}$/.test(wt6))
      pesoKg = pesoKg ?? interpretarPesoKKGGGG(wt6);
    // Fallback 1: cola EAN-13 heurística
    pesoKg = pesoKg ?? interpretarPesoColaEan13(d);
    // Fallback 2: heurística de 7 dígitos para otros modelos de balanza
    if (pesoKg == null && /^\d{6}$/.test(wt6))
      pesoKg = interpretarPeso7Digitos(wt6.padEnd(7, "0"));
  }

  // PLU conocido textual
  if (d.includes("000007")) push("000007");

  for (const c of candidatosCodigoBarrasParaPluInterno(d)) push(c);

  return { codigosPlu: ordered.slice(0, 40), pesoKg };
}

/** Variantes legacy de substrings (sin volver a llamar resolver). */
function candidatosCodigoBarrasParaPluInterno(scan: string): string[] {
  const d = scan;
  if (!d.length) return [];
  const uniq: string[] = [];
  const add = (...xs: Array<string | undefined>) => {
    for (const t of xs) {
      const s = (t ?? "").trim();
      if (!s || uniq.includes(s)) continue;
      uniq.push(s);
      const n = parseInt(s, 10);
      const ns = Number.isFinite(n) ? String(n) : "";
      if (ns && ns !== s && !uniq.includes(ns)) uniq.push(ns);
    }
  };

  add(d);
  if (d.startsWith("0")) add(d.slice(1));

  if (d.length === 13 && d.startsWith("2")) {
    add(d.slice(1, 6), d.slice(1, 7), d.slice(2, 7), d.slice(2, 8), d.slice(3, 8), d.slice(3, 9), d.slice(4, 9));
    add(d.slice(6, 11), d.slice(5, 11), d.slice(7, 12));
  }

  return uniq.slice(0, 24);
}

/**
 * @deprecated usar `resolverScanBalanza` en flujo completo
 */
export function candidatosCodigoBarrasParaPlu(scan: string): string[] {
  return resolverScanBalanza(scan).codigosPlu;
}

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

export const SISTEMA_LABELS: Record<string, string> = {
  filet_fresco:         "Filet fresco",
  pata_muslo_fresca:    "Pata/Muslo fresca",
  pechuga_con_piel:     "Pechuga c/piel",
  alitas:               "Alitas",
  carcasa:              "Carcasa",
  menudos:              "Menudos",
  pollo_entero:         "Pollo entero",
  supremas:             "Supremas",
  filet_congelado:      "Filet congelado",
  pata_muslo_congelada: "Pata/Muslo congelada",
  pata_muslo:           "Pata/Muslo (desposte)",
  pechuga:              "Filet fresco (desposte)",
};

export function getProductoLabel(nombre: string): string {
  if (SISTEMA_LABELS[nombre]) return SISTEMA_LABELS[nombre];
  return nombre
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}