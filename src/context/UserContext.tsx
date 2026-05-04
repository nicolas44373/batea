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
        // AuthSessionMissingError es esperado cuando no hay sesión activa (ej: página de login).
        // No lo mostramos como error — simplemente no hay usuario.
        if (authError.name !== "AuthSessionMissingError") {
          console.error("[UserContext] auth.getUser error:", authError);
        }
        setValue((v) => ({ ...v, loaded: true, profileError: null }));
        return;
      }
      if (!user) {
        setValue((v) => ({ ...v, loaded: true }));
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("usuarios")
        .select("nombre, rol")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[UserContext] query usuarios error:", profileError);
      }

      const rol = (profile?.rol ?? "operario") as UserRole;

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setValue({
          userId: "", userName: "", userRole: "operario",
          isAdmin: false, loaded: true, profileError: null,
        });
      } else {
        load();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(UserContext);
}
