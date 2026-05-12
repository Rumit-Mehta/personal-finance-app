import { Pie, PieChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  groceries: {
    label: "Groceries",
    color: "var(--chart-1)",
  },
  transport: {
    label: "Transport",
    color: "var(--chart-2)",
  },
  housing: {
    label: "Housing",
    color: "var(--chart-3)",
  },
  savings: {
    label: "Savings",
    color: "var(--chart-4)",
  },
};

const defaultData = [
  { category: "groceries", amount: 420, fill: "var(--color-groceries)" },
  { category: "transport", amount: 180, fill: "var(--color-transport)" },
  { category: "housing", amount: 1250, fill: "var(--color-housing)" },
  { category: "savings", amount: 600, fill: "var(--color-savings)" },
];

function FinancePieChart({ data = defaultData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending split</CardTitle>
        <CardDescription>Monthly spending by category</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="mx-auto max-h-[280px]">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="category"
                  formatter={(value) => formatCurrency(value)}
                />
              }
            />
            <Pie
              data={data}
              dataKey="amount"
              nameKey="category"
              innerRadius={56}
              outerRadius={92}
              paddingAngle={2}
            />
            <ChartLegend content={<ChartLegendContent nameKey="category" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export { FinancePieChart };
