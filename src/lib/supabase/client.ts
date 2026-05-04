import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton: una sola instancia en el browser evita que múltiples clientes
// compitan por el lock de refresco del token (error "Lock was released...")
let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}

/** Llama esto después de signOut para que el próximo login use una instancia limpia. */
export function resetClient(): void {
  client = null;
}
