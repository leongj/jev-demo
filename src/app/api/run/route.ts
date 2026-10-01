import { runSchema } from "@/lib/validation";
import type { RunEvent, RunInput } from "@/lib/types";
import { executeProvider } from "@/server/providers";
import { acquireSlot, assertSameOrigin, boundedJson, DemoError, publicError, redact } from "@/server/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 65;

export async function POST(request: Request) {
  let input: RunInput;
  let release: () => void;
  try {
    assertSameOrigin(request);
    const parsed = runSchema.safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new DemoError(
        "VALIDATION",
        `Invalid input: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
          .slice(0, 1500)}`,
      );
    input = parsed.data;
    release = acquireSlot();
  } catch (error) {
    return Response.json(
      { error: publicError(error) },
      {
        status: error instanceof DemoError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const cancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, cancellation.signal, AbortSignal.timeout(60000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: RunEvent) => {
        if (closed || cancellation.signal.aborted || request.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(redact(event))}\n`));
      };
      try {
        const result = await executeProvider(input, signal, emit);
        emit({ type: "result", result });
      } finally {
        closed = true;
        release();
        if (!cancellation.signal.aborted) controller.close();
      }
    },
    cancel() {
      cancellation.abort(new DOMException("Client disconnected", "AbortError"));
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
