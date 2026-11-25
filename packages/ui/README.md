# @bossbyte/ui

BossByte UI is the in-house React component library: accessible components, a few hooks and
date helpers, styled with Tailwind CSS 4.

It is an internal package with no build step. Apps import the TypeScript source directly and
their own bundler compiles it.

## Use it in an app

1. Add the dependency to the app's `package.json`:

   ```json
   { "dependencies": { "@bossbyte/ui": "*" } }
   ```

2. Import the stylesheet once, after Tailwind, in the app's main CSS file:

   ```css
   @import 'tailwindcss';
   @import '@bossbyte/ui/styles.css';
   ```

   The stylesheet defines the `brand` colour scale, tells Tailwind to scan this package for
   class names, and styles the date picker and rich text content. Nothing else needs
   configuring.

3. Import what you need:

   ```tsx
   import { Button, Modal, TextField, useDisclosure } from '@bossbyte/ui';

   export function InviteButton() {
     const invite = useDisclosure();

     return (
       <>
         <Button onClick={invite.open}>Invite teammate</Button>
         <Modal
           open={invite.isOpen}
           onClose={invite.close}
           title="Invite a teammate"
           footer={<Button onClick={invite.close}>Send invite</Button>}
         >
           <TextField label="Email" type="email" />
         </Modal>
       </>
     );
   }
   ```

Toasts need a provider near the root of the app:

```tsx
import { ToastProvider, useToast } from '@bossbyte/ui';

// In the root layout
<ToastProvider>{children}</ToastProvider>;

// Anywhere below it
const { toast } = useToast();
toast({ title: 'Saved', tone: 'success' });
```

## What is in the box

| Group      | Exports                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Forms      | `Button` `Input` `Textarea` `FormField` `TextField` `Select` `Checkbox` `Switch` `DatePicker` `RichTextEditor` |
| Overlays   | `Modal` `ConfirmDialog` `DropdownMenu` `ToastProvider` `useToast`                                              |
| Navigation | `Tabs` `Pagination`                                                                                            |
| Display    | `Badge` `Card` `Alert` `Spinner` `Skeleton` `Avatar` `EmptyState` `DataTable`                                  |
| Hooks      | `useDebounce` `useDisclosure` `useLocalStorage` `useMediaQuery` `useCopyToClipboard`                           |
| Utilities  | `cn` `formatDate` `formatDateTime` `formatRelativeTime` `isValidDate` `paginationRange`                        |

Every component exports its props type as `<Name>Props`.

Two things to know:

- `RichTextEditor` reads and writes HTML. Sanitise that HTML before rendering it outside the
  editor.
- `DatePicker` takes a date-fns format string in `dateFormat`, while `formatDate` takes a dayjs
  one. They differ for days and years: `MMM d, yyyy` versus `MMM D, YYYY`.

## Add a component

1. Create `src/components/Thing.tsx`. Export the component and its `ThingProps` as named
   exports. A component file exports only components and types; hooks, constants and helpers go
   in their own files so fast refresh keeps working.
2. Style it with Tailwind utilities and merge the caller's `className` last with `cn()`.
   Reuse the shared class strings in `src/lib/control.ts` for inputs and focus rings.
3. Build interactive behaviour on Headless UI where it has a primitive, so keyboard and
   screen reader support come with it. Accept `ref` as an ordinary prop.
4. Add `src/components/Thing.test.tsx` next to it. Test the behaviour through roles and
   labels, and finish with an axe check:

   ```tsx
   import { axe } from '../test/axe';

   expect(await axe(container)).toHaveNoViolations();
   ```

5. Export the component and its props type from `src/index.ts`.

## Scripts

Run these from `packages/ui`, or for the whole repo with `turbo`:

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
```

Tests run in jsdom, which has no layout or painting. Colour contrast and anything that depends
on measured sizes are not covered here and need checking in a browser.
