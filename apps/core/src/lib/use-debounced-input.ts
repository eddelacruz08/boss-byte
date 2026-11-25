import { useDebounce } from '@bossbyte/ui';
import { useEffect, useEffectEvent, useState } from 'react';

/**
 * State for a text input whose value lives somewhere slower than a keystroke,
 * typically a URL search param. The input updates at once; `onCommit` runs
 * with the trimmed text when typing pauses.
 *
 * `committed` may also change from outside (the back button, a "clear
 * filters" link) and the input follows it.
 *
 * @example
 *   const [text, setText] = useDebouncedInput(search.q, (q) =>
 *     navigate({ search: (prev) => ({ ...prev, q, page: 1 }), replace: true }),
 *   );
 *   <input value={text} onChange={(event) => setText(event.target.value)} />
 */
export function useDebouncedInput(
  committed: string,
  onCommit: (value: string) => void,
  delayMs = 300,
): [string, (text: string) => void] {
  const [text, setText] = useState(committed);
  const debounced = useDebounce(text.trim(), delayMs);

  const [seen, setSeen] = useState(committed);
  if (committed !== seen) {
    setSeen(committed);
    // Our own commit arriving back must not overwrite what was typed since.
    if (committed !== debounced) setText(committed);
  }

  const commit = useEffectEvent((value: string) => {
    if (value !== committed) onCommit(value);
  });
  useEffect(() => commit(debounced), [debounced]);

  return [text, setText];
}
