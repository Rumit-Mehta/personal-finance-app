import BrushChart from "@/components/charts/visxBrush";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ParentSize } from "@visx/responsive";

export function ChartsSection({ accountNetWorthStackSeries }) {
  return (
    <section>
      <h2>Charts</h2>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Net worth by account</CardTitle>
            <CardDescription>Daily account balances with range selection</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[420px] w-full">
              <ParentSize>
                {({ width, height }) =>
                  width > 0 && height > 0 ? (
                    <BrushChart
                      stackSeries={accountNetWorthStackSeries}
                      width={width}
                      height={height}
                    />
                  ) : null
                }
              </ParentSize>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
