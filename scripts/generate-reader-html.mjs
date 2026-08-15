import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readerAssetVersion() {
  const hash = createHash('sha256');
  for (const rel of [
    'public/inpx-reader/reader.js',
    'public/inpx-reader/bootstrap.js',
    'public/inpx-reader/reader-native-bridge.js',
    'public/inpx-reader/reader.css',
    'public/foliate/view.js',
    'public/foliate/paginator.js',
  ]) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`Missing reader asset: ${rel}`);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 12);
}

const version = readerAssetVersion();
const libPath = path.resolve(root, '../inpx-library-server/src/templates/library.js');
const lib = fs.readFileSync(libPath, 'utf8');
const marker = 'export function renderReader';
const fnStart = lib.indexOf(marker);
const retStart = lib.indexOf('return `<!DOCTYPE html>', fnStart);
const retEnd = lib.indexOf('</html>`;', retStart);
if (retStart < 0 || retEnd < 0) throw new Error('renderReader HTML not found');

let html = lib.slice(retStart + 8, retEnd + 7);

const replacements = [
  [/\$\{htmlLang\}/g, 'ru'],
  [/\$\{htmlAttrs\}/g, ''],
  [/\$\{csrfToken \? `[\s\S]*?` : ''\}/g, ''],
  [/\$\{escapeHtml\(siteTitleForDisplay\(\)\)\} \\u2014 \$\{escapeHtml\(title\)\}/g, 'Читалка'],
  [/\$\{renderFaviconLinks\(\)\}/g, ''],
  [/\$\{fontPreconnect\}/g, ''],
  [/\$\{STATIC_ASSET_VERSION\}/g, version],
  [/\$\{themeBoot\}/g, "try{var _t=JSON.parse(localStorage.getItem('reader-settings')||'{}').theme||'sepia';document.documentElement.dataset.readerTheme=_t}catch(e){document.documentElement.dataset.readerTheme='sepia'}"],
  [/\$\{lite \? ' reader-lite' : ''\}/g, ''],
  [/\$\{serializeClientI18n\(\)\}/g, '{"locale":"ru","strings":{}}'],
  [/\$\{liteBoot\}/g, ''],
  [/\$\{themeSettingsBlock\}/g, `<div class="rs-group">
        <div class="rs-label">Тема</div>
        <div class="rs-themes">
          <button class="rs-theme-dot" type="button" data-set-theme="dark"><span class="rs-dot-label">Тёмная</span></button>
          <button class="rs-theme-dot" type="button" data-set-theme="light"><span class="rs-dot-label">Светлая</span></button>
          <button class="rs-theme-dot" type="button" data-set-theme="sepia"><span class="rs-dot-label">Сепия</span></button>
          <button class="rs-theme-dot" type="button" data-set-theme="night"><span class="rs-dot-label">Ночь</span></button>
        </div>
      </div>`],
  [/\$\{ttsStopSvg\}/g, '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg>'],
  [/\$\{escapeHtml\(t\('reader\.back'\)\)\}/g, 'Назад'],
  [/\$\{escapeHtml\(t\('reader\.backToBook'\)\)\}/g, 'Назад'],
  [/\$\{escapeHtml\(t\('reader\.reading'\)\)\}/g, 'Чтение'],
  [/\$\{escapeHtml\(title\)\}/g, ''],
  [/\$\{escapeHtml\(t\('reader\.loading'\)\)\}/g, 'Загрузка…'],
  [/\$\{escapeHtml\(t\('reader\.loadingBook'\)\)\}/g, 'Загрузка книги…'],
  [/\$\{escapeHtml\(t\('reader\.ttsBar'\)\)\}/g, 'Озвучка'],
  [/\$\{escapeHtml\(t\('reader\.ttsPrev'\)\)\}/g, 'Назад'],
  [/\$\{escapeHtml\(t\('reader\.ttsPlay'\)\)\}/g, 'Читать'],
  [/\$\{escapeHtml\(t\('reader\.ttsStop'\)\)\}/g, 'Стоп'],
  [/\$\{escapeHtml\(t\('reader\.ttsNext'\)\)\}/g, 'Вперёд'],
  [/\$\{escapeHtml\(t\('reader\.fullscreen'\)\)\}/g, 'Полный экран'],
  [/\$\{escapeHtml\(t\('reader\.nightMode'\)\)\}/g, 'Ночь'],
  [/\$\{escapeHtml\(t\('reader\.dayModeToggle'\)\)\}/g, 'День/ночь'],
  [/\$\{escapeHtml\(t\('reader\.bookmark'\)\)\}/g, 'Закладка'],
  [/\$\{escapeHtml\(t\('reader\.addBookmark'\)\)\}/g, 'Добавить закладку'],
  [/\$\{escapeHtml\(t\('reader\.search'\)\)\}/g, 'Поиск'],
  [/\$\{escapeHtml\(t\('reader\.searchBook'\)\)\}/g, 'Поиск по книге'],
  [/\$\{escapeHtml\(t\('reader\.toc'\)\)\}/g, 'Оглавление'],
  [/\$\{escapeHtml\(t\('reader\.tocNav'\)\)\}/g, 'Оглавление'],
  [/\$\{escapeHtml\(t\('reader\.settings'\)\)\}/g, 'Настройки'],
  [/\$\{escapeHtml\(t\('reader\.settingsReading'\)\)\}/g, 'Настройки чтения'],
  [/\$\{escapeHtml\(t\('readerJs\.highlight'\)\)\}/g, 'Выделить'],
  [/\$\{escapeHtml\(t\('readerJs\.addNote'\)\)\}/g, 'Заметка'],
  [/\$\{escapeHtml\(t\('readerJs\.copy'\)\)\}/g, 'Копировать'],
  [/\$\{escapeHtml\(t\('readerJs\.remove'\)\)\}/g, 'Удалить'],
  [/\$\{escapeHtml\(t\('readerJs\.notePlaceholder'\)\)\}/g, 'Ваша заметка…'],
  [/\$\{escapeHtml\(t\('readerJs\.cancel'\)\)\}/g, 'Отмена'],
  [/\$\{escapeHtml\(t\('readerJs\.save'\)\)\}/g, 'Сохранить'],
  [/\$\{escapeHtml\(t\('reader\.closePanel'\)\)\}/g, 'Закрыть'],
  [/\$\{escapeHtml\(t\('readerJs\.panelTocKicker'\)\)\}/g, 'Навигация'],
  [/\$\{escapeHtml\(t\('readerJs\.panelTocTitle'\)\)\}/g, 'Оглавление'],
  [/\$\{escapeHtml\(t\('reader\.close'\)\)\}/g, 'Закрыть'],
  [/\$\{escapeHtml\(t\('reader\.panelToc'\)\)\}/g, 'Оглавление'],
  [/\$\{escapeHtml\(t\('reader\.panelSearch'\)\)\}/g, 'Поиск'],
  [/\$\{escapeHtml\(t\('reader\.panelBookmarks'\)\)\}/g, 'Закладки'],
  [/\$\{escapeHtml\(t\('reader\.panelNotes'\)\)\}/g, 'Заметки'],
  [/\$\{escapeHtml\(t\('reader\.panelSettings'\)\)\}/g, 'Настройки'],
  [/\$\{escapeHtml\(t\('reader\.findChapter'\)\)\}/g, 'Найти главу'],
  [/\$\{escapeHtml\(t\('reader\.prevChapter'\)\)\}/g, 'Пред. глава'],
  [/\$\{escapeHtml\(t\('reader\.nextChapter'\)\)\}/g, 'След. глава'],
  [/\$\{escapeHtml\(t\('readerJs\.searchPlaceholder'\)\)\}/g, 'Поиск по тексту'],
  [/\$\{escapeHtml\(t\('readerJs\.searchHint'\)\)\}/g, 'Введите запрос'],
  [/\$\{escapeHtml\(t\('reader\.presets'\)\)\}/g, 'Пресеты'],
  [/\$\{escapeHtml\(t\('reader\.presetCompact'\)\)\}/g, 'Компакт'],
  [/\$\{escapeHtml\(t\('reader\.presetBalanced'\)\)\}/g, 'Баланс'],
  [/\$\{escapeHtml\(t\('reader\.presetRelaxed'\)\)\}/g, 'Простор'],
  [/\$\{escapeHtml\(t\('reader\.font'\)\)\}/g, 'Шрифт'],
  [/\$\{escapeHtml\(t\('reader\.fontFaceAria'\)\)\}/g, 'Шрифт'],
  [/\$\{escapeHtml\(t\('reader\.color'\)\)\}/g, 'Цвет'],
  [/\$\{escapeHtml\(t\('reader\.textColor'\)\)\}/g, 'Текст'],
  [/\$\{escapeHtml\(t\('reader\.customTextColorTitle'\)\)\}/g, 'Цвет текста'],
  [/\$\{escapeHtml\(t\('reader\.fromTheme'\)\)\}/g, 'Из темы'],
  [/\$\{escapeHtml\(t\('reader\.bgColor'\)\)\}/g, 'Фон'],
  [/\$\{escapeHtml\(t\('reader\.customBgColorTitle'\)\)\}/g, 'Цвет фона'],
  [/\$\{escapeHtml\(t\('reader\.fontSize'\)\)\}/g, 'Размер'],
  [/\$\{escapeHtml\(t\('reader\.lineHeight'\)\)\}/g, 'Интервал'],
  [/\$\{escapeHtml\(t\('reader\.pageMargin'\)\)\}/g, 'Поля'],
  [/\$\{escapeHtml\(t\('reader\.pageMarginHint'\)\)\}/g, ''],
  [/\$\{escapeHtml\(t\('reader\.layoutMode'\)\)\}/g, 'Режим'],
  [/\$\{escapeHtml\(t\('reader\.layoutPaginated'\)\)\}/g, 'Страницы'],
  [/\$\{escapeHtml\(t\('reader\.layoutDual'\)\)\}/g, 'Разворот'],
  [/\$\{escapeHtml\(t\('reader\.columnWidth'\)\)\}/g, 'Ширина'],
  [/\$\{escapeHtml\(t\('reader\.fullWidth'\)\)\}/g, 'На всю ширину'],
  [/\$\{escapeHtml\(t\('reader\.columnGap'\)\)\}/g, 'Зазор'],
  [/\$\{escapeHtml\(t\('reader\.columnGapHint'\)\)\}/g, ''],
  [/\$\{escapeHtml\(t\('reader\.ttsSettings'\)\)\}/g, 'Озвучка'],
  [/\$\{escapeHtml\(t\('reader\.ttsRate'\)\)\}/g, 'Скорость'],
  [/\$\{escapeHtml\(t\('reader\.ttsVoice'\)\)\}/g, 'Голос'],
  [/\$\{escapeHtml\(t\('reader\.ttsVoiceDefault'\)\)\}/g, 'Системный'],
  [/\$\{escapeHtml\(t\('reader\.reset'\)\)\}/g, 'Сброс'],
  [/\$\{escapeHtml\(t\('reader\.theme'\)\)\}/g, 'Тема'],
  [/\$\{escapeHtml\(t\('reader\.themeDark'\)\)\}/g, 'Тёмная'],
  [/\$\{escapeHtml\(t\('reader\.themeLight'\)\)\}/g, 'Светлая'],
  [/\$\{escapeHtml\(t\('reader\.themeSepia'\)\)\}/g, 'Сепия'],
  [/\$\{escapeHtml\(t\('reader\.themeNight'\)\)\}/g, 'Ночь'],
  [/\$\{backHref\}/g, '#'],
  [/\$\{readerBackClick\}/g, ''],
  [/<script src="\/book-ref\.js[^"]*" defer><\/script>\s*/g, ''],
  [/<script>window\.__READER_BOOK_ID=[\s\S]*?<\/script>\s*<script type="module" src="\/reader\.js[^"]*"><\/script>/,
    `<script>window.__READER_APP=1;window.__READER_ASSET_V__=${JSON.stringify(version)};</script>\n<script type="module" src="/inpx-reader/bootstrap.js?v=${version}"></script>\n<script src="/inpx-reader/reader-native-bridge.js?v=${version}"></script>\n<script type="module" src="/inpx-reader/reader.js?v=${version}"></script>`],
  [/href="\/reader\.css/g, 'href="/inpx-reader/reader.css'],
  [/<a href="#" class="tb-btn"([^>]*)><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"\/><\/svg><\/a>/,
    '<button type="button" class="tb-btn" id="btn-app-back"$1 aria-label="Назад"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'],
];

