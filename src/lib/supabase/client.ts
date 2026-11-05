import { createBrowserClient } from "@supabase/ssr";

export function createClient(unlockToken?: string) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    unlockToken
      ? { isSingleton: false, global: { headers: { "x-wt-unlock": unlockToken } } }
      : undefined,
  );
}
