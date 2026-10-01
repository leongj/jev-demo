import "server-only";

export class DemoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function redact(value: unknown): unknown {
  const secrets = [
    process.env.TYPESAFE_API_KEY,
    process.env.AZURE_OPENAI_API_KEY,
    process.env.AZURE_CLIENT_SECRET,
  ].filter((s): s is string => Boolean(s));
  if (typeof value === "string") {
    let text = value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");
    for (const secret of secrets) text = text.split(secret).join("[REDACTED]");
    return text;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /^(authorization|api[-_]?key|access[-_]?token|client[-_]?secret|encrypted_content)$/i.test(key)
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return value;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next's internal request URL may use localhost even when the browser uses 127.0.0.1.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (!origin || origin !== expectedOrigin)
    throw new DemoError("ORIGIN", "Live calls must originate from this demo website.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new DemoError("CONTENT_TYPE", "Send application/json.", 415);
}
export async function boundedJson(request: Request, limit = 24000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new DemoError("BODY_TOO_LARGE", "Request exceeds 24,000 bytes.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DemoError("BODY", "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new DemoError("BODY_TOO_LARGE", "Request exceeds 24,000 bytes.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new DemoError("JSON", "Request is not valid UTF-8 JSON.");
  }
}
const globalState = globalThis as typeof globalThis & {
  __jevDemoLimits?: { active: number; timestamps: number[] };
};
export function acquireSlot() {
  const state = (globalState.__jevDemoLimits ??= { active: 0, timestamps: [] });
  const now = Date.now();
  state.timestamps = state.timestamps.filter((t) => now - t < 60000);
  if (state.active >= 2)
    throw new DemoError(
      "BUSY",
      "Two provider calls are already active on this server. Cancel or wait before starting another.",
      429,
    );
  if (state.timestamps.length >= 30)
    throw new DemoError(
      "RATE_LIMIT",
      "Demo limit: 30 provider attempts per rolling minute. Wait before another run.",
      429,
    );
  state.active++;
  state.timestamps.push(now);
  let released = false;
  return () => {
    if (!released) {
      state.active--;
      released = true;
    }
  };
}
export function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof DemoError) return { code: error.code, message: String(redact(error.message)) };
  if (error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError"))
    return {
      code: "CANCELLED",
      message: "Provider request cancelled. Work already accepted by the provider may still be billed.",
    };
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "APITimeoutError"))
    return {
      code: "TIMEOUT",
      message: "Provider exceeded the 60-second limit. No retry or fixture fallback was made.",
    };
  return {
    code: "PROVIDER_CONNECTION",
    message:
      "Provider connection or credential-chain failure. Check server-side configuration, Azure login/permissions and network access. No retry or fixture fallback was made.",
  };
}
