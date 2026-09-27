/** A short tap whose click WebView dropped because :active scale moved the hit box. */
const RESCUE_MOVE_PX = 8;

export function shouldRescuePress(input: {
  cancelled: boolean;
  movedPx: number;
  stillOnControl: boolean;
}): boolean {
  if (input.movedPx > RESCUE_MOVE_PX) return false;
  if (!input.cancelled && input.stillOnControl) return false;
  return true;
}

function controlFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('button, [role="button"]');
  return el instanceof HTMLElement ? el : null;
}

function isDisabled(el: HTMLElement): boolean {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
}

/**
 * WebView cancels a tap when `.inpx-press:active` scales the control out from under
 * the finger. The press paints, then pointerup/pointercancel never becomes a click.
 */
export function installStablePress(doc: Document = document) {
  const flag = '__inpxStablePress';
  const marked = doc as Document & { [flag]?: boolean };
  if (marked[flag]) return;
  marked[flag] = true;

  let press: { el: HTMLElement; x: number; y: number } | null = null;

  const arm = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const el = controlFrom(event.target);
    if (!el || isDisabled(el)) {
      press = null;
      return;
    }
    press = { el, x: event.clientX, y: event.clientY };
  };

  const release = (event: PointerEvent, cancelled: boolean) => {
    const current = press;
    press = null;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const node = event.target instanceof Node ? event.target : null;
    if (!shouldRescuePress({
      cancelled,
      movedPx: Math.hypot(dx, dy),
      stillOnControl: Boolean(node && current.el.contains(node)),
    })) return;

    let allowSynthetic = true;
    const blockExtraClick = (click: Event) => {
      const target = click.target instanceof Node ? click.target : null;
      if (allowSynthetic && target && current.el.contains(target)) {
        allowSynthetic = false;
        return;
      }
      click.preventDefault();
      click.stopPropagation();
    };
    doc.addEventListener('click', blockExtraClick, true);
    doc.defaultView?.setTimeout(() => doc.removeEventListener('click', blockExtraClick, true), 0);
    current.el.click();
  };

  doc.addEventListener('pointerdown', arm, true);
  doc.addEventListener('pointerup', (event) => release(event, false), true);
  doc.addEventListener('pointercancel', (event) => release(event, true), true);
}
