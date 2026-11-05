"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function RequestAccess({ videoId, email: initialEmail, name: initialName }: { videoId: string; email: string | null; name: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "approved" | "declined">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("request_video_access", {
      vid: videoId,
      req_email: email,
      req_name: name,
      req_message: message,
    });
    setBusy(false);
    if (err || data === "missing") return setError("Could not send your request. Try again.");
    if (data === "invalid_email") return setError("Enter a valid email address.");
    setState(data as "pending" | "approved" | "declined");
  }

  if (state !== "idle") {
    return (
      <div className="anim-fade mt-6 rounded-lg bg-surface-muted p-4 text-left text-sm" role="status">
        <p className="flex items-center gap-2 font-medium">
          {state !== "declined" && <Check className="h-4 w-4 text-success" aria-hidden />}
          {state === "approved" ? "You already have access" : state === "declined" ? "This request was declined" : "Request sent"}
        </p>
        <p className="mt-1 text-muted">
          {state === "approved"
            ? `Sign in with ${email} and reload this page.`
            : state === "declined"
              ? "The owner has declined access for this email."
              : `The owner will see it. Once approved, sign in with ${email} to watch.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-2.5 text-left">
      <p className="text-sm font-medium">Ask for access</p>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your name" aria-label="Your name" className="field" />
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Your email" className="field" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="Add a note (optional)" aria-label="Note to the owner" className="field resize-none" />
      {error && (
        <p role="alert" className="anim-alert text-sm text-record">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request access
      </button>
    </form>
  );
}
