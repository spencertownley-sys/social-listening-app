import { notFound } from "next/navigation";
import { canSeeProfile, canWrite } from "./accounts";
import { pageContext } from "./http";
import { read } from "./store";

/** Server-side loader for profile pages: signed-in user, and only profiles in their workspace. */
export async function loadProfile(id: string) {
  const ctx = await pageContext();
  const data = await read();
  const profile = data.profiles.find((p) => p.id === id);
  if (!profile || !canSeeProfile(data, ctx, id)) notFound();
  const versions = data.versions
    .filter((v) => v.profileId === id)
    .map((v) => v.version)
    .sort((a, b) => b - a);
  return { ctx, canEdit: canWrite(ctx), data, profile, versions, renderedAt: Date.now() };
}
