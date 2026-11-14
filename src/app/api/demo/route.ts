import { NextResponse } from "next/server";
import { apiContext } from "@/lib/http";
import { mutate, removePosts } from "@/lib/store";

/** DELETE: remove the bundled demo posts and everything derived from them. Real posts stay. */
export async function DELETE() {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  const removed = await mutate((data) =>
    removePosts(
      data,
      Object.values(data.posts)
        .filter((p) => /^demo\d+$/.test(p.externalId))
        .map((p) => p.id),
    ),
  );
  return NextResponse.json({ removed });
}
