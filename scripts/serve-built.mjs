// Local-only production smoke-test server, including a nested hosting path and update fixture.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
const root = resolve('dist'), base = '/azulia-seller-flow/'
let release = 0
const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.webp':'image/webp' }
createServer(async (request,response) => {
  try {
    const path = decodeURIComponent(new URL(request.url,'http://localhost').pathname)
    if (path === '/__test__/release' && request.method === 'POST') { release++; response.end('ok'); return }
    if (!path.startsWith(base)) { response.writeHead(404); response.end(); return }
    const relative = path.slice(base.length) || 'index.html'
    const file = resolve(root,relative)
    if (!file.startsWith(root + sep)) { response.writeHead(403); response.end(); return }
    let body = await readFile(file)
    if (relative === 'sw.js' && release) body = Buffer.from(body.toString().replace(/const CACHE = PREFIX \+ '([^']+)';/,(_,version) => `const CACHE = PREFIX + '${version}-smoke-${release}';`))
    response.writeHead(200,{ 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' }); response.end(body)
  } catch { response.writeHead(404); response.end('Not found') }
}).listen(4180,'127.0.0.1')
