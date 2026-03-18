# UI Architecture Guidelines

## Purpose

Define the UI architecture for this project. The goal is to build a modern interface using web platform primitives, Tailwind CSS, and server-rendered UI components, while avoiding framework-specific UI systems such as React component libraries.

This architecture is designed to align with Remix v3's server-first philosophy.

---

## Core Principles

### 1. HTML-First UI

All UI must begin with semantic HTML.

Prefer built-in browser primitives whenever possible.

Use native elements such as:

- `<dialog>` for modals
- `<details>` / `<summary>` for accordions
- `<form>` and native inputs
- `<button>` for actions
- `<nav>`, `<header>`, `<section>`, `<article>` for layout
- Popover API (`popover`, `popovertarget`)

Avoid replacing native controls with custom implementations unless necessary.

### 2. Server-First Rendering

UI components should be rendered on the server whenever possible.

Pages should be fully usable when delivered as HTML without JavaScript.

JavaScript should only enhance interactivity.

This matches Remix's core design principles:

- server-rendered HTML
- progressive enhancement
- minimal client JavaScript

### 3. Progressive Enhancement

Interfaces must function with little or no JavaScript.

Enhancement layers:

1. HTML structure
2. Tailwind styling
3. Optional JavaScript behavior

The UI must remain usable if JavaScript fails.

---

## Styling Strategy

### Tailwind CSS

Tailwind is the primary styling solution.

Guidelines:

- Prefer utility classes
- Avoid large custom CSS files
- Extract repeated patterns into reusable components

Example:

```html
<button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
  Save
</button>
```

Global CSS should be minimal and primarily support Tailwind.

---

## Component Architecture

### JSX Components (Remix `remix/component`)

UI is built with **JSX components** rendered on the server via `remix/component`. Page bodies and the document shell are JSX; `render()` returns `createHtmlResponse(renderToStream(document))`.

**Component placement:**

| Location | Use case |
|----------|----------|
| `app/components/` | Shared components used across multiple features (e.g. `AppTopBar`, `Sidebar`, `SelectInput`, `ThemeToggleButton`) |
| `app/features/{feature}/` | Feature-specific page components (e.g. `PortfolioPage`, `GuidelinesPage`, `CatalogPage`, `AdvicePage`) |

**Rendering pattern:** Matches the Bookstore demo. The full document is JSX (`DocumentShell` wrapping page body). Controllers call `render(title, session, currentPage, jsx(PageComponent, props))`, which returns `createHtmlResponse(renderToStream(document))`. Page bodies are passed as JSX children.

**Remix component signature:** Components use `(handle, setup) => (props) => JSX`. Sub-components used only within a page (e.g. `CatalogTableHeader`) are plain functions or constants — not Remix components — to avoid the "must return a render function" requirement.

### Legacy: Server-Rendered Component Partials (deprecated)

The following describes the legacy HTML partial approach, kept for reference. New components use JSX.

Component directory:

```text
app/components/
```

Example structure (legacy):

```text
app/components/
  button.html
  modal.html
  dropdown.html
```

These files contain pure HTML markup with Tailwind styling.

### Component Example

`app/components/button.html`

```html
<button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
  {{ children }}
</button>
```

The `children` placeholder represents nested content inserted by the server renderer.

### Component Usage

Example usage inside a page template:

```html
<ui-button>
  Save
</ui-button>
```

During server rendering the component tag is replaced with the component partial.

Rendered output:

```html
<button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
  Save
</button>
```

Component resolution should occur during server rendering, not at runtime in the browser.

---

## Native UI Patterns

Use browser-native UI primitives whenever possible.

### Modal

```html
<dialog>
  Modal content

  <form method="dialog">
    <button>Close</button>
  </form>
</dialog>
```

### Accordion

```html
<details>
  <summary>More information</summary>
  Content here
</details>
```

### Popover Menu

```html
<button popovertarget="menu">Options</button>

<div id="menu" popover>
  <button>Edit</button>
  <button>Delete</button>
</div>
```

Avoid custom JavaScript implementations if a native primitive exists.

---

## Interactive Components

Interactive behaviors should be implemented as JavaScript islands. Each island attaches behavior to server-rendered HTML and is loaded only when its `data-island` attribute is present in the page.

