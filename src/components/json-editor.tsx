"use client";

import { useRef } from "react";
import JsonCode from "./json-code";

export default function JsonEditor({ id, label, value, onChange, disabled }: {
  id?: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const highlight = useRef<HTMLPreElement>(null);
  return <div className="json-editor-shell">
    <JsonCode text={`${value}\n`} preRef={highlight} hidden />
    <textarea id={id} aria-label={label} className="json-editor-input" spellCheck={false}
      value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
      onScroll={event => {
        if (highlight.current) {
          highlight.current.scrollTop = event.currentTarget.scrollTop;
          highlight.current.scrollLeft = event.currentTarget.scrollLeft;
        }
      }} />
  </div>;
}
