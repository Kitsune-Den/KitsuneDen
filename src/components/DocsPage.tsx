"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DOC_OPTIONS = [
  { key: "readme", label: "README" },
  { key: "manual/00-preface", label: "00 Preface" },
  { key: "manual/01-spirit-hall", label: "01 Spirit Hall" },
  { key: "manual/02-architecture", label: "02 Architecture" },
  { key: "manual/03-spirits", label: "03 Spirits" },
  { key: "manual/04-operations", label: "04 Operations" },
  { key: "manual/05-troubleshooting", label: "05 Troubleshooting" },
  { key: "manual/06-lantern-hall", label: "06 Lantern Hall" },
  { key: "manual/07-appendices", label: "07 Appendices" },
];

interface DocsPageProps {
  docKey: string;
  onSelect: (key: string) => void;
}

export default function DocsPage({ docKey, onSelect }: DocsPageProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/docs?file=${encodeURIComponent(docKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.content) {
          setContent(data.content);
        } else {
          setContent("");
          setError(data.error || "Failed to load doc.");
        }
      })
      .catch(() => {
        setContent("");
        setError("Failed to load doc.");
      })
      .finally(() => setLoading(false));
  }, [docKey]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border">
          <h3 className="text-sm font-bold">Documentation</h3>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {DOC_OPTIONS.map((doc) => (
            <button
              key={doc.key}
              onClick={() => onSelect(doc.key)}
              className={`text-left px-3 py-2 rounded-md text-[12px] font-semibold transition-colors ${
                docKey === doc.key
                  ? "bg-den-elevated text-den-text"
                  : "text-den-text-muted hover:bg-den-surface"
              }`}
            >
              {doc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border">
          <h3 className="text-sm font-bold">Doc Viewer</h3>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto text-[13px] leading-7 text-den-text">
          {loading && <div className="text-den-text-dim">Loading...</div>}
          {error && <div className="text-den-red">{error}</div>}
          {!loading && !error && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mt-2 mb-3">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold mt-4 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-3 text-den-text">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ml-5 mb-3">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-5 mb-3">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                code: ({ children, className }) =>
                  className ? (
                    <code className="block whitespace-pre-wrap p-3 rounded bg-den-bg text-[12px] text-den-text">
                      {children}
                    </code>
                  ) : (
                    <code className="px-1 py-0.5 rounded bg-den-bg text-den-amber text-[12px]">
                      {children}
                    </code>
                  ),
                pre: ({ children }) => <pre className="mb-3">{children}</pre>,
                a: ({ children, href }) => (
                  <a href={href} className="text-den-cyan hover:underline" target="_blank">
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <table className="w-full text-[12px] border-collapse mb-4">{children}</table>
                ),
                th: ({ children }) => (
                  <th className="border border-den-border px-2 py-1 text-left bg-den-surface">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-den-border px-2 py-1">{children}</td>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
