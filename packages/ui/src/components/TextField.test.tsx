import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test/axe';
import { TextField } from './TextField';

describe('TextField', () => {
  it('associates the label with the input', async () => {
    const onChange = vi.fn();
    render(<TextField label="Email" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');

    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co');
    expect(onChange).toHaveBeenCalled();
  });

  it('describes the input with the hint', () => {
    render(<TextField label="Email" hint="We never share it." />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('We never share it.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows the error instead of the hint and marks the input invalid', () => {
    render(<TextField label="Email" hint="We never share it." error="Enter a valid email." />);

    const input = screen.getByLabelText('Email');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Enter a valid email.');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email.');
    expect(screen.queryByText('We never share it.')).not.toBeInTheDocument();
  });

  it('uses the id it is given', () => {
    render(<TextField id="email" label="Email" error="Required." />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'email-error');
  });

  it('marks required fields', () => {
    render(<TextField label="Email" required />);

    expect(screen.getByRole('textbox', { name: /Email/ })).toBeRequired();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <TextField label="Name" hint="As shown on your ID." />
        <TextField label="Email" type="email" required error="Enter a valid email." />
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