for (const [pattern, value] of replacements) {
  html = html.replace(pattern, value);
}

function composeReaderSettingsPanel(html) {
  const inner = `
      <section class="rs-section" data-rs-section="presets">
        <h3 class="rs-section-title">Пресеты</h3>
        <div class="rs-group">
          <div class="rs-seg rs-preset-seg">
            <button type="button" data-preset="compact">Компакт</button>
            <button type="button" data-preset="balanced">Баланс</button>
            <button type="button" data-preset="relaxed">Простор</button>
          </div>
        </div>
      </section>

      <section class="rs-section" data-rs-section="appearance">
        <h3 class="rs-section-title">Оформление</h3>
        <div class="rs-group">
          <div class="rs-label">Тема</div>
          <div class="rs-themes">
            <button class="rs-theme-dot" type="button" data-set-theme="dark"><span class="rs-dot-label">Тёмная</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="light"><span class="rs-dot-label">Светлая</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="sepia"><span class="rs-dot-label">Сепия</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="night"><span class="rs-dot-label">Ночь</span></button>
            <button class="rs-theme-dot" type="button" data-set-theme="eink"><span class="rs-dot-label">E-Ink</span></button>
          </div>
        </div>
        <div class="rs-group">
          <div class="rs-label">Цвета</div>
          <div class="rs-color-stack">
            <div class="rs-color-line">
              <div class="rs-color-sub">Текст</div>
              <div class="rs-color-row">
                <input type="color" id="rs-text-color" name="readerTextColor" value="#3d3121" aria-label="Текст" title="Цвет текста">
                <button type="button" class="rs-color-default" id="rs-text-color-default" title="Из темы">Из темы</button>
              </div>
            </div>
            <div class="rs-color-line">
              <div class="rs-color-sub">Фон</div>
              <div class="rs-color-row">
                <input type="color" id="rs-bg-color" name="readerBgColor" value="#f4edd5" aria-label="Фон" title="Цвет фона">
                <button type="button" class="rs-color-default" id="rs-bg-color-default" title="Из темы">Из темы</button>
              </div>
            </div>
            <div class="rs-color-line">
              <div class="rs-color-sub">Ссылки</div>
              <div class="rs-color-row">
                <input type="color" id="rs-link-color" name="readerLinkColor" value="#8b5a12" aria-label="Ссылки" title="Цвет ссылок">
                <button type="button" class="rs-color-default" id="rs-link-color-default" title="Из темы">Из темы</button>
              </div>
            </div>
          </div>
        </div>
        <div class="rs-group" id="rs-bg-image-group">
          <div class="rs-label">Фоновое изображение</div>
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
            <div class="rs-sublabel">Затемнение поверх картинки</div>
            <div class="rs-slider">
              <input type="range" id="rs-bg-image-paper" min="0" max="1" step="0.02" aria-label="Затемнение поверх картинки">
              <span class="rs-val" id="rs-bg-image-paper-val">35%</span>
            </div>
            <div class="rs-hint">0% — только картинка, 100% — сплошной цвет темы</div>
          </div>
        </div>
        <div class="rs-group">
          <label class="rs-check">
            <input type="checkbox" id="rs-invert" name="readerInvert">
            <span>Инверсия цветов</span>
          </label>
        </div>
        <div id="rs-brightness-slot"></div>
      </section>

      <section class="rs-section" data-rs-section="font">
        <h3 class="rs-section-title">Шрифт</h3>
        <div class="rs-group">
          <div class="rs-label">Гарнитура</div>
          <select id="rs-font-family" name="readerFontFamily" class="rs-select" aria-label="Шрифт"></select>
          <label class="rs-check">
            <input type="checkbox" id="rs-publisher-font" name="readerPublisherFont">
            <span>Шрифт из книги</span>
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
          <div class="rs-label">Размер</div>
          <div class="rs-slider">
            <span class="rs-icon">A</span>
            <input type="range" id="rs-font-size" name="readerFontSize" min="12" max="32" step="1">
            <span class="rs-val" id="rs-font-size-val">18</span>
            <span class="rs-icon rs-icon-lg">A</span>
          </div>
        </div>
        <div class="rs-group">
          <div class="rs-label">Межстрочный интервал</div>
          <div class="rs-slider">
            <span class="rs-icon">&equiv;</span>
            <input type="range" id="rs-line-height" name="readerLineHeight" min="1.2" max="2.4" step="0.1">
            <span class="rs-val" id="rs-line-height-val">1.6</span>
          </div>
        </div>
      </section>

      <section class="rs-section" data-rs-section="layout">
        <h3 class="rs-section-title">Макет</h3>
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
            <input type="checkbox" id="rs-full-width" name="readerFullWidth">
            <span>На всю ширину</span>
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
            <span class="rs-icon" aria-hidden="true">|</span>
            <input type="range" id="rs-page-margin" name="readerPageMargin" min="0" max="72" step="4" aria-label="Боковые поля">
            <span class="rs-val" id="rs-page-margin-val">32 px</span>
            <span class="rs-icon" aria-hidden="true">|&nbsp;|</span>
          </div>
          <div class="rs-sublabel">Вертикальные</div>
          <div class="rs-slider">
            <span class="rs-icon" aria-hidden="true">—</span>
            <input type="range" id="rs-vertical-margin" name="readerVerticalMargin" min="0" max="96" step="4" aria-label="Вертикальные поля">
            <span class="rs-val" id="rs-vertical-margin-val">32 px</span>
            <span class="rs-icon" aria-hidden="true">≡</span>
          </div>
        </div>
      </section>

      <section class="rs-section" data-rs-section="typography">
        <h3 class="rs-section-title">Типографика</h3>
        <div class="rs-group">
          <label class="rs-check">
            <input type="checkbox" id="rs-justify" name="readerJustify" checked>
            <span>Выравнивание по ширине</span>
          </label>
          <label class="rs-check">
            <input type="checkbox" id="rs-hyphenate" name="readerHyphenate" checked>
            <span>Переносы (дефисы)</span>
          </label>
        </div>
        <div class="rs-group">
          <div class="rs-sublabel">Межбуквенный интервал</div>
          <div class="rs-slider">
            <input type="range" id="rs-letter-spacing" name="readerLetterSpacing" min="-0.05" max="0.2" step="0.01" aria-label="Межбуквенный интервал">
            <span class="rs-val" id="rs-letter-spacing-val">0.00</span>
          </div>
          <div class="rs-sublabel">Межабзацный интервал</div>
          <div class="rs-slider">
            <input type="range" id="rs-paragraph-spacing" name="readerParagraphSpacing" min="0" max="1.5" step="0.05" aria-label="Межабзацный интервал">
            <span class="rs-val" id="rs-paragraph-spacing-val">0.40</span>
          </div>
          <div class="rs-sublabel">Красная строка</div>
          <div class="rs-slider">
            <input type="range" id="rs-text-indent" name="readerTextIndent" min="0" max="3" step="0.1" aria-label="Красная строка">
            <span class="rs-val" id="rs-text-indent-val">0.0 em</span>
          </div>
        </div>
      </section>

      <section class="rs-section" data-rs-section="controls">
        <h3 class="rs-section-title">Управление</h3>
        <div class="rs-group">
          <div class="rs-label">Зоны экрана</div>
          <div class="rs-seg rs-tap-mode-seg">
            <button type="button" data-tap-edit="short" class="is-active">Короткий тап</button>
            <button type="button" data-tap-edit="long">Долгий тап</button>
          </div>
          <div class="rs-tap-grid" id="rs-tap-grid" role="group" aria-label="Зоны экрана"></div>
          <select id="rs-tap-action" class="rs-select" aria-label="Действие зоны" hidden></select>
          <div class="rs-hint" id="rs-tap-hint">Выберите клетку, затем действие</div>
          <button type="button" class="rs-tap-reset" id="rs-tap-reset">Сброс зон</button>
        </div>
        <div class="rs-group">
          <div class="rs-label">Автоперелистывание</div>
          <div class="rs-slider">
            <input type="range" id="rs-auto-flip" name="readerAutoFlip" min="0" max="30" step="1" aria-label="Интервал автоперелистывания">
            <span class="rs-val" id="rs-auto-flip-val">Выкл</span>
          </div>
          <div class="rs-hint">0 — выкл. Работает только в режиме страниц, пауза при меню и озвучке.</div>
        </div>
        <div class="rs-group">
          <label class="rs-check"><input type="checkbox" id="rs-page-haptic" name="readerPageHaptic"><span>Вибрация при листании</span></label>
          <div class="rs-hint">По умолчанию выкл. Отклик при добавлении закладки не затрагивается.</div>
        </div>
        <div class="rs-group" id="rs-eink-refresh-group" hidden>
          <div class="rs-label">Полная перерисовка</div>
          <div class="rs-seg">
            <button type="button" data-set-eink-refresh="1">Каждый раз</button>
            <button type="button" data-set-eink-refresh="3">Каждые 3</button>
            <button type="button" data-set-eink-refresh="5">Каждые 5</button>
          </div>
          <div class="rs-hint">E-Ink: полный refresh экрана против шлейфов. Чуть дольше обычного листания.</div>
        </div>
        <div class="rs-group" id="rs-eink-volume-hint" hidden>
          <div class="rs-hint">E-Ink: громкость листает страницы. Яркость — левый край, температура — правый.</div>
        </div>
        <div id="rs-volume-keys-slot"></div>
      </section>

      <section class="rs-section" data-rs-section="status">
        <h3 class="rs-section-title">Строка состояния</h3>
        <div class="rs-group">
          <div class="rs-label">Видимость</div>
          <div class="rs-seg">
            <button type="button" data-set-status-mode="withChrome">С панелью</button>
            <button type="button" data-set-status-mode="always">Всегда</button>
            <button type="button" data-set-status-mode="hidden">Скрыта</button>
          </div>
        </div>
        <div class="rs-group">
          <label class="rs-check"><input type="checkbox" id="rs-status-chapter" name="statusChapter" checked><span>Глава</span></label>
          <label class="rs-check"><input type="checkbox" id="rs-status-pct" name="statusPct" checked><span>Процент</span></label>
          <label class="rs-check"><input type="checkbox" id="rs-status-page" name="statusPage" checked><span>Страница N / M</span></label>
          <label class="rs-check"><input type="checkbox" id="rs-status-chapter-left" name="statusChapterLeft"><span>Осталось в главе</span></label>
          <label class="rs-check"><input type="checkbox" id="rs-status-clock" name="statusClock"><span>Часы</span></label>
        </div>
      </section>

      <section class="rs-section" data-rs-section="extra">
        <h3 class="rs-section-title">Дополнительно</h3>
        <div class="rs-group">
          <label class="rs-check">
            <input type="checkbox" id="rs-footnotes" name="readerFootnotes" checked>
            <span>Всплывающие сноски</span>
          </label>
        </div>
        <div class="rs-group">
          <div class="rs-label">Свой CSS</div>
          <textarea id="rs-custom-css" class="rs-custom-css" name="readerCustomCss" rows="5" spellcheck="false" placeholder="/* Дополнительные стили для текста книги */"></textarea>
          <button type="button" class="rs-custom-css-clear" id="rs-custom-css-clear">Очистить CSS</button>
        </div>
      </section>

      <section class="rs-section" data-rs-section="tts">
        <h3 class="rs-section-title">Озвучка</h3>
        <div class="rs-group">
          <div class="rs-sublabel">Скорость</div>
          <div class="rs-slider">
            <input type="range" id="rs-tts-rate" name="readerTtsRate" min="0.5" max="2" step="0.05" aria-label="Скорость">
            <span class="rs-val" id="rs-tts-rate-val">1.00</span>
          </div>
          <div class="rs-sublabel">Голос</div>
          <select id="rs-tts-voice" name="readerTtsVoice" class="rs-select" aria-label="Голос">
            <option value="">Системный</option>
          </select>
        </div>
      </section>
`;

  return html.replace(
    /<div class="panel-body" data-panel-tab="settings" hidden>[\s\S]*?<div class="rs-actions">/,
    `<div class="panel-body" data-panel-tab="settings" data-settings-layout="v2" hidden>${inner}\n      <div class="rs-actions">`,
  );
}

