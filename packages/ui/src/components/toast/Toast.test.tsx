import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test/axe';
import { ToastProvider } from './ToastProvider';
import type { ToastOptions } from './toast-context';
import { useToast } from './useToast';

function Trigger({ options }: { options: ToastOptions }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(options)}>
      Notify
    </button>
  );
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast with its title and description', async () => {
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Saved', description: 'Your changes are live.' }} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Saved');
    expect(toast).toHaveTextContent('Your changes are live.');
  });

  it('announces danger toasts as alerts', async () => {
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Upload failed', tone: 'danger' }} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
  });

  it('stacks several toasts', async () => {
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Saved' }} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('dismisses from the dismiss button', async () => {
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Saved', durationMs: 0 }} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('dismisses itself after its duration', async () => {
    // Only the timeout is faked, so the exit animation still runs on real frames.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Saved', durationMs: 3000 }} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('keeps a toast with a duration of 0 until dismissed', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Saved', durationMs: 0 }} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { baseElement } = render(
      <ToastProvider>
        <Trigger options={{ title: 'Saved', description: 'Your changes are live.' }} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('useToast', () => {
  it('throws outside a ToastProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Trigger options={{ title: 'Saved' }} />)).toThrow(
      'useToast must be used within a <ToastProvider>',
    );

    consoleError.mockRestore();
  });
});
