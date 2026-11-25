import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { axe } from '../test/axe';
import { Select, type SelectOption } from './Select';

type Role = 'admin' | 'editor' | 'viewer';

const options: SelectOption<Role>[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer', disabled: true },
];

function ControlledSelect({ onChange }: { onChange?: (value: Role) => void }) {
  const [value, setValue] = useState<Role | null>(null);
  return (
    <Select
      label="Role"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Select', () => {
  it('shows the placeholder until a value is chosen', () => {
    render(
      <Select
        label="Role"
        placeholder="Pick a role"
        options={options}
        value={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /Role/ })).toHaveTextContent('Pick a role');
  });

  it('shows the label of the selected option', () => {
    render(<Select label="Role" options={options} value="editor" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: /Role/ })).toHaveTextContent('Editor');
  });

  it('selects an option with the mouse', async () => {
    const onChange = vi.fn();
    render(<ControlledSelect onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Role/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Editor' }));

    expect(onChange).toHaveBeenCalledWith('editor');
    expect(screen.getByRole('button', { name: /Role/ })).toHaveTextContent('Editor');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects an option with the keyboard', async () => {
    const onChange = vi.fn();
    render(<ControlledSelect onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('editor');
  });

  it('does not select disabled options', async () => {
    const onChange = vi.fn();
    render(<ControlledSelect onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Role/ }));
    const viewer = screen.getByRole('option', { name: 'Viewer' });
    expect(viewer).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(viewer);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the error and describes the control with it', () => {
    render(
      <Select
        label="Role"
        options={options}
        value={null}
        onChange={() => {}}
        error="Choose a role."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a role.');
    expect(screen.getByRole('button', { name: /Role/ })).toHaveAccessibleDescription(
      'Choose a role.',
    );
  });

  it('cannot be opened while disabled', async () => {
    render(<Select label="Role" options={options} value={null} onChange={() => {}} disabled />);

    await userEvent.click(screen.getByRole('button', { name: /Role/ }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('has no accessibility violations, closed or open', async () => {
    const { baseElement } = render(<ControlledSelect />);
    expect(await axe(baseElement)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: /Role/ }));
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
