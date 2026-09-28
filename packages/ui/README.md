# `@lister/ui`

Shared React component layer for Lister, generated with the
[shadcn](https://ui.shadcn.com) CLI and built on
[Base UI](https://base-ui.com) primitives.

- Style: `base-luma` (shadcn preset [`b51GFh7y6`](https://ui.shadcn.com/create?preset=b51GFh7y6))
- Base color: `mist`, chart/theme color: `rose`
- Font: [Public Sans](https://fontsource.org/fonts/public-sans) (variable)
- Icons: [Phosphor](https://phosphoricons.com)
- Tailwind CSS v4 (CSS-first configuration, no `tailwind.config.*`)

The package ships TypeScript source, not built artifacts: `main` and every
subpath export point into `src/`, and consumers bundle the components with
their own tooling (for example Vite).

## Requirements

- React 19 (`react` and `react-dom` are peer dependencies; the consuming app
  owns the runtime)
- Tailwind CSS v4 in the consuming app

## Consuming the package

### 1. Install

Inside this repository (Bun workspace):

```jsonc
// apps/<app>/package.json
{
  "dependencies": {
    "@lister/ui": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

Then run `bun install` from the repository root.

### 2. Extend Tailwind with the package theme

The app's Tailwind entry imports Tailwind itself first, then the package theme,
then registers the package source directory so Tailwind scans the generated
component class names:

```css
/* apps/<app>/src/styles.css */
@import "tailwindcss";
@import "@lister/ui/styles/globals";
@source "../../../packages/ui/src";
```

Adjust `@source` so it points at `packages/ui/src` relative to the CSS file.
Import the style with the `@lister/ui/styles/globals` specifier (no `.css`):
the package export map maps `./styles/*` to `./src/styles/*.css`.

To theme the app differently, override the CSS variables after the import:

```css
:root {
  --primary: oklch(0.55 0.2 250);
}

.dark {
  --primary: oklch(0.7 0.15 250);
}
```

### 3. Import components

Components are imported from their own modules:

```tsx
import { Button } from "@lister/ui/components/button";
import { Combobox } from "@lister/ui/components/combobox";
import { Input } from "@lister/ui/components/input";

export function SaveButton() {
  return <Button onClick={() => save()}>Save</Button>;
}
```

The package root exports the shared class-name helper:

```tsx
import { cn } from "@lister/ui";
```

## Components

| Import | Exports |
| --- | --- |
| `@lister/ui/components/badge` | `Badge`, `badgeVariants` |
| `@lister/ui/components/button` | `Button`, `buttonVariants` |
| `@lister/ui/components/combobox` | `Combobox`, `ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`, `ComboboxGroup`, `ComboboxLabel`, `ComboboxCollection`, `ComboboxEmpty`, `ComboboxSeparator`, `ComboboxChips`, `ComboboxChip`, `ComboboxChipsInput`, `ComboboxTrigger`, `ComboboxValue`, `useComboboxAnchor` |
| `@lister/ui/components/dialog` | `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger` |
| `@lister/ui/components/input` | `Input` |
| `@lister/ui/components/input-group` | `InputGroup`, `InputGroupAddon`, `InputGroupButton`, `InputGroupInput`, `InputGroupText`, `InputGroupTextarea` |
| `@lister/ui/components/popover` | `Popover`, `PopoverContent`, `PopoverDescription`, `PopoverHeader`, `PopoverTitle`, `PopoverTrigger` |
| `@lister/ui/components/select` | `Select`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectLabel`, `SelectScrollDownButton`, `SelectScrollUpButton`, `SelectSeparator`, `SelectTrigger`, `SelectValue` |
| `@lister/ui/components/skeleton` | `Skeleton` |
| `@lister/ui/components/table` | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` |
| `@lister/ui/components/textarea` | `Textarea` |
| `@lister/ui/components/toast` | `Toaster`, `Toast`, `ToastAction`, `ToastClose`, `ToastContent`, `ToastDescription`, `ToastPortal`, `ToastProvider`, `ToastTitle`, `ToastViewport`, `createToastManager`, `toast`, `useToastManager` |

`input-group` and `textarea` were installed as registry dependencies of the
requested components.

## Regenerating components

`components.json` in this directory configures the shadcn CLI. From the
repository root:

```sh
bunx shadcn@latest add <component> --yes -c packages/ui
```

The CLI verifies the framework before writing files. This package has no
framework config of its own, so create a temporary `packages/ui/vite.config.ts`
(for example `export default {};`) before running the CLI and delete it
afterwards. Applying the original preset again:

```sh
bunx shadcn@latest preset decode b51GFh7y6 --json
bunx shadcn@latest apply b51GFh7y6 --yes -c packages/ui
```

## Tests

```sh
# from the repository root
bun test packages/ui
```

Tests use Bun's test runner, `happy-dom` (via `@happy-dom/global-registrator`)
and `@testing-library/react`. Because Bun reads JSX configuration from the
process working directory and the repository root `tsconfig.json` uses the
server-side classic factory `Html.createElement`,
`src/test/jsx-factory.ts` registers a React-backed `Html` global for tests.
Run tests from this directory (`cd packages/ui && bun test`) to use this
package's own `jsx: react-jsx` configuration instead.
