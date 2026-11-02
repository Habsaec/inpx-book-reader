import { Check } from 'lucide-react';
import { t } from '../i18n';

/** One read badge for covers, list thumbs, and the book sheet. */
export default function ReadMark({ className = 'top-1.5 right-1.5' }: { className?: string }) {
  return (
    <span
      className={`absolute z-[6] w-5 h-5 rounded-full bg-[var(--app-success)] text-white flex items-center justify-center ${className}`}
      title={t('common.read')}
      aria-label={t('common.read')}
    >
      <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
    </span>
  );
}
