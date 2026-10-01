import "server-only";
import type { ConfigStatus } from "@/lib/types";

export const VERIFIED_REASONING_MODELS = ["gpt-6-luna", "gpt-5.6-luna"] as const;
export function azureBaseURL(endpoint: string) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ![".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com"].some((suffix) =>
      url.hostname.endsWith(suffix),
    )
  ) {
    throw new Error(
      "Use an HTTPS Azure OpenAI/AI Services resource endpoint, without credentials, query parameters or fragments.",
    );
  }
  if (!["/", "", "/openai/v1", "/openai/v1/"].includes(url.pathname))
    throw new Error("Use the resource endpoint or /openai/v1/ URL, not a Foundry project URL.");
  return `${url.origin}/openai/v1/`;
}
export function azureConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  const model = process.env.AZURE_OPENAI_MODEL?.trim();
  const auth = process.env.AZURE_OPENAI_AUTH?.trim() || (process.env.AZURE_OPENAI_API_KEY ? "key" : "entra");
  if (!endpoint || !deployment || !model)
    throw new Error(
      "Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT and AZURE_OPENAI_MODEL in the server environment.",
    );
  if (!VERIFIED_REASONING_MODELS.some((known) => known === model))
    throw new Error(
      "This demo verifies reasoning:none only for gpt-6-luna and gpt-5.6-luna. Set the exact underlying Luna model; no model or reasoning fallback is performed.",
    );
  if (auth !== "entra" && auth !== "key") throw new Error("AZURE_OPENAI_AUTH must be entra or key.");
  if (auth === "key" && !process.env.AZURE_OPENAI_API_KEY?.trim())
    throw new Error("API-key auth is selected but AZURE_OPENAI_API_KEY is missing.");
  return { baseURL: azureBaseURL(endpoint), deployment, model, auth };
}
export function configStatus(): ConfigStatus {
  let azureNote = "Configured. Credentials and data-plane permissions are checked only when you initiate a live run.";
  let azureReady = true;
  try {
    azureConfig();
  } catch (error) {
    azureReady = false;
    azureNote = error instanceof Error ? error.message : "Invalid Azure configuration.";
  }
  return {
    azure: {
      ready: azureReady,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "Not configured",
      model: process.env.AZURE_OPENAI_MODEL || "Not configured",
      auth: process.env.AZURE_OPENAI_AUTH || (process.env.AZURE_OPENAI_API_KEY ? "key" : "entra"),
      reasoning: "none (explicit, no fallback)",
      note: azureNote,
    },
    jev: {
      ready: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
      model: process.env.JEV_MODEL?.trim() || "jev-1.13.0",
      note: process.env.TYPESAFE_API_KEY?.trim()
        ? "Key present; validity checked on user-initiated runs."
        : "Set TYPESAFE_API_KEY in the server environment. Do not paste keys into chat.",
    },
  };
}
