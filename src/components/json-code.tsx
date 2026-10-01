import type { ReactNode, Ref } from "react";

export default function JsonCode({ value, text, preRef, hidden }: {
  value?: unknown; text?: string; preRef?: Ref<HTMLPreElement>; hidden?: boolean;
}) {
  const code = text ?? JSON.stringify(value, null, 2) ?? "—";
  const tokens: ReactNode[] = [];
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g;
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) tokens.push(code.slice(cursor, index));
    const kind = match[1] ? match[2] ? "key" : "string" : match[3] ? "literal" : match[4] ? "number" : "punctuation";
    tokens.push(<span className={`json-${kind}`} key={index}>{match[0]}</span>);
    cursor = index + match[0].length;
  }
  if (cursor < code.length) tokens.push(code.slice(cursor));
  return <pre className="json-code" ref={preRef} aria-hidden={hidden}><code>{tokens}</code></pre>;
}
