import React from 'react';
import { Plus } from 'lucide-react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { theme } from '../../lib/appTheme';
import { useCalmMotion } from '../../hooks/useCalmMotion';
import { textStyles, radii, motion as motionTokens } from '../../ui/tokens';
import { useFollowSpring } from '../../ui/useFollowSpring';

type Props = {
  open: boolean;
  name: string;
  busy?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
};

/** «+» with a tooltip. The name field grows the same way the header search does. */
export default function ShelfCreateField({
  open,
  name,
  busy = false,
  onOpen,
  onClose,
  onNameChange,
  onSubmit,
}: Props) {
  const calm = useCalmMotion();
  const follow = useFollowSpring(calm);
  const reveal = useMotionValue(0);
  const fieldGrow = useTransform(reveal, (value) => value);
  const openRef = React.useRef(open);
  const [field, setField] = React.useState(open);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useLayoutEffect(() => {
    openRef.current = open;
    if (open) setField(true);
    follow(reveal, open ? 1 : 0);
  }, [open, follow, reveal]);

  React.useEffect(() => reveal.on('change', (value) => {
    if (value < 0.02 && !openRef.current) setField(false);
  }), [reveal]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, field]);

  const onPlus = () => {
    if (busy) return;
    if (!open) {
      setField(true);
      onOpen();
      return;
    }
    if (name.trim()) onSubmit();
    else onClose();
  };

  return (
    <div className="flex items-center min-w-0 w-full">
      <button
        type="button"
        title="Создать"
        aria-label="Создать"
        aria-expanded={open}
        disabled={busy}
        onClick={onPlus}
        className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.md} ${theme.accentText} ${theme.focusRing} ${motionTokens.press} disabled:opacity-50`}
      >
        <Plus className="w-5 h-5" aria-hidden />
      </button>
      <motion.div className="min-w-0 overflow-hidden" style={{ flexGrow: fieldGrow, flexBasis: 0 }}>
        {field ? (
          <input
            ref={inputRef}
            className={`w-full min-h-12 px-3 ${textStyles.body} ${radii.button} ${theme.input} ${theme.inputFocus}`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (name.trim()) onSubmit();
            }}
            placeholder="Название полки"
            maxLength={80}
            disabled={busy}
            aria-label="Название новой полки"
          />
        ) : null}
      </motion.div>
    </div>
  );
}
