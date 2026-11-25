import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test/axe';
import { paginationRange } from '../lib/pagination-range';
import { Pagination } from './Pagination';

describe('paginationRange', () => {
  it('lists every page when they all fit', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses the far side near the start', () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 'ellipsis-end', 10]);
    expect(paginationRange(3, 10)).toEqual([1, 2, 3, 4, 'ellipsis-end', 10]);
  });

  it('collapses both sides in the middle', () => {
    expect(paginationRange(5, 10)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 10]);
  });

  it('collapses the near side at the end', () => {
    expect(paginationRange(10, 10)).toEqual([1, 'ellipsis-start', 9, 10]);
  });

  it('clamps out-of-range input', () => {
    expect(paginationRange(99, 3)).toEqual([1, 2, 3]);
    expect(paginationRange(0, 0)).toEqual([1]);
  });
});

describe('Pagination', () => {
  it('marks the current page', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 3' })).not.toHaveAttribute('aria-current');
  });

  it('moves with the page, previous and next buttons', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(onPageChange.mock.calls).toEqual([[4], [1], [3]]);
  });

  it('disables previous on the first page and next on the last', () => {
    const { rerender } = render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();

    rerender(<Pagination page={3} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('hides distant pages behind ellipses', () => {
    render(<Pagination page={10} totalPages={20} onPageChange={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Page 5' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Pagination page={10} totalPages={20} onPageChange={() => {}} />);

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
