import type { Post } from "../types";
import { decodeEntities, getJson, nowIso, type Connector, type FetchRequest } from "./types";

/**
 * YouTube Data API v3: search.list for recent videos per term, then videos.list for stats.
 * Needs YOUTUBE_API_KEY. search.list costs 100 quota units per call (default quota 10,000/day),
 * so terms are capped per run. Comments (commentThreads.list) are the next addition.
 */

interface SearchItem {
  id: { videoId?: string };
  snippet: { publishedAt: string; channelId: string; channelTitle: string; title: string; description: string; thumbnails?: { medium?: { url: string } } };
}
interface VideoItem {
  id: string;
  snippet: { description: string; defaultAudioLanguage?: string; defaultLanguage?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

const MAX_TERMS = Number(process.env.YOUTUBE_MAX_TERMS ?? 10);

export const youtubeConnector: Connector = {
  network: "youtube",
  name: "YouTube videos",
  unavailableReason: () => (process.env.YOUTUBE_API_KEY ? null : "Set YOUTUBE_API_KEY to listen on YouTube."),
  async fetch(req: FetchRequest): Promise<Post[]> {
    const key = process.env.YOUTUBE_API_KEY!;
    const found = new Map<string, SearchItem>();
    for (const term of req.terms.slice(0, MAX_TERMS)) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.search = new URLSearchParams({
        part: "snippet",
        q: term,
        type: "video",
        order: "date",
        maxResults: String(Math.min(50, req.limit)),
        publishedAfter: req.since.toISOString(),
        key,
      }).toString();
      const res = await getJson<{ items: SearchItem[] }>(url.toString());
      for (const item of res.items) if (item.id.videoId) found.set(item.id.videoId, item);
    }
    const ids = [...found.keys()];
    const details = new Map<string, VideoItem>();
    for (let i = 0; i < ids.length; i += 50) {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.search = new URLSearchParams({ part: "snippet,statistics", id: ids.slice(i, i + 50).join(","), key }).toString();
      const res = await getJson<{ items: VideoItem[] }>(url.toString());
      for (const v of res.items) details.set(v.id, v);
    }
    return ids.map((id): Post => {
      const s = found.get(id)!.snippet;
      const d = details.get(id);
      return {
        id: `youtube:${id}`,
        network: "youtube",
        externalId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        author: { handle: s.channelTitle, displayName: s.channelTitle },
        title: decodeEntities(s.title),
        text: decodeEntities(d?.snippet.description ?? s.description).slice(0, 4000),
        lang: d?.snippet.defaultAudioLanguage ?? d?.snippet.defaultLanguage,
        postedAt: s.publishedAt,
        kind: "original",
        media: [{ type: "video", url: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: s.thumbnails?.medium?.url }],
        links: [],
        engagement: {
          views: Number(d?.statistics?.viewCount ?? 0) || undefined,
          likes: Number(d?.statistics?.likeCount ?? 0) || undefined,
          replies: Number(d?.statistics?.commentCount ?? 0) || undefined,
        },
        ingestedAt: nowIso(),
      };
    });
  },
};
