# Remix v3 — Packages & Best Practices

> **Source of truth:** [https://github.com/remix-run/remix](https://github.com/remix-run/remix)
> All API references below are derived directly from the GitHub repository.
> Version in use: `remix@3.0.0-alpha.3`

---

## Overview

Remix v3 is a **fetch-first, server-centric web framework** built on web standards. It ships as a single umbrella package (`remix`) that re-exports ~30 focused sub-packages. Each sub-package is a standalone tool with zero or minimal internal dependencies — you import only what you need.

All packages are runtime-agnostic: they work on Node.js, Bun, Deno, Cloudflare Workers, and in browsers where applicable.

---

## Package Index

| Import path | Purpose |
|---|---|
| `remix/fetch-router` | HTTP router (core) |
| `remix/fetch-router/routes` | Route definition helpers |
| `remix/node-fetch-server` | Node.js HTTP adapter |
| `remix/html-template` | XSS-safe HTML tagged template |
| `remix/response/html` | HTML response helper |
| `remix/response/redirect` | Redirect response helper |
| `remix/response/file` | File response with ETags/Range |
| `remix/response/compress` | Streaming compression helper |
| `remix/session` | Session management |
| `remix/session/cookie-storage` | Cookie-backed sessions |
| `remix/session/fs-storage` | Filesystem-backed sessions |
| `remix/session/memory-storage` | In-memory sessions (dev/test) |
| `remix/session-middleware` | Auto-session middleware for router |
| `remix/session-storage-redis` | Redis-backed sessions |
| `remix/session-storage-memcache` | Memcache-backed sessions |
| `remix/cookie` | Signed cookie creation/parsing |
| `remix/headers` | Type-safe HTTP header parsing |
| `remix/route-pattern` | URL pattern matching |
| `remix/form-data-parser` | Streaming multipart parser |
| `remix/form-data-middleware` | FormData parsing middleware |
| `remix/method-override-middleware` | HTML form method override (PUT/DELETE) |
| `remix/static-middleware` | Static file serving |
| `remix/logger-middleware` | Request/response logging |
| `remix/compression-middleware` | Gzip/Brotli compression middleware |
| `remix/async-context-middleware` | AsyncLocalStorage context access |
| `remix/file-storage` | File key/value storage interface |
| `remix/file-storage/fs` | Filesystem file storage |
| `remix/file-storage/memory` | In-memory file storage |
| `remix/file-storage-s3` | AWS S3 file storage |
| `remix/fs` | Lazy filesystem utilities |
| `remix/lazy-file` | Streaming File/Blob implementation |
| `remix/mime` | MIME type detection/helpers |
| `remix/multipart-parser` | Low-level multipart stream parser |
| `remix/fetch-proxy` | HTTP proxy via Fetch API |
| `remix/data-schema` | Data validation (Standard Schema v1) |
| `remix/data-schema/checks` | Built-in validation checks |
| `remix/data-schema/coerce` | Type coercions for form data |
| `remix/data-schema/lazy` | Recursive schema support |
| `remix/data-table` | Data table abstraction |
| `remix/data-table-postgres` | PostgreSQL data table adapter |
| `remix/data-table-mysql` | MySQL data table adapter |
| `remix/data-table-sqlite` | SQLite data table adapter |
| `remix/tar-parser` | TAR archive parser |
| `remix/component` | Island component system (JSX) |
| `remix/component/server` | Server-side component rendering |
| `remix/interaction` | Type-safe DOM event handling |
| `remix/interaction/press` | Press / long-press interactions |
| `remix/interaction/keys` | Keyboard interaction helpers |
| `remix/interaction/popover` | Popover interaction helpers |

---

## Core Routing — `remix/fetch-router`

The heart of Remix v3. A composable, Fetch API–native router.

### Key concepts

- **Route map** — declared with `route()`, `form()`, `resources()`, or `resource()` in a dedicated `routes.ts`
- **Router** — created with `createRouter()`, wires maps to controllers
- **Actions** — handler functions receiving a typed `context` object
- **Middleware** — runs before/after actions; global or per-route
- **Type-safe links** — `routes.home.href()` generates correct URLs at compile time

### Route helpers (`remix/fetch-router/routes`)

```ts
import { route, form, resources, resource, get, post, put, delete_ } from 'remix/fetch-router/routes'

// Generic map — any method accepted
route({ home: '/', about: '/about' })

// Method-encoded routes (preferred)
route({
  health: get('/health'),
  users: {
    index: get('/users'),
    create: post('/users'),
    show: get('/users/:id'),
    update: put('/users/:id'),
    delete: post('/users/:id/delete'),  // HTML forms can't use DELETE natively
  },
})

// Form shorthand: index (GET) + action (POST) at the same URL
form('contact')  // → { index: GET /contact, action: POST /contact }

// RESTful resource collection (index, new, show, create, edit, update, destroy)
resources('users', { only: ['index', 'show'] })

// RESTful singleton resource (new, show, create, edit, update, destroy)
resource('profile', { only: ['show', 'edit', 'update'] })
```

### Router API

```ts
import { createRouter } from 'remix/fetch-router'

let router = createRouter({ middleware: [logger(), formData(), session(cookie, storage)] })

// Register by map
router.map(routes, controller)

// Register by method
router.get(routes.home, handler)
router.post(routes.contact.action, handler)

// Test directly — no test harness needed
let response = await router.fetch('https://example.com/path', { method: 'POST', body: ... })
```

### Action context

```ts
router.get(routes.user.show, ({ request, url, params, storage, session, formData, files }) => {
  params.id       // typed from route pattern
  url.searchParams.get('sort')
  session.get('userId')
  formData.get('name')  // available when formData middleware is active
})
```

### Middleware

```ts
import type { Middleware } from 'remix/fetch-router'

function auth(): Middleware {
  return (context, next) => {
    if (!context.session.get('userId')) return createRedirectResponse('/login')
    return next()
  }
}

// Per-route middleware
router.map(routes.admin, {
  middleware: [auth()],
  action(context) { ... }
})
```

---

## Node.js Server — `remix/node-fetch-server`

Bridges a standard Node.js `http` server to the Fetch API router.

```ts
import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'
import { router } from './app/router.ts'

let server = http.createServer(createRequestListener(router.fetch))
server.listen(8080)
```

---

## HTML Templating — `remix/html-template`

XSS-safe tagged template literal for server-rendered HTML.

```ts
import { html } from 'remix/html-template'

// All interpolations are escaped by default
let userInput = '<script>alert(1)</script>'
let body = html`<h1>Hello ${userInput}!</h1>`
// → <h1>Hello &lt;script&gt;alert(1)&lt;/script&gt;!</h1>

// html.raw — for trusted HTML fragments only
let icon = html.raw`<svg>...</svg>`
let button = html`<button>${icon} Click me</button>`

// Arrays work — each item is rendered and joined
let items = ['a', 'b', 'c']
html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`

// Null/undefined renders nothing — useful for conditionals
html`<div>${showError ? html`<p>${error}</p>` : null}</div>`
```

---

## Response Helpers

### HTML — `remix/response/html`

```ts
import { createHtmlResponse } from 'remix/response/html'

// Auto-prepends <!DOCTYPE html>, sets Content-Type: text/html; charset=UTF-8
createHtmlResponse(html`<h1>Hello</h1>`)
createHtmlResponse(html`<h1>Hello</h1>`, { status: 400 })
```

### Redirect — `remix/response/redirect`

```ts
import { createRedirectResponse } from 'remix/response/redirect'

createRedirectResponse('/login')             // 302
createRedirectResponse('/new-page', 301)     // permanent
createRedirectResponse('/dashboard', {
  status: 303,
  headers: { 'X-Custom': 'value' },
})
```

### File — `remix/response/file`

Full HTTP file semantics: ETags, Last-Modified, conditional requests, Range support.

```ts
import { createFileResponse } from 'remix/response/file'
import { openLazyFile } from 'remix/fs'

let file = openLazyFile('./public/logo.png')
let response = await createFileResponse(file, request, {
  cacheControl: 'public, max-age=3600',
  etag: 'weak',       // or 'strong' or false
  lastModified: true,
  acceptRanges: true,
})
```

### Compress — `remix/response/compress`

```ts
import { compressResponse } from 'remix/response/compress'

let compressed = await compressResponse(uncompressedResponse, request)
```

---

## Session Management

### Low-level — `remix/session` + `remix/cookie`

```ts
import { createCookie } from 'remix/cookie'
import { createCookieSessionStorage } from 'remix/session/cookie-storage'
import { createFsSessionStorage } from 'remix/session/fs-storage'
import { createMemorySessionStorage } from 'remix/session/memory-storage'

let sessionCookie = createCookie('__session', {
  httpOnly: true,
  secrets: ['rotate-me'],  // array supports secret rotation
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
})

// Cookie storage (all data in cookie, max ~4096 bytes)
let storage = createCookieSessionStorage()

// Filesystem storage (requires persistent disk)
let storage = createFsSessionStorage('/tmp/sessions')

// Memory storage (dev/test only — lost on restart)
let storage = createMemorySessionStorage()

// Usage in a handler (manual flow)
let session = await storage.read(request.headers.get('Cookie'))
session.set('userId', user.id)
session.flash('notice', 'Logged in!')     // available only on next request
session.regenerateId()                    // call after login (prevents fixation)
session.destroy()                         // call on logout

let setCookie = await storage.save(session)
return new Response('OK', { headers: { 'Set-Cookie': setCookie } })
```

### Middleware — `remix/session-middleware`

Automatically reads the session on every request and saves it on every response.

```ts
import { session } from 'remix/session-middleware'

let router = createRouter({
  middleware: [formData(), session(sessionCookie, sessionStorage)],
})

router.post('/login', ({ session, formData }) => {
  let user = authenticate(formData.get('username'), formData.get('password'))
  if (!user) {
    session.flash('error', 'Invalid credentials')
    return createRedirectResponse('/login')
  }
  session.regenerateId()
  session.set('userId', user.id)
  return createRedirectResponse('/dashboard')
})
```

---

## Cookies — `remix/cookie`

Signed cookies with HMAC-SHA256 and secret rotation.

```ts
import { createCookie } from 'remix/cookie'

let sessionCookie = createCookie('session', {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  secrets: ['new-secret', 'old-secret'],  // first signs, rest verify
})

let value = await sessionCookie.parse(request.headers.get('Cookie'))
let header = await sessionCookie.serialize(newValue)
```

---

## HTTP Headers — `remix/headers`

Type-safe parsing and manipulation for all common HTTP headers.

```ts
import { Accept, CacheControl, ContentType, SetCookie, Vary } from 'remix/headers'

// Content negotiation
let accept = Accept.from(request.headers.get('accept'))
accept.getPreferred(['text/html', 'application/json'])  // 'text/html'

// Cache control
let cc = new CacheControl({ public: true, maxAge: 3600 })
response.headers.set('Cache-Control', cc)

// Vary
let vary = new Vary(['Accept-Encoding', 'Accept-Language'])
response.headers.set('Vary', vary)
```

---

## Form Data & File Uploads

### Middleware approach — `remix/form-data-middleware`

Simplest: parses `FormData` automatically and exposes it on `context.formData`.

```ts
import { formData } from 'remix/form-data-middleware'

let router = createRouter({ middleware: [formData()] })

router.post('/upload', ({ formData, files }) => {
  let name = formData.get('name') as string
  let avatar = files?.get('avatar')  // File object
})
```

### Method override — `remix/method-override-middleware`

Enables PUT/PATCH/DELETE from HTML forms via a hidden `_method` field.
Must come **after** `formData()` middleware.

```ts
import { methodOverride } from 'remix/method-override-middleware'

let router = createRouter({
  middleware: [formData(), methodOverride()],
})
```

```html
<form method="POST" action="/users/123">
  <input type="hidden" name="_method" value="DELETE" />
  <button>Delete</button>
</form>
```

### Low-level — `remix/form-data-parser`

For streaming file uploads to disk or S3.

```ts
import { parseFormData } from 'remix/form-data-parser'
import type { FileUpload } from 'remix/form-data-parser'

let formData = await parseFormData(request, async (upload: FileUpload) => {
  if (upload.fieldName === 'avatar') {
    await writeFile(`/uploads/${upload.name}`, upload.bytes)
    return `/uploads/${upload.name}`  // stored path replaces the File in FormData
  }
})
```

---

## Static Files — `remix/static-middleware`

Serves static files from a directory with ETags and Range support.

```ts
import { staticFiles } from 'remix/static-middleware'

let router = createRouter({
  middleware: [
    staticFiles('./public', { cacheControl: 'public, max-age=31536000, immutable' }),
  ],
})
```

---

## Request Logging — `remix/logger-middleware`

```ts
import { logger } from 'remix/logger-middleware'

let router = createRouter({
  middleware: [logger({ format: '%method %path %status (%duration ms)' })],
})
```

Available tokens: `%method`, `%path`, `%status`, `%duration`, `%date`, `%dateISO`, `%userAgent`, `%contentLength`, `%contentType`, `%host`, `%url`.

---

## Compression — `remix/compression-middleware`

```ts
import { compression } from 'remix/compression-middleware'

let router = createRouter({
  middleware: [compression({ threshold: 1024 })],
})
```

---

## Async Context — `remix/async-context-middleware`

Makes the request context available anywhere in the same async call stack without prop-drilling.

```ts
import { asyncContext, getContext } from 'remix/async-context-middleware'

let router = createRouter({ middleware: [asyncContext()] })

// In any utility called from a handler:
function getCurrentUser() {
  return getContext().session.get('userId')
}
```

---

## Data Validation — `remix/data-schema`

Tiny, sync-first validation. Compatible with [Standard Schema v1](https://standardschema.dev/) — Zod, Valibot, and ArkType schemas work too.

```ts
import { object, string, number, optional, enum_, parse, parseSafe } from 'remix/data-schema'
import { email, minLength, maxLength, min } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'

let CreateEtfSchema = object({
  ticker:  string().pipe(minLength(1), maxLength(10)),
  name:    string().pipe(minLength(1)),
  type:    enum_(['equity', 'bond', 'real-estate', 'commodity'] as const),
  weight:  coerce.number().pipe(min(0)),  // coerce from form string
  amount:  coerce.number().pipe(min(0)),
})

// Throws on failure
let etf = parse(CreateEtfSchema, Object.fromEntries(formData))

// Returns { success, value } or { success: false, issues }
let result = parseSafe(CreateEtfSchema, Object.fromEntries(formData))
if (!result.success) {
  // result.issues — array of { message, path? }
}
```

**When to use `coerce.*`:** Form data is always strings. Use `coerce.number()`, `coerce.boolean()`, `coerce.date()` at schema boundaries for automatic conversion.

---

## Route Patterns — `remix/route-pattern`

Type-safe URL pattern matching with params, wildcards, and optionals.

```ts
import { RoutePattern, ArrayMatcher, TrieMatcher } from 'remix/route-pattern'

let pattern = new RoutePattern('blog/:slug')
pattern.match('https://example.com/blog/hello')  // { params: { slug: 'hello' } }
pattern.href({ slug: 'hello' })                  // '/blog/hello'

// Optional segments
new RoutePattern('api(/v:version)/users')
// matches /api/users AND /api/v2/users
```

---

## MIME Utilities — `remix/mime`

```ts
import { detectMimeType, detectContentType, isCompressibleMimeType } from 'remix/mime'

detectMimeType('image.png')          // 'image/png'
detectContentType('styles.css')      // 'text/css; charset=utf-8'
isCompressibleMimeType('text/html')  // true
isCompressibleMimeType('image/png')  // false
```

---

## Lazy Files — `remix/fs` and `remix/lazy-file`

Stream files from disk without buffering.

```ts
import { openLazyFile, writeFile } from 'remix/fs'

let file = openLazyFile('./public/data.json')
let text = await file.text()  // reads on demand

// Serve as a response
let response = new Response(file.stream(), {
  headers: { 'Content-Type': file.type, 'Content-Length': String(file.size) },
})
```

---

## File Storage — `remix/file-storage`

Simple key/value storage for `File` objects.

```ts
import { createFsFileStorage } from 'remix/file-storage/fs'
import { createMemoryFileStorage } from 'remix/file-storage/memory'

let storage = createFsFileStorage('./uploads')
await storage.set('user-123-avatar', file)
let saved = await storage.get('user-123-avatar')
await storage.remove('user-123-avatar')
```

---

## Island Component System — `remix/component`

A full-featured component system that renders on the server and hydrates interactive "islands" on the client. More powerful than the manual `data-island` pattern.

```ts
// Server: render full page
import { renderToStream } from 'remix/component/server'

let stream = renderToStream(<App />)
return new Response(stream, { headers: { 'Content-Type': 'text/html' } })

// Component with server+client rendering
import { clientEntry, type Handle } from 'remix/component'

export let Counter = clientEntry(
  '/assets/counter.js#Counter',
  function Counter(handle: Handle, setup: number) {
    let count = setup
    return (props: { label: string }) => (
      <div>
        <span>{props.label}: {count}</span>
        <button on={{ click() { count++; handle.update() } }}>+</button>
      </div>
    )
  },
)

// Client bootstrap
import { run } from 'remix/component'
let app = run(document, {
  loadModule: (url, name) => import(url).then(m => m[name]),
  resolveFrame: (src) => fetch(src).then(r => r.text()),
})
```

**`<Frame>`** streams partial server UI into a page region and supports reload without full navigation.

---

## DOM Event Handling — `remix/interaction`

Type-safe event listeners with async re-entry protection.

```ts
import { on, createContainer } from 'remix/interaction'
import { press, longPress } from 'remix/interaction/press'

// Add listeners
on(button, {
  click: (event) => console.log('clicked'),
  [press](event) { navigate(button.href) },
  [longPress](event) { event.preventDefault(); showMenu() },
})

// Async with abort signal (aborted on re-entry)
on(input, {
  async input(event, signal) {
    let results = await fetch(`/search?q=${event.currentTarget.value}`, { signal })
    updateResults(await results.json())
  },
})
```

---

## HTTP Proxy — `remix/fetch-proxy`

```ts
import { createFetchProxy } from 'remix/fetch-proxy'

let proxy = createFetchProxy('https://api.example.com')
return proxy(request)  // forwards request, returns response
```

---

## Best Practices

### 1. Declare all routes in one file

Keep `routes.ts` as the single source of truth for all URL patterns. Use typed route helpers from `remix/fetch-router/routes`.

```ts
// routes.ts
import { route, form, resources, get, post } from 'remix/fetch-router/routes'

export const routes = route({
  health: get('/health'),
  portfolio: {
    index: get('/'),
    create: post('/etfs'),
  },
  auth: {
    login: get('/auth/github'),
    callback: get('/auth/github/callback'),
    logout: post('/auth/logout'),
  },
})
```

### 2. Use `route.href()` instead of string literals

```ts
// ✅ type-safe, refactor-safe
html`<a href="${routes.portfolio.index.href()}">Portfolio</a>`
html`<form action="${routes.guidelines.create.href()}" method="POST">`

// ❌ fragile strings
html`<a href="/">Portfolio</a>`
```

### 3. Prefer `form()` shorthand for standard form pages

```ts
// routes.ts
guidelines: form('guidelines'),
// → { index: GET /guidelines, action: POST /guidelines }
```

### 4. Use `resources()` for RESTful APIs

```ts
// routes.ts
users: resources('users', { only: ['index', 'show', 'create', 'update'] }),
```

### 5. Use `remix/session-middleware` instead of manual cookie parsing

Replace manual `session.read()`/`session.save()` calls in every handler with the middleware, which handles it automatically.

### 6. Use `remix/data-schema` for form validation

Parse and validate all form inputs at the action boundary before processing.

```ts
router.post(routes.etfs.create, ({ formData }) => {
  let result = parseSafe(CreateEtfSchema, Object.fromEntries(formData))
  if (!result.success) return createHtmlResponse(renderForm(result.issues), { status: 422 })
  let etf = result.value
  // ...
})
```

### 7. Validate with `coerce.*` for form/query string inputs

Form data is always strings. Use `coerce.number()`, `coerce.boolean()` to convert at the boundary.

### 8. Use `remix/html-template` for all HTML

Always use `html` template tag to avoid XSS. Never concatenate user input into raw strings.

```ts
// ✅
return createHtmlResponse(html`<h1>${userInput}</h1>`)

// ❌ XSS risk
return createHtmlResponse(`<h1>${userInput}</h1>`)
```

### 9. Use `remix/static-middleware` for static assets

```ts
let router = createRouter({
  middleware: [
    staticFiles('./public', { cacheControl: 'public, max-age=31536000, immutable' }),
    formData(),
    session(sessionCookie, sessionStorage),
  ],
})
```

### 10. Test with `router.fetch()` directly

No special test harness required. Use the Fetch API directly.

```ts
let response = await router.fetch('https://test.local/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ ticker: 'VTI' }),
})
assert.equal(response.status, 302)
```

### 11. Use `remix/logger-middleware` in development

```ts
let router = createRouter({
  middleware: process.env.NODE_ENV === 'development'
    ? [logger(), formData(), session(...)]
    : [formData(), session(...)],
})
```

### 12. Use `form` + `resources` shorthand over manual method encoding

```ts
// ✅ Clear and idiomatic
route({
  users: resources('users'),
  contact: form('contact'),
})

