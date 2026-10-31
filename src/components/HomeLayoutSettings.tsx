import React from 'react';
import { Reorder } from 'motion/react';
import { theme } from '../lib/appTheme';
import { textStyles } from '../ui/tokens';
import { impactLight } from '../lib/haptics';
import { DragRow, useDragOrder } from '../ui/DragReorder';
import {
  HOME_SECTION_LABELS,
  isHomeSectionVisible,
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

/** «Блоки главной»: drag + switch per home section (same list as the web «Профиль → Вид»). */
export default function HomeLayoutSettings({ layout, onChange, disabled = false }: HomeLayoutSettingsProps) {
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const sections = useDragOrder<HomeSectionId>(layout.order, (order) => onChange({ ...layoutRef.current, order }));

  return (
    <div className="py-3 border-b border-[color:var(--app-border)]">
      <p className={`${textStyles.body} ${theme.text}`}>Блоки главной</p>
      <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
        Что показывать; порядок — перетаскиванием за ⠿. Порядок полок — в «Мои книги». Общая настройка с сайтом
      </p>
      <Reorder.Group axis="y" as="ul" values={sections.order} onReorder={sections.setOrder} className="mt-2" aria-label="Блоки главной">
        {sections.order.map((id) => {
          const visible = isHomeSectionVisible(layout, id);
          const label = HOME_SECTION_LABELS[id];
          return (
            <DragRow
              key={id}
              value={id}
              label={label}
              disabled={disabled}
              className="min-h-12"
              onDragStart={sections.start}
              onDragEnd={sections.finish}
              onMove={(step) => sections.moveBy(id, step)}
            >
              <span className={`flex-1 min-w-0 ${textStyles.body} ${visible ? theme.text : theme.textMuted}`}>{label}</span>
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
            </DragRow>
          );
        })}
      </Reorder.Group>
    </div>
  );
}
