import { get, post, route } from 'remix/fetch-router/routes'

export let routes = route({
  home: get('/'),
  health: get('/health'),
  addEtf: post('/etfs'),
  githubLogin: get('/auth/github'),
  githubCallback: get('/auth/github/callback'),
  logout: post('/auth/logout'),
  advice: post('/advice'),
})