function extendReaderSettingsHtml(source) {
  return composeReaderSettingsPanel(source);
}

/** AlReaderX-пакет: статус, goto, chrome footer — вне settings panel. */
function injectAlReaderChrome(source) {
  let out = source;

  // Idempotent cleanup if a previous broken inject left junk inside footer.
  out = out.replace(/\s*<div class="reader-status-strip"[\s\S]*?<\/div>\s*<div class="reader-autoflip-hud"[\s\S]*?<\/div>\s*/g, '\n');
  out = out.replace(/\s*<button type="button" class="ft-goto-btn" id="ft-goto"[^>]*>.*?<\/button>\s*/g, '\n  ');
  out = out.replace(/\s*<div class="reader-goto" id="reader-goto"[\s\S]*?<\/div>\s*<\/div>\s*/g, '\n');

  if (!out.includes('id="ft-goto"')) {
    out = out.replace(
      /(<span class="ft-pct" id="ft-pct">)/,
      '<button type="button" class="ft-goto-btn" id="ft-goto" title="Перейти…" aria-label="Перейти к позиции">⋯</button>\n  $1',
    );
  }

  if (!out.includes('id="reader-status-strip"')) {
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

$2`,
    );
  }

  if (!out.includes('id="reader-hud-flash"')) {
    out = out.replace(
      /(<div class="reader-autoflip-hud" id="reader-autoflip-hud"[^>]*>[\s\S]*?<\/div>)/,
      `$1\n\n<div class="reader-hud-flash" id="reader-hud-flash" aria-hidden="true"></div>`,
    );
  }

  if (!out.includes('id="reader-goto"')) {
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
  }

  return out;
}

html = extendReaderSettingsHtml(html);
html = injectAlReaderChrome(html);

// Полноэкранный wallpaper underlay (Android WebView; создаётся и из reader.js)
if (!html.includes('id="reader-wallpaper"')) {
  html = html.replace(
    /<body([^>]*)>/i,
    '<body$1>\n<div id="reader-wallpaper" aria-hidden="true"></div>',
  );
}

// Strip any remaining template expressions
html = html.replace(/\$\{[^}]+\}/g, '');

const out = path.join(root, 'public/inpx-reader/index.html');
fs.writeFileSync(out, html);
console.log('Wrote', out, html.length, 'bytes', `v=${version}`);
if (!html.includes(`src="/inpx-reader/reader.js?v=${version}"`)) {
  console.error('Reader script is missing a cache-busting query; WebView will keep stale JS');
  process.exit(1);
}
if (!html.includes('id="rs-tap-grid"') || !html.includes('id="reader-goto"') || !html.includes('id="ft-goto"')) {
  console.error('AlReaderX chrome markup missing after generate-reader-html');
  process.exit(1);
}
