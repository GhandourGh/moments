/**
 * Anthropic gateway — the only file that talks to the provider. Keys live in
 * Vercel env, never on the device (docs/stack.md).
 *
 * Cost posture (docs/costs.md): moderation on by default (~$0.87/event on
 * Haiku), captions off by default (~$9/event), face match costs $0 because
 * embeddings are computed on-device.
 */

const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";

export function aiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

export function moderationEnabled(): boolean {
  if (process.env.AI_MODERATION === "false") return false;
  return Boolean(aiKey()); // default on whenever a key exists
}

export function captionsEnabled(): boolean {
  return process.env.AI_CAPTIONS === "true" && Boolean(aiKey());
}

async function vision(prompt: string, image: Buffer, mime: string, maxTokens: number): Promise<string> {
  const key = aiKey();
  if (!key) throw Object.assign(new Error("ai disabled"), { code: "ai_disabled" });

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: image.toString("base64") } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`anthropic ${res.status}`), { code: "ai_provider_down" });
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return data.content?.find((b) => b.type === "text")?.text ?? "";
}

export interface ModerationVerdict {
  allowed: boolean;
  reasons: string[];
}

const MODERATE_PROMPT = `You are moderating a photo for a shared event photo album (weddings, parties). Guests of all ages will see every allowed photo.

Block ONLY: nudity or sexual content, graphic violence or gore, hate symbols, illegal drug use. Ordinary party content — drinks, dancing, kissing, silly faces — is allowed.

Reply with strict JSON only, no prose: {"allowed": true, "reasons": []} or {"allowed": false, "reasons": ["<one-word-reason>"]}`;

/**
 * Screen a photo. Returns null on provider failure so the caller can decide
 * fail-open vs fail-closed (uploads fail open — the party can't wait on us).
 */
export async function moderateImage(image: Buffer, mime: string): Promise<ModerationVerdict | null> {
  try {
    const text = await vision(MODERATE_PROMPT, image, mime, 100);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.allowed !== "boolean") return null;
    return { allowed: parsed.allowed, reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [] };
  } catch (err) {
    if ((err as { code?: string }).code === "ai_disabled") throw err;
    return null;
  }
}

const CAPTION_PROMPT = `Write one short sentence of accessible alt-text for this event photo. Describe what is happening and the setting; never guess names or identities. Reply with the sentence only.`;

export async function captionImage(image: Buffer, mime: string): Promise<string> {
  return (await vision(CAPTION_PROMPT, image, mime, 120)).trim();
}
