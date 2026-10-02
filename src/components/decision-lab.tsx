"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runSelected, streamRun } from "@/lib/client-run";
import { fixtureResult } from "@/lib/fixtures";
import { azurePayload, jevPayload } from "@/lib/payloads";
import { emailExamples, scenarios } from "@/lib/scenarios";
import { parseInput, questionsSchema } from "@/lib/validation";
import { type Answers, type ConfigStatus, type Input, type ObservedResult, type Provider, type State } from "@/lib/types";
import JsonCode from "./json-code";
import JsonEditor from "./json-editor";
import ConceptDiagram from "./concept-diagram";
import ScenarioPreview from "./scenario-preview";

type Key = "azure" | "jev";
type Lane = {
  id: number; provider: Provider; source: "fixture" | "live"; running: boolean;
  serverComplete: number | null; ttft: number | null; text: string; request: unknown;
  result: ObservedResult | null; error: string; inputKey: string;
};
const initial = scenarios[0];
const print = (value: unknown) => JSON.stringify(value, null, 2);
const ms = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(0)} ms`;
const blank = (provider: Provider): Lane => ({
  id: 0, provider, source: "live", running: false, serverComplete: null,
  ttft: null, text: "", request: null, result: null, error: "", inputKey: "",
});
const initialInput: Input = { state: initial.state, questions: { [initial.firstQuestion]: initial.questions[initial.firstQuestion] } };
function example(id: string, input: Input, provider: Provider, deployment = ""): Lane {
  const fixture = fixtureResult(id, input, provider, deployment);
  return { ...blank(provider), source: "fixture", request: fixture.request, text: fixture.text || "",
    inputKey: JSON.stringify(input), result: { ...fixture, browserCompleteMs: null, browserUsableMs: null } };
}

function Bars({ answers, azure }: { answers: Answers; azure: boolean }) {
  return <div className="answers">{Object.entries(answers).map(([id, answer]) => {
    const values = answer.type === "noul" ? { Yes: answer.noul, No: 1 - answer.noul } : answer.probabilities;
    const outcome = answer.type === "choice" ? answer.choice
      : answer.type === "noul" ? `${answer.noul >= .5 ? "Yes" : "No"} leaning`
      : `${answer.score.toFixed(2)} / ${Object.keys(answer.legend).length - 1}`;
    return <section className="answer" key={id}>
      <div className="answer-top"><span className="primitive">{answer.type}</span><span>{id.replaceAll("_", " ")}</span></div>
      <div className="outcome">{outcome}</div>
      <div className="probability-list">{Object.entries(values).map(([key, p]) => <div className="probability" key={key}>
        <div><span>{answer.type === "score" ? `${key} · ${answer.legend[key]}` : key}</span><b>{(p * 100).toFixed(1)}%</b></div>
        <div className="bar-track"><div className={`bar-fill ${azure ? "azure-fill" : ""}`} style={{ width: `${p * 100}%` }} /></div>
      </div>)}</div>
      {answer.type !== "noul" && <div className="answer-foot"><span>{azure ? "Stated confidence" : "Confidence"}</span><b>{answer.confidence.toFixed(3)}</b></div>}
    </section>;
  })}</div>;
}

function responseOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  if ("output" in raw) return raw.output;
  if ("response" in raw && raw.response && typeof raw.response === "object" && "output" in raw.response)
    return raw.response.output;
  return undefined;
}

function responseOutputText(raw: unknown): string | undefined {
  const output = responseOutput(raw);
  if (!Array.isArray(output)) return undefined;
  const texts = output.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) return [];
    return item.content.flatMap((content: unknown) =>
      content && typeof content === "object" && "text" in content && typeof content.text === "string"
        ? [content.text] : []);
  });
  return texts.length ? texts.join("\n") : undefined;
}

function prettyJsonText(text: string): string {
  try {
    return print(JSON.parse(text));
  } catch (error) {
    // Keep partial streamed JSON visible until it can be parsed.
    if (error instanceof SyntaxError) return text;
    throw error;
  }
}

function PrettyRequest({ request }: { request: unknown }) {
  if (!request || typeof request !== "object") return <pre className="pretty-text">—</pre>;
  const instructions = "instructions" in request && typeof request.instructions === "string" ? request.instructions : "";
  const input = "input" in request && typeof request.input === "string" ? JSON.parse(request.input) : null;
  return <div className="pretty-request">
    <h4>Instructions</h4><p>{instructions}</p>
    <h4>Input</h4><JsonCode value={input} />
  </div>;
}

function InputPayload({ request, title, azure = false, mode, setMode, modeDisabled }: {
  request: unknown; title: string; azure?: boolean;
  mode?: Provider; setMode?: (mode: Provider) => void; modeDisabled?: boolean;
}) {
  const [view, setView] = useState<"pretty" | "json">("pretty");
  return <article className="provider-card" aria-label={`${title} input`}>
    <div className="provider-top"><h3>{title}</h3>
      {azure && <div className="provider-actions">
        <select aria-label="GPT output" disabled={modeDisabled} value={mode} onChange={event => setMode?.(event.target.value as Provider)}>
          <option value="azure-text">text</option><option value="azure-json">structured outputs</option>
        </select>
      </div>}
    </div>
    <section className="payload-section">
      <div className="payload-heading"><h3>Input payload</h3>
        {azure && <div className="mode-tabs" aria-label="GPT input view">
          <button aria-pressed={view === "pretty"} className={view === "pretty" ? "selected" : ""} onClick={() => setView("pretty")}>Pretty</button>
          <button aria-pressed={view === "json"} className={view === "json" ? "selected" : ""} onClick={() => setView("json")}>JSON</button>
        </div>}
      </div>
      <div className="input-content">{azure && view === "pretty" ? <PrettyRequest request={request} /> : <JsonCode value={request} />}</div>
    </section>
  </article>;
}

function Output({ lane, cancel, inputKey, model }: {
  lane: Lane; cancel: () => void; inputKey: string; model: string;
}) {
  const azure = lane.provider !== "jev";
  const result = lane.result;
  const pricing = result?.tokenPricing;
  const price = (value: number | null) => value === null ? "Unknown" : `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 20, useGrouping: false,
  })}`;
  const [view, setView] = useState<"pretty" | "output" | "json">("pretty");
  const json = result?.raw;
  return <article className="provider-card" aria-label={azure ? "GPT results" : "Jev results"} aria-busy={lane.running}>
    <div className="provider-top"><div className="provider-title">
      <h3>{azure ? `${model} (no reasoning)` : "Jev"}</h3>
      </div>
    </div>
    {lane.error && <div className="error-box" role="alert">{lane.error}</div>}
    <section className="payload-section">
      <div className="payload-heading"><h3>{lane.source === "fixture" ? "Example response" : "Response payload"}{result && lane.inputKey !== inputKey ? " (previous input)" : ""}</h3>
        <div className="mode-tabs" aria-label={azure ? "GPT response view" : "Jev response view"}>
          <button aria-pressed={view === "pretty"} className={view === "pretty" ? "selected" : ""} onClick={() => setView("pretty")}>Pretty output</button>
          {azure && <button aria-pressed={view === "output"} className={view === "output" ? "selected" : ""} onClick={() => setView("output")}>Output JSON</button>}
          <button aria-pressed={view === "json"} className={view === "json" ? "selected" : ""} onClick={() => setView("json")}>{azure ? "Full JSON" : "JSON"}</button>
        </div>
        {lane.running && <button className="cancel-button" onClick={cancel}>Cancel</button>}
      </div>
      <div className="response-content">
        {lane.running && <div className="waiting-indicator" role="status" aria-label="Waiting for response">
          <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
        </div>}
        {view !== "pretty" ? <JsonCode value={json} text={view === "output" ? prettyJsonText(responseOutputText(json) ?? (lane.text || "—")) : json == null ? lane.text || "—" : undefined} />
          : result?.opportunityMatch ? <div className="answers"><section className="answer">
            <div className="outcome">{result.opportunityMatch.opportunityName ?? "No suitable match"}</div>
            <div className="answer-foot"><span>Opportunity ID</span><b>{result.opportunityMatch.opportunityId ?? "null"}</b></div>
            <div className="answer-foot"><span>Stated confidence</span><b>{result.opportunityMatch.confidence}</b></div>
          </section></div>
          : result?.answers ? <Bars answers={result.answers} azure={azure} />
          : azure && lane.text ? <JsonCode text={lane.text} />
          : <pre className="pretty-text">{lane.text || (lane.running ? "…" : "—")}</pre>}
      </div>
    </section>
    <div className="timing-block timing-grid">
      <div><div className="time-label">Server complete</div><div className="headline-time">{ms(lane.serverComplete ?? result?.timing?.providerCompleteMs)}</div></div>
      {azure && <div><div className="time-label">First token</div><div className="headline-time">{ms(lane.ttft)}</div></div>}
    </div>
    {result?.usage && <section className="timing-block timing-grid" aria-label="Cost and token usage">
      <div title={`Estimated USD for 1000 runs with the same token usage. ${result.costNote || ""}`}>
        <div className="time-label">Cost</div>
        <div className="headline-time">{result.estimatedUsd == null ? "Unknown" : `$${(result.estimatedUsd * 1000).toFixed(3)} / 1000`}</div>
        {pricing && <div className="token-pricing">
          <div>Input {price(pricing.inputUsdPerMillion)} / Output {price(pricing.outputUsdPerMillion)}
            {pricing.cachedInputUsdPerMillion !== undefined && <> / Cached {price(pricing.cachedInputUsdPerMillion)}</>}
          </div>
          <div>USD per 1M tokens</div>
        </div>}
      </div>
      <div><div className="time-label">Input / Output tokens</div>
        <div className="headline-time">{result.usage.input_tokens} / {result.usage.output_tokens}</div>
      </div>
    </section>}
  </article>;
}

function QuestionTypes() {
  return <details className="type-guide"><summary>Question &amp; output types</summary>
    <div className="type-guide-grid">
      <section><h4>Noul <span>Yes / no</span></h4>
        <p>Ask a yes/no question. Get the probability of yes, from 0 to 1. No separate confidence field.</p>
        <JsonCode value={{ type: "noul", noul: 0.85 }} />
      </section>
      <section><h4>Choice <span>One option</span></h4>
        <p>Define named options. Get one selected option, a probability for every option, and confidence. Not multi-select.</p>
        <JsonCode value={{ type: "choice", choice: "snag", probabilities: { sandwich: 0.1, snag: 0.9 }, confidence: 0.88 }} />
      </section>
      <section><h4>Score <span>Ordered rubric</span></h4>
        <p>Define levels from lowest to highest. Get probabilities, confidence, and their weighted average index, starting at 0. The score can fall between levels.</p>
        <JsonCode value={{ type: "score", score: 0.75, legend: { "0": "Neat", "1": "Messy" },
          probabilities: { "0": 0.25, "1": 0.75 }, confidence: 0.8 }} />
      </section>
    </div>
    <p className="type-guide-note">These are example shapes. GPT uses the same fields, with model-reported probabilities and confidence.</p>
  </details>;
}

function EmailFields({ state, update, disabled }: { state: State; update: (state: State) => void; disabled: boolean }) {
  if (!state || typeof state !== "object" || Array.isArray(state) || !state.email ||
      typeof state.email !== "object" || Array.isArray(state.email)) return <p role="alert">Invalid email fields.</p>;
  const email = state.email as Record<string, unknown>;
  return <div className="email-editor">
    {["from", "to", "subject", "body"].map(field => <label key={field}>{field}
      {field === "body"
        ? <textarea disabled={disabled} value={String(email[field] ?? "")} onChange={e => update({ ...state, email: { ...email, [field]: e.target.value } })} />
        : <input disabled={disabled} value={String(email[field] ?? "")} onChange={e => update({ ...state, email: { ...email, [field]: e.target.value } })} />}
    </label>)}
    <label>Recipient context<textarea disabled={disabled}
      value={typeof state.recipient_context === "string" ? state.recipient_context : print(state.recipient_context)}
      onChange={e => update({ ...state, recipient_context: e.target.value })} /></label>
  </div>;
}

export default function DecisionLab() {
  const [scenarioId, setScenarioId] = useState(initial.id);
  const [emailExample, setEmailExample] = useState("");
  const [stateText, setStateText] = useState(print(initial.state));
  const [questionsText, setQuestionsText] = useState(print(initialInput.questions));
  const [allQuestionsText, setAllQuestionsText] = useState(print(initial.questions));
  const [single, setSingle] = useState(true);
  const [singleId, setSingleId] = useState(initial.firstQuestion);
  const [azureMode, setAzureMode] = useState<Provider>("azure-text");
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [lanes, setLanes] = useState(() => ({ azure: example(initial.id, initialInput, "azure-text"), jev: example(initial.id, initialInput, "jev") }));
  const sequence = useRef(0);
  const controllers = useRef<Partial<Record<Key, { id: number; controller: AbortController }>>>({});
  const locked = lanes.azure.running || lanes.jev.running;
  const parsed = useMemo(() => {
    try { return { input: parseInput(stateText, questionsText, single ? singleId : undefined), error: "" }; }
    catch (error) { return { input: null, error: error instanceof Error ? error.message : "Invalid input." }; }
  }, [stateText, questionsText, single, singleId]);
  const questionKeys = useMemo(() => {
    try { const q: unknown = JSON.parse(allQuestionsText); return q && typeof q === "object" && !Array.isArray(q) ? Object.keys(q) : []; }
    catch { return []; }
  }, [allQuestionsText]);
  const inputKey = parsed.input ? JSON.stringify(parsed.input) : "";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error("Configuration unavailable.");
      return r.json();
    }).then(setConfig).catch(error => { if (!controller.signal.aborted) setNotice(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => {
    Object.values(controllers.current).forEach(run => run?.controller.abort());
  }, []);

  function preview(input: Input, id = scenarioId, mode = azureMode) {
    try {
      setLanes({ azure: example(id, input, mode, config?.azure.deployment), jev: example(id, input, "jev") });
      setNotice("");
    } catch (error) {
      setLanes({ azure: blank(mode), jev: blank("jev") });
      setNotice(error instanceof Error ? error.message : "No example response for this input.");
    }
  }
  function selectScenario(id: string, state?: State) {
    const scenario = scenarios.find(s => s.id === id)!;
    setScenarioId(id); setStateText(print(state ?? scenario.state));
    const exampleIndex = id === "email"
      ? emailExamples.findIndex(example => JSON.stringify(example.state) === JSON.stringify(state ?? scenario.state))
      : -1;
    setEmailExample(exampleIndex < 0 ? "" : String(exampleIndex));
    const questions = single ? { [scenario.firstQuestion]: scenario.questions[scenario.firstQuestion] } : scenario.questions;
    setAllQuestionsText(print(scenario.questions)); setQuestionsText(print(questions)); setSingleId(scenario.firstQuestion);
    preview({ state: state ?? scenario.state, questions }, id);
  }
  function selectQuestions(onlyOne: boolean, id = singleId) {
    try {
      const current = questionsSchema.parse(JSON.parse(questionsText));
      const questions = single ? { ...questionsSchema.parse(JSON.parse(allQuestionsText)), ...current } : current;
      const selectedId = questions[id] ? id : Object.keys(questions)[0];
      const text = print(onlyOne ? { [selectedId]: questions[selectedId] } : questions);
      setAllQuestionsText(print(questions)); setQuestionsText(text);
      setSingle(onlyOne); setSingleId(selectedId);
      preview(parseInput(stateText, text, onlyOne ? selectedId : undefined));
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Invalid input."); }
  }
  function patch(key: Key, id: number, update: Partial<Lane> | ((lane: Lane) => Partial<Lane>)) {
    setLanes(previous => previous[key].id !== id ? previous : {
      ...previous, [key]: { ...previous[key], ...(typeof update === "function" ? update(previous[key]) : update) },
    });
  }
  function cancel(key: Key) { controllers.current[key]?.controller.abort(); }
  async function runLane(provider: Provider, input: Input): Promise<ObservedResult> {
    const key = provider === "jev" ? "jev" : "azure";
    if (controllers.current[key]) throw new Error("Provider already running.");
    const id = ++sequence.current;
    const controller = new AbortController();
    controllers.current[key] = { id, controller };
    setLanes(previous => ({ ...previous, [key]: {
      ...blank(provider), id, source: "live", running: true, inputKey: JSON.stringify(input),
    } }));
    try {
      const result = await streamRun({ ...input, provider }, controller.signal, event => {
        if (controllers.current[key]?.id !== id || controller.signal.aborted) return;
        if (event.type === "request") patch(key, id, { request: event.request });
        if (event.type === "delta") patch(key, id, lane => ({ text: lane.text + event.text, ttft: event.providerFirstTextMs }));
        if (event.type === "complete") patch(key, id, { serverComplete: event.timing.providerCompleteMs });
      });
      if (!controller.signal.aborted) patch(key, id, {
        running: false, result, text: result.text || "", request: result.request,
        serverComplete: result.timing?.providerCompleteMs ?? null, ttft: result.timing?.providerFirstTextMs ?? null,
        error: result.error?.message || "",
      });
      return result;
    } catch (error) {
      const message = controller.signal.aborted ? "Cancelled." : error instanceof Error ? error.message : "Run failed.";
      const result: ObservedResult = { provider, source: "live", ok: false, request: null, raw: null, timing: null,
        browserCompleteMs: null, browserUsableMs: null, error: { code: controller.signal.aborted ? "CANCELLED" : "CLIENT_ERROR", message } };
      patch(key, id, { running: false, error: message, result });
      return result;
    } finally { if (controllers.current[key]?.id === id) delete controllers.current[key]; }
  }
  async function run(providers: Provider[]) {
    if (!parsed.input) { setNotice(parsed.error); return; }
    setNotice("");
    try { await runSelected(providers, provider => runLane(provider, parsed.input!)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to start."); }
  }
  const editor = <JsonEditor id="state-editor" label="State JSON" value={stateText}
    disabled={locked} onChange={setStateText} />;
  const azureRequest = parsed.input ? azurePayload(parsed.input, config?.azure.deployment || "YOUR-DEPLOYMENT", azureMode === "azure-json") : null;
  const jevRequest = parsed.input ? jevPayload(parsed.input, config?.jev.model || "jev-1.13.0") : null;
  const model = (config?.azure.model || "GPT").replace(/^gpt-/i, "GPT-").replace(/-luna$/, " Luna");
  const scenario = scenarios.find(item => item.id === scenarioId)!;
  const scenarioState = scenarioId === "email" && emailExample !== "" ? emailExamples[Number(emailExample)].state : scenario.state;
  const shownAzureRequest = lanes.azure.source === "live" && lanes.azure.inputKey === inputKey && lanes.azure.request ? lanes.azure.request : azureRequest;
  const shownJevRequest = lanes.jev.source === "live" && lanes.jev.inputKey === inputKey && lanes.jev.request ? lanes.jev.request : jevRequest;
  return <main>
    <header className="site-header"><h1>Understanding Jev</h1></header>
    {notice && <div className="notice" role="alert">{notice}</div>}
    <div className="page-sections">
      <section className="page-section" aria-labelledby="about-title">
        <header className="section-heading"><h2 id="about-title">What is Jev?</h2></header>
        <ConceptDiagram />
      </section>
      <section className="page-section" aria-labelledby="scenario-title">
        <header className="section-heading">
          <div className="scenario-heading">
          <h2 id="scenario-title">Scenario</h2>
          <div className="control-bar">
            <select aria-label="Scenario" disabled={locked} value={scenarioId} onChange={e => selectScenario(e.target.value)}>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            {scenarioId === "email" && <select aria-label="Email example" disabled={locked} value={emailExample} onChange={event => {
              selectScenario("email", emailExamples[Number(event.target.value)].state);
            }}><option value="" disabled>Example email</option>{emailExamples.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select>}
          </div>
          </div>
          <button disabled={locked} onClick={() => selectScenario(scenarioId)}>Reset</button>
        </header>
        <ScenarioPreview state={parsed.input?.state ?? scenarioState} questions={parsed.input?.questions ?? scenario.questions}
          questionsControls={single && <select aria-label="Question" disabled={locked} value={singleId} onChange={event => selectQuestions(true, event.target.value)}>
            {questionKeys.map(id => <option key={id}>{id}</option>)}
          </select>}
          stateEditor={<details className="question-editor scenario-editor"><summary>State (Context) JSON</summary>
            {scenarioId === "email" && parsed.input && <EmailFields state={parsed.input.state} update={state => setStateText(print(state))} disabled={locked} />}
            {editor}
          </details>}
          questionsEditor={<>
            <details className="question-editor scenario-editor"><summary>Questions JSON</summary>
              <div className="question-selection"><div className="mode-tabs">
                <button disabled={locked} aria-pressed={single} className={single ? "selected" : ""} onClick={() => selectQuestions(true)}>Single</button>
                <button disabled={locked} aria-pressed={!single} className={!single ? "selected" : ""} onClick={() => selectQuestions(false)}>All</button>
              </div>
                <div className="question-list">{Object.entries(parsed.input?.questions || {}).map(([id, question]) =>
                  <div key={id}><span className="primitive">{question.type}</span><span>{id.replaceAll("_", " ")}</span></div>)}</div>
              </div>
              <JsonEditor label="Questions JSON" value={questionsText} disabled={locked} onChange={text => {
                setQuestionsText(text);
                if (!single) setAllQuestionsText(text);
              }} />
            </details>
            <QuestionTypes />
          </>}
        />
        {parsed.error && <div className="error-box input-error" role="alert">{parsed.error}</div>}
      </section>
      <section className="page-section comparison" aria-labelledby="live-demo-title">
        <header className="section-heading"><h2 id="live-demo-title">Live demo</h2></header>
        <div className="provider-grid input-payloads">
          <InputPayload title={`${model} (no reasoning)`} request={shownAzureRequest} azure
            mode={azureMode} modeDisabled={locked} setMode={mode => {
              setAzureMode(mode);
              if (parsed.input) preview(parsed.input, scenarioId, mode);
            }} />
          <InputPayload title="Jev" request={shownJevRequest} />
        </div>
        <div className="run-actions">
          <button className="primary" disabled={lanes.azure.running || !parsed.input} onClick={() => void run([azureMode])}>Run GPT</button>
          <button className="primary" disabled={locked || !parsed.input} onClick={() => void run([azureMode, "jev"])}>Run both</button>
          <button className="primary" disabled={lanes.jev.running || !parsed.input} onClick={() => void run(["jev"])}>Run Jev</button>
        </div>
        <div className="provider-grid"><Output lane={lanes.azure} cancel={() => cancel("azure")} inputKey={inputKey}
          model={model} />
          <Output lane={lanes.jev} cancel={() => cancel("jev")} inputKey={inputKey}
            model={config?.jev.model || "jev-1.13.0"} /></div>
      </section>
    </div>
  </main>;
}
