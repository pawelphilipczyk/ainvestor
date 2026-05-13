# Remix GitHub Repository Analysis

> Analysis of [github.com/remix-run/remix](https://github.com/remix-run/remix)
> and [api.remix.run](https://api.remix.run/) for example apps, demos, and
> patterns. Cross-checked against GitHub main branch: March 2026; beta naming
> notes added May 2026.

---

## 1. Example Apps and Structure

### Demos Directory (`demos/`)

| Demo | Purpose | Stack |
|------|---------|-------|
| **bookstore** | Full fetch-router app with CRUD, auth, cart, checkout | fetch-router, remix/ui island JSX, data-table-sqlite, form-data-middleware |
| **sse** | Server-Sent Events demo | fetch-router, remix/ui |
| **frames** | Frame/streaming UI demo | remix/ui |
| **frame-navigation** | Frame navigation patterns | remix/ui |
| **unpkg** | npm package browser (UNPKG-style) | fetch-router, html-template, no form/session |

### Package-Level Demos

| Package | Demo Location | Purpose |
|---------|---------------|---------|
| **fetch-router** | `packages/fetch-router/demos/` | Node, Bun, Cloudflare Workers variants of a simple blog |
| **component** | `packages/component/demos/` | Animation, keyed-list, draggable, drummer, etc. |
| **form-data-parser** | `packages/form-data-parser/demos/` | Node, Deno, Bun, CF Workers multipart examples |
| **static-middleware** | `packages/static-middleware/demos/` | Static file serving with directory listing |

### Packages Directory (`packages/`)

38 packages including: `fetch-router`, `fetch-router/routes`, `session`, `session-middleware`, `form-data-middleware`, `form-data-parser`, `method-override-middleware`, `static-middleware`, `html-template`, `response`, `data-schema`, `data-schema/form-data`, `component`, `cookie`, `node-fetch-server`, etc.

---

## 2. Key Patterns in Examples

### 2.1 fetch-router, createRouter, routes

**Bookstore (`demos/bookstore/`):**

```ts
// routes.ts
import { del, get, post, put, route, form, resources } from 'remix/fetch-router/routes'

export let routes = route({
  home: '/',
  about: '/about',
  contact: form('contact'),
  auth: {
    login: form('login'),
    register: form('register'),
    logout: post('logout'),
  },
  account: route('account', {
    index: '/',
    settings: form('settings', {
      formMethod: 'PUT',
      names: { action: 'update' },
    }),
    orders: resources('orders', { only: ['index', 'show'], param: 'orderId' }),
  }),
  admin: route('admin', {
    books: resources('books', { param: 'bookId' }),
    users: resources('users', {
      only: ['index', 'show', 'edit', 'update', 'destroy'],
      param: 'userId',
    }),
  }),
})
```

**Fetch-router demos (`packages/fetch-router/demos/node/`):**

```ts
export let routes = route({
  home: '/',
  login: form('/login'),
  logout: { method: 'POST', pattern: '/logout' },
  posts: resources('posts', { only: ['new', 'create', 'show'] }),
})
```

**Patterns:**
- `form('path')` → `{ index: GET /path, action: POST /path }`
- `form('path', { formMethod: 'PUT', names: { action: 'update' } })` → PUT at same URL, action named `update`
- `resources('name', { only: [...], param: 'customParam' })` for RESTful CRUD
- `route('prefix', { ... })` for nested route groups

### 2.2 Session Middleware

**Bookstore** uses filesystem storage:

```ts
import { createCookie } from 'remix/cookie'
import { createFsSessionStorage } from 'remix/session/fs-storage'

export let sessionCookie = createCookie('session', {
  secrets: ['s3cr3t-k3y-for-d3mo'],
  httpOnly: true,
  sameSite: 'Lax',
  maxAge: 2592000,
})

export let sessionStorage = createFsSessionStorage(path.resolve(__dirname, '..', '..', 'tmp', 'sessions'))
```

**Fetch-router demos** use cookie storage:

```ts
import { createCookie } from '@remix-run/cookie'
import { createCookieSessionStorage } from '@remix-run/session/cookie-storage'

let sessionCookie = createCookie('__sess', { secrets: ['s3cr3t'] })
let sessionStorage = createCookieSessionStorage()
```

**Context access:** Bookstore uses `asyncContext()` + `get(Session)`; our app uses `session` directly on context.

### 2.3 Form Handling

**Bookstore** uses `remix/data-schema/form-data`:

```ts
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'

const textField = f.field(s.defaulted(s.string(), ''))
const loginSchema = f.object({
  email: textField,
  password: textField,
})

// In action:
let { email, password } = s.parse(loginSchema, formData)
```

**FormData source:** Bookstore uses `get(FormData)` from async context; our app uses `context.formData` from middleware.

**File uploads (bookstore):**

```ts
formData({ uploadHandler })

// uploadHandler stores to file-storage and returns public URL
export async function uploadHandler(file: FileUpload): Promise<string> {
  let key = `${file.fieldName}/${Date.now()}-${...}.${ext}`
  await uploadsStorage.set(key, file)
  return `/uploads/${key}`
}
```

### 2.4 UI / Island Patterns

**Beta package naming:** `remix@3.0.0-beta.0` removes the old
`remix/component` exports. New work should import the consolidated UI runtime
from `remix/ui`, server rendering from `remix/ui/server`, and JSX runtime
helpers from `remix/ui/jsx-runtime`. Historical notes below that mention
`remix/component` refer to the alpha-era import path removed in beta.

**Bookstore** uses full Remix UI runtime (JSX):

- `clientEntry`, `renderToStream`, and component-local `mix` helpers such as `on()` and `css()`
- router-driven server rendering plus client hydration via `run({ loadModule, resolveFrame })`
- `RestfulForm` component for PUT/DELETE with `_method` override

**Our app** uses:
- **`remix/ui`** / **`remix/ui/server`**: JSX page components with **`handle.props`**, `clientEntry`, `renderToStream`, and `renderToString` where needed
- server-rendered documents with clientEntry hydration
- shared and feature-local `.component.js` files for browser behavior
- a mostly server-first composition style instead of frame-heavy examples

**Component demos** (`packages/component/demos/`): Standalone component demos (animation, draggable, etc.) served via `staticFiles('.')` and `createRouter`.

### 2.5 Static Middleware

**Bookstore:**

```ts
staticFiles('./public', {
  cacheControl: 'no-store, must-revalidate',
  etag: false,
  lastModified: false,
})
```

**Our app:** Serves `.component.js` and remix runtime from `app/` and `node_modules` with custom filters.

**Static-middleware** also supports directory listing (uses `html-template` + `createHtmlResponse` for listing HTML).

### 2.6 HTML Templating

**Fetch-router demos** and **unpkg**:

```ts
import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'

return createHtmlResponse(html`
  <html>
    <body>
      ${items.map((i) => html`<li>${i}</li>`)}
    </body>
  </html>
`)
```

**Bookstore** uses JSX + `render()` utility that returns `createHtmlResponse(renderToStream(...))`.

**Our app:** Matches Bookstore. Full document is JSX (`DocumentShell` wrapping page body). `render()` returns `createHtmlResponse(renderToStream(document))`. Controllers pass page bodies as JSX children. Shared components in `app/components/`; feature-specific page components in `app/features/{feature}/`.

### 2.7 Method Override

**Bookstore:** `methodOverride()` in middleware; `RestfulForm` component adds `<input type="hidden" name="_method" value="PUT" />`.

**Our app:** Same pattern; `methodOverride()` + `_method` hidden field for DELETE.

### 2.8 Data Validation (data-schema)

**Bookstore** uses `remix/data-schema/form-data`:

- `f.object({ ... })` with `f.field(s.defaulted(s.string(), ''))`
- `s.parse(schema, formData)` — throws on failure
- `s.defaulted()` for optional fields with defaults

**Our app** uses:

- `object()`, `string()`, `coerce.number()`, `enum_()`, etc. from `remix/data-schema`
- `parseSafe(CreateGuidelineSchema, Object.fromEntries(formData))` — returns `{ success, value }` or `{ success: false, issues }`
- No `remix/data-schema/form-data` — we pass `Object.fromEntries(formData)` to schemas

**Form-data schema API** (from `packages/data-schema/src/lib/form-data.ts`):

- `f.object({ key: f.field(schema) })` — reads directly from FormData/URLSearchParams
- `f.fields()`, `f.file()`, `f.files()` for repeated fields and file uploads
- Works with `s.parse()` / `s.parseSafe()` — no need to call `Object.fromEntries()` first

---

## 3. Utilities and Helpers Not in Main Docs

| Utility | Location | Purpose |
|---------|----------|---------|
| `s.defaulted(schema, value)` | data-schema | Default value when field missing |
| `f.field()`, `f.fields()`, `f.file()`, `f.files()` | data-schema/form-data | FormData-native parsing |
| `form('path', { formMethod: 'PUT', names: { action: 'update' } })` | fetch-router/routes | PUT forms at same URL |
| `resources('name', { param: 'customId' })` | fetch-router/routes | Custom param name for REST routes |
| `RestfulForm` | bookstore | Wraps form with `_method` override for PUT/DELETE |
| `get(Session)`, `get(FormData)` | async-context-middleware | Access context without prop drilling |
| `createFsSessionStorage` | session/fs-storage | Filesystem-backed sessions |
| `uploadHandler` in formData() | form-data-middleware | Custom file storage (returns URL path) |
| `createFsFileStorage` | file-storage/fs | Key/value file storage for uploads |
| Directory listing | static-middleware | Optional HTML listing for static dirs |

---

## 4. Differences Between Our App and Remix Examples

| Aspect | Our App | Remix Examples |
|--------|---------|----------------|
| **Rendering** | JSX document + page bodies with clientEntry hydration | Bookstore: full JSX with `renderToStream`; fetch-router demos: html templates |
| **Data validation** | `parseSafe` + `Object.fromEntries(formData)` | Bookstore: `s.parse` + `f.object()` (FormData-native) |
| **Session storage** | `createCookieSessionStorage` | Bookstore: `createFsSessionStorage`; demos: `createCookieSessionStorage` |
| **Context access** | `context.session`, `context.formData` | Bookstore: `get(Session)`, `get(FormData)` via asyncContext |
| **Components** | JSX page components + `clientEntry` islands; shared in `app/components/`, feature-specific in `app/features/` | Bookstore: full JSX; fetch-router demos: minimal/no components |
| **Form shorthand** | `form('guidelines')` | Same; bookstore also uses `form('settings', { formMethod: 'PUT', names: { action: 'update' } })` |
| **Resources** | Not used | Bookstore: `resources('orders')`, `resources('books')`, etc. |
| **File uploads** | None | Bookstore: `uploadHandler` + `createFsFileStorage` |
| **Middleware order** | logger, formData, methodOverride, session | Same; bookstore adds asyncContext, compression, loadDatabase |
| **Static files** | Custom filter for `.component.js` and remix runtime | Bookstore: `./public`; demos: `staticFiles('.')` for component demos |

---

## 5. Recommendations

1. **Consider `remix/data-schema/form-data`** — Use `f.object()` + `f.field()` instead of `Object.fromEntries(formData)` for cleaner FormData parsing and better integration with file fields.

2. **Consider `form()` with custom options** — For PUT forms (e.g. settings), use `form('settings', { formMethod: 'PUT', names: { action: 'update' } })` instead of manual route definitions.

3. **Consider `resources()`** — If adding RESTful collections (e.g. orders, items), use `resources('name', { only: [...], param: 'id' })` for consistency with Remix patterns.

4. **Consider `asyncContext` + `get()`** — If handlers need Session/FormData in deeply nested utilities, `asyncContext()` + `get(Session)` avoids prop drilling.

5. **RestfulForm pattern** — For PUT/DELETE forms, either use `RestfulForm`-style component or ensure `_method` hidden field is present (we already do this).

6. **File uploads** — When needed, use `formData({ uploadHandler })` with `createFsFileStorage` or S3; return public URL from handler.

---

## 6. File References

- Bookstore routes: `demos/bookstore/app/routes.ts`
- Bookstore router: `demos/bookstore/app/router.ts`
- Bookstore auth (form-data schema): `demos/bookstore/app/auth.tsx`
- Bookstore session: `demos/bookstore/app/utils/session.ts`
- Fetch-router demo (Node): `packages/fetch-router/demos/node/app/router.ts`
- Form route helper: `packages/fetch-router/src/lib/route-helpers/form.ts`
- Data-schema form-data: `packages/data-schema/src/lib/form-data.ts`
- Static middleware directory listing: `packages/static-middleware/src/lib/directory-listing.ts`
