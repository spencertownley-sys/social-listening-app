import { NextResponse } from "next/server";
import { apiContext } from "@/lib/http";
import { mutate } from "@/lib/store";

/** DELETE: remove the bundled demo posts and everything derived from them. Real posts stay. */
export async function DELETE() {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  const removed = await mutate((data) => {
    const ids = Object.values(data.posts)
      .filter((p) => /^demo\d+$/.test(p.externalId))
      .map((p) => p.id);
    const gone = new Set(ids);
    for (const id of ids) {
      delete data.posts[id];
      delete data.enrichments[id];
    }
    for (const [k, m] of Object.entries(data.matches)) if (gone.has(m.postId)) delete data.matches[k];
    data.feedback = data.feedback.filter((f) => !gone.has(f.postId));
    for (const n of data.notifications) n.postIds = n.postIds.filter((id) => !gone.has(id));
    data.notifications = data.notifications.filter((n) => n.postIds.length > 0 || n.kind !== "realtime");
    return ids.length;
  });
  return NextResponse.json({ removed });
}
