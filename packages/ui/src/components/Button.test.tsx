import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test/axe';
import { Button } from './Button';

describe('Button', () => {
  it('renders a button that does not submit forms by default', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('blocks clicks and reports busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });

    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('swaps the left icon for a spinner while loading', () => {
    const { rerender } = render(<Button leftIcon={<span data-testid="icon" />}>Save</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(
      <Button loading leftIcon={<span data-testid="icon" />}>
        Save
      </Button>,
    );
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('lets className override the variant classes', () => {
    render(<Button className="bg-emerald-600">Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('bg-emerald-600');
    expect(button).not.toHaveClass('bg-brand-600');
  });

  it('forwards the ref and native attributes', () => {
    let node: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(element) => {
          node = element;
        }}
        type="submit"
        name="intent"
      >
        Save
      </Button>,
    );

    expect(node).toBe(screen.getByRole('button', { name: 'Save' }));
    expect(node).toHaveAttribute('type', 'submit');
    expect(node).toHaveAttribute('name', 'intent');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <Button>Save</Button>
        <Button variant="danger" loading>
          Delete
        </Button>
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
