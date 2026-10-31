import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles } from '../ui/tokens';
import IconButton from '../ui/IconButton';
import { impactLight } from '../lib/haptics';
import {
  HOME_SECTION_LABELS,
  isHomeSectionVisible,
  moveHomeSection,
  toggleHomeSection,
  type HomeLayout,
  type HomeSectionId,
} from '../lib/homeLayout';

interface HomeLayoutSettingsProps {
  layout: HomeLayout;
  /** Applies at once; the caller saves it to the account. */
  onChange: (next: HomeLayout) => void;
  disabled?: boolean;
}

/** «Блоки главной»: switch + ▲▼ per home section (same list as the web «Профиль → Вид»). */
export default function HomeLayoutSettings({ layout, onChange, disabled = false }: HomeLayoutSettingsProps) {
  const last = layout.order.length - 1;
  return (
    <div className="py-3 border-b border-[color:var(--app-border)]">
      <p className={`${textStyles.body} ${theme.text}`}>Блоки главной</p>
      <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
        Что показывать и в каком порядке. Общая настройка с сайтом
      </p>
      <ul className="mt-2" aria-label="Блоки главной">
        {layout.order.map((id: HomeSectionId, index) => {
          const visible = isHomeSectionVisible(layout, id);
          const label = HOME_SECTION_LABELS[id];
          return (
            <li key={id} className="flex items-center gap-1 min-h-12">
              <span className={`flex-1 min-w-0 ${textStyles.body} ${visible ? theme.text : theme.textMuted}`}>{label}</span>
              <IconButton
                label={`${label}: выше`}
                disabled={disabled || index === 0}
                onClick={() => onChange(moveHomeSection(layout, id, 'up'))}
              >
                <ChevronUp className="w-5 h-5" aria-hidden />
              </IconButton>
              <IconButton
                label={`${label}: ниже`}
                disabled={disabled || index === last}
                onClick={() => onChange(moveHomeSection(layout, id, 'down'))}
              >
                <ChevronDown className="w-5 h-5" aria-hidden />
              </IconButton>
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                aria-label={`Показывать «${label}»`}
                disabled={disabled}
                onClick={() => {
                  impactLight();
                  onChange(toggleHomeSection(layout, id, !visible));
                }}
                className={`inpx-switch relative ml-1 h-7 w-12 shrink-0 rounded-full disabled:opacity-50 ${theme.focusRing} ${
                  visible ? theme.accentBg : theme.panel
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                    visible ? 'translate-x-[1.125rem]' : 'translate-x-0'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
