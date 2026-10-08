import Link from "next/link";
import type { ListeningProfile } from "@/lib/profile";
import { ProfileActions } from "./ProfileActions";

export function ProfileHeader({ profile, versions, current }: { profile: ListeningProfile; versions: number[]; current: "feed" | "dashboard" | "digest" | "edit" }) {
  const tabs = [
    ["feed", "Feed", `/profiles/${profile.id}`],
    ["dashboard", "Dashboard", `/profiles/${profile.id}/dashboard`],
    ["digest", "Digest", `/profiles/${profile.id}/digest`],
  ] as const;
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{profile.config.name}</h1>
          <p className="text-sm text-muted">
            Version {profile.version} · {profile.status === "active" ? "listening" : "paused"}
            {profile.config.description ? ` · ${profile.config.description}` : ""}
          </p>
        </div>
        <ProfileActions profile={profile} versions={versions} />
      </div>
      <nav className="flex gap-4 border-b border-line text-sm">
        {tabs.map(([id, label, href]) => (
          <Link key={id} href={href} className={`-mb-px border-b-2 pb-2 ${current === id ? "border-accent font-medium" : "border-transparent text-muted"}`} aria-current={current === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
