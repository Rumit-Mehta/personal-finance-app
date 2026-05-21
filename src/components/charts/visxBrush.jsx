import { useEffect, useMemo, useRef, useState } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Brush } from "@visx/brush";
import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { LinearGradient } from "@visx/gradient";
import { Group } from "@visx/group";
import { PatternLines } from "@visx/pattern";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaStack } from "@visx/shape";
import { bisector, extent, max, min } from "@visx/vendor/d3-array";
import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const EMPTY_STACK_SERIES = { data: [], keys: [], seriesMeta: {} };
const brushMargin = { top: 10, bottom: 15, left: 58, right: 20 };
const chartSeparation = 30;
const PATTERN_ID = "net_worth_brush_pattern";
const GRADIENT_ID = "net_worth_chart_background";
const accentColor = "#ffffff70";
const background = "#171717";
const selectedBrushStyle = {
  fill: `url(#${PATTERN_ID})`,
  stroke: "white",
};

const getDate = (datum) => new Date(datum.date);
const bisectDate = bisector((datum) => getDate(datum)).left;

function BrushChart({
  compact = false,
  stackSeries = EMPTY_STACK_SERIES,
  width,
  height,
  margin = {
    top: 20,
    left: 58,
    bottom: 28,
    right: 20,
  },
}) {
  const brushRef = useRef(null);
  const { data, keys, seriesMeta } = stackSeries ?? EMPTY_STACK_SERIES;
  const [filteredData, setFilteredData] = useState(data);
  const [hoveredDatum, setHoveredDatum] = useState(null);

  useEffect(() => {
    setFilteredData(data);
    setHoveredDatum(null);
  }, [data]);

  const visibleData = filteredData.length ? filteredData : data;
  const hasData = data.length > 0 && keys.length > 0;
  const chartHeight = Math.max(height - 42, 0);

  const innerHeight = chartHeight - margin.top - margin.bottom;
  const topChartBottomMargin = compact
    ? chartSeparation / 2
    : chartSeparation + 10;
  const topChartHeight = 0.8 * innerHeight - topChartBottomMargin;
  const bottomChartHeight = innerHeight - topChartHeight - chartSeparation;
  const xMax = Math.max(width - margin.left - margin.right, 0);
  const yMax = Math.max(topChartHeight, 0);
  const xBrushMax = Math.max(width - brushMargin.left - brushMargin.right, 0);
  const yBrushMax = Math.max(
    bottomChartHeight - brushMargin.top - brushMargin.bottom,
    0,
  );

  const visibleDateDomain = useMemo(
    () => paddedDateDomain(visibleData),
    [visibleData],
  );
  const fullDateDomain = useMemo(() => paddedDateDomain(data), [data]);
  const visibleValueDomain = useMemo(
    () => stackValueDomain(visibleData, keys),
    [keys, visibleData],
  );
  const fullValueDomain = useMemo(
    () => stackValueDomain(data, keys),
    [data, keys],
  );

  const dateScale = useMemo(
    () =>
      scaleTime({
        range: [0, xMax],
        domain: visibleDateDomain,
      }),
    [visibleDateDomain, xMax],
  );
  const valueScale = useMemo(
    () =>
      scaleLinear({
        range: [yMax, 0],
        domain: visibleValueDomain,
        nice: true,
      }),
    [visibleValueDomain, yMax],
  );
  const brushDateScale = useMemo(
    () =>
      scaleTime({
        range: [0, xBrushMax],
        domain: fullDateDomain,
      }),
    [fullDateDomain, xBrushMax],
  );
  const brushValueScale = useMemo(
    () =>
      scaleLinear({
        range: [yBrushMax, 0],
        domain: fullValueDomain,
        nice: true,
      }),
    [fullValueDomain, yBrushMax],
  );

  const initialBrushPosition = useMemo(() => {
    if (data.length <= 1) {
      return {
        start: { x: 0 },
        end: { x: xBrushMax },
      };
    }

    return {
      start: { x: brushDateScale(getDate(data[0])) },
      end: { x: brushDateScale(getDate(data.at(-1))) },
    };
  }, [brushDateScale, data, xBrushMax]);

  const hoverEntries = useMemo(
    () =>
      hoveredDatum
        ? accountEntriesForDatum(hoveredDatum, keys, seriesMeta)
        : [],
    [hoveredDatum, keys, seriesMeta],
  );

  const onBrushChange = (domain) => {
    if (!domain) {
      return;
    }

    const x0 = Math.min(domain.x0, domain.x1);
    const x1 = Math.max(domain.x0, domain.x1);
    const nextData = data.filter((datum) => {
      const time = getDate(datum).getTime();

      return time >= x0 && time <= x1;
    });

    setFilteredData(nextData.length ? nextData : data);
  };

  const handleClearClick = () => {
    setFilteredData(data);
    setHoveredDatum(null);
    brushRef.current?.reset();
  };

  const handleResetClick = () => {
    if (!brushRef.current) {
      return;
    }

    const updater = (prevBrush) => {
      const newExtent = brushRef.current.getExtent(
        initialBrushPosition.start,
        initialBrushPosition.end,
      );

      return {
        ...prevBrush,
        start: { y: newExtent.y0, x: newExtent.x0 },
        end: { y: newExtent.y1, x: newExtent.x1 },
        extent: newExtent,
      };
    };

    setFilteredData(data);
    setHoveredDatum(null);
    brushRef.current.updateBrush(updater);
  };

  const handleMainChartPointerMove = (event) => {
    const point = localPoint(event);

    if (!point || !visibleData.length) {
      return;
    }

    const x = point.x - margin.left;
    const hoveredDate = dateScale.invert(x);
    const index = bisectDate(visibleData, hoveredDate, 1);
    const leftDatum = visibleData[index - 1];
    const rightDatum = visibleData[index];
    const nearest =
      rightDatum &&
      leftDatum &&
      hoveredDate - getDate(leftDatum) > getDate(rightDatum) - hoveredDate
        ? rightDatum
        : leftDatum;

    setHoveredDatum(nearest ?? null);
  };

  const handleMainChartPointerLeave = () => {
    setHoveredDatum(null);
  };

  if (!hasData) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No balance history yet
      </div>
    );
  }

  const hoverX = hoveredDatum ? dateScale(getDate(hoveredDatum)) || 0 : 0;
  const tooltipWidth = Math.min(230, Math.max(xMax - 16, 160));
  const tooltipX = Math.min(
    Math.max(hoverX + 12, 8),
    Math.max(xMax - tooltipWidth - 8, 8),
  );
  const tooltipHeight = 48 + hoverEntries.length * 17;

  return (
    <div className="grid h-full gap-2">
      <svg width={width} height={chartHeight}>
        <LinearGradient
          id={GRADIENT_ID}
          from={background}
          to="#262626"
          rotate={45}
        />
        <rect
          x={0}
          y={0}
          width={width}
          height={chartHeight}
          fill={`url(#${GRADIENT_ID})`}
          rx={8}
        />
        <Group left={margin.left} top={margin.top}>
          <AreaStack
            data={visibleData}
            keys={keys}
            x={(stackPoint) => dateScale(getDate(stackPoint.data)) || 0}
            y0={(stackPoint) => valueScale(stackPoint[0]) || 0}
            y1={(stackPoint) => valueScale(stackPoint[1]) || 0}
            value={(datum, key) => Number(datum[key]) || 0}
            curve={curveMonotoneX}
          >
            {({ stacks, path }) =>
              stacks.map((series) => (
                <path
                  key={`main-${series.key}`}
                  d={path(series) || ""}
                  fill={seriesMeta[series.key]?.color ?? "#d4d4d4"}
                  fillOpacity={0.82}
                  stroke={seriesMeta[series.key]?.color ?? "#d4d4d4"}
                  strokeOpacity={0.9}
                  strokeWidth={1}
                />
              ))
            }
          </AreaStack>
          <line
            x1={0}
            x2={xMax}
            y1={valueScale(0)}
            y2={valueScale(0)}
            stroke="rgba(255, 255, 255, 0.45)"
            strokeDasharray="3 3"
          />
          {!compact && (
            <AxisBottom
              top={yMax}
              scale={dateScale}
              numTicks={width > 520 ? 8 : 4}
              stroke="rgba(255, 255, 255, 0.75)"
              tickStroke="rgba(255, 255, 255, 0.55)"
              tickFormat={formatTickDate}
              tickLabelProps={axisBottomTickLabelProps}
            />
          )}
          <AxisLeft
            scale={valueScale}
            numTicks={5}
            stroke="rgba(255, 255, 255, 0.75)"
            tickStroke="rgba(255, 255, 255, 0.55)"
            tickFormat={formatCurrencyShort}
            tickLabelProps={axisLeftTickLabelProps}
          />
          <rect
            x={0}
            y={0}
            width={xMax}
            height={yMax}
            fill="transparent"
            onPointerMove={handleMainChartPointerMove}
            onPointerLeave={handleMainChartPointerLeave}
          />
          {hoveredDatum && (
            <Group>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={0}
                y2={yMax}
                stroke="white"
                strokeDasharray="4 4"
                strokeOpacity={0.65}
              />
              <g transform={`translate(${tooltipX}, 8)`}>
                <rect
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={6}
                  fill="rgba(0, 0, 0, 0.78)"
                  stroke="rgba(255, 255, 255, 0.35)"
                />
                <text x={10} y={17} fill="white" fontSize={11}>
                  {formatDate(getDate(hoveredDatum))}
                </text>
                <text x={10} y={34} fill="white" fontSize={12} fontWeight={700}>
                  {formatCurrency(hoveredDatum.total)}
                </text>
                {hoverEntries.map((entry, index) => (
                  <g
                    key={entry.key}
                    transform={`translate(10, ${51 + index * 17})`}
                  >
                    <circle cy={-4} r={4} fill={entry.color} />
                    <text x={10} y={0} fill="white" fontSize={11}>
                      {truncateLabel(entry.label, 17)}
                    </text>
                    <text
                      x={tooltipWidth - 12}
                      y={0}
                      fill="white"
                      fontSize={11}
                      textAnchor="end"
                    >
                      {formatCurrency(entry.value)}
                    </text>
                  </g>
                ))}
              </g>
            </Group>
          )}
        </Group>
        <Group top={topChartHeight + topChartBottomMargin + margin.top}>
          <Group left={brushMargin.left} top={brushMargin.top}>
            <AreaStack
              data={data}
              keys={keys}
              x={(stackPoint) => brushDateScale(getDate(stackPoint.data)) || 0}
              y0={(stackPoint) => brushValueScale(stackPoint[0]) || 0}
              y1={(stackPoint) => brushValueScale(stackPoint[1]) || 0}
              value={(datum, key) => Number(datum[key]) || 0}
              curve={curveMonotoneX}
            >
              {({ stacks, path }) =>
                stacks.map((series) => (
                  <path
                    key={`brush-${series.key}`}
                    d={path(series) || ""}
                    fill={seriesMeta[series.key]?.color ?? "#d4d4d4"}
                    fillOpacity={0.56}
                  />
                ))
              }
            </AreaStack>
            <line
              x1={0}
              x2={xBrushMax}
              y1={brushValueScale(0)}
              y2={brushValueScale(0)}
              stroke="rgba(255, 255, 255, 0.35)"
            />
            <Brush
              xScale={brushDateScale}
              yScale={brushValueScale}
              width={xBrushMax}
              height={yBrushMax}
              margin={brushMargin}
              handleSize={8}
              innerRef={brushRef}
              resizeTriggerAreas={["left", "right"]}
              brushDirection="horizontal"
              initialBrushPosition={initialBrushPosition}
              onChange={onBrushChange}
              onClick={() => setFilteredData(data)}
              selectedBoxStyle={selectedBrushStyle}
              useWindowMoveEvents
              renderBrushHandle={(props) => <BrushHandle {...props} />}
            />
          </Group>
          <PatternLines
            id={PATTERN_ID}
            height={8}
            width={8}
            stroke={accentColor}
            strokeWidth={1}
            orientation={["diagonal"]}
          />
        </Group>
      </svg>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleClearClick}>
          <X aria-hidden="true" />
          Clear
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleResetClick}>
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
      </div>
    </div>
  );
}

