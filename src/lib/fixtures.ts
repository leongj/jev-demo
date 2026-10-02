import { azurePayload, jevPayload, opportunityCandidates } from "./payloads";
import { emailExamples, scenarios } from "./scenarios";
import type { Answers, Input, Provider, Question, Result } from "./types";

const fixtureValues: Record<string, Record<string, string | number | number[]>> = {
  snag: {
    food_category: "snag",
    is_restaurant: 0.01,
    messiness: [0.08, 0.27, 0.65],
  },
  fairy: {
    dessert: 0.96,
    contains_gluten: 0.99,
    party_fit: [0.01, 0.07, 0.92],
  },
  support: {
    department: "technical",
    urgent: 0.97,
    severity: [0.01, 0.08, 0.91],
  },
  sales: {
    opportunity: "FY27 - HDS - GitHub Copilot",
  },
};
function answer(q: Question, value: string | number | number[]) {
  if (q.type === "noul" && typeof value === "number") return { type: q.type, noul: value };
  if (q.type === "choice" && typeof value === "string") {
    const keys = Object.keys(q.criteria);
    return {
      type: q.type,
      choice: value,
      probabilities: Object.fromEntries(keys.map((key) => [key, key === value ? 0.91 : 0.09 / (keys.length - 1)])),
      confidence: 0.88,
    };
  }
  if (q.type === "score" && Array.isArray(value))
    return {
      type: q.type,
      score: value.reduce((total, p, i) => total + p * i, 0),
      legend: Object.fromEntries(q.criteria.map((label, i) => [String(i), label])),
      probabilities: Object.fromEntries(value.map((p, i) => [String(i), p])),
      confidence: 0.78,
    };
  throw new Error("No illustrative fixture exists for this question.");
}
export function fixtureResult(scenarioId: string, input: Input, provider: Provider, deployment: string): Result {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error("Unknown fixture scenario.");
  let values = fixtureValues[scenarioId];
  let validState = JSON.stringify(input.state) === JSON.stringify(scenario.state);
  if (scenarioId === "email") {
    const index = emailExamples.findIndex((example) => JSON.stringify(example.state) === JSON.stringify(input.state));
    validState = index >= 0;
    if (index >= 0)
      values = {
        category: emailExamples[index].name,
        urgent: index === 3 ? 0.95 : 0.05,
        effort: index <= 1 ? [0.95, 0.04, 0.01] : index === 2 ? [0.03, 0.93, 0.04] : [0.01, 0.07, 0.92],
      };
  }
  if (
    !validState ||
    Object.entries(input.questions).some(([id, q]) => JSON.stringify(q) !== JSON.stringify(scenario.questions[id]))
  ) {
    throw new Error(
      "Illustrative fixtures only cover the unedited presets. Reset this preset, or use live mode to evaluate your edits. No model was called.",
    );
  }
  const answers: Answers = Object.fromEntries(
    Object.entries(input.questions).map(([id, q]) => [id, answer(q, values[id])]),
  );
  const candidates = provider !== "jev" ? opportunityCandidates(input) : null;
  const selected = candidates?.find(candidate => candidate.name === values.opportunity);
  const opportunityMatch = candidates ? {
    opportunityId: selected?.id ?? null,
    opportunityName: selected?.name ?? null,
    confidence: "high" as const,
  } : undefined;
  const text = JSON.stringify(opportunityMatch
    ? { opportunityId: opportunityMatch.opportunityId, confidence: opportunityMatch.confidence }
    : { answers }, null, 2);
  return {
    provider,
    source: "fixture",
    ok: true,
    timing: null,
    request:
      provider === "jev"
        ? jevPayload(input, "jev-1.13.0")
        : azurePayload(input, deployment || "YOUR-DEPLOYMENT", provider === "azure-json"),
    raw:
      provider === "jev"
        ? { model: "ILLUSTRATIVE: not model output", answers }
        : {
            type: "response.completed",
            response: {
              id: "fixture-not-a-live-response",
              status: "completed",
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text,
                    },
                  ],
                },
              ],
            },
          },
    text: provider === "jev" ? undefined : text,
    answers: opportunityMatch ? undefined : answers,
    opportunityMatch,
    model: "Authored fixture",
  };
}
