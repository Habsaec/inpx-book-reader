/**
 * Compare /api/* paths in inpx-library-server vs inpx-book-reader inpxClient.ts.
 * Exit 1 if client references paths with no matching server route.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.resolve(root, '../inpx-library-server');
const routesDir = path.join(serverRoot, 'src/routes');
const serverEntry = path.join(serverRoot, 'src/server.js');
const clientFile = path.join(root, 'src/lib/inpxClient.ts');
const agentsFile = path.join(root, 'AGENTS.md');

const ROUTE_RE = /app\.(?:get|post|put|patch|delete)\(\s*(?:\[\s*)?['"`](\/api[^'"`]+)['"`]/g;
const CLIENT_LITERAL_RE = /['"`](\/api\/[^'"`$]+)['"`]/g;
const CLIENT_TEMPLATE_RE = /`(\/api\/[^`]+)`/g;

function normalize(p) {
  return p
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ':param')
    .replace(/\([^)]*\)/g, '') // remove express regex groups like :view(recent|...)
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '');
}

function collectFromText(text, routes) {
  for (const m of text.matchAll(ROUTE_RE)) {
    routes.add(normalize(m[1]));
  }
}

function collectServerRoutes() {
  const routes = new Set();
  if (!fs.existsSync(serverRoot)) {
    console.error('Server repo not found:', serverRoot);
    process.exit(2);
  }
  if (fs.existsSync(serverEntry)) {
    collectFromText(fs.readFileSync(serverEntry, 'utf8'), routes);
  }
  if (fs.existsSync(routesDir)) {
    for (const file of fs.readdirSync(routesDir)) {
      if (!file.endsWith('.js')) continue;
      collectFromText(fs.readFileSync(path.join(routesDir, file), 'utf8'), routes);
    }
  }
  return routes;
}

function collectClientPaths() {
  const text = fs.readFileSync(clientFile, 'utf8');
  const paths = new Set();
  for (const m of text.matchAll(CLIENT_LITERAL_RE)) {
    if (!m[1].includes('/api/proxy')) paths.add(normalize(m[1]));
  }
  for (const m of text.matchAll(CLIENT_TEMPLATE_RE)) {
    if (!m[1].includes('/api/proxy')) paths.add(normalize(m[1]));
  }
  return paths;
}

function collectAgentsEndpoints() {
  const text = fs.readFileSync(agentsFile, 'utf8');
  const endpoints = new Set();
  for (const m of text.matchAll(/`(GET|POST|PUT|PATCH|DELETE)\s+(\/api[^`]+)`/g)) {
    endpoints.add(normalize(m[2]));
  }
  return endpoints;
}

function matchRoute(clientPath, serverRoutes) {
  if (serverRoutes.has(clientPath)) return true;
  for (const route of serverRoutes) {
    const clientParts = clientPath.split('/');
    const routeParts = route.split('/');
    if (clientParts.length !== routeParts.length) continue;
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i] === ':param' || clientParts[i] === ':param') continue;
      if (routeParts[i] !== clientParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const serverRoutes = collectServerRoutes();
const clientPaths = collectClientPaths();
const agentsEndpoints = collectAgentsEndpoints();

const missingOnServer = [...clientPaths].filter((p) => !matchRoute(p, serverRoutes));
const clientUsedByReader = missingOnServer.filter(
  (p) => !p.includes('/api/admin') && !p.includes('/api/operations')
);

console.log(`Server routes: ${serverRoutes.size}`);
console.log(`Client paths:  ${clientPaths.size}`);
console.log(`AGENTS.md:     ${agentsEndpoints.size} endpoints documented\n`);

let failed = false;

if (clientUsedByReader.length) {
  failed = true;
  console.error('❌ Client paths with NO matching server route:');
  for (const p of clientUsedByReader.sort()) console.error('  ', p);
  console.error('');
}

const readerCritical = [
  '/api/profile',
  '/api/catalog',
  '/api/books/:param/position',
  '/api/books/:param/meta',
  '/api/reader-activity-sync-meta',
];
const missingCritical = readerCritical.filter((p) => !matchRoute(p, serverRoutes));
if (missingCritical.length) {
  failed = true;
  console.error('❌ Critical reader endpoints missing on server:');
  for (const p of missingCritical) console.error('  ', p);
  console.error('');
}

const checkDocs = [
  '/api/reader-activity-sync-meta',
  '/api/reading-history/:param',
  '/api/books/:param/reader-sync-meta',
];
const undocumented = checkDocs.filter((p) => !agentsEndpoints.has(p) && matchRoute(p, serverRoutes));
if (undocumented.length) {
  console.warn('⚠️  Document in AGENTS.md if not already:');
  for (const p of undocumented.sort()) console.warn('  ', p);
  console.warn('');
}

if (!failed) {
  console.log('✅ All inpxClient.ts /api paths have matching server routes.');
}

process.exit(failed ? 1 : 0);
