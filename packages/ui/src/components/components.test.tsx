import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { axe } from '../test/axe';
import { Alert } from './Alert';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Checkbox } from './Checkbox';
import { DatePicker } from './DatePicker';
import { DropdownMenu } from './DropdownMenu';
import { EmptyState } from './EmptyState';
import { RichTextEditor } from './RichTextEditor';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { Switch } from './Switch';
import { Tabs } from './Tabs';
import { Textarea } from './Textarea';

describe('Alert', () => {
  it('interrupts for problems and waits for everything else', () => {
    const { rerender } = render(<Alert tone="danger" title="Payment failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Payment failed');

    rerender(<Alert tone="success" title="Payment received" />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment received');
  });

  it('shows a dismiss button only when it can be dismissed', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Alert title="Heads up" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<Alert title="Heads up" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Avatar', () => {
  it('shows initials when there is no image', () => {
    render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
  });

  it('falls back to initials when the image fails to load', () => {
    render(<Avatar name="Grace" src="https://example.com/missing.png" />);
    const image = screen.getByRole('img', { name: 'Grace' });
    expect(image).toHaveAttribute('src', 'https://example.com/missing.png');

    fireEvent.error(image);

    expect(screen.getByRole('img', { name: 'Grace' })).toHaveTextContent('G');
  });
});

describe('Spinner', () => {
  it('announces its label', () => {
    render(<Spinner label="Loading invoices" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading invoices');
  });
});

describe('Checkbox and Switch', () => {
  function Example() {
    const [agreed, setAgreed] = useState(false);
    const [enabled, setEnabled] = useState(false);
    return (
      <>
        <Checkbox
          checked={agreed}
          onChange={setAgreed}
          label="I agree"
          description="To the terms of service."
        />
        <Switch checked={enabled} onChange={setEnabled} label="Email alerts" />
      </>
    );
  }

  it('toggle from their labels and the keyboard', async () => {
    render(<Example />);
    const checkbox = screen.getByRole('checkbox', { name: 'I agree' });
    const toggle = screen.getByRole('switch', { name: 'Email alerts' });
    expect(checkbox).toHaveAccessibleDescription('To the terms of service.');

    await userEvent.click(screen.getByText('I agree'));
    expect(checkbox).toBeChecked();

    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toBeChecked();
  });

  it('ignore input while disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="I agree" disabled />);

    await userEvent.click(screen.getByText('I agree'));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  const tabs = [
    { label: 'Profile', content: 'Profile settings' },
    { label: 'Billing', content: 'Billing settings' },
    { label: 'Audit', content: 'Audit log', disabled: true },
  ];

  it('shows the panel of the selected tab', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Profile settings');

    await userEvent.click(screen.getByRole('tab', { name: 'Billing' }));

    expect(onChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Billing settings');
  });

  it('starts on defaultIndex and skips disabled tabs', async () => {
    render(<Tabs tabs={tabs} defaultIndex={1} />);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Billing settings');

    await userEvent.click(screen.getByRole('tab', { name: 'Audit' }));

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Billing settings');
  });
});

describe('DropdownMenu', () => {
  it('opens and runs the chosen item', async () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <DropdownMenu
        label="Actions"
        items={[
          { label: 'Rename', onSelect: onRename },
          { label: 'Delete', onSelect: onDelete, danger: true },
        ]}
      />,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('DatePicker', () => {
  it('shows the formatted value under its label', () => {
    render(<DatePicker label="Start date" value={new Date(2026, 2, 5)} onChange={() => {}} />);

    expect(screen.getByLabelText('Start date')).toHaveValue('Mar 5, 2026');
  });

  it('reports a day picked from the calendar', async () => {
    const onChange = vi.fn();
    render(<DatePicker label="Start date" value={new Date(2026, 2, 5)} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Start date'));
    await userEvent.click(await screen.findByRole('gridcell', { name: /March 20th, 2026/ }));

    const picked = onChange.mock.calls.at(-1)?.[0] as Date;
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2026, 2, 20]);
  });

  it('marks the input invalid and describes it with the error', () => {
    render(<DatePicker label="Start date" value={null} onChange={() => {}} error="Pick a date." />);

    const input = screen.getByLabelText('Start date');
    expect(input).toHaveAttribute('placeholder', 'Select a date');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Pick a date.');
  });
});

describe('RichTextEditor', () => {
  it('renders the value in a labelled textbox', () => {
    render(
      <RichTextEditor
        label="Notes"
        value="<p>Hello <strong>team</strong></p>"
        onChange={() => {}}
      />,
    );

    const editor = screen.getByRole('textbox', { name: 'Notes' });
    expect(editor).toHaveTextContent('Hello team');
    expect(editor.querySelector('strong')).toHaveTextContent('team');
  });

  it('reports HTML when a toolbar command changes the document', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="Notes" value="<p>Hello</p>" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Heading 2' }));

    expect(onChange).toHaveBeenLastCalledWith('<h2>Hello</h2>');
    expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('follows a new value from the parent without reporting it back', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RichTextEditor label="Notes" value="<p>One</p>" onChange={onChange} />,
    );

    rerender(<RichTextEditor label="Notes" value="<p>Two</p>" onChange={onChange} />);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveTextContent('Two'),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the placeholder only while empty', () => {
    const { rerender } = render(
      <RichTextEditor label="Notes" value="" placeholder="Write something…" onChange={() => {}} />,
    );
    expect(screen.getByText('Write something…')).toBeInTheDocument();

    rerender(
      <RichTextEditor
        label="Notes"
        value="<p>Hi</p>"
        placeholder="Write something…"
        onChange={() => {}}
      />,
    );
    return waitFor(() => expect(screen.queryByText('Write something…')).not.toBeInTheDocument());
  });

  it('hides the toolbar and locks the document when not editable', () => {
    render(
      <RichTextEditor label="Notes" value="<p>Hello</p>" editable={false} onChange={() => {}} />,
    );

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
  });
});

describe('accessibility', () => {
  it('display components have no violations', async () => {
    const { container } = render(
      <main>
        <Alert tone="warning" title="Trial ends soon" onDismiss={() => {}}>
          Add a payment method to keep your workspace.
        </Alert>
        <Card title="Team" description="People with access." actions={<Button>Invite</Button>}>
          <Badge tone="success">Active</Badge>
          <Avatar name="Ada Lovelace" />
          <Spinner />
          <Skeleton className="h-4 w-32" />
        </Card>
        <EmptyState
          title="No projects yet"
          description="Create one to get started."
          action={<Button>New project</Button>}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('form and navigation components have no violations', async () => {
    const { baseElement } = render(
      <main>
        <Checkbox checked onChange={() => {}} label="I agree" description="To the terms." />
        <Switch checked={false} onChange={() => {}} label="Email alerts" />
        <label htmlFor="bio">Bio</label>
        <Textarea id="bio" />
        <DatePicker label="Start date" value={null} onChange={() => {}} />
        <RichTextEditor label="Notes" value="<p>Hello</p>" onChange={() => {}} />
        <Tabs
          tabs={[
            { label: 'Profile', content: 'Profile settings' },
            { label: 'Billing', content: 'Billing settings' },
          ]}
        />
        <DropdownMenu label="Actions" items={[{ label: 'Rename', onSelect: () => {} }]} />
      </main>,
    );

    expect(await axe(baseElement)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
