import type { Network, Post } from "../types";
import { nowIso } from "./types";

/**
 * Demo posts so the app is usable without keys or network access. They are invented examples
 * (fictional handles) spread over the last 7 days, covering the seven profile templates:
 * cruise lines (topic trends / brand health), a podcast (fan love), a coffee shop (crisis radar,
 * competitor watch, leads) and a notes app (product feedback).
 */

type Row = [network: Network, handle: string, followers: number, hoursAgo: number, text: string, extra?: Partial<Post>];

const ROWS: Row[] = [
  // Cruise
  ["bluesky", "seadaysandy.bsky.social", 1840, 3, "Starlink wifi on Royal Caribbean's Wonder of the Seas is honestly amazing. Streamed the game from the pool deck, zero buffering. #cruise"],
  ["bluesky", "portholepete.bsky.social", 312, 7, "Third day of our Carnival cruise and the wifi is still unusable. Paid $25 a day for this?? Unacceptable. #cruiselife"],
  ["mastodon", "wanderwell@mastodon.social", 920, 11, "Princess Cruises skipped Ensenada again with no explanation. Disappointed, and no refund offered. #cruise", { lang: "en" }],
  ["news", "Cruise Industry Daily", 0, 14, "Royal Caribbean raises full-year guidance as bookings hit record highs, citing strong demand for Caribbean itineraries and its private destination Perfect Day at CocoCay.", { title: "Royal Caribbean raises guidance on record bookings" }],
  ["bluesky", "firsttimecruiser.bsky.social", 85, 20, "First cruise ever next month! Royal Caribbean or Carnival for a family with two teens? Any recommendations? #cruise"],
  ["youtube", "Cruise With Mo", 48200, 26, "We tried EVERY specialty restaurant on Icon of the Seas. Some were incredible, a couple were overpriced and meh. Full honest review.", { title: "Icon of the Seas specialty dining: honest review" }],
  ["mastodon", "deckchairdiaries@mastodon.social", 410, 33, "Oh great, another muster drill in the rain. Love that for us. #cruiselife", { lang: "en" }],
  ["bluesky", "norovirus_watch.bsky.social", 2300, 40, "CDC reports a norovirus outbreak on a Holland America sailing; 140 passengers ill. Ship returning to port early. #cruise #health"],
  ["bluesky", "cruisedealsbot", 15000, 44, "GIVEAWAY: repost to win a free Carnival cruise for two! #cruise #giveaway", { author: { handle: "cruisedealsbot", botScore: 0.9 } }],
  ["news", "Travel Weekly Wire", 0, 52, "Norwegian Cruise Line Holdings cut its occupancy outlook, citing softer close-in demand on Alaska itineraries.", { title: "NCLH trims occupancy outlook" }],
  ["bluesky", "lighthouse_liz.bsky.social", 640, 58, "Shout out to the crew on Princess Ruby Princess. Our cabin steward remembered my daughter's birthday and made a towel cake. Best cruise ever."],
  ["bluesky", "jobsatsea.bsky.social", 3000, 61, "We're hiring! Bartenders and youth staff wanted for Carnival ships. Apply now #jobs #cruise"],
  ["mastodon", "slowtravel@mastodon.social", 2200, 70, "Is the Starlink wifi on cruise ships actually fast enough for video calls? Need to work two days of the trip. #cruise", { lang: "en" }],
  ["bluesky", "cabin8402.bsky.social", 150, 80, "Never sailing Carnival again. Cabin was dirty, guest services were rude, and the buffet was a mess. Switching to Celebrity next year."],
  ["youtube", "The Budget Sailor", 12100, 95, "Is Perfect Day at CocoCay worth it? We spent a full day there and here's what we loved and what was crowded.", { title: "Perfect Day at CocoCay: worth it?" }],
  ["bluesky", "harborhopper.bsky.social", 990, 110, "Wish Royal Caribbean's app would let you book shows before boarding. Please add this! Waiting in line on day one is annoying."],
  ["bluesky", "seadaysandy.bsky.social", 1840, 130, "Wifi so slow on our Carnival ship that I gave up and read a book. Honestly kind of relaxing? #cruise"],

  // Podcast: "The Deep End" (fan love / creator persona)
  ["bluesky", "podnerd.bsky.social", 760, 5, "This week's Deep End episode with the marine biologist was SO good. Learned more about octopus brains than I ever expected. #deependpod"],
  ["youtube", "Clip Corner", 3400, 18, "Best moments from The Deep End podcast episode 112. The squid story had me crying laughing.", { title: "The Deep End Podcast: best of ep. 112" }],
  ["bluesky", "audiofile.bsky.social", 2100, 29, "Love @deependpod but the audio on the last two episodes has a weird echo. Anyone else hear it?"],
  ["mastodon", "sciencecommute@fosstodon.org", 530, 47, "Any recommendations for science podcasts like The Deep End? Need more for my commute. #podcasts #deependpod", { lang: "en" }],
  ["bluesky", "kelpforest.bsky.social", 310, 76, "Can't wait for the live Deep End show in Seattle!! Tickets booked. #deependpod"],
  ["bluesky", "deependpod.bsky.social", 25400, 90, "New episode out now: what lives at the bottom of the Mariana Trench? #deependpod", { author: { handle: "deependpod.bsky.social", followerCount: 25400, verified: true } }],

  // Coffee shop: "Bean There Coffee" in Portland (small business persona)
  ["bluesky", "pdxlatte.bsky.social", 420, 2, "Waited 25 minutes at Bean There Coffee on Alberta this morning and they got my order wrong. Frustrating. #portland"],
  ["mastodon", "bikecommuter@pdx.social", 260, 9, "Bean There Coffee's cold brew is the best in Portland. Fight me. #portland", { lang: "en" }],
  ["bluesky", "newtopdx.bsky.social", 75, 15, "Just moved to Portland. Looking for a cozy coffee shop to work from with good wifi, any suggestions? #portland #coffee"],
  ["bluesky", "pdxlatte.bsky.social", 420, 22, "Stumptown raised prices again. $7 for a latte is wild. Might switch to Bean There Coffee."],
  ["news", "Portland Eats Blog", 0, 50, "Bean There Coffee opens a second location in Sellwood with a bigger roastery and a kids' corner.", { title: "Bean There Coffee expands to Sellwood" }],
  ["bluesky", "grumpybarista.bsky.social", 880, 64, "Health inspector closed Bean There Coffee's Alberta shop for a day? Hope they're okay, that's scary. #portland"],
  ["mastodon", "rosecityreads@pdx.social", 140, 100, "Stumptown's new oat milk cortado is excellent and the staff were so friendly. #coffee", { lang: "en" }],

  // App: "Notably" notes app (product feedback persona)
  ["bluesky", "devdana.bsky.social", 1500, 4, "Notably keeps crashing when I paste images on iPad. Lost a whole page of notes. Really frustrating."],
  ["bluesky", "pkm_paul.bsky.social", 3800, 13, "Feature request for Notably: please add backlinks between notes. It's the one thing keeping me on Obsidian."],
  ["mastodon", "writerwen@mastodon.social", 610, 24, "Notably's new sync is fast and the dark mode is gorgeous. Best notes app I've used. #productivity", { lang: "en" }],
  ["bluesky", "ux_ana.bsky.social", 2900, 37, "Thinking of cancelling my Notably subscription. The price went up and offline mode still doesn't work. Switching to Bear."],
  ["bluesky", "studystack.bsky.social", 220, 55, "Does Notably support handwriting search? Trying to decide before I buy the yearly plan."],
  ["youtube", "Productivity Lab", 89000, 84, "Notably vs Obsidian vs Bear: which notes app should you use in 2026? We tested sync, search and pricing.", { title: "Notably vs Obsidian vs Bear (2026)" }],
];

export function demoPosts(now = Date.now()): Post[] {
  return ROWS.map(([network, handle, followers, hoursAgo, text, extra], i) => {
    const id = `demo${String(i + 1).padStart(3, "0")}`;
    const author = { handle, displayName: handle.split(/[.@]/)[0], followerCount: followers || undefined, ...(extra?.author ?? {}) };
    return {
      id: `${network}:${id}`,
      network,
      externalId: id,
      url: network === "news" ? `https://example.com/news/${id}` : `https://example.com/${network}/${id}`,
      author,
      text,
      lang: "en",
      postedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
      kind: "original",
      media: network === "youtube" ? [{ type: "video", url: `https://example.com/youtube/${id}` }] : [],
      links: [],
      engagement: { likes: Math.round(followers / 40) + (i % 7), reposts: Math.round(followers / 300), replies: i % 9 },
      ingestedAt: nowIso(),
      ...extra,
      ...(extra?.author ? { author } : {}),
    } satisfies Post;
  });
}
