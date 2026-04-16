# Neural Viz Library

Reusable, SVG-based data visualization components with Neural styling for the Agnes Ara platform.

## Overview

This library provides 6 core visualization components designed for dark theme, with glass morphism effects, neon accents, and smooth animations powered by Framer Motion.

**No external chart libraries** - all components are built with pure SVG for maximum control and minimal bundle size.

## Components

### 1. TimeSeriesChart

Line/area charts for displaying trends over time with smooth Bezier curves.

```tsx
import { TimeSeriesChart } from '@/core/components/viz';

<TimeSeriesChart
  data={[
    { date: '2024-03-01', value: 85 },
    { date: '2024-03-02', value: 90 },
    { date: '2024-03-03', value: 88 },
  ]}
  metric="Sleep Quality"
  color="indigo"
  showGradient
  height={250}
  showDots
  animate
/>
```

**Props:**
- `data: TimeSeriesDataPoint[]` - Array of date/value pairs
- `metric: string` - Chart label
- `color?: string` - Color theme (default: 'indigo')
- `showGradient?: boolean` - Show gradient fill under line (default: true)
- `height?: number` - Chart height in pixels (default: 200)
- `showDots?: boolean` - Show data points (default: true)
- `animate?: boolean` - Enable animations (default: true)

**Colors:** indigo, purple, orange, amber, cyan, teal, green, emerald, blue, sky

---

### 2. BarChart

Vertical or horizontal bar charts with hover tooltips and animated bars.

```tsx
import { BarChart } from '@/core/components/viz';

<BarChart
  data={[
    { category: 'Sleep', value: 8.5 },
    { category: 'Exercise', value: 6.2 },
    { category: 'Nutrition', value: 7.8 },
  ]}
  orientation="vertical"
  color="cyan"
  height={300}
  showValues
  animate
/>
```

**Props:**
- `data: BarChartDataPoint[]` - Array of category/value pairs
- `orientation?: 'vertical' | 'horizontal'` - Bar direction (default: 'vertical')
- `color?: string` - Color theme (default: 'indigo')
- `height?: number` - Chart height (default: 300)
- `showValues?: boolean` - Display value labels (default: true)
- `animate?: boolean` - Enable animations (default: true)

---

### 3. PieChart

Donut/pie charts for showing proportions with interactive segments.

```tsx
import { PieChart } from '@/core/components/viz';

<PieChart
  data={[
    { label: 'Cardio', value: 45 },
    { label: 'Strength', value: 30 },
    { label: 'Flexibility', value: 25 },
  ]}
  donut
  donutThickness={0.4}
  size={300}
  showLegend
  animate
/>
```

**Props:**
- `data: PieChartSegment[]` - Array of label/value/color objects
- `donut?: boolean` - Render as donut chart (default: true)
- `donutThickness?: number` - Thickness ratio 0-1 (default: 0.4)
- `size?: number` - Chart size in pixels (default: 300)
- `showLegend?: boolean` - Show legend below chart (default: true)
- `animate?: boolean` - Enable animations (default: true)

**Interactions:**
- Click segments to focus
- Hover to highlight
- Legend items are clickable

---

### 4. MetricCard

Single metric display with large number, trend indicator, and optional sparkline.

```tsx
import { MetricCard } from '@/core/components/viz';

<MetricCard
  label="Sleep Quality"
  value={85}
  unit="score"
  change={12.5}
  trendDirection="up"
  sparklineData={[65, 70, 75, 80, 85]}
  color="indigo"
/>
```

**Props:**
- `label: string` - Metric name
- `value: number | string` - Primary value to display
- `unit?: string` - Unit label (e.g., "bpm", "kcal")
- `change?: number` - Percentage change
- `trendDirection?: TrendDirection` - Trend arrow direction
- `sparklineData?: number[]` - Mini line chart data
- `color?: string` - Color theme (default: 'indigo')
- `isLoading?: boolean` - Show skeleton loader

---

### 5. TrendIndicator

Compact up/down/neutral indicator with percentage and icon.

```tsx
import { TrendIndicator } from '@/core/components/viz';

<TrendIndicator
  value={12.5}
  direction="up"
  size="md"
  showIcon
  showSign
  animate
/>
```

