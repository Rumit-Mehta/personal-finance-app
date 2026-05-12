import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
  balance: {
    label: "Balance",
    color: "var(--chart-1)",
  },
};

const defaultData = [
  { month: "Jan", balance: 18400 },
  { month: "Feb", balance: 19150 },
  { month: "Mar", balance: 20300 },
  { month: "Apr", balance: 19880 },
  { month: "May", balance: 21450 },
  { month: "Jun", balance: 22600 },
];

function FinanceLineChart({ data = defaultData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth trend</CardTitle>
        <CardDescription>Balance movement over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
          <LineChart data={data}>
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
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  formatter={(value) => formatCurrency(value)}
                />
              }
            />
            <Line
              dataKey="balance"
              type="monotone"
              stroke="var(--color-balance)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
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

export { FinanceLineChart };
