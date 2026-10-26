import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.resolve(root, '../inpx-library-server');

function readerAssetVersion() {
  const hash = createHash('sha256');
  for (const rel of [
    'public/inpx-reader/reader.js',
    'public/inpx-reader/bootstrap.js',
    'public/inpx-reader/reader-native-bridge.js',
    'public/inpx-reader/reader.css',
    'public/foliate/view.js',
    'public/foliate/paginator.js',
    'public/foliate/fb2.js',
  ]) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`Missing reader asset: ${rel}`);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 12);
}

const version = readerAssetVersion();

/*
 * The page is the server's renderReader() (src/templates/library.js), evaluated here with stubs
 * and the server's Russian strings: toolbar, tile menu, panels and the settings list come from
 * one template. Its helpers live in src/templates/reader-chrome.js, which has no imports, so this
 * script never loads the server (DB, config). The app then swaps in its own settings sections
 * (more options than the web) and adds its extra chrome below.
 */
const { LOCALE_BUNDLES } = await import(pathToFileURL(path.join(serverRoot, 'src/locale-bundles.js')).href);
const readerChrome = await import(pathToFileURL(path.join(serverRoot, 'src/templates/reader-chrome.js')).href);
const ru = LOCALE_BUNDLES.ru;

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const t = (key) => {
  if (!(key in ru)) throw new Error(`Reader template uses a key missing from the server ru bundle: ${key}`);
  return ru[key];
};
const I18N_SCRIPT_STUB = '/__reader-i18n__.js';

const lib = fs.readFileSync(path.join(serverRoot, 'src/templates/library.js'), 'utf8').replace(/\r\n/g, '\n');
const fnStart = lib.indexOf('export function renderReader');
const fnEnd = lib.indexOf('</html>`;\n}', fnStart);
if (fnStart < 0 || fnEnd < 0) throw new Error('renderReader not found in the server template');
const fnSource = lib.slice(fnStart, fnEnd + '</html>`;\n}'.length).replace(/^export /, '');

const stubs = {
  t,
  escapeHtml,
  getLocale: () => 'ru',
  formatAuthorLabel: () => '',
  bookPagePath: () => '#',
  liteBookPagePath: () => '#',
  renderFaviconLinks: () => '',
  clientI18nScriptUrl: () => I18N_SCRIPT_STUB,
  STATIC_ASSET_VERSION: version,
  READER_ICONS: readerChrome.READER_ICONS,
  READER_THEMES: readerChrome.READER_THEMES,
  READER_EINK_UA_RE: readerChrome.READER_EINK_UA_RE,
  readerQuickTile: readerChrome.readerQuickTile,
  readerSettingsRow: readerChrome.readerSettingsRow,
};
// eslint-disable-next-line no-new-func
const renderReader = new Function(...Object.keys(stubs), `return ${fnSource}`)(...Object.values(stubs));
// The app fills the title at runtime (reader.js), so the template gets a placeholder that is cut out.
let html = renderReader({ book: { id: '', ext: 'fb2' }, details: { title: '__READER_TITLE__' }, user: null, lite: false })
  .replace(/__READER_TITLE__/g, '');

function replaceOnce(pattern, value, what) {
  if (!pattern.test(html)) throw new Error(`generate-reader-html: ${what} not found in the server template`);
  html = html.replace(pattern, value);
}

