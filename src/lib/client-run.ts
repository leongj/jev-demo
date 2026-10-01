import type { ObservedResult, Provider, RunEvent, RunInput } from "./types";

export async function streamRun(
  input: RunInput,
  signal: AbortSignal,
  onEvent: (event: RunEvent, elapsed: number) => void,
  fetcher: typeof fetch = fetch,
): Promise<ObservedResult> {
  const started = performance.now();
  let browserCompleteMs: number | null = null;
  const response = await fetcher("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error?.message || `Demo server returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("Streaming response body is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ObservedResult | undefined;
  let completed = false;
  function consume(line: string) {
    const event: RunEvent = JSON.parse(line);
    const elapsed = performance.now() - started;
    if (event.type === "complete") {
      if (completed) throw new Error("Duplicate completion event.");
      completed = true;
      browserCompleteMs = elapsed;
    }
    if (event.type === "result") {
      if (result) throw new Error("Duplicate result event.");
      if (event.result.provider !== input.provider || event.result.source !== "live")
        throw new Error("Server returned a mismatched provider or non-live result.");
      if (event.result.ok && !completed)
        throw new Error("Successful result arrived without a complete-response event.");
      result = { ...event.result, browserCompleteMs, browserUsableMs: elapsed };
    }
    onEvent(event, elapsed);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 2_000_000) throw new Error("Demo stream exceeded its size limit.");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) consume(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!result) throw new Error("Connection ended without a result. Partial text is not a completed answer.");
    return result;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
export function runSelected<T>(providers: Provider[], run: (provider: Provider) => Promise<T>): Promise<T[]> {
  if (providers.length < 1 || providers.length > 2 || new Set(providers).size !== providers.length)
    throw new Error("Choose one or two distinct provider lanes.");
  return Promise.all(providers.map((provider) => run(provider)));
}
