import {
  capitalize,
  formatBytes,
  formatNumber,
  ROLE_LABELS,
  type DashboardStats,
} from '@bossbyte/shared';
import { Card, formatRelativeTime, Skeleton } from '@bossbyte/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BarChart, DoughnutChart } from '@/components/charts';
import { PageHeader } from '@/components/PageHeader';
import { QueryError } from '@/components/QueryError';
import { StatCard } from '@/components/StatCard';
import { statsQueryOptions } from '@/features/reports/api';
import { useCurrentUser } from '@/lib/auth';

export const Route = createFileRoute('/_authenticated/')({
  // Starts the request as soon as the link is hovered, without holding up navigation.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(statsQueryOptions);
  },
  component: DashboardPage,
});

const monthFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

/** "2026-03" → "Mar 26" */
function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** "user.created" → "User created" */
function activityLabel(action: string): string {
  return capitalize(action.replaceAll(/[._]/g, ' '));
}

function RecentActivity({ items }: { items: DashboardStats['recentActivity'] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-600">Nothing has happened yet.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
          <p className="text-sm text-slate-800">
            <span className="font-medium text-slate-950">{item.userName ?? 'System'}</span>
            {' · '}
            {activityLabel(item.action)}
          </p>
          <time dateTime={item.createdAt} className="text-sm text-slate-600">
            {formatRelativeTime(item.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

function DashboardPage() {
  const user = useCurrentUser();
  const stats = useQuery(statsQueryOptions);
  const { data } = stats;
  const loading = stats.isPending;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name.split(' ')[0] ?? user.name}. Here is where things stand.`}
      />

      {stats.isError ? (
        <QueryError error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Users"
              value={data && formatNumber(data.totals.users)}
              loading={loading}
            />
            <StatCard
              label="Active users"
              value={data && formatNumber(data.totals.activeUsers)}
              hint={
                data && `${formatNumber(data.totals.users - data.totals.activeUsers)} deactivated`
              }
              loading={loading}
            />
            <StatCard
              label="Files"
              value={data && formatNumber(data.totals.files)}
              loading={loading}
            />
            <StatCard
              label="Storage used"
              value={data && formatBytes(data.totals.storageBytes)}
              loading={loading}
            />
          </dl>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Sign-ups" description="New accounts per month" className="lg:col-span-2">
              {data ? (
                <BarChart
                  description="New accounts per month"
                  seriesLabel="Sign-ups"
                  labels={data.signupsByMonth.map((entry) => monthLabel(entry.month))}
                  values={data.signupsByMonth.map((entry) => entry.count)}
                />
              ) : (
                <Skeleton className="h-64" />
              )}
            </Card>
            <Card title="Users by role">
              {data ? (
                <DoughnutChart
                  description="Users by role"
                  labels={data.usersByRole.map((entry) => ROLE_LABELS[entry.role])}
                  values={data.usersByRole.map((entry) => entry.count)}
                />
              ) : (
                <Skeleton className="h-64" />
              )}
            </Card>
          </div>

          <Card title="Recent activity" description="The latest entries in the audit log">
            {data ? <RecentActivity items={data.recentActivity} /> : <Skeleton className="h-40" />}
          </Card>
        </>
      )}
    </>
  );
}
