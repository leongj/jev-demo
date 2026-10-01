export type State = string | Record<string, unknown> | unknown[];
export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};
export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
};
export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;
export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Record<string, Answer>;
export type Provider = "azure-text" | "azure-json" | "jev";
export type Source = "fixture" | "live";
export type Input = { state: State; questions: Questions };
export type RunInput = Input & { provider: Provider };
export type Timing = {
  providerCompleteMs: number;
  providerFirstTextMs: number | null;
  serverUsableMs: number | null;
};
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
};
export type Result = {
  provider: Provider;
  source: Source;
  ok: boolean;
  request: unknown;
  raw: unknown;
  text?: string;
  answers?: Answers;
  timing: Timing | null;
  usage?: Usage;
  model?: string;
  estimatedUsd?: number | null;
  costNote?: string;
  error?: { code: string; message: string };
};
export type RunEvent =
  | { type: "request"; request: unknown }
  | { type: "delta"; text: string; providerFirstTextMs: number }
  | { type: "complete"; timing: Timing }
  | { type: "result"; result: Result };
export type ObservedResult = Result & {
  browserCompleteMs: number | null;
  browserUsableMs: number | null;
};
export type ConfigStatus = {
  azure: {
    ready: boolean;
    deployment: string;
    model: string;
    auth: string;
    reasoning: string;
    note: string;
  };
  jev: { ready: boolean; model: string; note: string };
};
export const PROVIDER_LABELS: Record<Provider, string> = {
  "azure-text": "GPT / text",
  "azure-json": "GPT / structured outputs",
  jev: "Jev / typed decisions",
};
