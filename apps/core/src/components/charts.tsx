import { useMediaQuery } from '@bossbyte/ui';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

// Chart.js is tree-shakeable: only what is registered here ends up in the bundle.
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Legend, Tooltip);
ChartJS.defaults.font.family = "'Inter', ui-sans-serif, system-ui, sans-serif";
ChartJS.defaults.color = '#475569';

const BRAND = '#5b3ae8';
const SERIES = ['#5b3ae8', '#0ea5e9', '#f59e0b', '#64748b', '#10b981', '#ef4444'];

interface ChartProps {
  /** One label per value, in order. */
  labels: string[];
  values: number[];
  /** What the chart shows. Read out with the figures, since a canvas has no text of its own. */
  description: string;
  formatValue?: (value: number) => string;
  /** Sets the height, e.g. `h-64`. */
  className?: string;
}

function textAlternative({ description, labels, values, formatValue = String }: ChartProps) {
  const figures = labels.map((label, index) => `${label} ${formatValue(values[index] ?? 0)}`);
  return `${description}: ${figures.join(', ')}`;
}

function useAnimation() {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return reduceMotion ? (false as const) : undefined;
}

export interface BarChartProps extends ChartProps {
  /** Names the series in the tooltip. */
  seriesLabel: string;
  /** Lays the bars out left to right, which suits long category names. */
  horizontal?: boolean;
}

/**
 * A single-series bar chart.
 *
 * @example
 *   <BarChart
 *     description="Sign-ups per month"
 *     seriesLabel="Sign-ups"
 *     labels={['Jan', 'Feb']}
 *     values={[4, 9]}
 *   />
 */
export function BarChart(props: BarChartProps) {
  const {
    labels,
    values,
    seriesLabel,
    horizontal = false,
    formatValue,
    className = 'h-64',
  } = props;
  const animation = useAnimation();
  const valueAxis = {
    beginAtZero: true,
    grid: { color: '#e2e8f0' },
    ticks: {
      precision: 0,
      callback: (value: string | number) =>
        formatValue && typeof value === 'number' ? formatValue(value) : value,
    },
  };
  const categoryAxis = { grid: { display: false } };

  return (
    <div className={className}>
      <Bar
        role="img"
        aria-label={textAlternative(props)}
        data={{
          labels,
          datasets: [{ label: seriesLabel, data: values, backgroundColor: BRAND, borderRadius: 4 }],
        }}
        options={{
          animation,
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: horizontal ? 'y' : 'x',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) =>
                  `${seriesLabel}: ${formatValue ? formatValue(Number(item.raw)) : item.formattedValue}`,
              },
            },
          },
          scales: horizontal
            ? { x: valueAxis, y: categoryAxis }
            : { x: categoryAxis, y: valueAxis },
        }}
      />
    </div>
  );
}

/**
 * A doughnut chart for parts of a whole.
 *
 * @example
 *   <DoughnutChart description="Users by role" labels={['Admin', 'Staff']} values={[2, 14]} />
 */
export function DoughnutChart(props: ChartProps) {
  const { labels, values, className = 'h-64' } = props;
  const animation = useAnimation();

  return (
    <div className={className}>
      <Doughnut
        role="img"
        aria-label={textAlternative(props)}
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: labels.map((_, index) => SERIES[index % SERIES.length]),
              borderColor: '#ffffff',
              borderWidth: 2,
            },
          ],
        }}
        options={{
          animation,
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
        }}
      />
    </div>
  );
}
