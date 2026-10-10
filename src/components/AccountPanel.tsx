"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/store";

interface Props {
  me: { id: string; name: string; email: string; role: Role };
  workspaceName: string;
  members: { userId: string; role: Role; name: string; email: string }[];
  invites: { id: string; role: Role; expiresAt: string }[];
  canInvite: boolean;
  storage: "file" | "postgres";
}

const ROLE_HELP: Record<Role, string> = {
  owner: "everything, including people and data export",
  editor: "create and edit profiles, give feedback, run listening",
  viewer: "read-only",
};

async function post(url: string, method: string, body: object) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok && res.status !== 204) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong");
  return res.status === 204 ? {} : res.json();
}

export function AccountPanel({ me, workspaceName, members, invites, canInvite, storage }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("editor");
  const [pw, setPw] = useState({ current: "", next: "" });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted">
          {me.name || me.email} · {me.email} · {me.role} of {workspaceName}
        </p>
      </div>
      {msg && (
        <p className="text-sm" role="status">
          {msg}
        </p>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">People in {workspaceName}</h2>
        <ul className="divide-y divide-line text-sm">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
              <span>
                {m.name || m.email} <span className="text-muted">· {m.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="chip text-muted" title={ROLE_HELP[m.role]}>
                  {m.role}
                </span>
                {me.role === "owner" && m.userId !== me.id && (
                  <button
                    className="btn text-danger"
                    onClick={() =>
                      confirm(`Remove ${m.email} from ${workspaceName}?`) &&
                      run(() => post("/api/members", "DELETE", { userId: m.userId }), `Removed ${m.email}.`)
                    }
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>

        {canInvite && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Invite someone as
              <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role for the invite">
                {me.role === "owner" && <option value="owner">owner</option>}
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                className="btn-primary"
                onClick={() =>
                  run(async () => {
                    const r = (await post("/api/invites", "POST", { role })) as { path: string };
                    setLink(`${window.location.origin}${r.path}`);
                  }, "Invite link created. It works once and expires in 7 days.")
                }
              >
                Create invite link
              </button>
            </div>
            {link && (
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg("Copied."))}>
                  Copy
                </button>
              </div>
            )}
            {invites.length > 0 && (
              <ul className="text-sm text-muted">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-1">
                    Open invite ({i.role}), expires {new Date(i.expiresAt).toLocaleDateString()}
                    <button className="btn" onClick={() => run(() => post("/api/invites", "DELETE", { id: i.id }), "Invite revoked.")}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Password and sessions</h2>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post("/api/account", "POST", { action: "password", ...pw });
              setPw({ current: "", next: "" });
            }, "Password changed. Other devices were signed out.");
          }}
        >
          <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required aria-label="Current password" />
          <input className="input" type="password" placeholder="New password (10+ characters)" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required aria-label="New password" />
          <button className="btn" type="submit">
            Change password
          </button>
        </form>
        <button
          className="btn"
          onClick={() =>
            confirm("Sign out on every device, including this one?") &&
            run(async () => {
              await post("/api/account", "POST", { action: "signout-everywhere" });
              router.push("/login");
            }, "Signed out everywhere.")
          }
        >
          Sign out everywhere
        </button>
      </section>

      {me.role === "owner" && (
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">Your data</h2>
          <p className="text-muted">
            Stored in {storage === "postgres" ? "Postgres on Railway (back it up from Railway's Backups tab)" : "a local file on the server"}.
          </p>
          <a className="btn" href="/api/export">
            Download a JSON export of this workspace
          </a>
        </section>
      )}
    </div>
  );
}
