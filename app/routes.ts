import { del, form, get, post, route } from 'remix/fetch-router/routes'

const adviceForm = form('advice')

export const routes = route({
	health: get('/health'),
	home: {
		index: get('/'),
	},
	portfolio: {
		index: get('/portfolio'),
		create: post('/etfs'),
		update: post('/etfs/:id'),
		import: post('/etfs/import'),
		delete: del('/etfs/:id'),
		fragmentList: get('/fragments/portfolio-list'),
	},
	auth: {
		login: get('/auth/github'),
		callback: get('/auth/github/callback'),
		logout: post('/auth/logout'),
	},
	advice: {
		...adviceForm,
		etfInfo: post('/advice/etf-info'),
	},
	guidelines: {
		index: get('/guidelines'),
		instrument: post('/guidelines/instrument'),
		assetClass: post('/guidelines/asset-class'),
		updateTarget: post('/guidelines/:id/target'),
		delete: del('/guidelines/:id'),
		fragmentList: get('/fragments/guidelines-list'),
	},
	catalog: {
		index: get('/catalog'),
		import: post('/catalog/import'),
	},
})