function BrushHandle({ x, height, isBrushActive }) {
  const pathWidth = 8;
  const pathHeight = 15;

  if (!isBrushActive) {
    return null;
  }

  return (
    <Group left={x + pathWidth / 2} top={(height - pathHeight) / 2}>
      <path
        fill="#f2f2f2"
        d="M -4.5 0.5 L 3.5 0.5 L 3.5 15.5 L -4.5 15.5 L -4.5 0.5 M -1.5 4 L -1.5 12 M 0.5 4 L 0.5 12"
        stroke="#999999"
        strokeWidth="1"
        style={{ cursor: "ew-resize" }}
      />
    </Group>
  );
}

function paddedDateDomain(data) {
  const [start, end] = extent(data, getDate);

  if (!start || !end) {
    const today = new Date();
    return [addDays(today, -1), addDays(today, 1)];
  }

  if (start.getTime() === end.getTime()) {
    return [addDays(start, -1), addDays(end, 1)];
  }

  return [start, end];
}

function stackValueDomain(data, keys) {
  const extents = data.flatMap((datum) => {
    let total = 0;
    const values = [0];

    keys.forEach((key) => {
      total += Number(datum[key]) || 0;
      values.push(total);
    });

    return values;
  });
  const minValue = min(extents) ?? 0;
  const maxValue = max(extents) ?? 0;

  if (minValue === 0 && maxValue === 0) {
    return [-1, 1];
  }

  const range = maxValue - minValue;
  const padding = Math.max(range * 0.08, 1);

  return [
    minValue < 0 ? minValue - padding : 0,
    maxValue > 0 ? maxValue + padding : 0,
  ];
}

function accountEntriesForDatum(datum, keys, seriesMeta) {
  return keys
    .map((key) => ({
      key,
      label: seriesMeta[key]?.label ?? key,
      value: Number(datum.values?.[key] ?? datum[key] ?? 0),
      color: seriesMeta[key]?.color ?? "#d4d4d4",
    }))
    .filter((entry) => entry.value !== 0)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 6);
}

function addDays(date, days) {
  const nextDate = new Date(date);

  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyShort(value) {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatTickDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(value);
}

function truncateLabel(label, maxLength) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

const axisBottomTickLabelProps = {
  textAnchor: "middle",
  fontFamily: "Arial",
  fontSize: 10,
  fill: "rgba(255, 255, 255, 0.86)",
};

const axisLeftTickLabelProps = {
  dx: "-0.25em",
  dy: "0.25em",
  fontFamily: "Arial",
  fontSize: 10,
  textAnchor: "end",
  fill: "rgba(255, 255, 255, 0.86)",
};

export default BrushChart;
