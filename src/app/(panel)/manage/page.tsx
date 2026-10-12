"use client";

import Page from "@/components/shell/Page";
import ServersPage from "@/components/ServersPage";

export default function ManagePage() {
  return (
    <Page title="Server setup" subtitle="Add, edit and remove the servers the Den looks after">
      <ServersPage />
    </Page>
  );
}