**Props:**
- `value: number` - Percentage value
- `direction?: 'up' | 'down' | 'neutral'` - Auto-detected if not provided
- `size?: 'sm' | 'md' | 'lg'` - Size variant (default: 'md')
- `showIcon?: boolean` - Show arrow icon (default: true)
- `showSign?: boolean` - Show +/- sign (default: true)
- `animate?: boolean` - Enable animations (default: true)

**Utility:**
```tsx
import { computeTrendValue } from '@/core/components/viz';

const { value, direction } = computeTrendValue(currentValue, previousValue);
```

---

### 6. ProgressRing

Circular progress indicator with animated stroke and center text.

```tsx
import { ProgressRing } from '@/core/components/viz';

<ProgressRing
  percentage={75}
  label="Complete"
  color="green"
  size={120}
  strokeWidth={8}
  showPercentage
  animate
/>
```

**Props:**
- `percentage: number` - Progress value 0-100
- `label?: string` - Label below percentage
- `color?: string` - Color theme (default: 'indigo')
- `size?: number` - Ring diameter in pixels (default: 120)
- `strokeWidth?: number` - Ring thickness (default: 8)
- `showPercentage?: boolean` - Display % in center (default: true)
- `animate?: boolean` - Enable animations (default: true)

---

## Color Palette

All components support these color themes aligned with module identities:

| Color | Module | Usage |
|-------|--------|-------|
| `indigo` / `purple` | **Therapy** | Mental health, therapy sessions |
| `orange` / `amber` | **Trainer** | Fitness, workouts, activity |
| `cyan` / `teal` | **Ledger** | Finances, tracking, data |
| `green` / `emerald` | **Soma** | Health, vitals, wellness |
| `blue` / `sky` | **Atlas** | Navigation, exploration, maps |

## Styling

All components use:
- **Glass morphism:** `backdrop-blur`, translucent backgrounds
- **Neon accents:** Glowing edges and hover effects
- **Neural grid:** Subtle grid patterns in backgrounds
- **Dark theme:** Optimized for `var(--void)` background

Components integrate seamlessly with existing `SurfaceCard` wrappers:

```tsx
<SurfaceCard className="p-6">
  <TimeSeriesChart data={data} metric="Example" />
</SurfaceCard>
```

## Accessibility

All components include:
- ✅ ARIA labels and roles
- ✅ Semantic SVG structure
- ✅ Keyboard navigation (where applicable)
- ✅ `prefers-reduced-motion` support via Framer Motion
- ✅ High contrast text and colors

## Animations

Powered by **Framer Motion**:
- Smooth path drawing for line charts
- Staggered bar animations
- Scale and fade transitions
- Hover interactions with spring physics

Disable animations globally with `animate={false}` prop.

## Visual Testing

To view all components with sample data:

```tsx
import { VizShowcase } from '@/core/components/viz/VizShowcase';

// Render in your app
<VizShowcase />
```

This renders a comprehensive showcase of all components with various configurations.

## Performance

- **No external dependencies** (except Framer Motion)
- **SVG-based** for scalability and sharp rendering
- **Responsive** via viewBox and percentage-based sizing
- **Lazy rendering** - components only compute data when visible
- **Memoized calculations** with `useMemo` for expensive operations

## Examples

### Dashboard Grid

```tsx
<div className="grid grid-cols-4 gap-6">
  <MetricCard label="Steps" value="12.5K" change={15.2} color="sky" />
  <MetricCard label="Calories" value="2,450" change={-3.1} color="orange" />
  <MetricCard label="Sleep" value={8.5} change={5.0} color="indigo" />
  <MetricCard label="Heart Rate" value={72} unit="bpm" color="cyan" />
</div>
```

### Progress Section

```tsx
<div className="flex gap-8 justify-center">
  <ProgressRing percentage={75} label="Daily Goal" color="indigo" />
  <ProgressRing percentage={92} label="Weekly Goal" color="emerald" />
  <ProgressRing percentage={45} label="Monthly Goal" color="amber" />
</div>
```

### Analytics Panel

```tsx
<SurfaceCard className="p-6">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-lg font-bold">Weekly Trends</h3>
    <TrendIndicator value={8.5} direction="up" />
  </div>
  <TimeSeriesChart data={weekData} metric="Activity Score" color="orange" />
</SurfaceCard>
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

SVG filters may have reduced performance on older mobile devices.

## Future Enhancements

Potential additions:
- ScatterPlot component
- HeatMap component
- GaugeChart component
- Export to PNG/SVG
- Real-time streaming data support
- More animation variants

---

**Built with ❤️ for Agnes Ara**
