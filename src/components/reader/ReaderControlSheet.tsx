import React from 'react';
import { createPortal } from 'react-dom';
import { X, Type, Sun, Moon, BookOpen, List, ScrollText, BookMarked, Maximize2, Clock, Volume2, Square, Search, Highlighter } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, touchMin } from '../../ui/tokens';
import Button from '../../ui/Button';
import { SheetDragHandle, sheetBackdropClass, sheetPanelClass, sheetPanelStyle } from '../../ui/SheetChrome';

import type { ReaderFontFamily, ReaderLayout, ReaderTheme } from './readerTypes';

export type { ReaderTheme, ReaderLayout, ReaderFontFamily } from './readerTypes';

interface ReaderControlSheetProps {
  open: boolean;
  onClose: () => void;
  readerTheme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  lineHeight: number;
  onLineHeightChange: (value: number) => void;
  fontFamily: ReaderFontFamily;
  onFontFamilyChange: (font: ReaderFontFamily) => void;
  orientationLock: 'auto' | 'portrait' | 'landscape';
  onOrientationLockChange: (mode: 'auto' | 'portrait' | 'landscape') => void;
  layout: ReaderLayout;
  onLayoutChange: (layout: ReaderLayout) => void;
  brightnessDim: number;
  onBrightnessDimChange: (value: number) => void;
  immersive: boolean;
  onImmersiveChange: (value: boolean) => void;
  sessionMinutes: number;
  readingProgress: number;
  paginatorPage: number | null;
  paginatorPages: number | null;
  chapterTitle?: string;
  remainingBookMinutes?: number | null;
  remainingChapterMinutes?: number | null;
  pageMargin?: number;
  onPageMarginChange?: (value: number) => void;
  onShowToc?: () => void;
  onShowBookmarks?: () => void;
  onShowSearch?: () => void;
  onShowNotes?: () => void;
  onGotoAnnotation?: (direction: 'prev' | 'next') => void;
  ttsActive?: boolean;
  ttsPlaying?: boolean;
  onTtsToggle?: () => void;
  onTtsStop?: () => void;
}

const THEMES: { id: ReaderTheme; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'Светлая', icon: <Sun className="w-4 h-4" /> },
  { id: 'dark', label: 'Тёмная', icon: <Moon className="w-4 h-4" /> },
  { id: 'sepia', label: 'Сепия', icon: <BookMarked className="w-4 h-4" /> },
];

const FONT_OPTIONS: { id: ReaderFontFamily; label: string }[] = [
  { id: 'serif', label: 'Georgia' },
  { id: 'sans', label: 'System' },
  { id: 'palatino', label: 'Palatino' },
  { id: 'gf-pt-serif', label: 'PT Serif' },
  { id: 'gf-literata', label: 'Literata' },
];

const ORIENTATION_OPTIONS: { id: 'auto' | 'portrait' | 'landscape'; label: string }[] = [
  { id: 'auto', label: 'Авто' },
  { id: 'portrait', label: 'Портрет' },
  { id: 'landscape', label: 'Альбом' },
];

