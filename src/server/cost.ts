import "server-only";
import type { Provider, Usage } from "@/lib/types";
import { DemoError } from "./safety";

// Azure Retail Prices API: UK South, Global Standard, short context; checked 2026-10-01.
const GPT6_LUNA_USD_PER_MILLION = { input: 0.10, cachedInput: 0.01, output: 0.50 };

function rate(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new DemoError("PRICE_CONFIGURATION", `${name} must be a non-negative USD price per million tokens.`);
  return parsed;
}
export function estimatedCost(provider: Provider, usage: Usage, model?: string) {
  if (provider === "jev") {
    const input = rate("JEV_INPUT_USD_PER_MILLION") ?? 0.042;
    return {
      estimatedUsd: (usage.input_tokens * input) / 1e6,
      costNote: `Jev input assumption: USD ${input}/million; output free. Published Jev 1.13 price checked 2026-10-01; verify your account terms. Returned usage only.`,
    };
  }
  const defaults = model === "gpt-6-luna" || model?.startsWith("gpt-6-luna-") ? GPT6_LUNA_USD_PER_MILLION : null;
  const input = rate("AZURE_INPUT_USD_PER_MILLION") ?? defaults?.input ?? null;
  const output = rate("AZURE_OUTPUT_USD_PER_MILLION") ?? defaults?.output ?? null;
  const cached = rate("AZURE_CACHED_INPUT_USD_PER_MILLION") ?? defaults?.cachedInput ?? null;
  const cachedTokens = usage.cached_input_tokens ?? 0;
  if (input === null || output === null || (cachedTokens > 0 && cached === null))
    return {
      estimatedUsd: null,
      costNote:
        "Azure price unknown. Configure input/output (and cached-input when used) USD/million rates for this deployment. Reasoning is included in output usage.",
    };
  return {
    estimatedUsd:
      ((usage.input_tokens - cachedTokens) * input + cachedTokens * (cached ?? 0) + usage.output_tokens * output) / 1e6,
    costNote: `Returned usage at USD ${input} input / ${cached ?? "unknown"} cached input / ${output} output per million. GPT-6 Luna defaults: Azure Global Standard, short context, checked 2026-10-01; environment overrides take precedence. Excludes unreported cache-write surcharges, taxes and discounts.`,
  };
}
