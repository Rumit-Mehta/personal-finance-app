import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  income: {
    label: "Income",
    color: "var(--chart-1)",
  },
  expenses: {
    label: "Expenses",
    color: "var(--chart-2)",
  },
};

const defaultData = [
  { month: "Jan", income: 4200, expenses: 2800 },
  { month: "Feb", income: 4300, expenses: 3100 },
  { month: "Mar", income: 4550, expenses: 2950 },
  { month: "Apr", income: 4400, expenses: 3300 },
  { month: "May", income: 4700, expenses: 3050 },
  { month: "Jun", income: 4650, expenses: 2900 },
];

function FinanceBarChart({ data = defaultData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income vs expenses</CardTitle>
        <CardDescription>Monthly cash flow comparison</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tickFormatter={(value) => formatCompactCurrency(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="dashed"
                  formatter={(value) => formatCurrency(value)}
                />
              }
            />
            <Bar
              dataKey="income"
              fill="var(--color-income)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="expenses"
              fill="var(--color-expenses)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
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

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 1,
  }).format(value);
}

export { FinanceBarChart };
