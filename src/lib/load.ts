import { notFound } from "next/navigation";
import { read } from "./store";

/** Server-side loader for profile pages. */
export async function loadProfile(id: string) {
  const data = await read();
  const profile = data.profiles.find((p) => p.id === id);
  if (!profile) notFound();
  const versions = data.versions
    .filter((v) => v.profileId === id)
    .map((v) => v.version)
    .sort((a, b) => b - a);
  return { data, profile, versions, renderedAt: Date.now() };
}
