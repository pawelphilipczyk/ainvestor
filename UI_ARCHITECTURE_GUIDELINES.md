# UI Architecture Guidelines

## Purpose

Define the UI architecture for this project. The goal is to build a modern interface using web platform primitives, Tailwind CSS, and HTML modules as components, while avoiding framework-specific component systems (React, Vue, etc.).

The UI must follow a server-first philosophy and remain compatible with Remix v3.

---

## Core Principles

### 1) HTML-first UI

All UI should begin with semantic HTML. Prefer built-in browser primitives whenever possible.

Use native elements such as:

- `<dialog>` for modals
- `<details>` / `<summary>` for accordions
- `<form>` and standard inputs
- `<button>` for actions
- `<nav>` and `<header>` for navigation
- `<section>` and `<article>` for layout

Avoid replacing native controls unless absolutely necessary.

### 2) Progressive enhancement

Interfaces should work with minimal or no JavaScript.

JavaScript should only enhance functionality, not be required for basic usability.

Pattern:

- HTML provides structure
- Tailwind provides styling
- JavaScript adds optional interaction

---

## Styling strategy

### Tailwind CSS

Tailwind is the primary styling solution.

Guidelines:

- Prefer utility classes over custom CSS
- Extract repeated patterns into reusable components
- Keep global CSS minimal

Example:

```html
<button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
  Save
</button>
```

Avoid large custom CSS files unless necessary.

---

## Component strategy

### HTML modules as components

Reusable UI elements are stored as HTML template modules.

Each component lives in:

```text
app/components/
```

Example:

```text
app/components/
  button.html
  modal.html
  dropdown.html
```

### Component file format

Each component contains a single `<template>` element.

Example:

```html
<template>
  <button class="px-4 py-2 rounded bg-blue-600 text-white">
    <slot></slot>
  </button>
</template>
```

The `<slot>` placeholder is replaced by the component's inner content.

### Component usage

Components are used as custom HTML tags.

Example:

```html
<ui-button>Save</ui-button>
```

The component loader replaces the tag with template content at runtime.

Rendered output:

```html
<button class="px-4 py-2 rounded bg-blue-600 text-white">
  Save
</button>
```

---

## Native UI patterns

Use browser-native UI patterns whenever possible.

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

### Popover

```html
<button popovertarget="menu">Options</button>
<div id="menu" popover>
  <button>Edit</button>
  <button>Delete</button>
</div>
```

Avoid implementing custom versions if a native primitive exists.

---

## Interactive components

Interactive UI logic lives in island modules.

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

Each island attaches behavior to existing HTML.

Example:

```js
export function mount(el) {
  const button = el.querySelector(".trigger")
  const panel = el.querySelector(".panel")

  button.addEventListener("click", () => {
    panel.classList.toggle("hidden")
  })
}
```

---

## JavaScript guidelines

JavaScript should:

- Enhance existing HTML
- Remain small and modular
- Avoid framework runtimes
- Attach behavior via `data-*` attributes or component tags

Example:

```html
<div data-island="dropdown">
  ...
</div>
```

---

## Folder structure

UI-related files should follow this structure:

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

## Anti-patterns

Avoid introducing:

- React-style component systems
- Heavy UI frameworks
- Complex client-side state managers
- Unnecessary JavaScript for simple interactions

Prefer native HTML + Tailwind + small JS modules.

---

## Summary

The UI architecture follows these principles:

- HTML-first
- Tailwind for styling
- HTML modules for reusable components
- Native browser UI primitives
- Progressive enhancement
- Minimal JavaScript islands

This keeps the UI lightweight, maintainable, and aligned with modern web platform capabilities.
