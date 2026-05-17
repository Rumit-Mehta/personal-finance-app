import { FinanceLineChart } from "@/components/charts/FinanceLineChart";

export function ChartsSection({ netWorthSeries = [] }) {
  return (
    <section>
      <h2>Charts</h2>
      <div className="grid gap-4">
        <FinanceLineChart data={netWorthSeries} />
      </div>
    </section>
  );
}
