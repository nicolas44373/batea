"use client";

import { useCurrentUser } from "@/context/UserContext";

/**
 * Muestra sus hijos SOLO si el usuario es admin.
 * Opcionalmente muestra un fallback (ej: Badge "Solo admin").
 */
export function AdminOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isAdmin, loaded } = useCurrentUser();
  if (!loaded) return null;
  return isAdmin ? <>{children}</> : <>{fallback}</>;
}
