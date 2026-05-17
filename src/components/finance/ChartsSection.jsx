import { BarChartInteractive } from "@/components/charts/BarChartInteractive";

export function ChartsSection() {
  return (
    <section>
      <h2>Charts</h2>
      <div className="grid gap-4">
        <BarChartInteractive />
      </div>
    </section>
  );
}
