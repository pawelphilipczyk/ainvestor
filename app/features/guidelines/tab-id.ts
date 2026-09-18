/**
 * Which of the guidelines page's two add-forms is open.
 *
 * Its own module because the three places that need it cannot share any other
 * one. `guidelines/index.ts` is server-only and `guidelines-page.tsx` is a
 * server component the asset server does not serve, so
 * `guidelines-tabs.component.ts` — a browser module — cannot import a value
 * from either. A type can travel where a value cannot: `verbatimModuleSyntax`
 * erases `import type` outright, so the entry's compiled output carries no
 * reference to this file and the asset server is never asked for it.
 *
 * Keep this module type-only for that reason. A runtime export that the entry
 * actually *used* at runtime would make a browser module depend on a file the
 * asset server refuses to serve; `app/lib/remix-assets.test.ts` fails on
 * exactly that. (Merely adding one is not enough to break it — an import used
 * only under `typeof` stays a type position and is erased as well.)
 */
export type GuidelinesAddTabId = 'instrument' | 'bucket'
