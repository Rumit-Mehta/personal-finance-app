import { Button } from "@/components/ui/button";

export function DashboardHeader({ onThemeToggle, parsedData, profileName, theme }) {
  const displayName = profileName || parsedData?.user.fullName || "there";

  return (
    <>
      <p className="mb-3 font-semibold text-muted-foreground">
        Welcome back, {displayName}
      </p>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Stage bank files, apply reusable rules, then save the edited data.
          </p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={onThemeToggle}
          type="button"
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
      </div>
    </>
  );
}
