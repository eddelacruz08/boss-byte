import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, expect } from 'vitest';
// `vitest-axe/matchers` is typed as `export type *`, so the matcher value is
// only importable from the dist file.
import { toHaveNoViolations, type AxeMatchers } from 'vitest-axe/dist/matchers.js';

expect.extend({ toHaveNoViolations });

// vitest-axe 0.1 augments the `Vi` namespace, which Vitest 4 no longer reads,
// so `toHaveNoViolations` is declared on Vitest's own interfaces here.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

// Enter and exit animations finish at once, so tests never wait on them.
MotionGlobalConfig.skipAnimations = true;

// jsdom has no layout engine; Headless UI's anchored popovers ask for these.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// axe probes a canvas to spot icon fonts; jsdom has none and logs on every call.
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
});
