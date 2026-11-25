import { act, renderHook } from '@testing-library/react';
import { useCopyToClipboard } from './useCopyToClipboard';
import { useDebounce } from './useDebounce';
import { useDisclosure } from './useDisclosure';
import { useLocalStorage } from './useLocalStorage';
import { useMediaQuery } from './useMediaQuery';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('useDebounce', () => {
  it('only updates after the value has been stable for the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');

    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('abc');
  });
});

describe('useDisclosure', () => {
  it('opens, closes and toggles', () => {
    const { result } = renderHook(() => useDisclosure());
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
  });

  it('starts open when asked and keeps its callbacks stable', () => {
    const { result, rerender } = renderHook(() => useDisclosure(true));
    const first = result.current;

    rerender();

    expect(first.isOpen).toBe(true);
    expect(result.current.open).toBe(first.open);
    expect(result.current.close).toBe(first.close);
    expect(result.current.toggle).toBe(first.toggle);
  });
});

describe('useLocalStorage', () => {
  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('theme', 'light'));

    expect(result.current[0]).toBe('light');
  });

  it('reads an existing value', () => {
    window.localStorage.setItem('theme', JSON.stringify('dark'));

    const { result } = renderHook(() => useLocalStorage('theme', 'light'));

    expect(result.current[0]).toBe('dark');
  });

  it('writes values and updater results as JSON', () => {
    const { result } = renderHook(() => useLocalStorage('count', 1));

    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(window.localStorage.getItem('count')).toBe('5');

    act(() => result.current[1]((current) => current + 1));
    expect(result.current[0]).toBe(6);
    expect(window.localStorage.getItem('count')).toBe('6');
  });

  it('removes the value and falls back to the initial one', () => {
    const { result } = renderHook(() => useLocalStorage('count', 1));
    act(() => result.current[1](5));

    act(() => result.current[2]());

    expect(result.current[0]).toBe(1);
    expect(window.localStorage.getItem('count')).toBeNull();
  });

  it('falls back to the initial value when the stored JSON is corrupt', () => {
    window.localStorage.setItem('count', '{not json');

    const { result } = renderHook(() => useLocalStorage('count', 1));

    expect(result.current[0]).toBe(1);
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useLocalStorage('theme', 'light'));

    act(() => {
      window.localStorage.setItem('theme', JSON.stringify('dark'));
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
    });

    expect(result.current[0]).toBe('dark');
  });
});

describe('useMediaQuery', () => {
  function stubMatchMedia(initial: boolean) {
    let matches = initial;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        get matches() {
          return matches;
        },
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      })),
    );
    return {
      set(next: boolean) {
        matches = next;
        listeners.forEach((listener) => listener());
      },
      listeners,
    };
  }

  it('reports whether the query matches and follows changes', () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

describe('useCopyToClipboard', () => {
  it('copies text and resets `copied` after the delay', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { result } = renderHook(() => useCopyToClipboard(1000));

    let ok = false;
    await act(async () => {
      ok = await result.current.copy('hello');
    });

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.copied).toBe(false);
  });

  it('returns false when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { result } = renderHook(() => useCopyToClipboard());

    let ok = true;
    await act(async () => {
      ok = await result.current.copy('hello');
    });

    expect(ok).toBe(false);
    expect(result.current.copied).toBe(false);
  });
});
