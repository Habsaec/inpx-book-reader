import React from 'react';

type BackHandler = () => boolean;

const stack: BackHandler[] = [];

/** Вызвать зарегистрированные обработчики (последний добавленный — первый). */
export function consumeAppBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true;
  }
  return false;
}

/** Регистрирует обработчик «Назад». Верните true, если событие обработано. */
export function useBackHandler(handler: () => boolean, enabled = true) {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (!enabled) return;

    const wrapped = () => handlerRef.current();
    stack.push(wrapped);
    return () => {
      const idx = stack.indexOf(wrapped);
      if (idx >= 0) stack.splice(idx, 1);
    };
  }, [enabled]);
}
