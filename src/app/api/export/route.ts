import { NextResponse } from "next/server";
import { visibleProfiles } from "@/lib/accounts";
import { apiContext } from "@/lib/http";
import { read } from "@/lib/store";

/** GET → a JSON download of this workspace: profiles, versions, matches, matched posts, feedback, notifications. */
export async function GET() {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  const data = await read();
  const profiles = visibleProfiles(data, ctx);
  const ids = new Set(profiles.map((p) => p.id));
  const matches = Object.values(data.matches).filter((m) => ids.has(m.profileId));
  const postIds = new Set(matches.map((m) => m.postId));
  const body = {
    exportedAt: new Date().toISOString(),
    workspace: data.workspaces.find((w) => w.id === ctx.workspaceId),
    profiles,
    versions: data.versions.filter((v) => ids.has(v.profileId)),
    learning: Object.fromEntries(Object.entries(data.learning).filter(([k]) => ids.has(k))),
    feedback: data.feedback.filter((f) => ids.has(f.profileId)),
    notifications: data.notifications.filter((n) => ids.has(n.profileId)),
    matches,
    posts: Object.values(data.posts).filter((p) => postIds.has(p.id)),
    enrichments: Object.values(data.enrichments).filter((e) => postIds.has(e.postId)),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="earshot-export-${body.exportedAt.slice(0, 10)}.json"`,
    },
  });
}
