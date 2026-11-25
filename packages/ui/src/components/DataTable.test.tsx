import { render, screen, within } from '@testing-library/react';
import { axe } from '../test/axe';
import { DataTable, type DataTableColumn } from './DataTable';

interface Member {
  id: string;
  name: string;
  seats: number;
}

const members: Member[] = [
  { id: 'm1', name: 'Ada Lovelace', seats: 3 },
  { id: 'm2', name: 'Grace Hopper', seats: 12 },
];

const columns: DataTableColumn<Member>[] = [
  { key: 'name', header: 'Name', cell: (member) => member.name },
  { key: 'seats', header: 'Seats', align: 'right', cell: (member) => member.seats },
];

describe('DataTable', () => {
  it('renders a header per column and a row per item', () => {
    render(
      <DataTable columns={columns} rows={members} rowKey={(member) => member.id} caption="Team" />,
    );

    expect(screen.getByRole('table', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
      'Seats',
    ]);

    const [, ...bodyRows] = screen.getAllByRole('row');
    expect(bodyRows).toHaveLength(2);
    const firstRow = bodyRows[0];
    if (!firstRow) throw new Error('expected a body row');
    expect(
      within(firstRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Ada Lovelace', '3']);
  });

  it('applies column alignment to header and cells', () => {
    render(<DataTable columns={columns} rows={members} rowKey={(member) => member.id} />);

    expect(screen.getByRole('columnheader', { name: 'Seats' })).toHaveClass('text-right');
    expect(screen.getByRole('cell', { name: '12' })).toHaveClass('text-right');
  });

  it('shows the empty message across all columns when there are no rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(member) => member.id}
        emptyMessage="No members yet."
      />,
    );

    const cell = screen.getByRole('cell', { name: 'No members yet.' });
    expect(cell).toHaveAttribute('colspan', '2');
  });

  it('shows skeleton rows instead of data while loading', () => {
    render(<DataTable columns={columns} rows={members} rowKey={(member) => member.id} loading />);

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 5);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <DataTable columns={columns} rows={members} rowKey={(member) => member.id} caption="Team" />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
