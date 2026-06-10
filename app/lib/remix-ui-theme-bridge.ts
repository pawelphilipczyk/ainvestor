/**
 * Re-maps `--rmx-*` after `RMX_01.Style` so Remix UI primitives track the same HSL
 * semantic tokens as Tailwind utilities (`:root` / `.dark` in `document-styles.ts`).
 * Required because the RMX preset uses fixed light hex values while this app switches
 * palettes via `html.dark` + CSS variables.
 */
export const remixUiThemeBridgeCss = `
  :root {
    --rmx-control-height-sm: 2.25rem;

    --rmx-color-text-primary: hsl(var(--foreground));
    --rmx-color-text-secondary: hsl(var(--muted-foreground));
    --rmx-color-text-muted: hsl(var(--muted-foreground));
    --rmx-color-text-link: hsl(var(--primary));

    --rmx-color-border-subtle: hsl(var(--border));
    --rmx-color-border-default: hsl(var(--border));
    --rmx-color-border-strong: hsl(var(--border));

    --rmx-color-focus-ring: hsl(var(--ring));

    --rmx-surface-lvl0: hsl(var(--background));
    --rmx-surface-lvl1: hsl(var(--card));
    --rmx-surface-lvl2: hsl(var(--muted));
    --rmx-surface-lvl3: hsl(var(--accent));
    --rmx-surface-lvl4: hsl(var(--accent));

    --rmx-color-action-primary-background: hsl(var(--primary));
    --rmx-color-action-primary-background-hover: hsl(var(--primary) / 0.9);
    --rmx-color-action-primary-background-active: hsl(var(--primary) / 0.82);
    --rmx-color-action-primary-foreground: hsl(var(--primary-foreground));
    --rmx-color-action-primary-border: hsl(var(--primary));

    --rmx-color-action-secondary-background: hsl(var(--card));
    --rmx-color-action-secondary-background-hover: hsl(var(--accent));
    --rmx-color-action-secondary-background-active: hsl(var(--accent));
    --rmx-color-action-secondary-foreground: hsl(var(--accent-foreground));
    --rmx-color-action-secondary-border: hsl(var(--border));

    --rmx-color-action-danger-background: hsl(0 84.2% 60.2%);
    --rmx-color-action-danger-background-hover: hsl(0 84.2% 52%);
    --rmx-color-action-danger-background-active: hsl(0 84.2% 46%);
    --rmx-color-action-danger-foreground: hsl(0 0% 100%);
    --rmx-color-action-danger-border: hsl(0 84.2% 60.2%);
  }
`