export default function ReaderControlSheet({
  open,
  onClose,
  readerTheme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  lineHeight,
  onLineHeightChange,
  fontFamily,
  onFontFamilyChange,
  orientationLock,
  onOrientationLockChange,
  layout,
  onLayoutChange,
  brightnessDim,
  onBrightnessDimChange,
  immersive,
  onImmersiveChange,
  sessionMinutes,
  readingProgress,
  paginatorPage,
  paginatorPages,
  chapterTitle,
  remainingBookMinutes = null,
  remainingChapterMinutes = null,
  pageMargin = 32,
  onPageMarginChange,
  onShowToc,
  onShowBookmarks,
  onShowSearch,
  onShowNotes,
  onGotoAnnotation,
  ttsActive = false,
  ttsPlaying = false,
  onTtsToggle,
  onTtsStop,
}: ReaderControlSheetProps) {
  if (!open) return null;

  return createPortal(
    <div className={`${sheetBackdropClass} z-[300]`} onClick={onClose}>
      <div
        className={`${sheetPanelClass} px-5 pt-0 max-h-[70vh]`}
        style={sheetPanelStyle()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="reader-control-title"
        aria-modal="true"
      >
        <SheetDragHandle />
        <div className="flex items-center justify-between">
          <h2 id="reader-control-title" className={textStyles.title}>Чтение</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} className={`${touchMin} inline-flex items-center justify-center rounded-lg ${theme.chipButton} ${theme.focusRing}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mt-4">
        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Тема</p>
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.id}
                variant={readerTheme === t.id ? 'primary' : 'secondary'}
                onClick={() => onThemeChange(t.id)}
                className="flex-1"
              >
                {t.icon}
                <span className="ml-1">{t.label}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Размер шрифта</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => onFontSizeChange(Math.max(14, fontSize - 2))}>A−</Button>
            <span className={textStyles.body}>{fontSize}px</span>
            <Button variant="secondary" onClick={() => onFontSizeChange(Math.min(28, fontSize + 2))}>A+</Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Межстрочный интервал</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => onLineHeightChange(Math.max(1.2, Math.round((lineHeight - 0.1) * 10) / 10))}>−</Button>
            <span className={textStyles.body}>{lineHeight.toFixed(1)}</span>
            <Button variant="secondary" onClick={() => onLineHeightChange(Math.min(2.2, Math.round((lineHeight + 0.1) * 10) / 10))}>+</Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Шрифт</p>
          <div className="flex flex-wrap gap-2">
            {FONT_OPTIONS.map((f) => (
              <Button
                key={f.id}
                variant={fontFamily === f.id ? 'primary' : 'secondary'}
                onClick={() => onFontFamilyChange(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Ориентация</p>
          <div className="flex gap-2">
            {ORIENTATION_OPTIONS.map((o) => (
              <Button
                key={o.id}
                variant={orientationLock === o.id ? 'primary' : 'secondary'}
                fullWidth
                onClick={() => onOrientationLockChange(o.id)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Режим</p>
          <div className="flex gap-2">
            <Button
              variant={layout === 'paginated' ? 'primary' : 'secondary'}
              fullWidth
              onClick={() => onLayoutChange('paginated')}
            >
              <BookOpen className="w-4 h-4 inline mr-1" /> Страницы
            </Button>
            <Button
              variant={layout === 'scrolled' ? 'primary' : 'secondary'}
              fullWidth
              onClick={() => onLayoutChange('scrolled')}
            >
              <ScrollText className="w-4 h-4 inline mr-1" /> Прокрутка
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Затемнение экрана</p>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.05}
            value={brightnessDim}
            onChange={(e) => onBrightnessDimChange(Number(e.target.value))}
            className="w-full"
            aria-label="Затемнение экрана"
          />
        </div>

        <div className="space-y-2">
          <p className={`${textStyles.captionBold} ${theme.textMuted}`}>Поля страницы</p>
          <input
            type="range"
            min={0}
            max={80}
            step={4}
            value={pageMargin}
            onChange={(e) => onPageMarginChange?.(Number(e.target.value))}
            className="w-full"
            aria-label="Поля страницы"
          />
          <p className={`${textStyles.caption} ${theme.textMuted}`}>{pageMargin} px</p>
        </div>

        <Button variant={immersive ? 'primary' : 'secondary'} fullWidth onClick={() => onImmersiveChange(!immersive)}>
          <Maximize2 className="w-4 h-4 inline mr-1" />
          {immersive ? 'Полный экран включён' : 'Полный экран'}
        </Button>

        <p className={`${textStyles.caption} ${theme.textMuted}`}>
          <Clock className="w-3 h-3 inline mr-1" aria-hidden />
          Сессия: {sessionMinutes} мин
          {readingProgress > 0 && <> • Прогресс: {readingProgress.toFixed(1)}%</>}
          {remainingBookMinutes != null && <> • ≈{remainingBookMinutes} мин до конца книги</>}
          {remainingChapterMinutes != null && <> • ≈{remainingChapterMinutes} мин до конца главы</>}
          {paginatorPage != null && paginatorPages != null && paginatorPages > 1 && (
            <> • Стр. {paginatorPage} / {paginatorPages}</>
          )}
        </p>
        {chapterTitle && (
          <p className={`${textStyles.caption} ${theme.textMuted} line-clamp-2`}>
            Глава: {chapterTitle}
          </p>
        )}

        {onGotoAnnotation && (
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => onGotoAnnotation('prev')}>
              ← Выделение
            </Button>
            <Button variant="secondary" fullWidth onClick={() => onGotoAnnotation('next')}>
              Выделение →
            </Button>
          </div>
        )}

        {onShowToc && (
          <Button variant="secondary" fullWidth onClick={onShowToc}>
            <List className="w-4 h-4 inline mr-1" /> Оглавление
          </Button>
        )}

        {onShowBookmarks && (
          <Button variant="secondary" fullWidth onClick={onShowBookmarks}>
            <BookOpen className="w-4 h-4 inline mr-1" /> Закладки
          </Button>
        )}

        {onShowNotes && (
          <Button variant="secondary" fullWidth onClick={onShowNotes}>
            <Highlighter className="w-4 h-4 inline mr-1" /> Заметки и выделения
          </Button>
        )}

        {onShowSearch && (
          <Button variant="secondary" fullWidth onClick={onShowSearch}>
            <Search className="w-4 h-4 inline mr-1" /> Поиск по книге
          </Button>
        )}

        {onTtsToggle && (
          <div className="flex gap-2">
            <Button variant={ttsPlaying ? 'primary' : 'secondary'} fullWidth onClick={onTtsToggle}>
              <Volume2 className="w-4 h-4 inline mr-1" />
              {ttsPlaying ? 'Пауза' : ttsActive ? 'Продолжить' : 'Озвучить'}
            </Button>
            {ttsActive && onTtsStop && (
              <Button variant="secondary" onClick={onTtsStop} aria-label="Остановить озвучку">
                <Square className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}

        <p className={`${textStyles.caption} ${theme.textMuted}`}>
          <Type className="w-3 h-3 inline mr-1" aria-hidden />
          Чтение только из локального файла на устройстве
        </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
