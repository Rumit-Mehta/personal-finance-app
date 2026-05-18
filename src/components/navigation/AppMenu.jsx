import { Database, LayoutDashboard, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AppMenu({
  activeView,
  onData,
  onDashboard,
  onProfile,
  profile,
  profileComplete,
}) {
  return (
    <nav
      aria-label="Primary"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-current={activeView === "dashboard" ? "page" : undefined}
          disabled={!profileComplete}
          onClick={onDashboard}
          type="button"
          variant={activeView === "dashboard" ? "default" : "outline"}
        >
          <LayoutDashboard />
          Dashboard
        </Button>
        <Button
          aria-current={activeView === "data" ? "page" : undefined}
          disabled={!profileComplete}
          onClick={onData}
          type="button"
          variant={activeView === "data" ? "default" : "outline"}
        >
          <Database />
          Data
        </Button>
        <Button
          aria-current={activeView === "profile" ? "page" : undefined}
          onClick={onProfile}
          type="button"
          variant={activeView === "profile" ? "default" : "outline"}
        >
          <UserRound />
          Profile
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {profileComplete
          ? `Local profile: ${profile.name}`
          : "Local profile required"}
      </p>
    </nav>
  );
}