### Island Placement Rules

Islands have two homes, depending on their scope:

**Shared islands** — reused across multiple features — live in the central directory:

```text
app/islands/
  sidebar.js
  theme-toggle.js
  dropdown.js
```

**Feature-specific islands** — used by only one feature — live next to the feature HTML component that needs them, using an `.island.js` suffix:

```text
app/features/portfolio/
  etf-card.html
  etf-card.island.js   ← behavior for this card only
  badge.html

app/features/guidelines/
  inline-editor.html
  inline-editor.island.js
```

This co-location rule keeps the interactive behavior close to the markup it enhances, making it easy to reason about and modify a feature in one place.

### When to co-locate vs. centralize

| Situation | Location |
|---|---|
| Behavior used in ≥ 2 features | `app/islands/` |
| Behavior specific to one feature | `app/features/{feature}/{name}.island.js` |
| Behavior specific to a shared component | `app/components/{name}.island.js` |

### Island module interface

All islands follow the same interface regardless of location:

```js
// Any of: app/islands/*.js, app/features/**/*.island.js, app/components/*.island.js
export function mount(el) {
  const trigger = el.querySelector('.trigger')
  const panel   = el.querySelector('.panel')

  trigger.addEventListener('click', () => {
    panel.classList.toggle('hidden')
  })
}
```

### Island Activation

Interactive areas declare themselves with `data-island`, referencing the island module name:

```html
<!-- Shared island: app/islands/dropdown.js -->
<div data-island="dropdown">...</div>

<!-- Feature island: app/features/portfolio/etf-card.island.js -->
<div data-island="portfolio/etf-card">...</div>
```

The island loader initializes behavior only for elements that declare `data-island`, ensuring JavaScript is loaded only where necessary.

---

## JavaScript Guidelines

JavaScript must:

- enhance existing HTML
- remain small and modular
- avoid heavy client frameworks
- rely on platform APIs

Prefer:

- native DOM APIs
- event delegation
- minimal client state

Avoid introducing large UI runtimes.

---

## Folder Structure

All UI-related files should follow this structure:

```text
app/
  components/
    app-top-bar.tsx      ← shared layout (top bar, sidebar toggle, theme)
    document-shell.tsx   ← DocumentShell layout (head, sidebar, top bar, scripts)
    render.ts            ← render() returns createHtmlResponse(renderToStream(...))
    sidebar.tsx          ← shared navigation
    theme-toggle.tsx
    select-input.tsx     ← shared form fields
    *.component.js       ← clientEntry for interactive components
  lib/
    auth.ts              ← getClientId, getClientSecret
    format.ts            ← formatValue
    session.ts           ← getSessionData, SessionData
    guidelines.ts        ← ETF_TYPES, EtfType
  features/
    portfolio/
      portfolio-page.tsx   ← feature-specific page body
      etf-card.tsx
    guidelines/
      guidelines-page.tsx
    catalog/
      catalog-page.tsx
    advice/
      advice-page.tsx
  styles/
    tailwind.css
```

**Rule:** Shared components (used by ≥2 features) live in `app/components/`. Feature-specific components live in `app/features/{feature}/`.

---

## Anti-Patterns

Avoid introducing:

- React-style UI frameworks
- large client-side UI libraries
- full-page hydration
- complex client state management
- unnecessary JavaScript for simple UI interactions

Prefer HTML + Tailwind + minimal JavaScript.

---

## Summary

The UI architecture follows these principles:

- HTML-first design
- Server-rendered components
- Tailwind CSS for styling
- Native browser UI primitives
- Progressive enhancement
- JavaScript islands for interaction (co-located with feature or shared component)

This approach produces a UI that is fast, accessible, framework-independent, and aligned with Remix v3's server-first model.

---

## Remix v3 Alignment

This architecture aligns with the packages available in `remix@next`. Key Remix v3 packages relevant to UI work:

| Package | Role in this architecture |
|---|---|
| `remix/response/html` | `createHtmlResponse()` — wraps HTML with proper headers |
| `remix/response/redirect` | `createRedirectResponse()` — post-form redirect |
| `remix/static-middleware` | Serve CSS, JS islands, and other static assets |
| `remix/component` | JSX components for page bodies and shared UI; `clientEntry` for interactive islands |
| `remix/component/server` | `renderToStream()` — full document streamed to response |
| `remix/interaction` | Type-safe DOM events for islands (`on()`, `createContainer()`) |

