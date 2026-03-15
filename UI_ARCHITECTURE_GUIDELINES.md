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

### Server-Rendered Component Partials

Reusable UI components are implemented as HTML partial templates rendered on the server.

Component directory:

```text
app/components/
```

Example structure:

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

Interactive behaviors should be implemented as JavaScript islands.

Directory:

```text
app/islands/
```

Example:

```text
app/islands/
  modal.js
  dropdown.js
  cart.js
```

Each island attaches behavior to existing server-rendered HTML.

Example island module:

```js
export function mount(el) {
  const button = el.querySelector(".trigger")
  const panel = el.querySelector(".panel")

  button.addEventListener("click", () => {
    panel.classList.toggle("hidden")
  })
}
```

### Island Activation

Interactive areas should declare themselves with `data-island`.

Example:

```html
<div data-island="dropdown">
  ...
</div>
```

The island loader initializes behavior only for those sections.

This ensures JavaScript is loaded only where necessary.

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
    button.html
    modal.html
    dropdown.html
  islands/
    dropdown.js
    modal.js
  styles/
    tailwind.css
```

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
- JavaScript islands for interaction

This approach produces a UI that is fast, accessible, framework-independent, and aligned with Remix v3's server-first model.

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

If the component needs behavior, create a corresponding island:

```text
app/components/dropdown.html   ← markup only
app/islands/dropdown.js        ← behavior only
```

The island targets the component via `data-island`:

```html
<div data-island="dropdown" class="relative">
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
