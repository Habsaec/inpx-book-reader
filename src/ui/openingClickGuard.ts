/**
 * A long-press opens a sheet while the finger is still down.
 * The release click must not activate whatever appears under it.
 * WebView often never emits that click, so a one-shot "next click"
 * listener would eat the user's first tap on the sheet.
 */
export function createOpeningClickGuard() {
  let pending = true;
  let swallowReleaseClick = false;

  return {
    isArmed(): boolean {
      return !pending;
    },
    notePointerUp(): void {
      if (!pending) return;
      pending = false;
      swallowReleaseClick = true;
    },
    notePointerDown(): void {
      if (pending) {
        pending = false;
        return;
      }
      swallowReleaseClick = false;
    },
    consumeReleaseClick(): boolean {
      if (pending) {
        pending = false;
        return true;
      }
      if (!swallowReleaseClick) return false;
      swallowReleaseClick = false;
      return true;
    },
  };
}
