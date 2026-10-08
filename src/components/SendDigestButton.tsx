"use client";

import { useState } from "react";

export function SendDigestButton({ profileId }: { profileId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const res = await fetch(`/api/profiles/${profileId}/digest`, { method: "POST" });
    const body = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
    setStatus(body.sent ? "Sent." : (body.reason ?? body.error ?? "Not sent."));
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-3">
      {status && (
        <span className="text-sm text-muted" role="status">
          {status}
        </span>
      )}
      <button className="btn-primary" onClick={send} disabled={busy}>
        {busy ? "Sending…" : "Send now"}
      </button>
    </div>
  );
}
