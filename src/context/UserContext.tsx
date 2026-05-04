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

    const load = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.error("[UserContext] auth.getUser error:", authError);
        setValue((v) => ({ ...v, loaded: true, profileError: authError.message }));
        return;
      }
      if (!user) {
        setValue((v) => ({ ...v, loaded: true }));
        return;
      }

      // Usar maybeSingle para no lanzar error si no hay fila
      const { data: profile, error: profileError } = await supabase
        .from("usuarios")
        .select("nombre, rol")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[UserContext] query usuarios error:", profileError);
      }

      const rol = (profile?.rol ?? "operario") as UserRole;

      console.log("[UserContext] loaded → uid:", user.id, "| db_rol:", profile?.rol, "| rol_used:", rol, "| isAdmin:", rol === "admin", "| profileError:", profileError?.message ?? null);

      setValue({
        userId:      user.id,
        userName:    profile?.nombre ?? user.email ?? "",
        userRole:    rol,
        isAdmin:     rol === "admin",
        loaded:      true,
        profileError: profileError?.message ?? null,
      });
    };

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => subscription.unsubscribe();
  }, []);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(UserContext);
}
