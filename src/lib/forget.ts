import { removePosts, type StoreData } from "./store";
import type { Network } from "./types";

/**
 * Erasure request for one post author: remove every stored post by that handle on that network
 * (with labels, matches, feedback and notification lines) and every muted-author entry for the
 * handle. Muted lists hold bare handles, so mutes are cleared whatever the network.
 */

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, "");
}

export interface ForgetResult {
  posts: number;
  mutes: number;
}

export function forgetAuthor(data: StoreData, network: Network, handleInput: string): ForgetResult {
  const handle = normalizeHandle(handleInput);
  if (!handle) return { posts: 0, mutes: 0 };
  const ids = Object.values(data.posts)
    .filter((p) => p.network === network && normalizeHandle(p.author.handle) === handle)
    .map((p) => p.id);
  const handles = new Set(ids.map((id) => data.posts[id].author.handle));
  const posts = removePosts(data, ids);

  // Alert texts quote posts as "… · handle: text"; drop those lines.
  for (const n of data.notifications) {
    const lines = n.body.split("\n");
    const kept = lines.filter((line) => ![...handles, handle].some((h) => line.includes(` · ${h}: `)));
    if (kept.length !== lines.length) n.body = kept.join("\n");
  }

  let mutes = 0;
  const strip = (list: string[]) => {
    const next = list.filter((h) => normalizeHandle(h) !== handle);
    mutes += list.length - next.length;
    return next;
  };
  for (const l of Object.values(data.learning)) l.mutedAuthors = strip(l.mutedAuthors ?? []);
  for (const p of data.profiles) p.config.author.muted = strip(p.config.author.muted ?? []);
  for (const v of data.versions) if (v.config?.author?.muted) v.config.author.muted = v.config.author.muted.filter((h) => normalizeHandle(h) !== handle);
  return { posts, mutes };
}
