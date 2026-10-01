import { z } from "zod";
import type { Answers, Input, Questions } from "./types";

const id = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const description = z.string().min(1).max(1000);
const instructions = z.string().min(1).max(2000);
const question = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("noul"),
      instructions,
      criteria: z.object({ true: description, false: description }).strict().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("choice"),
      instructions,
      criteria: z
        .record(z.string().min(1).max(80), description.nullable())
        .refine(
          (v) => Object.keys(v).length >= 2 && Object.keys(v).length <= 8,
          "Choice needs 2-8 options in this demo.",
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal("score"),
      instructions,
      criteria: z.array(description).min(2).max(5),
    })
    .strict(),
]);
export const questionsSchema = z
  .record(id, question)
  .refine((v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 8, "Select 1-8 questions.");
const jsonState = z.union([z.string().min(1), z.record(z.string(), z.json()), z.array(z.json())]);
export const inputSchema = z
  .object({
    state: jsonState.refine(
      (v) => new TextEncoder().encode(JSON.stringify(v)).length <= 12000,
      "State must be at most 12,000 UTF-8 bytes.",
    ),
    questions: questionsSchema,
  })
  .strict();
export const runSchema = inputSchema
  .extend({
    provider: z.enum(["azure-text", "azure-json", "jev"]),
  })
  .strict();
const probability = z.number().min(0).max(1);
const answersSchema = z.record(
  z.string(),
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("noul"), noul: probability }).strict(),
    z
      .object({
        type: z.literal("choice"),
        choice: z.string(),
        probabilities: z.record(z.string(), probability),
        confidence: probability,
      })
      .strict(),
    z
      .object({
        type: z.literal("score"),
        score: z.number(),
        legend: z.record(z.string(), z.string()),
        probabilities: z.record(z.string(), probability),
        confidence: probability,
      })
      .strict(),
  ]),
);
export const usageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  })
  .passthrough();
export const jevResponseSchema = z
  .object({
    model: z.string().min(1),
    answers: answersSchema,
    usage: usageSchema,
  })
  .passthrough();

function sameKeys(actual: string[], expected: string[]) {
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}
export function validateAnswers(value: unknown, questions: Questions): Answers {
  const answers = answersSchema.parse(value);
  if (!sameKeys(Object.keys(answers), Object.keys(questions)))
    throw new Error("Response question IDs do not match the request.");
  for (const [id, q] of Object.entries(questions)) {
    const a = answers[id];
    if (a.type !== q.type) throw new Error(`Answer type mismatch for ${id}.`);
    if (a.type === "noul") continue;
    const expected =
      q.type === "choice" ? Object.keys(q.criteria) : q.type === "score" ? q.criteria.map((_, i) => String(i)) : [];
    if (!sameKeys(Object.keys(a.probabilities), expected))
      throw new Error(`Distribution keys do not match criteria for ${id}.`);
    const sum = Object.values(a.probabilities).reduce((total, p) => total + p, 0);
    if (Math.abs(sum - 1) > 0.015)
      throw new Error(`Distribution for ${id} does not sum to 1 (within rounding tolerance).`);
    if (a.type === "choice") {
      if (!expected.includes(a.choice)) throw new Error(`Unknown choice for ${id}.`);
      if (a.probabilities[a.choice] + 0.001 < Math.max(...Object.values(a.probabilities)))
        throw new Error(`Selected choice is not a highest-probability option for ${id}.`);
    }
    if (a.type === "score" && q.type === "score") {
      if (!sameKeys(Object.keys(a.legend), expected) || q.criteria.some((level, i) => a.legend[String(i)] !== level))
        throw new Error(`Score legend mismatch for ${id}.`);
      const mean = expected.reduce((total, key) => total + Number(key) * a.probabilities[key], 0);
      if (a.score < 0 || a.score > q.criteria.length - 1 || Math.abs(a.score - mean) > 0.03)
        throw new Error(`Score is not a probability-weighted level index for ${id}.`);
    }
  }
  return answers;
}
export function parseInput(stateText: string, questionsText: string, singleId?: string): Input {
  const state: unknown = JSON.parse(stateText);
  const all = questionsSchema.parse(JSON.parse(questionsText));
  if (singleId && !all[singleId]) throw new Error("Choose a question that exists in the edited question map.");
  return inputSchema.parse({
    state,
    questions: singleId ? { [singleId]: all[singleId] } : all,
  });
}
