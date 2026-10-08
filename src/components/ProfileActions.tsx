"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ListeningProfile } from "@/lib/profile";

export function ProfileActions({ profile, versions }: { profile: ListeningProfile; versions: number[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: object) {
    setBusy(true);
    await fetch(`/api/profiles/${profile.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${profile.config.name}" and all its matches and feedback?`)) return;
    setBusy(true);
    await fetch(`/api/profiles/${profile.id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/profiles/${profile.id}/edit`} className="btn">
        Edit
      </Link>
      <button className="btn" disabled={busy} onClick={() => patch({ status: profile.status === "active" ? "paused" : "active" })}>
        {profile.status === "active" ? "Pause" : "Resume"}
      </button>
      {versions.length > 1 && (
        <select
          className="input w-auto"
          aria-label="Roll back to a version"
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && patch({ rollbackTo: Number(e.target.value) })}
        >
          <option value="">Roll back to…</option>
          {versions
            .filter((v) => v !== profile.version)
            .map((v) => (
              <option key={v} value={v}>
                version {v}
              </option>
            ))}
        </select>
      )}
      <button className="btn text-danger" disabled={busy} onClick={remove}>
        Delete
      </button>
    </div>
  );
}
