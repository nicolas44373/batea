"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types";

interface UserContextValue {
  userId:      string;
  userName:    string;
  userRole:    UserRole;
  isAdmin:     boolean;
  loaded:      boolean;
  profileError: string | null;
}

const UserContext = createContext<UserContextValue>({
  userId:      "",
  userName:    "",
  userRole:    "operario",
  isAdmin:     false,
  loaded:      false,
  profileError: null,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<UserContextValue>({
    userId:      "",
    userName:    "",
    userRole:    "operario",
    isAdmin:     false,
    loaded:      false,
    profileError: null,
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadProfile = async (userId: string, email: string | undefined) => {
      const { data: profile, error: profileError } = await supabase
        .from("usuarios")
        .select("nombre, rol")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        console.error("[UserContext] query usuarios error:", profileError);
      }

      const rol = (profile?.rol ?? "operario") as UserRole;

      setValue({
        userId,
        userName:    profile?.nombre ?? email ?? "",
        userRole:    rol,
        isAdmin:     rol === "admin",
        loaded:      true,
        profileError: profileError?.message ?? null,
      });
    };

    // onAuthStateChange dispara inmediatamente con INITIAL_SESSION al suscribirse,
    // evitando llamar a getUser() por separado y el conflicto de locks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setValue({
          userId: "", userName: "", userRole: "operario",
          isAdmin: false, loaded: true, profileError: null,
        });
      } else {
        loadProfile(session.user.id, session.user.email ?? undefined);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(UserContext);
}
