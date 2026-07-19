import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.resolve(root, '../inpx-library-server');
const publicDir = path.join(root, 'public');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

copyDir(path.join(serverRoot, 'public/foliate'), path.join(publicDir, 'foliate'));
// Do NOT copy server reader.js — app reader has Android-specific code and a distinct
// positionFromLocation wrapper; blind copy reintroduces stack overflow (shadowed import).
fs.copyFileSync(path.join(serverRoot, 'public/reader.css'), path.join(publicDir, 'inpx-reader/reader.css'));

const { renderReader } = await import(pathToFileURL(path.join(serverRoot, 'src/templates/library.js')).href);

let html = renderReader({
  book: { id: 'placeholder', ext: 'fb2', title: 'Book' },
  details: { title: 'Книга' },
  user: { username: 'app' },
  csrfToken: '',
});

html = html
  .replace('href="/reader.css', 'href="/inpx-reader/reader.css')
  .replace('<script src="/book-ref.js', '<!-- book-ref.js omitted -->')
  .replace(
    /<script>window\.__READER_BOOK_ID=.*?<\/script>\s*<script type="module" src="\/reader.js[^"]*"><\/script>/,
    `<script src="/inpx-reader/bootstrap.js"></script>
<script type="module" src="/inpx-reader/reader.js"></script>`,
  )
  .replace(
    /<a href="[^"]*" class="tb-btn"([^>]*?)><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"\/><\/svg><\/a>/,
    '<button type="button" class="tb-btn" id="btn-app-back"$1 aria-label="Назад"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>',
  );

fs.mkdirSync(path.join(publicDir, 'inpx-reader'), { recursive: true });
fs.writeFileSync(path.join(publicDir, 'inpx-reader/index.html'), html);
console.log('Reader assets synced to public/');
