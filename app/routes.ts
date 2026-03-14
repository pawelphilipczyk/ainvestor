import { get, post, route } from 'remix/fetch-router/routes'

export let routes = route({
  home: get('/'),
  addEtf: post('/etfs'),
})
