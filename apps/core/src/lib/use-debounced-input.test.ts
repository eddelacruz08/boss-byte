import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedInput } from './use-debounced-input';

function setup(initial = '') {
  const onCommit = vi.fn();
  const hook = renderHook(({ committed }) => useDebouncedInput(committed, onCommit, 300), {
    initialProps: { committed: initial },
  });
  const type = (text: string) => act(() => hook.result.current[1](text));
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  return { ...hook, onCommit, type, wait };
}

describe('useDebouncedInput', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('updates the input at once and commits when typing pauses', () => {
    const { result, onCommit, type, wait } = setup();

    type('a');
    wait(200);
    type('ad');
    wait(200);
    type('ada');

    expect(result.current[0]).toBe('ada');
    expect(onCommit).not.toHaveBeenCalled();

    wait(300);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('ada');
  });

  it('commits trimmed text, and nothing when only whitespace changed', () => {
    const { onCommit, type, wait } = setup('ada');

    type('ada  ');
    wait(300);
    expect(onCommit).not.toHaveBeenCalled();

    type('  grace ');
    wait(300);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('grace');
  });

  it('follows a value that changes from outside, such as the back button', () => {
    const { result, rerender, onCommit, wait } = setup('ada');

    rerender({ committed: '' });
    expect(result.current[0]).toBe('');

    wait(300);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps what was typed while its own commit was on the way back', () => {
    const { result, rerender, type, wait } = setup();

    type('ada');
    wait(300);
    type('ada l');
    // The URL catches up with the first commit after the user has typed more.
    rerender({ committed: 'ada' });

    expect(result.current[0]).toBe('ada l');
  });
});
