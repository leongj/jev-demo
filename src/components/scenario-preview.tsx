import type { Questions, State } from "@/lib/types";
import type { ReactNode } from "react";

function HumanValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <ul>{value.map((item, index) => <li key={index}><HumanValue value={item} /></li>)}</ul>;
  if (value && typeof value === "object") return <dl>{Object.entries(value).map(([key, item]) =>
    <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd><HumanValue value={item} /></dd></div>)}</dl>;
  return <p>{value == null ? "—" : String(value)}</p>;
}

export default function ScenarioPreview({ state, questions, stateEditor, questionsEditor }: {
  state: State; questions: Questions; stateEditor?: ReactNode; questionsEditor?: ReactNode;
}) {
  const email = state && typeof state === "object" && !Array.isArray(state) && "email" in state;
  return <div className="scenario-overview">
    <div className="scenario-block">
    <section className={`scenario-preview${email ? " scenario-email" : ""}`}>
      <h3>State</h3><HumanValue value={state} />
    </section>
    {stateEditor}
    </div>
    <div className="scenario-block">
    <section className="scenario-preview scenario-questions">
      <h3>Questions</h3>
      <div className="scenario-question-list">{Object.entries(questions).map(([id, question]) =>
        <article className="scenario-question" key={id}>
          <p className="scenario-question-text">{question.instructions}</p>
          {question.type === "score"
            ? <ol start={0}>{question.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ol>
            : question.criteria && <HumanValue value={question.type === "noul"
              ? { Yes: question.criteria.true, No: question.criteria.false } : question.criteria} />}
        </article>)}</div>
    </section>
    {questionsEditor}
    </div>
  </div>;
}
