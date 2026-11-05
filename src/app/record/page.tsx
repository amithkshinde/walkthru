import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/app-nav";
import Recorder from "@/components/recorder";

export const instant = false;
export const metadata = { title: "New recording | Walkthru" };

export default async function RecordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/record");

  return (
    <>
      <AppNav email={user.email} />
      <main className="flex-1 px-4 py-10 sm:py-14">
        <Recorder />
      </main>
    </>
  );
}
