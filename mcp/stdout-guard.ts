/**
 * stdout is the MCP protocol channel: the spec allows nothing but MCP messages
 * there, and one stray line breaks the client's parser. Node's console sends
 * `log`, `info`, `debug`, `dir` and `table` to stdout, so point them all at
 * stderr, which the spec explicitly leaves free for logging.
 *
 * Import this **first** in the entry point. ES modules evaluate in import
 * order, so everything imported after it is covered; a module-scope write from
 * a module imported before it would still escape.
 */
console.log = console.error
console.info = console.error
console.debug = console.error
console.dir = console.error
console.table = console.error
