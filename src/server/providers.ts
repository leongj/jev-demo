import "server-only";
import OpenAI from "openai";
import type { Response as AzureResponse } from "openai/resources/responses/responses";
import { DefaultAzureCredential } from "@azure/identity";
import { azurePayload, jevPayload } from "@/lib/payloads";
import { jevResponseSchema, validateAnswers } from "@/lib/validation";
import type { Result, RunEvent, RunInput, Timing, Usage } from "@/lib/types";
import { azureConfig } from "./config";
import { estimatedCost } from "./cost";
import { DemoError, publicError } from "./safety";

const credential = new DefaultAzureCredential();
type Emit = (event: RunEvent) => void;
function httpError(status: number): DemoError {
  const messages: Record<number, string> = {
    400: "Provider rejected the request/model parameters. Verify this deployment supports Responses, reasoning.effort:none and strict structured output. No parameter was silently removed.",
    401: "Provider authentication failed. Check the server key or Azure login.",
    403: "Provider access denied. Check Azure data-plane roles (Cognitive Services OpenAI User) or TypeSafe account permissions.",
    404: "Deployment, model or endpoint not found. Check server configuration.",
    422: "Provider rejected the state/question or schema format. Check the official API contract and request limits.",
    429: "Provider rate limit reached. No automatic retries are used, so benchmarks count the failure.",
    529: "TypeSafe is overloaded. No automatic retry or fixture fallback was made.",
  };
  return new DemoError(
    `HTTP_${status}`,
    messages[status] || `Provider returned HTTP ${status}. No retry or fallback was made.`,
    502,
  );
}
function responseText(response: AzureResponse) {
  const content = response.output.flatMap((item) => (item.type === "message" ? item.content : []));
  if (content.some((part) => part.type === "refusal"))
    throw new DemoError("REFUSAL", "GPT refused this request; no usable answer was returned.", 502);
  return content.flatMap((part) => (part.type === "output_text" ? [part.text] : [])).join("");
}
export async function executeProvider(input: RunInput, signal: AbortSignal, emit: Emit): Promise<Result> {
  let request: unknown = null;
  let raw: unknown = null;
  let timing: Timing | null = null;
  let usage: Usage | undefined;
  let model: string | undefined;
  let text = "";
  let started: number | null = null;
  try {
    if (input.provider === "jev") {
      const key = process.env.TYPESAFE_API_KEY?.trim();
      if (!key)
        throw new DemoError(
          "CONFIGURATION",
          "TYPESAFE_API_KEY is missing. Set it in the server environment. No Jev call was made.",
        );
      request = jevPayload(input, process.env.JEV_MODEL?.trim() || "jev-1.13.0");
      emit({ type: "request", request });
      signal.throwIfAborted();
      started = performance.now();
      const response = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal,
        cache: "no-store",
      });
      // Consume the whole HTTP body before recording a completion boundary.
      const body = await response.text();
      if (!response.ok) throw httpError(response.status);
      timing = {
        providerCompleteMs: performance.now() - started,
        providerFirstTextMs: null,
        serverUsableMs: null,
      };
      emit({ type: "complete", timing });
      try {
        raw = JSON.parse(body);
      } catch {
        throw new DemoError("INVALID_RESPONSE", "Jev returned a non-JSON body.", 502);
      }
      const parsed = jevResponseSchema.safeParse(raw);
      if (!parsed.success)
        throw new DemoError(
          "INVALID_RESPONSE",
          "Jev returned an invalid response envelope or answer type. Inspect the raw response.",
          502,
        );
      usage = {
        input_tokens: parsed.data.usage.input_tokens,
        output_tokens: parsed.data.usage.output_tokens,
      };
      model = parsed.data.model;
      let answers;
      try {
        answers = validateAnswers(parsed.data.answers, input.questions);
      } catch {
        throw new DemoError(
          "INVALID_CONTRACT",
          "Jev answer keys, probabilities, choices or score rubric failed validation. Inspect the raw response.",
          502,
        );
      }
      timing.serverUsableMs = performance.now() - started;
      return {
        provider: input.provider,
        source: "live",
        ok: true,
        request,
        raw,
        answers,
        timing,
        usage,
        model,
        ...estimatedCost(input.provider, usage, model),
      };
    }
    let config;
    try {
      config = azureConfig();
    } catch (error) {
      throw new DemoError("CONFIGURATION", error instanceof Error ? error.message : "Invalid Azure configuration.");
    }
    const token =
      config.auth === "key"
        ? process.env.AZURE_OPENAI_API_KEY!.trim()
        : (
            await credential.getToken("https://ai.azure.com/.default", {
              abortSignal: signal,
            })
          )?.token;
    if (!token)
      throw new DemoError(
        "AUTHENTICATION",
        "Azure credential chain returned no token. Run az login or configure a supported server credential.",
      );
    const client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: token,
      maxRetries: 0,
      timeout: 60000,
    });
    const payload = azurePayload(input, config.deployment, input.provider === "azure-json");
    request = payload;
    emit({ type: "request", request });
    signal.throwIfAborted();
    started = performance.now();
    const stream = await client.responses.create(payload, { signal });
    let terminal: AzureResponse | undefined;
    let firstText: number | null = null;
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        if (!event.delta) continue;
        firstText ??= performance.now() - started;
        text += event.delta;
        emit({
          type: "delta",
          text: event.delta,
          providerFirstTextMs: firstText,
        });
      } else if (event.type === "response.completed") {
        terminal = event.response;
        raw = terminal;
        timing = {
          providerCompleteMs: performance.now() - started,
          providerFirstTextMs: firstText,
          serverUsableMs: null,
        };
        emit({ type: "complete", timing });
        break;
      } else if (event.type === "response.failed" || event.type === "response.incomplete") {
        raw = event.response;
        throw new DemoError(
          event.type === "response.incomplete" ? "INCOMPLETE" : "FAILED",
          "The Responses API emitted a terminal failure/incomplete response. Partial text is not a complete usable answer.",
          502,
        );
      } else if (event.type === "error") {
        throw new DemoError(
          "STREAM_ERROR",
          "The Responses API emitted a streaming error; partial text is not a complete response.",
          502,
        );
      }
    }
    if (!terminal || !timing)
      throw new DemoError(
        "STREAM_TRUNCATED",
        "The Responses API stream ended without response.completed. No successful completion time is recorded.",
        502,
      );
    model = terminal.model;
    if (model !== config.model && !model.startsWith(`${config.model}-`))
      throw new DemoError(
        "MODEL_MISMATCH",
        "The returned model does not match AZURE_OPENAI_MODEL. Verify the exact underlying deployment model. No model substitution is accepted.",
        502,
      );
    if (terminal.usage)
      usage = {
        input_tokens: terminal.usage.input_tokens,
        output_tokens: terminal.usage.output_tokens,
        cached_input_tokens: terminal.usage.input_tokens_details?.cached_tokens,
        reasoning_tokens: terminal.usage.output_tokens_details?.reasoning_tokens,
      };
    if (terminal.reasoning?.effort !== "none")
      throw new DemoError(
        "REASONING_MISMATCH",
        "The GPT response did not confirm reasoning.effort:none. This run is not treated as the requested no-reasoning comparison.",
        502,
      );
    if (usage && (usage.reasoning_tokens ?? 0) !== 0)
      throw new DemoError(
        "REASONING_TOKENS",
        "GPT returned reasoning tokens despite the explicit none setting; inspect the raw response.",
        502,
      );
    text = responseText(terminal);
    if (!text) throw new DemoError("EMPTY_RESPONSE", "GPT completed without any answer text.", 502);
    let answers;
    try {
      const envelope: unknown = JSON.parse(text);
      if (!envelope || typeof envelope !== "object" || Object.keys(envelope).length !== 1 || !("answers" in envelope))
        throw new Error("Invalid envelope");
      answers = validateAnswers(envelope.answers, input.questions);
    } catch {
      throw new DemoError(
        "INVALID_CONTRACT",
        "GPT did not return the requested Jev answer format. Inspect raw JSON.",
        502,
      );
    }
    timing.serverUsableMs = performance.now() - started;
    return {
      provider: input.provider,
      source: "live",
      ok: true,
      request,
      raw,
      timing,
      text,
      answers,
      model,
      usage,
      ...(usage
        ? estimatedCost(input.provider, usage, model)
        : {
            estimatedUsd: null,
            costNote: "No usage returned; cost cannot be estimated.",
          }),
    };
  } catch (error) {
    let failure = publicError(error);
    if (error instanceof OpenAI.APIError && error.status) failure = publicError(httpError(error.status));
    if (signal.aborted) failure = publicError(signal.reason);
    return {
      provider: input.provider,
      source: "live",
      ok: false,
      request,
      raw,
      timing,
      text: text || undefined,
      usage,
      model,
      error: failure,
    };
  }
}
