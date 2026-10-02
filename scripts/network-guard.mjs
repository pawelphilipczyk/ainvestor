// Preloaded into every test process (`node --import`): a test must never reach
// the real GitHub. The suite stands GitHub in with `installFakeDataRepo` or the
// in-process stores, and a path that forgets to do so would otherwise read
// somebody's real repository, or fail only on a machine with no network.
//
// Throwing is not enough on its own: app code catches fetch failures and turns
// them into an "unavailable" page, which a test can then assert on while still
// having made the request. So the guard also fails the process at exit.
const real = globalThis.fetch
const GUARDED_HOSTS = new Set(['api.github.com', 'github.com'])
const reached = []

globalThis.fetch = async (input, init) => {
	const url = new URL(input instanceof Request ? input.url : String(input))
	if (GUARDED_HOSTS.has(url.hostname)) {
		reached.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`)
		throw new Error(
			`Test reached the real GitHub (${url.origin}${url.pathname}). Install a fake or an in-process store instead.`,
		)
	}
	return real(input, init)
}

process.on('exit', () => {
	if (reached.length === 0) return
	console.error(
		`\nThis test process made ${reached.length} real GitHub request(s):\n${reached.map((line) => `  ${line}`).join('\n')}`,
	)
	process.exitCode = 1
})