// ✅ Also fine for custom routes
route({
  health: get('/health'),
  webhook: post('/webhook'),
})
```

### 13. Prefer `remix/cookie` over custom HMAC signing

The `createCookie` helper supports HMAC-SHA256 signing, secret rotation, and all standard cookie attributes out of the box.

### 14. Use `remix/form-data-middleware` at the router level

Parse `FormData` once globally rather than in each handler.

---

## This Project's Current Usage

| Package | Used | Notes |
|---|---|---|
| `remix/fetch-router` | ✅ | Core router |
| `remix/fetch-router/routes` | ✅ | `get()`, `post()` — all routes in `app/routes.ts` |
| `remix/node-fetch-server` | ✅ | `server.ts` |
| `remix/html-template` | ✅ | `html` tag used in all feature renderers |
| `remix/response/html` | ✅ | `createHtmlResponse` |
| `remix/response/redirect` | ✅ | `createRedirectResponse` |
| `remix/form-data-middleware` | ✅ | `formData()` global middleware |
| `remix/logger-middleware` | ✅ | Dev logging |
| `remix/static-middleware` | ✅ | Serves `.island.js` files from `app/` |
| `route.href()` | ✅ | Used in all HTML templates — no hardcoded URL strings |
| `remix/session` | ✅ | `Session` type used in all handler contexts |
| `remix/session-middleware` | ✅ | `session()` in router middleware chain |
| `remix/cookie` | ✅ | `sessionCookie` in `app/lib/session.ts` |
| `remix/data-schema` | ✅ | `parseSafe()` + `coerce.*` in portfolio, guidelines, advice |
| `remix/method-override-middleware` | ✅ | `methodOverride()` in router; DELETE /guidelines/:id |
| `remix/compression-middleware` | ✅ | `compression()` in production middleware stack |
| `form()` shorthand | ✅ | guidelines routes use `form('guidelines')` |
| `remix/headers` | ❌ | Not used yet |
| `remix/component` | ❌ | Using manual `data-island` + `mount(el)` pattern |
| `remix/interaction` | ❌ | Using vanilla JS in island files |
| `resources()` shorthand | ❌ | No RESTful resource collections yet |

### What still could be added (future opportunities)

1. **`remix/static-middleware` (expand scope for Tailwind)** — `app/styles/tailwind.css` exists locally but the pages load Tailwind from the public CDN. Expanding to serve a compiled CSS file requires adding a Tailwind CLI build step to the project (compile `tailwind.css` → `tailwind.built.css`, then serve it via `staticFiles`).

2. **`remix/interaction`** — island files use plain `addEventListener`. `remix/interaction`'s `on()` helper adds type-safe async re-entry protection for free.

3. **`resources()` shorthand** — if more RESTful resource collections are added in the future, prefer `resources('name', { only: [...] })` over manual route declarations.
