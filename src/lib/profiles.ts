import { applyFeedback } from "./learning";
import { rematchProfile } from "./pipeline";
import { parseProfileConfig, type ListeningProfile } from "./profile";
import { getLearning, mutate, newId } from "./store";
import type { Feedback, FeedbackAction, Sentiment } from "./types";

/** Profile CRUD with versioning: every save writes a ProfileVersion snapshot (enables rollback). */

export async function createProfile(input: unknown): Promise<ListeningProfile> {
  const config = parseProfileConfig(input);
  return mutate((data) => {
    const now = new Date().toISOString();
    const profile: ListeningProfile = {
      id: newId("prf"),
      workspaceId: data.workspace.id,
      version: 1,
      status: "active",
      config,
      createdAt: now,
      updatedAt: now,
    };
    data.profiles.push(profile);
    data.versions.push({ profileId: profile.id, version: 1, config, createdAt: now });
    return profile;
  });
}

export async function updateProfile(
  id: string,
  patch: { config?: unknown; status?: ListeningProfile["status"]; rollbackTo?: number },
): Promise<ListeningProfile | null> {
  return mutate((data) => {
    const profile = data.profiles.find((p) => p.id === id);
    if (!profile) return null;
    let config = profile.config;
    if (patch.rollbackTo !== undefined) {
      const v = data.versions.find((x) => x.profileId === id && x.version === patch.rollbackTo);
      if (!v) throw new Error(`Version ${patch.rollbackTo} not found`);
      config = v.config;
    } else if (patch.config !== undefined) {
      config = parseProfileConfig(patch.config);
    }
    const now = new Date().toISOString();
    const configChanged = config !== profile.config;
    if (configChanged) {
      profile.version += 1;
      profile.config = config;
      data.versions.push({ profileId: id, version: profile.version, config, createdAt: now });
    }
    if (patch.status) profile.status = patch.status;
    profile.updatedAt = now;
    rematchProfile(data, profile);
    return profile;
  });
}

export async function deleteProfile(id: string): Promise<boolean> {
  return mutate((data) => {
    const before = data.profiles.length;
    data.profiles = data.profiles.filter((p) => p.id !== id);
    data.versions = data.versions.filter((v) => v.profileId !== id);
    for (const k of Object.keys(data.matches)) if (data.matches[k].profileId === id) delete data.matches[k];
    data.feedback = data.feedback.filter((f) => f.profileId !== id);
    delete data.learning[id];
    return data.profiles.length < before;
  });
}

export async function recordFeedback(input: {
  profileId: string;
  postId: string;
  action: FeedbackAction;
  correctedSentiment?: Sentiment;
}): Promise<Feedback> {
  return mutate((data) => {
    const profile = data.profiles.find((p) => p.id === input.profileId);
    if (!profile) throw new Error("Profile not found");
    const post = data.posts[input.postId];
    if (!post) throw new Error("Post not found");
    if (input.action === "wrong_sentiment" && !input.correctedSentiment) throw new Error("Say which sentiment is right.");
    const feedback: Feedback = { id: newId("fb"), ...input, createdAt: new Date().toISOString() };
    data.feedback.push(feedback);
    data.learning[profile.id] = applyFeedback(getLearning(data, profile.id), feedback, post);
    rematchProfile(data, profile);
    return feedback;
  });
}
