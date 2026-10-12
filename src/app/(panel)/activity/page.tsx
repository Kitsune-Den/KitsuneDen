"use client";

import Page from "@/components/shell/Page";
import ActivityFeed from "@/components/ActivityFeed";

export default function ActivityPage() {
  return (
    <Page title="Activity" subtitle="Starts, stops, crashes, config saves and roster changes across the Den">
      <div className="max-w-[900px]">
        <ActivityFeed limit={200} />
      </div>
    </Page>
  );
}
