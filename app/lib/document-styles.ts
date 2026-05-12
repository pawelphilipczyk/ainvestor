import { remixUiThemeBridgeCss } from './remix-ui-theme-bridge.ts'

/**
 * Base CSS variables for light/dark themes. Inlined in document shell style tag.
 */
export const baseCss = `@layer base {
  /* Prevent rare wide descendants (tables, pre) from growing the viewport width. */
  html {
    max-width: 100%;
    overflow-x: hidden;
  }

  body {
    max-width: 100%;
    overflow-x: hidden;
  }

  @view-transition {
    navigation: auto;
  }

  ::view-transition-group(section-portfolio),
  ::view-transition-group(section-advice),
  ::view-transition-group(section-catalog),
  ::view-transition-group(section-guidelines) {
    animation-duration: 0.45s;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }

  ::view-transition-old(section-portfolio),
  ::view-transition-new(section-portfolio),
  ::view-transition-old(section-advice),
  ::view-transition-new(section-advice),
  ::view-transition-old(section-catalog),
  ::view-transition-new(section-catalog),
  ::view-transition-old(section-guidelines),
  ::view-transition-new(section-guidelines) {
    animation-name: section-intro-crossfade;
  }

  @keyframes section-intro-crossfade {
    from {
      opacity: 0.85;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }

${remixUiThemeBridgeCss}

  /* Default textarea min width follows cols (~20ch); cap to container on narrow viewports. */
  textarea {
    min-width: 0;
    max-width: 100%;
  }

  /* Busy state for submit buttons without .submit-button-busy-overlay (innerHTML swap). */
  html:not(.dark) button[type='submit'][aria-busy='true']:not(:has(.submit-button-busy-overlay)),
  html:not(.dark) input[type='submit'][aria-busy='true'] {
    background-color: hsl(var(--foreground));
    color: hsl(var(--muted-foreground));
    border-color: hsl(var(--border));
    border-width: 1px;
    border-style: solid;
  }

  html.dark button[type='submit'][aria-busy='true']:not(:has(.submit-button-busy-overlay)),
  html.dark input[type='submit'][aria-busy='true'] {
    background-color: hsl(var(--card));
    color: hsl(var(--muted-foreground));
    border-color: hsl(var(--border));
    border-width: 1px;
    border-style: solid;
  }

  button[type='submit'][aria-busy='true'] .submit-button-busy-label,
  input[type='submit'][aria-busy='true'] .submit-button-busy-label {
    color: hsl(var(--muted-foreground));
  }

  /* Closed native dialogs must stay hidden if Tailwind sets display on dialog. */
  dialog:not([open]) {
    display: none !important;
  }

  /*
   * Busy overlay for buttons/links (SubmitButton, Link, client fetch CTAs).
   * Defined here so Tailwind CDN always applies it; group-data loading variants from TS
   * constants are often not generated when classes are composed outside scanned HTML.
   */
  .busy-control-overlay {
    display: none;
  }

  .busy-control-root[data-loading] {
    pointer-events: none;
    opacity: 0.9;
  }

  .busy-control-root[data-loading] .busy-control-label {
    visibility: hidden;
  }

  .busy-control-root[data-loading] .busy-control-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
`
