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

  const current = DOC_OPTIONS.find((d) => d.key === docKey);

  // Chapter links in the manual ("02-architecture.md", "./03-spirits.md#x") point
  // at files on disk. Inside the viewer, turn those into in-app navigation.
  const resolveDocLink = (href: string | undefined): string | null => {
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith("#")) return null;
    const file = href.split("#")[0].split("/").pop() || "";
    if (/^readme\.md$/i.test(file) && !href.includes("den-operators-manual")) return "readme";
    const key = `manual/${file.replace(/\.md$/i, "")}`;
    return DOC_OPTIONS.some((d) => d.key === key) ? key : null;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4 items-start">
      <nav className="den-card overflow-hidden xl:sticky xl:top-4" aria-label="Documents">
        <div className="den-card-header">
          <h3 className="den-card-title">Library</h3>
        </div>
        <div className="p-2 flex flex-row flex-wrap xl:flex-col gap-1">
          {DOC_OPTIONS.map((doc) => (
            <button
              key={doc.key}
              onClick={() => onSelect(doc.key)}
              aria-current={docKey === doc.key ? "page" : undefined}
              className={`text-left px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors ${
                docKey === doc.key
                  ? "bg-den-elevated text-den-text"
                  : "text-den-text-muted hover:bg-den-surface hover:text-den-text"
              }`}
            >
              {doc.label}
            </button>
          ))}
        </div>
      </nav>

      <article className="den-card overflow-hidden">
        <div className="den-card-header">
          <h3 className="den-card-title">{current?.label || "Document"}</h3>
        </div>
        <div key={docKey} className="px-6 py-5 max-h-[75vh] overflow-y-auto text-[14px] leading-7 text-den-text">
          <div className="max-w-[78ch]">
            {loading && <div className="text-den-text-dim">Loading…</div>}
            {error && <div className="text-den-red">{error}</div>}
            {!loading && !error && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold tracking-tight mt-2 mb-4">{children}</h1>,
                  h2: ({ children }) => (
                    <h2 className="text-lg font-semibold tracking-tight mt-8 mb-3 pb-2 border-b border-den-border">{children}</h2>
                  ),
                  h3: ({ children }) => <h3 className="text-base font-semibold mt-6 mb-2">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-sm font-semibold mt-4 mb-2 text-den-text-muted">{children}</h4>,
                  p: ({ children }) => <p className="mb-4 text-den-text/90">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc ml-5 mb-4 marker:text-den-text-dim">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal ml-5 mb-4 marker:text-den-text-dim">{children}</ol>,
                  li: ({ children }) => <li className="mb-1 pl-1">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-den-lantern/60 pl-4 my-4 text-den-text-muted italic">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-8 border-den-border" />,
                  // Inline code. Fenced blocks are styled by `pre`, which resets these.
                  code: ({ children }) => (
                    <code className="px-1.5 py-0.5 rounded bg-den-bg/80 border border-den-border/60 text-den-amber text-[12.5px] font-mono">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="mb-4 p-4 rounded-lg bg-den-bg/80 border border-den-border overflow-x-auto text-[12.5px] leading-6 font-mono [&_code]:p-0 [&_code]:bg-transparent [&_code]:border-0 [&_code]:text-den-text [&_code]:text-[12.5px]">
                      {children}
                    </pre>
                  ),
                  a: ({ children, href }) => {
                    const docLink = resolveDocLink(href);
                    if (docLink) {
                      return (
                        <button
                          onClick={() => onSelect(docLink)}
                          className="text-den-cyan hover:underline underline-offset-2"
                        >
                          {children}
                        </button>
                      );
                    }
                    const external = !!href && /^https?:/i.test(href);
                    return (
                      <a
                        href={href}
                        className="text-den-cyan hover:underline underline-offset-2"
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {children}
                      </a>
                    );
                  },
                  // Repo-relative screenshots in the README don't exist at a URL the app serves.
                  img: ({ src, alt }) =>
                    typeof src === "string" && /^https?:/i.test(src) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={alt || ""} className="inline-block align-middle max-w-full" />
                    ) : null,
                  table: ({ children }) => (
                    <div className="mb-4 overflow-x-auto rounded-lg border border-den-border">
                      <table className="w-full text-[12.5px] border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border-b border-den-border px-3 py-2 text-left bg-den-surface font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-den-border/60 px-3 py-2 align-top">{children}</td>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
