import { NextResponse } from "next/server";
import { visibleProfiles } from "@/lib/accounts";
import { apiContext, jsonBody } from "@/lib/http";
import { mutate } from "@/lib/store";

/** Mark notifications read: `{ ids: [...] }` or `{ all: true }`. */
export async function POST(req: Request) {
  const ctx = await apiContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await jsonBody(req);
  const ids = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null;
  const count = await mutate((data) => {
    let n = 0;
    const mine = new Set(visibleProfiles(data, ctx).map((p) => p.id));
    for (const x of data.notifications) {
      if (!x.read && mine.has(x.profileId) && (body.all === true || ids?.has(x.id))) {
        x.read = true;
        n++;
      }
    }
    return n;
  });
  return NextResponse.json({ marked: count });
}
