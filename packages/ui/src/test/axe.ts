import { configureAxe } from 'vitest-axe';

export const axe = configureAxe({
  rules: {
    // jsdom does not paint, so there is no contrast to measure; check it in the browser.
    'color-contrast': { enabled: false },
    // Components are rendered on their own here, not inside a page's landmarks.
    region: { enabled: false },
  },
});
