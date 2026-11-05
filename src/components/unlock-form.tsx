"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";
import { unlockVideo } from "@/app/v/[id]/actions";

export default function UnlockForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(unlockVideo.bind(null, id), null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <div>
        <label htmlFor="pw" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input id="pw" name="password" type="password" required autoFocus autoComplete="off" className="field" />
      </div>
      {state?.error && (
        <p role="alert" className="anim-alert rounded-lg bg-record-soft px-3 py-2 text-sm text-record">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {pending ? "Checking" : "Watch video"}
      </button>
    </form>
  );
}
