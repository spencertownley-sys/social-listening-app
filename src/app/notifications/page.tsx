import Link from "next/link";
import { read } from "@/lib/store";
import { MarkAllRead } from "@/components/MarkAllRead";
import { timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL = { realtime: "New mentions", spike: "Spike", digest: "Digest" } as const;

export default async function NotificationsPage() {
  const data = await read();
  const names = new Map(data.profiles.map((p) => [p.id, p.config.name]));
  const list = [...data.notifications].reverse().slice(0, 100);
  const unread = list.filter((n) => !n.read).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {unread > 0 && <MarkAllRead />}
      </div>
      {list.length === 0 && (
        <p className="card text-sm text-muted">
          Nothing yet. Alerts and digests appear here after each listening run, following each profile&apos;s delivery settings.
        </p>
      )}
      <ul className="space-y-3">
        {list.map((n) => (
          <li key={n.id} className={`card space-y-2 ${n.read ? "" : "border-accent"}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {!n.read && <span className="chip border-accent font-medium text-accent">New</span>}
              <span className="chip">{KIND_LABEL[n.kind]}</span>
              <Link href={`/profiles/${n.profileId}`} className="font-medium text-foreground hover:underline">
                {names.get(n.profileId) ?? "Deleted profile"}
              </Link>
              <span>{timeAgo(n.createdAt)}</span>
              <span className="ml-auto">sent: {n.channels.join(", ")}</span>
            </div>
            <p className="font-medium">{n.title}</p>
            <p className="text-sm whitespace-pre-line text-muted">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
