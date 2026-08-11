/**
 * Online play needs a Supabase project configured at build time. Without one
 * the app is still a complete single-player game — the online entry points
 * simply don't render.
 */
export function onlineEnabled(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
