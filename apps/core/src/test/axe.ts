import { configureAxe } from 'vitest-axe';

/**
 * axe for component tests. Two rules are off because they cannot give a
 * meaningful answer here: jsdom does no layout or painting (colour contrast),
 * and a component rendered on its own has no page landmarks around it (region).
 *
 * @example
 *   const { container } = render(<LoginForm onSignedIn={vi.fn()} />);
 *   expect(await axe(container)).toHaveNoViolations();
 */
export const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});
