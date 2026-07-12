import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles } from '../../ui/tokens';
import Button from '../../ui/Button';

interface CatalogLoadMoreProps {
  loaded: number;
  total: number;
  loading?: boolean;
  onLoadMore: () => void;
  /** Автоподгрузка при появлении sentinel в viewport */
  infinite?: boolean;
}

export default function CatalogLoadMore({
  loaded,
  total,
  loading,
  onLoadMore,
  infinite = true,
}: CatalogLoadMoreProps) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!infinite || loading || loaded >= total) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [infinite, loading, loaded, total, onLoadMore]);

  if (loaded >= total) return null;

  return (
    <div ref={sentinelRef} className="mt-3 mb-1 flex flex-col items-center gap-1">
      <p className={`${textStyles.micro} ${theme.textMuted}`}>
        Показано {loaded.toLocaleString('ru-RU')} из {total.toLocaleString('ru-RU')}
      </p>
      <Button variant="secondary" loading={loading} onClick={onLoadMore}>
        Загрузить ещё
      </Button>
    </div>
  );
}
