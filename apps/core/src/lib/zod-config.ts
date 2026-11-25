import { z } from 'zod';

/**
 * Zod speeds up object parsing by compiling validators with `new Function`,
 * and probes for it when the first object schema is defined. The dashboard's
 * Content-Security-Policy forbids eval, so the probe would be reported as a
 * violation on every page load. `jitless` skips it; form-sized payloads do not
 * need the fast path.
 *
 * This has to run before any schema is defined, which is why main.tsx imports
 * it and only then loads the rest of the app.
 */
z.config({ jitless: true });