**Rendering:** All page bodies and the document shell are JSX. `render()` returns `createHtmlResponse(renderToStream(document))`. See `REMIX_V3_PACKAGES.md` for the component rendering pattern.

Refer to `REMIX_V3_PACKAGES.md` for the full package reference.

---

## Component Creation Rules

This section defines the exact rules an AI agent must follow when generating a new UI component.

### 1. One component per file

Each component lives in its own file inside `app/components/`.

File name must be lowercase and hyphen-separated:

```text
app/components/alert-banner.html
app/components/avatar.html
app/components/icon-button.html
```

### 2. File contents are pure HTML

Component files contain only HTML markup. No `<template>` wrapper, no `<script>`, no `<style>`.

```html
<div class="rounded border border-yellow-400 bg-yellow-50 px-4 py-3 text-yellow-800">
  {{ children }}
</div>
```

### 3. Use `{{ children }}` for slot content

When the component wraps arbitrary content, use `{{ children }}` as the single insertion point.

Only one `{{ children }}` per component.

### 4. Use named placeholders for additional variables

When a component needs more than one dynamic value, use named placeholders in the form `{{ name }}`.

Example `app/components/alert-banner.html`:

```html
<div role="alert" class="rounded border px-4 py-3 {{ variant_classes }}">
  <strong class="font-semibold">{{ title }}</strong>
  <p>{{ children }}</p>
</div>
```

Keep placeholders to a minimum. If a component needs many variables, consider splitting it into smaller components.

### 5. Use Tailwind utility classes only

Do not add inline `style` attributes or `<style>` blocks.

All visual styling must be expressed with Tailwind utility classes.

### 6. Use semantic HTML elements

Choose the most appropriate HTML element for the component's role:

| Purpose | Element |
|---|---|
| Actions | `<button>` |
| Navigation links | `<a>` |
| Grouped content | `<section>`, `<article>` |
| Overlays | `<dialog>` |
| Expandable content | `<details>` / `<summary>` |
| Status messages | `<output>`, `<p role="alert">` |

Do not use `<div>` when a semantic element fits.

### 7. Add ARIA attributes where needed

If the element's role is not obvious from the tag alone, add the appropriate `role` or `aria-*` attribute.

```html
<div role="status" class="text-sm text-green-700">
  {{ children }}
</div>
```

### 8. Do not add JavaScript inside component files

Interactivity belongs in a matching island file, not in the component partial.

If a **shared component** needs behavior, create a co-located island next to the component file:

```text
app/components/dropdown.html       ← markup only
app/components/dropdown.island.js  ← behavior for this shared component
```

If a **feature component** needs behavior, create a co-located island next to the feature HTML file:

```text
app/features/portfolio/etf-card.html
app/features/portfolio/etf-card.island.js
```

If behavior is used across multiple features, move the island to `app/islands/` instead.

The island targets the component via `data-island`:

```html
<!-- Shared component island -->
<div data-island="dropdown" class="relative">
  {{ children }}
</div>

<!-- Feature island -->
<div data-island="portfolio/etf-card">
  {{ children }}
</div>
```

### 9. Component naming convention

| File name | Custom tag used in templates |
|---|---|
| `button.html` | `<ui-button>` |
| `alert-banner.html` | `<ui-alert-banner>` |
| `icon-button.html` | `<ui-icon-button>` |

All custom tags use the `ui-` prefix followed by the file name without extension.

### 10. Creation checklist

Before finishing a new component, verify:

- [ ] File is in `app/components/` with a lowercase hyphenated name
- [ ] File contains only HTML (no `<template>`, `<script>`, or `<style>`)
- [ ] Dynamic content uses `{{ children }}` or named `{{ placeholders }}`
- [ ] All styling uses Tailwind utility classes
- [ ] Semantic HTML element is used
- [ ] ARIA attributes are present where the role is not implicit
- [ ] No JavaScript inside the file
- [ ] If behavior is needed, a matching island file exists in `app/islands/`
