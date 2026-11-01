import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ReferenceLine,
} from 'recharts';
import type { DailyRevenuePoint } from './fulfillment';

export interface RechartsDailyRevenueOptions {
  data: DailyRevenuePoint[];
  chartMode: 'combined' | 'daily' | 'cumulative';
  showMovingAverage?: boolean;
  enableBrush?: boolean;
}

export class DailyRevenueRechartsMount {
  private root: Root | null = null;
  private container: HTMLElement | null = null;

  mount(container: HTMLElement, options: RechartsDailyRevenueOptions) {
    if (this.container !== container) {
      this.unmount();
      this.container = container;
      this.root = createRoot(container);
    }
    this.render(options);
  }

  render(options: RechartsDailyRevenueOptions) {
    if (!this.root) return;

    const {
      data,
      chartMode,
      showMovingAverage = true,
      enableBrush = false,
    } = options;

    const avgDaily =
      data.length > 0
        ? Math.round(data.reduce((s, d) => s + d.dailyRevenue, 0) / data.length)
        : 0;

    const showDailyBars = chartMode === 'combined' || chartMode === 'daily';
    const showCumulativeArea =
      chartMode === 'combined' || chartMode === 'cumulative';
    const cumulativeAxisId = chartMode === 'cumulative' ? 'left' : 'right';

    const chartElement = React.createElement(
      ResponsiveContainer,
      { width: '100%', height: enableBrush ? 310 : 280, minWidth: 280 },
      React.createElement(
        ComposedChart,
        {
          data,
          margin: { top: 14, right: 18, left: 6, bottom: enableBrush ? 12 : 6 },
        },
        React.createElement(
          'defs',
          null,
          React.createElement(
            'linearGradient',
            { id: 'seCumulativeRevenueGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', {
              offset: '5%',
              stopColor: '#10B981',
              stopOpacity: 0.42,
            }),
            React.createElement('stop', {
              offset: '95%',
              stopColor: '#10B981',
              stopOpacity: 0.02,
            })
          ),
          React.createElement(
            'linearGradient',
            { id: 'seDailyBarGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', {
              offset: '0%',
              stopColor: '#38BDF8',
              stopOpacity: 0.9,
            }),
            React.createElement('stop', {
              offset: '100%',
              stopColor: '#0284C7',
              stopOpacity: 0.45,
            })
          )
        ),
        React.createElement(CartesianGrid, {
          strokeDasharray: '3 3',
          stroke: 'rgba(148, 163, 184, 0.14)',
          vertical: false,
        }),
        React.createElement(XAxis, {
          dataKey: 'dateLabel',
          stroke: '#94A3B8',
          tick: { fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
          tickLine: false,
          axisLine: { stroke: 'rgba(148, 163, 184, 0.22)' },
          minTickGap: data.length > 35 ? 24 : 10,
        }),
        React.createElement(YAxis, {
          yAxisId: 'left',
          stroke: chartMode === 'cumulative' ? '#10B981' : '#38BDF8',
          tick: { fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
          tickLine: false,
          axisLine: false,
          tickFormatter: (val: number) => `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`,
        }),
        chartMode === 'combined'
          ? React.createElement(YAxis, {
              yAxisId: 'right',
              orientation: 'right',
              stroke: '#10B981',
              tick: { fill: '#34D399', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
              tickLine: false,
              axisLine: false,
              tickFormatter: (val: number) =>
                `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`,
            })
          : null,
        React.createElement(Tooltip, {
          contentStyle: {
            backgroundColor: 'rgba(6, 9, 17, 0.96)',
            borderColor: 'rgba(16, 185, 129, 0.45)',
            borderRadius: '8px',
            color: '#F8FAFC',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.5)',
          },
          labelStyle: {
            color: '#34D399',
            fontWeight: 700,
            marginBottom: '4px',
          },
          formatter: (value: unknown, name: unknown) => [
            `$${Number(value ?? 0).toLocaleString()}`,
            String(name ?? ''),
          ],
        }),
        React.createElement(Legend, {
          wrapperStyle: {
            paddingTop: '8px',
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#CBD5E1',
          },
        }),
        showDailyBars && avgDaily > 0
          ? React.createElement(ReferenceLine, {
              yAxisId: 'left',
              y: avgDaily,
              stroke: 'rgba(245, 158, 11, 0.5)',
              strokeDasharray: '4 4',
            })
          : null,
        showDailyBars
          ? React.createElement(Bar, {
              yAxisId: 'left',
              dataKey: 'dailyRevenue',
              name: 'Daily Sales Revenue (USD)',
              fill: 'url(#seDailyBarGrad)',
              radius: [4, 4, 0, 0],
              barSize: data.length > 60 ? 6 : data.length > 20 ? 12 : 20,
              isAnimationActive: false,
            })
          : null,
        showDailyBars && showMovingAverage
          ? React.createElement(Line, {
              yAxisId: 'left',
              type: 'monotone',
              dataKey: 'movingAvg7d',
              name: '7D Rolling Avg (USD)',
              stroke: '#F59E0B',
              strokeWidth: 2,
              dot: false,
              isAnimationActive: false,
            })
          : null,
        showCumulativeArea
          ? React.createElement(Area, {
              yAxisId: cumulativeAxisId,
              type: 'monotone',
              dataKey: 'cumulativeRevenue',
              name: 'Cumulative Revenue Trajectory (USD)',
              stroke: '#10B981',
              strokeWidth: 2.5,
              fillOpacity: 1,
              fill: 'url(#seCumulativeRevenueGrad)',
              isAnimationActive: false,
            })
          : null,
        enableBrush && data.length > 5
          ? React.createElement(Brush, {
              dataKey: 'dateLabel',
              height: 22,
              stroke: '#10B981',
              fill: '#0B1220',
              travellerWidth: 8,
            })
          : null
      )
    );

    this.root.render(chartElement);
  }

  unmount() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.container = null;
  }
}
