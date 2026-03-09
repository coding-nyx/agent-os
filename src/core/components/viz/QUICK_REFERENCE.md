# Neural Viz - Quick Reference Card

## Import
```tsx
import {
  TimeSeriesChart,
  BarChart,
  PieChart,
  MetricCard,
  TrendIndicator,
  ProgressRing,
} from '@/core/components/viz';
```

## Components at a Glance

| Component | Use Case | Key Props | Size |
|-----------|----------|-----------|------|
| **TimeSeriesChart** | Trends over time | `data`, `metric`, `color` | 9.8 KB |
| **BarChart** | Category comparison | `data`, `orientation`, `color` | 11 KB |
| **PieChart** | Proportions/parts | `data`, `donut`, `showLegend` | 8.6 KB |
| **MetricCard** | Single KPI display | `label`, `value`, `change` | 6.1 KB |
| **TrendIndicator** | Up/down arrow | `value`, `direction`, `size` | 2.7 KB |
| **ProgressRing** | Circular progress | `percentage`, `label`, `color` | 5.4 KB |

## Color Palette

```tsx
color="indigo"   // Therapy (mental health)
color="orange"   // Trainer (fitness)
color="cyan"     // Ledger (finances)
color="emerald"  // Soma (health/vitals)
color="sky"      // Atlas (navigation)
```

## Quick Examples

### Metric Card
```tsx
<MetricCard 
  label="Sleep Quality" 
  value={85} 
  change={12.5}
  color="indigo" 
/>
```

### Time Series
```tsx
<TimeSeriesChart 
  data={[
    { date: '2024-03-01', value: 85 },
    { date: '2024-03-02', value: 90 }
  ]}
  metric="Weekly Progress"
  color="emerald"
/>
```

### Bar Chart
```tsx
<BarChart 
  data={[
    { category: 'Sleep', value: 8.5 },
    { category: 'Exercise', value: 6.2 }
  ]}
  orientation="horizontal"
  color="cyan"
/>
```

### Pie Chart
```tsx
<PieChart 
  data={[
    { label: 'Cardio', value: 45 },
    { label: 'Strength', value: 30 }
  ]}
  donut
  showLegend
/>
```

### Progress Ring
```tsx
<ProgressRing 
  percentage={75} 
  label="Complete"
  color="indigo"
  size={120}
/>
```

### Trend Indicator
```tsx
<TrendIndicator 
  value={12.5} 
  direction="up"
  size="md"
/>
```

## Common Patterns

### Dashboard Grid
```tsx
<div className="grid grid-cols-4 gap-6">
  <MetricCard {...} />
  <MetricCard {...} />
  <MetricCard {...} />
  <MetricCard {...} />
</div>
```

### Chart Panel
```tsx
<SurfaceCard className="p-6">
  <TimeSeriesChart {...} />
</SurfaceCard>
```

### Progress Cluster
```tsx
<div className="flex gap-8 justify-center">
  <ProgressRing {...} />
  <ProgressRing {...} />
  <ProgressRing {...} />
</div>
```

## TypeScript Types

```tsx
import type {
  TimeSeriesDataPoint,
  BarChartDataPoint,
  PieChartSegment,
  MetricCardProps,
  TrendDirection,
} from '@/core/components/viz';

// Use in your code
const data: TimeSeriesDataPoint[] = [...]
const bars: BarChartDataPoint[] = [...]
const segments: PieChartSegment[] = [...]
```

## Utilities

```tsx
import { computeTrendValue } from '@/core/components/viz';

const { value, direction } = computeTrendValue(currentValue, previousValue);
// Returns: { value: 10, direction: 'up' }
```

## Visual Showcase

```tsx
import { VizShowcase } from '@/core/components/viz/VizShowcase';

// View all components with sample data
<VizShowcase />
```

## Styling

All components support:
- **Neural theme**: Glass morphism, neon accents
- **Dark optimized**: Designed for `var(--void)` background  
- **Responsive**: Scales with container
- **Accessible**: ARIA labels, keyboard nav
- **Animated**: Smooth 60fps transitions

Use with `SurfaceCard` for consistent styling:
```tsx
<SurfaceCard className="p-6">
  <TimeSeriesChart {...} />
</SurfaceCard>
```

## Props Reference

### Common Props (most components)
- `color?: string` - Theme color (indigo, orange, cyan, etc.)
- `animate?: boolean` - Enable animations (default: true)
- `className?: string` - Additional CSS classes

### TimeSeriesChart
- `data: TimeSeriesDataPoint[]` - Array of {date, value}
- `metric: string` - Chart label
- `showGradient?: boolean` - Gradient fill (default: true)
- `height?: number` - Chart height (default: 200)

### BarChart
- `data: BarChartDataPoint[]` - Array of {category, value}
- `orientation?: 'vertical' | 'horizontal'` - Bar direction
- `showValues?: boolean` - Display values (default: true)
- `height?: number` - Chart height (default: 300)

### PieChart
- `data: PieChartSegment[]` - Array of {label, value}
- `donut?: boolean` - Donut style (default: true)
- `size?: number` - Chart size (default: 300)
- `showLegend?: boolean` - Show legend (default: true)

### MetricCard
- `label: string` - Metric name
- `value: number | string` - Primary value
- `change?: number` - Percentage change
- `sparklineData?: number[]` - Mini chart data
- `unit?: string` - Unit label

### ProgressRing
- `percentage: number` - Progress 0-100
- `label?: string` - Center label
- `size?: number` - Ring diameter (default: 120)
- `showPercentage?: boolean` - Show % (default: true)

### TrendIndicator
- `value: number` - Percentage value
- `direction?: 'up' | 'down' | 'neutral'` - Auto-detected if omitted
- `size?: 'sm' | 'md' | 'lg'` - Size variant
- `showIcon?: boolean` - Show arrow (default: true)

---

**Location**: `src/core/components/viz/`  
**Documentation**: See README.md for full API reference  
**Examples**: See EXAMPLES.tsx for code samples
