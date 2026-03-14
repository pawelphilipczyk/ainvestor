import { get, post, route } from 'remix/fetch-router/routes'

export let routes = route({
  home: get('/'),
  health: get('/health'),
  addEtf: post('/etfs'),
})
