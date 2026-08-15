import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, elevation } from './tokens';
import Button from './Button';

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Ловит необработанные ошибки рендера — иначе Capacitor WebView остаётся
 * с белым экраном без кнопки «Назад».
 */
export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className={`min-h-full flex flex-col items-center justify-center gap-4 px-6 py-10 text-center ${theme.bg} ${theme.text}`}
        role="alert"
      >
        <span className={`inline-flex items-center justify-center w-14 h-14 ${radii.full} ${theme.accentMuted}`}>
          <AlertTriangle className={`w-7 h-7 ${theme.accentText}`} aria-hidden strokeWidth={1.75} />
        </span>
        <p className={`${textStyles.title} text-xl`}>Приложение столкнулось с ошибкой</p>
        <p className={`${textStyles.body} ${theme.textMuted} max-w-xs leading-relaxed`}>
          Попробуйте перезапустить экран. Если ошибка повторяется — закройте читалку и откройте снова.
        </p>
        <div className={`${radii.lg} ${theme.card} ${elevation.card} max-w-sm w-full px-4 py-3`}>
          <p className={`${textStyles.caption} ${theme.textMuted} break-words text-left`}>
            {this.state.error.message || 'Неизвестная ошибка'}
          </p>
        </div>
        <Button variant="primary" onClick={this.handleReload}>
          Перезапустить
        </Button>
      </div>
    );
  }
}
