import { form, get, post, route } from 'remix/fetch-router/routes'

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
	advice: post('/advice'),
	guidelines: {
		...form('guidelines'),
		delete: post('/guidelines/:id/delete'),
	},
	catalog: {
		index: get('/catalog'),
		import: post('/catalog/import'),
	},
})
