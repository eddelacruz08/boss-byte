import { Card, Tabs } from '@bossbyte/ui';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { ChangePasswordForm } from '@/features/settings/ChangePasswordForm';
import { PasskeysPanel } from '@/features/settings/PasskeysPanel';
import { ProfileForm } from '@/features/settings/ProfileForm';
import { TwoFactorPanel } from '@/features/settings/TwoFactorPanel';

export const Route = createFileRoute('/_authenticated/settings')({ component: SettingsPage });

function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile and how you sign in." />
      <Tabs
        tabs={[
          {
            label: 'Profile',
            content: (
              <Card title="Profile" description="How you appear to other people here.">
                <ProfileForm />
              </Card>
            ),
          },
          {
            label: 'Password',
            content: (
              <Card title="Change password">
                <ChangePasswordForm />
              </Card>
            ),
          },
          {
            label: 'Two-factor',
            content: (
              <Card title="Two-factor authentication">
                <TwoFactorPanel />
              </Card>
            ),
          },
          {
            label: 'Passkeys',
            content: (
              <Card title="Passkeys">
                <PasskeysPanel />
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
