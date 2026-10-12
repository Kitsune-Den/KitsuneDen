"use client";

import { ReactNode } from "react";

interface PageProps {
  title: ReactNode;
  /** Muted line under the title */
  subtitle?: ReactNode;
  /** Right-hand side of the top bar */
  actions?: ReactNode;
  /** Rendered flush under the top bar, before the padded content (e.g. tabs) */
  below?: ReactNode;
  children: ReactNode;
}

/** A page: sticky 60px top bar with title + actions, then the scrolling content. */
export default function Page({ title, subtitle, actions, below, children }: PageProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-den-bg/85 backdrop-blur-md">
        <div className="min-h-[60px] flex items-center justify-between gap-4 px-7 max-[760px]:px-4 py-2.5 border-b border-den-border flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold leading-tight flex items-center gap-2.5 min-w-0">{title}</h1>
            {subtitle && <p className="text-[12.5px] text-den-text-dim mt-0.5 truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
        {below && <div className="px-7 max-[760px]:px-4">{below}</div>}
      </header>
      <main className="flex-1 px-7 max-[760px]:px-4 py-6 animate-[pageIn_0.18s_ease-out]">
        <div className="max-w-[1500px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
