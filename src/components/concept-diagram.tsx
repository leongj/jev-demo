"use client";

import { useEffect, useState } from "react";

type Mode = "noul" | "choice" | "score";
type TokenStep = { tokens: string[]; probabilities: number[]; selected: number };
type Example = {
  question: string; labels: string[]; probabilities: number[]; outcome: string; confidence?: number;
  prompt: string; steps: TokenStep[];
};
const step = (tokens: string[], probabilities: number[], selected = 0): TokenStep => ({ tokens, probabilities, selected });
const punctuation = step([",", ".", ";"], [0.68, 0.2, 0.12]);
const ending = step([".", "!", "…"], [0.9, 0.06, 0.04]);
const examples: Record<Mode, Example> = {
  noul: {
    question: "Vegetarian?", labels: ["Yes", "No"], probabilities: [0.02, 0.98], outcome: "P(yes) · 2%",
    prompt: "Is a sausage in folded bread vegetarian?",
    steps: [
      step(["No", "Yes", "Maybe"], [0.8, 0.15, 0.05]), punctuation,
      step([" it", " this", " that"], [0.72, 0.18, 0.1]),
      step([" contains", " includes", " has"], [0.64, 0.24, 0.12]),
      step([" meat", " sausage", " pork"], [0.75, 0.15, 0.1]), ending,
    ],
  },
  choice: {
    question: "Which food?", labels: ["Sandwich", "Taco", "Snag"], probabilities: [0.07, 0.02, 0.91], outcome: "Snag", confidence: 0.88,
    prompt: "Sausage in folded bread: sandwich, taco or snag?",
    steps: [
      step(["Snag", "Sandwich", "Taco"], [0.8, 0.15, 0.05]), punctuation,
      step([" a", " the", " an"], [0.7, 0.2, 0.1]),
      step([" sausage", " sandwich", " snack"], [0.82, 0.12, 0.06]),
      step([" in", " on", " with"], [0.65, 0.25, 0.1]),
      step([" bread", " a", " dough"], [0.85, 0.1, 0.05]), ending,
    ],
  },
  score: {
    question: "How messy?", labels: ["Neat", "Manageable", "Messy"], probabilities: [0.1, 0.25, 0.65], outcome: "1.55 / 2", confidence: 0.8,
    prompt: "How messy is a sausage in folded bread to eat?",
    steps: [
      step(["Messy", "Manageable", "Neat"], [0.65, 0.25, 0.1]), punctuation,
      step([" with", " because", " and"], [0.7, 0.2, 0.1]),
      step([" loose", " saucy", " exposed"], [0.55, 0.3, 0.15]),
      step([" filling", " onions", " sauce"], [0.63, 0.22, 0.15]), ending,
    ],
  },
};

function Arrow() {
  return <span className="concept-arrow" aria-hidden="true"><span /></span>;
}
function Probabilities({ labels, probabilities, selected }: { labels: string[]; probabilities: number[]; selected?: number }) {
  return <div className="concept-probabilities">{labels.map((label, index) => <div key={label} className={selected === index ? "concept-selected" : ""}>
    <div><span>{label.trim()}</span><b>{Math.round(probabilities[index] * 100)}%</b></div>
    <div className="concept-track"><span style={{ width: `${probabilities[index] * 100}%` }} /></div>
  </div>)}</div>;
}

function TokenPrediction({ example, paused, setPaused }: { example: Example; paused: boolean; setPaused: (paused: boolean) => void }) {
  const [frame, setFrame] = useState<{ index: number; phase: "predict" | "selected" | "complete" }>({ index: 0, phase: "predict" });
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setFrame(current => {
      if (current.phase === "predict") return { ...current, phase: "selected" };
      if (current.phase === "complete") return { index: 0, phase: "predict" };
      return current.index === example.steps.length - 1
        ? { ...current, phase: "complete" }
        : { index: current.index + 1, phase: "predict" };
    }), frame.phase === "predict" ? 600 : frame.phase === "selected" ? 300 : 800);
    return () => clearTimeout(timer);
  }, [frame, paused, example.steps.length]);
  const current = example.steps[frame.index];
  const count = frame.index + (frame.phase === "predict" ? 0 : 1);
  return <div className="concept-row">
    <div className="concept-row-heading"><h3>LLM</h3>
      <div className="concept-controls">
        <button onClick={() => setPaused(!paused)}>{paused ? "Play" : "Pause"}</button>
        <button onClick={() => { setFrame({ index: 0, phase: "predict" }); setPaused(false); }}>Replay</button>
      </div>
    </div>
    <div className="concept-flow">
      <div className="concept-node"><div className="concept-label">Prompt</div><p>{example.prompt}</p></div>
      <Arrow />
      <div className="concept-node concept-predict"><div className="concept-label">Next token probabilities</div>
        <Probabilities labels={current.tokens} probabilities={current.probabilities}
          selected={frame.phase === "predict" ? undefined : current.selected} />
      </div>
      <Arrow />
      <div className="concept-node concept-output"><div className="concept-label">Text / JSON</div>
        <div className="concept-tokens">{example.steps.slice(0, count).map((token, index) =>
          <span key={index} className={index === frame.index && frame.phase === "selected" ? "concept-token-current" : ""}>
            {token.tokens[token.selected]}
          </span>)}
          {frame.phase !== "complete" && <span className="concept-caret" aria-hidden="true" />}
        </div>
      </div>
    </div>
  </div>;
}

export default function ConceptDiagram() {
  const [mode, setMode] = useState<Mode>("choice");
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pauseIfReduced = () => { if (preference.matches) setPaused(true); };
    pauseIfReduced();
    preference.addEventListener("change", pauseIfReduced);
    return () => preference.removeEventListener("change", pauseIfReduced);
  }, []);
  const example = examples[mode];
  return <figure className={`concept-diagram${paused ? " concept-paused" : ""}`} aria-label="Illustrative LLM token prediction versus Jev typed-answer prediction">
    <TokenPrediction key={mode} example={example} paused={paused} setPaused={setPaused} />
    <div className="concept-row concept-jev">
      <div className="concept-row-heading"><h3>Jev</h3>
        <div className="mode-tabs" aria-label="Illustrated Jev question type">{(["noul", "choice", "score"] as const).map(type =>
          <button key={type} aria-pressed={mode === type} className={mode === type ? "selected" : ""} onClick={() => setMode(type)}>
            {type[0].toUpperCase() + type.slice(1)}
          </button>)}</div>
      </div>
      <div className="concept-flow concept-direct">
        <div className="concept-node"><div className="concept-label">State</div><p>Sausage in folded bread</p>
          <div className="concept-label">Question</div><p>{example.question}</p>
          <div className="concept-label">Possible answers</div>
          <div className="concept-answer-options">{example.labels.map((label, index) =>
            <span key={label}>{mode === "score" ? `${index} · ${label}` : label}</span>)}</div>
        </div>
        <Arrow />
        <div className="concept-node concept-output"><div className="concept-label">{mode} output</div>
          <strong>{example.outcome}</strong>
          <Probabilities labels={mode === "score" ? example.labels.map((label, index) => `${index} · ${label}`) : example.labels}
            probabilities={example.probabilities} />
          <div className="concept-confidence" title={mode === "noul" ? "Noul returns P(yes), without a separate confidence field." : undefined}>
            <span>Confidence</span><b>{example.confidence == null ? "—" : example.confidence.toFixed(2)}</b>
          </div>
        </div>
      </div>
    </div>
  </figure>;
}
