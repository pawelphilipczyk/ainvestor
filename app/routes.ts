import { del, form, get, post, route } from 'remix/fetch-router/routes'

export const routes = route({
	health: get('/health'),
	portfolio: {
		index: get('/'),
		create: post('/etfs'),
		import: post('/etfs/import'),
		delete: del('/etfs/:id'),
	},
	auth: {
		login: get('/auth/github'),
		callback: get('/auth/github/callback'),
		logout: post('/auth/logout'),
	},
	advice: post('/advice'),
	guidelines: {
		...form('guidelines'),
		delete: del('/guidelines/:id'),
	},
	catalog: {
		index: get('/catalog'),
		import: post('/catalog/import'),
		importJson: post('/catalog/import-json'),
	},
})
