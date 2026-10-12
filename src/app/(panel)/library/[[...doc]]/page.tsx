"use client";

import { useParams, useRouter } from "next/navigation";
import Page from "@/components/shell/Page";
import DocsPage from "@/components/DocsPage";

export default function LibraryPage() {
  const params = useParams<{ doc?: string[] }>();
  const router = useRouter();
  const docKey = params.doc?.length ? params.doc.map(decodeURIComponent).join("/") : "readme";

  return (
    <Page title="Library" subtitle="The README and the Den Operator's Manual">
      <DocsPage docKey={docKey} onSelect={(key) => router.push(key === "readme" ? "/library" : `/library/${key}`)} />
    </Page>
  );
}
