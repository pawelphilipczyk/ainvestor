import { del, form, get, post, route } from 'remix/fetch-router/routes'

const adviceForm = form('advice')

export const routes = route({
	health: get('/health'),
	mcp: {
		call: post('/mcp'),
		stream: get('/mcp'),
		// OAuth discovery. Clients read the WWW-Authenticate header first, but the
		// spec requires them to fall back to these well-known URIs.
		protectedResource: get('/.well-known/oauth-protected-resource'),
		protectedResourceForEndpoint: get(
			'/.well-known/oauth-protected-resource/mcp',
		),
		authorizationServer: get('/.well-known/oauth-authorization-server'),
	},
	home: {
		index: get('/'),
	},
	portfolio: {
		index: get('/portfolio'),
		create: post('/portfolio'),
		import: post('/portfolio/import'),
		delete: del('/portfolio/:id'),
		fragmentList: get('/fragments/portfolio-list'),
	},
	auth: {
		login: get('/auth/github'),
		callback: get('/auth/github/callback'),
		logout: post('/auth/logout'),
	},
	locale: {
		set: post('/locale'),
	},
	advice: {
		...adviceForm,
		fragmentResult: get('/fragments/advice-result'),
	},
	guidelines: {
		index: get('/guidelines'),
		instrument: post('/guidelines/instrument'),
		assetClass: post('/guidelines/asset-class'),
		updateTarget: post('/guidelines/:id/target'),
		delete: del('/guidelines/:id'),
		fragmentList: get('/fragments/guidelines-list'),
	},
	catalog: route('/catalog', {
		index: get('/'),
		etf: get('/etf/:catalogEntryId'),
		etfAnalysis: post('/etf/:catalogEntryId/analysis'),
		import: post('/import'),
		fragmentList: get('/fragments/list'),
		fragmentEtfAnalysis: get('/fragments/etf-analysis/:catalogEntryId'),
	}),
	admin: route('/admin', {
		etfImport: get('/etf-import'),
	}),
})