replaceOnce(/<title>[^<]*<\/title>/, '<title></title>', 'title');
// Web titles carry keyboard shortcuts («Оглавление (T)»); a phone has no keyboard.
html = html.replace(/ \([A-Z]\)"/g, '"');
// The app sets data-eink itself (useEinkMode → device / app setting), not from the browser UA.
replaceOnce(/<script>try\{var _s=JSON\.parse\(localStorage\.getItem\('reader-settings'\)[\s\S]*?<\/script>/,
  "<script>try{var _t=JSON.parse(localStorage.getItem('reader-settings')||'{}').theme||'sepia';document.documentElement.dataset.readerTheme=_t}catch(e){document.documentElement.dataset.readerTheme='sepia'}</script>",
  'theme boot script');
// Server serves UI strings as a script file; the app reader reads inline JSON and,
// when it is empty, loads public/inpx-reader/reader-i18n-ru.json itself.
replaceOnce(new RegExp(`<script src="${I18N_SCRIPT_STUB.replace(/[.]/g, '\\.')}" defer></script>`),
  '<script type="application/json" id="ui-i18n-json">{"locale":"ru","strings":{}}</script>', 'i18n script');
replaceOnce(/<script src="\/book-ref\.js[^"]*" defer><\/script>\s*/, '', 'book-ref script');
replaceOnce(/<script>window\.__READER_BOOK_ID=[\s\S]*?<\/script>\s*<script type="module" src="\/reader\.js[^"]*"><\/script>/,
  `<script>window.__READER_APP=1;window.__READER_ASSET_V__=${JSON.stringify(version)};</script>\n<script type="module" src="/inpx-reader/bootstrap.js?v=${version}"></script>\n<script src="/inpx-reader/reader-native-bridge.js?v=${version}"></script>\n<script type="module" src="/inpx-reader/reader.js?v=${version}"></script>`,
  'reader scripts');
replaceOnce(/href="\/reader\.css/, 'href="/inpx-reader/reader.css', 'reader.css link');
replaceOnce(/<a href="#" class="tb-btn"([^>]*)><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"\/><\/svg><\/a>/,
  '<button type="button" class="tb-btn" id="btn-app-back"$1><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>',
  'back link');

/* Settings sheet: the same section list as the web, with the app's own options in each section. */
const settingsRow = readerChrome.readerSettingsRow;
const resetIcon = readerChrome.READER_ICONS.reset;
const androidSettings = `
      <nav class="rs-root" id="rs-root" aria-label="Настройки">
        ${settingsRow('text', 'text', 'Текст')}
        ${settingsRow('look', 'palette', 'Цвета и тема')}
        ${settingsRow('page', 'page', 'Страница')}
        ${settingsRow('status', 'status', 'Строка состояния')}
        ${settingsRow('controls', 'hand', 'Управление')}
        ${settingsRow('tts', 'tts', 'Озвучка')}
        ${settingsRow('more', 'more', 'Прочее')}
        <button type="button" class="rs-root-row rs-root-reset" id="reader-reset-settings"><span class="rs-root-ico" aria-hidden="true">${resetIcon}</span><span class="rs-root-label">Сбросить</span></button>
      </nav>

      <section class="rs-page" data-rs-page="text" data-rs-title="Текст" hidden>
        <div class="rs-group">
          <div class="rs-label">Размер шрифта</div>
          <div class="rs-slider">
            <input type="range" id="rs-font-size" name="readerFontSize" min="12" max="32" step="1" aria-label="Размер шрифта">
            <span class="rs-val" id="rs-font-size-val">18</span>
          </div>
        </div>
        <div class="rs-group">
          <div class="rs-label">Пресеты</div>
          <div class="rs-seg rs-preset-seg">
            <button type="button" data-preset="compact">Компакт</button>
            <button type="button" data-preset="balanced">Баланс</button>
            <button type="button" data-preset="relaxed">Простор</button>
          </div>
        </div>
        <div class="rs-group">
          <div class="rs-label">Шрифт</div>
          <select id="rs-font-family" name="readerFontFamily" class="rs-select" aria-label="Шрифт"></select>
          <label class="rs-check">
            <span>Шрифт из книги</span>
            <input type="checkbox" id="rs-publisher-font" name="readerPublisherFont">
          </label>
        </div>
        <div class="rs-group">
          <div class="rs-label">Начертание</div>
          <select id="rs-font-weight" name="readerFontWeight" class="rs-select" aria-label="Начертание">
            <option value="400">Обычный</option>
            <option value="500">Средний</option>
            <option value="600">Полужирный</option>
            <option value="700">Жирный</option>
          </select>
        </div>
        <div class="rs-group">
          <div class="rs-label">Высота строки</div>
          <div class="rs-slider">
            <input type="range" id="rs-line-height" name="readerLineHeight" min="1.2" max="2.4" step="0.1" aria-label="Высота строки">
            <span class="rs-val" id="rs-line-height-val">1.6</span>
          </div>
        </div>
        <div class="rs-group">
          <div class="rs-label">Абзац</div>
          <label class="rs-check">
            <span>По ширине</span>
            <input type="checkbox" id="rs-justify" name="readerJustify" checked>
          </label>
          <label class="rs-check">
            <span>Переносы</span>
            <input type="checkbox" id="rs-hyphenate" name="readerHyphenate" checked>
          </label>
        </div>
        <div class="rs-group">
          <div class="rs-sublabel">Между абзацами</div>
          <div class="rs-slider">
            <input type="range" id="rs-paragraph-spacing" name="readerParagraphSpacing" min="0" max="1.5" step="0.05" aria-label="Межабзацный интервал">
            <span class="rs-val" id="rs-paragraph-spacing-val">0.40</span>
          </div>
          <div class="rs-sublabel">Красная строка</div>
          <div class="rs-slider">
            <input type="range" id="rs-text-indent" name="readerTextIndent" min="0" max="3" step="0.1" aria-label="Красная строка">
            <span class="rs-val" id="rs-text-indent-val">0.0 em</span>
          </div>
          <div class="rs-sublabel">Межбуквенный</div>
          <div class="rs-slider">
            <input type="range" id="rs-letter-spacing" name="readerLetterSpacing" min="-0.05" max="0.2" step="0.01" aria-label="Межбуквенный интервал">
            <span class="rs-val" id="rs-letter-spacing-val">0.00</span>
          </div>
        </div>
      </section>

      <section class="rs-page" data-rs-page="look" data-rs-title="Цвета и тема" hidden>
        <div class="rs-group">
          <div class="rs-label">Тема</div>
          <div class="rs-themes">
            <button class="rs-theme-dot" type="button" data-set-theme="light"><span class="rs-dot-label">Светлая</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="sepia"><span class="rs-dot-label">Сепия</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="dark"><span class="rs-dot-label">Тёмная</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="night"><span class="rs-dot-label">Ночь</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="eink"><span class="rs-dot-label">E-Ink</span></button>
          </div>
        </div>
        <div id="rs-brightness-slot"></div>
        <div class="rs-group">
          <div class="rs-label">Цвет</div>
          <div class="rs-color-stack">
            <div class="rs-color-line">
              <div class="rs-color-sub">Текст</div>
              <div class="rs-color-row">
                <input type="color" id="rs-text-color" name="readerTextColor" value="#3d3121" aria-label="Текст" title="Цвет текста">
                <button type="button" class="rs-color-default" id="rs-text-color-default">Тема</button>
              </div>
            </div>
            <div class="rs-color-line">
              <div class="rs-color-sub">Фон</div>
              <div class="rs-color-row">
                <input type="color" id="rs-bg-color" name="readerBgColor" value="#f4edd5" aria-label="Фон" title="Цвет фона">
                <button type="button" class="rs-color-default" id="rs-bg-color-default">Тема</button>
              </div>
            </div>
            <div class="rs-color-line">
              <div class="rs-color-sub">Ссылки</div>
              <div class="rs-color-row">
                <input type="color" id="rs-link-color" name="readerLinkColor" value="#8b5a12" aria-label="Ссылки" title="Цвет ссылок">
                <button type="button" class="rs-color-default" id="rs-link-color-default">Тема</button>
              </div>
            </div>
          </div>
        </div>
        <div class="rs-group" id="rs-bg-image-group">
          <div class="rs-label">Картинка на фоне</div>
          <div class="rs-bg-image-row">
            <div class="rs-bg-image-preview" id="rs-bg-image-preview" aria-hidden="true"></div>
            <div class="rs-bg-image-actions">
              <label class="rs-file-btn">
                Выбрать
                <input type="file" id="rs-bg-image-file" accept="image/*" hidden>
              </label>
              <button type="button" class="rs-bg-image-clear" id="rs-bg-image-clear" hidden>Убрать</button>
            </div>
          </div>
          <div class="rs-sublabel">Масштаб</div>
          <div class="rs-seg">
            <button type="button" data-bg-image-fit="cover">Заполнить</button>
            <button type="button" data-bg-image-fit="contain">Вписать</button>
            <button type="button" data-bg-image-fit="tile">Плитка</button>
          </div>
          <div id="rs-bg-image-paper-wrap" hidden>
            <div class="rs-sublabel">Затемнение</div>
            <div class="rs-slider">
              <input type="range" id="rs-bg-image-paper" min="0" max="1" step="0.02" aria-label="Затемнение поверх картинки">
              <span class="rs-val" id="rs-bg-image-paper-val">35%</span>
            </div>
          </div>
        </div>
        <div class="rs-group">
          <label class="rs-check">
            <span>Инверсия</span>
            <input type="checkbox" id="rs-invert" name="readerInvert">
          </label>
        </div>
      </section>

      <section class="rs-page" data-rs-page="page" data-rs-title="Страница" hidden>
        <div class="rs-group">
          <div class="rs-label">Режим</div>
          <div class="rs-seg">
            <button type="button" data-set-layout="paginated">Страницы</button>
            <button type="button" data-set-layout="dual" class="rs-layout-dual-btn">Разворот</button>
            <button type="button" data-set-layout="scrolled">Прокрутка</button>
          </div>
        </div>
        <div class="rs-group" id="rs-layout-paginated">
          <div class="rs-label">Ширина колонки</div>
          <div class="rs-slider">
            <input type="range" id="rs-column-width" name="readerColumnWidth" min="480" max="920" step="20" aria-label="Ширина колонки">
            <span class="rs-val" id="rs-column-width-val">720 px</span>
          </div>
          <label class="rs-check">
            <span>На всю ширину</span>
            <input type="checkbox" id="rs-full-width" name="readerFullWidth">
          </label>
        </div>
        <div class="rs-group" id="rs-layout-dual" hidden>
          <div class="rs-label">Зазор между колонками</div>
          <div class="rs-slider">
            <input type="range" id="rs-column-gap" name="readerColumnGap" min="4" max="16" step="1" aria-label="Зазор">
            <span class="rs-val" id="rs-column-gap-val">7%</span>
          </div>
        </div>
        <div class="rs-group" id="rs-layout-scrolled" hidden>
          <div class="rs-label">Высота блока</div>
          <div class="rs-slider">
            <input type="range" id="rs-max-block-size" name="readerMaxBlockSize" min="720" max="2400" step="40" aria-label="Высота блока">
            <span class="rs-val" id="rs-max-block-size-val">1440 px</span>
          </div>
          <div class="rs-hint">Максимальная высота текста в режиме прокрутки</div>
        </div>
        <div class="rs-group">
          <div class="rs-label">Поля</div>
          <div class="rs-sublabel">Боковые</div>
          <div class="rs-slider">
            <input type="range" id="rs-page-margin" name="readerPageMargin" min="0" max="72" step="4" aria-label="Боковые поля">
            <span class="rs-val" id="rs-page-margin-val">32 px</span>
          </div>
          <div class="rs-sublabel">Вертикальные</div>
          <div class="rs-slider">
            <input type="range" id="rs-vertical-margin" name="readerVerticalMargin" min="0" max="96" step="4" aria-label="Вертикальные поля">
            <span class="rs-val" id="rs-vertical-margin-val">32 px</span>
          </div>
        </div>
      </section>

      <section class="rs-page" data-rs-page="status" data-rs-title="Строка состояния" hidden>
        <div class="rs-group">
          <div class="rs-label">Видимость</div>
          <div class="rs-seg">
            <button type="button" data-set-status-mode="withChrome">С меню</button>
            <button type="button" data-set-status-mode="always">Всегда</button>
            <button type="button" data-set-status-mode="hidden">Скрыта</button>
          </div>
        </div>
        <div class="rs-group">
          <label class="rs-check"><span>Глава</span><input type="checkbox" id="rs-status-chapter" name="statusChapter" checked></label>
          <label class="rs-check"><span>Процент</span><input type="checkbox" id="rs-status-pct" name="statusPct" checked></label>
          <label class="rs-check"><span>Страница</span><input type="checkbox" id="rs-status-page" name="statusPage" checked></label>
          <label class="rs-check"><span>Осталось в главе</span><input type="checkbox" id="rs-status-chapter-left" name="statusChapterLeft"></label>
          <label class="rs-check"><span>Часы</span><input type="checkbox" id="rs-status-clock" name="statusClock"></label>
        </div>
      </section>

      <section class="rs-page" data-rs-page="controls" data-rs-title="Управление" hidden>
        <div class="rs-group" id="rs-eink-refresh-group" hidden>
          <div class="rs-label">Полная перерисовка E-Ink</div>
          <div class="rs-seg">
            <button type="button" data-set-eink-refresh="1">Каждый раз</button>
            <button type="button" data-set-eink-refresh="3">Каждые 3</button>
            <button type="button" data-set-eink-refresh="5">Каждые 5</button>
          </div>
          <div class="rs-hint">Полная перерисовка убирает шлейф от прошлых страниц.</div>
        </div>
        <div class="rs-group" id="rs-eink-volume-hint" hidden>
          <div class="rs-hint">E-Ink: громкость листает страницы. Яркость — левый край, температура — правый.</div>
        </div>
        <div id="rs-volume-keys-slot"></div>
        <div class="rs-group">
          <div class="rs-label">Автолистание, сек</div>
          <div class="rs-slider">
            <input type="range" id="rs-auto-flip" name="readerAutoFlip" min="0" max="30" step="1" aria-label="Интервал автоперелистывания">
            <span class="rs-val" id="rs-auto-flip-val">Выкл</span>
          </div>
          <div class="rs-hint">0 — выкл. Только в режиме страниц.</div>
        </div>
        <div class="rs-group">
          <label class="rs-check"><span>Вибрация при листании</span><input type="checkbox" id="rs-page-haptic" name="readerPageHaptic"></label>
        </div>
        <div class="rs-group">
          <div class="rs-label">Зоны экрана</div>
          <div class="rs-seg rs-tap-mode-seg">
            <button type="button" data-tap-edit="short" class="is-active">Короткий тап</button>
            <button type="button" data-tap-edit="long">Долгий тап</button>
          </div>
          <div class="rs-tap-grid" id="rs-tap-grid" role="group" aria-label="Зоны экрана"></div>
          <select id="rs-tap-action" class="rs-select" aria-label="Действие зоны" hidden></select>
          <div class="rs-hint" id="rs-tap-hint">Клетка, затем действие</div>
          <button type="button" class="rs-tap-reset" id="rs-tap-reset">Сброс зон</button>
        </div>
      </section>

      <section class="rs-page" data-rs-page="tts" data-rs-title="Озвучка" hidden>
        <div class="rs-group">
          <!-- Голос, скорость, тон, подсветка, паузы: reader-shared/reader-tts.js -->
          <div id="rs-tts-mount"></div>
        </div>
      </section>

      <section class="rs-page" data-rs-page="more" data-rs-title="Прочее" hidden>
        <div class="rs-group">
          <label class="rs-check">
            <span>Всплывающие сноски</span>
            <input type="checkbox" id="rs-footnotes" name="readerFootnotes" checked>
          </label>
        </div>
        <div class="rs-group">
          <div class="rs-label">Свой CSS</div>
          <textarea id="rs-custom-css" class="rs-custom-css" name="readerCustomCss" rows="5" spellcheck="false" placeholder="/* Дополнительные стили для текста книги */"></textarea>
          <button type="button" class="rs-custom-css-clear" id="rs-custom-css-clear">Очистить CSS</button>
        </div>
      </section>`;

replaceOnce(/(<div class="panel-body rs-body" data-panel-tab="settings" hidden>)[\s\S]*?(\n {4}<\/div>\n {2}<\/div>\n<\/div>\n)/,
  `$1${androidSettings}$2`, 'settings panel');

/** AlReaderX-пакет: статус, goto, chrome footer — вне settings panel. */
function injectAlReaderChrome(source) {
  let out = source;

  // The percentage itself opens «Перейти к…» (as in AlReader / Moon+), instead of a separate
  // «Перейти» word next to the seek bar that read like its caption.
  out = out.replace(
    /<span class="ft-pct" id="ft-pct">[^<]*<\/span>/,
    '<button type="button" class="ft-goto-btn" id="ft-goto" title="Перейти к позиции" aria-label="Перейти к позиции"><span class="ft-pct" id="ft-pct">0%</span></button>',
  );

  out = out.replace(
    /<button type="button" class="rsm-btn" id="rsm-note"[^>]*>([^<]*)<\/button>/,
    '<button type="button" class="rsm-btn" id="rsm-note">$1</button>\n  <button type="button" class="rsm-btn" id="rsm-bookmark">Закладка</button>',
  );

  out = out.replace(
    /(<\/div>\s*\n)(<div class="reader-tts-dock")/,
    `$1
<div class="reader-status-strip" id="reader-status-strip" aria-hidden="true">
  <div class="rss-side rss-left">
    <span class="rss-item rss-chapter" id="rss-chapter" hidden></span>
  </div>
  <div class="rss-mid">
    <span class="rss-item rss-page" id="rss-page" hidden></span>
    <span class="rss-item rss-chapter-left" id="rss-chapter-left" hidden></span>
  </div>
  <div class="rss-side rss-right">
    <span class="rss-item rss-clock" id="rss-clock" hidden></span>
    <span class="rss-item rss-pct" id="rss-pct" hidden></span>
  </div>
</div>

<div class="reader-autoflip-hud" id="reader-autoflip-hud" hidden aria-hidden="true">Авто</div>

<div class="reader-hud-flash" id="reader-hud-flash" aria-hidden="true"></div>

$2`,
  );

  out = out.replace(
    /(<div class="reader-note-editor" id="reader-note-editor" aria-hidden="true">\s*<div class="rne-card">[\s\S]*?<\/div>\s*<\/div>\s*)(\n*<div class="panel-overlay")/,
    `$1
<div class="reader-goto" id="reader-goto" aria-hidden="true">
  <div class="rg-card">
    <div class="rg-title">Перейти к…</div>
    <label class="rg-label" for="rg-pct">Процент</label>
    <div class="rg-row">
      <input type="range" id="rg-pct" name="gotoPct" min="0" max="100" step="0.1" value="0">
      <input type="number" id="rg-pct-num" name="gotoPctNum" min="0" max="100" step="0.1" value="0" inputmode="decimal">
      <span class="rg-unit">%</span>
    </div>
    <label class="rg-label" for="rg-page">Страница</label>
    <div class="rg-row">
      <input type="number" id="rg-page" name="gotoPage" min="1" step="1" value="1" inputmode="numeric">
      <span class="rg-unit" id="rg-page-total">из —</span>
    </div>
    <div class="rg-hint" id="rg-page-hint">Номер экрана в текущей вёрстке</div>
    <div class="rne-actions">
      <button type="button" class="rne-btn" id="rg-cancel">Отмена</button>
      <button type="button" class="rne-btn rne-btn-primary" id="rg-go">Перейти</button>
    </div>
  </div>
</div>
$2`,
  );

  return out;
}

html = injectAlReaderChrome(html);

html = html.replace(
  /<div id="reader-body">/,
  `<div class="reader-restore-veil" id="reader-restore-veil" hidden></div>
<div id="reader-body">`,
);

// Полноэкранный wallpaper underlay (Android WebView; создаётся и из reader.js)
html = html.replace(
  /<body([^>]*)>/i,
  '<body$1>\n<div id="reader-wallpaper" aria-hidden="true"></div>',
);

// A template value the stubs above did not cover would leave src="" / href="" — the WebView would load the page itself as a script.
if (/\s(?:src|href)=""/.test(html)) {
  throw new Error('Reader HTML has an empty src/href: a server template value needs a stub above');
}

html = html.replace(/\r\n/g, '\n');

const out = path.join(root, 'public/inpx-reader/index.html');
fs.writeFileSync(out, html);
console.log('Wrote', out, html.length, 'bytes', `v=${version}`);
if (!html.includes(`src="/inpx-reader/reader.js?v=${version}"`)) {
  console.error('Reader script is missing a cache-busting query; WebView will keep stale JS');
  process.exit(1);
}
if (!html.includes('id="reader-loading"')) {
  console.error('Foliate book loader #reader-loading is missing');
  process.exit(1);
}
const veilMarkup = html.match(/<div class="reader-restore-veil" id="reader-restore-veil"[^>]*>[\s\S]*?<\/div>/);
if (veilMarkup && veilMarkup[0].includes('Загрузка книги')) {
  console.error('Restore veil must not repeat the Foliate loading message');
  process.exit(1);
}
for (const id of ['rs-tap-grid', 'reader-goto', 'ft-goto', 'reader-quick', 'rs-root', 'rs-tts-mount', 'reader-status-strip', 'rsm-bookmark', 'btn-app-back']) {
  if (!html.includes(`id="${id}"`)) {
    console.error(`Reader markup #${id} missing after generate-reader-html`);
    process.exit(1);
  }
}
