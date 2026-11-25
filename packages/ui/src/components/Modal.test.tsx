import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test/axe';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Invite a teammate">
        Body
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog named by its title and described by its description', () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="Invite a teammate"
        description="They get an email with a link."
        footer={<Button>Send invite</Button>}
      >
        Body
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Invite a teammate' });
    expect(dialog).toHaveAccessibleDescription('They get an email with a link.');
    expect(dialog).toHaveTextContent('Body');
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeInTheDocument();
  });

  it('closes from the close button and from Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Invite a teammate">
        Body
      </Modal>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('unmounts once closed', async () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Invite a teammate">
        Body
      </Modal>,
    );

    rerender(
      <Modal open={false} onClose={() => {}} title="Invite a teammate">
        Body
      </Modal>,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('has no accessibility violations', async () => {
    const { baseElement } = render(
      <Modal
        open
        onClose={() => {}}
        title="Invite a teammate"
        description="They get an email with a link."
        footer={<Button>Send invite</Button>}
      >
        Body
      </Modal>,
    );

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('ConfirmDialog', () => {
  it('confirms and cancels', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete project?"
        message="This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Delete project?' })).toHaveTextContent(
      'This cannot be undone.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open and busy while loading', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        loading
        onClose={onClose}
        onConfirm={() => {}}
        title="Delete project?"
        message="This cannot be undone."
      />,
    );

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
