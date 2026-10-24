// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { usePullToRefresh } from '../usePullToRefresh';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function List({ onRefresh, scrollTop = 0 }: { onRefresh?: () => void; scrollTop?: number }) {
  const { bind, indicator } = usePullToRefresh(onRefresh);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (ref.current) Object.defineProperty(ref.current, 'scrollTop', { value: scrollTop, configurable: true });
  }, [scrollTop]);
  return (
    <div>
      {indicator}
      <div ref={ref} data-testid="list" {...bind}>книги</div>
    </div>
  );
}

function drag(el: HTMLElement, dx: number, dy: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 100 + dx / 2, clientY: 100 + dy / 2 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
  fireEvent.touchEnd(el);
}

describe('usePullToRefresh', () => {
  it('refreshes after a long enough pull from the top and shows the spinner', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    render(<List onRefresh={onRefresh} />);
    drag(screen.getByTestId('list'), 0, 200);
    expect(onRefresh).not.toHaveBeenCalled(); // runs after the release settles
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Обновление' })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a short pull', () => {
    const onRefresh = vi.fn();
    render(<List onRefresh={onRefresh} />);
    drag(screen.getByTestId('list'), 0, 60);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores a sideways swipe (tab switch)', () => {
    const onRefresh = vi.fn();
    render(<List onRefresh={onRefresh} />);
    drag(screen.getByTestId('list'), 240, 60);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores a pull that starts below the top of the list', () => {
    const onRefresh = vi.fn();
    render(<List onRefresh={onRefresh} scrollTop={300} />);
    drag(screen.getByTestId('list'), 0, 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
