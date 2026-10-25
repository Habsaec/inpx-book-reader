import { describe, it, expect } from 'vitest';
import { appendHideReadParam, getHideRead, setHideRead } from '../hideReadPreference';

describe('hideReadPreference', () => {
  it('sends nothing until the server reported the switch, then sends it explicitly', () => {
    setHideRead(null);
    const none = new URLSearchParams();
    appendHideReadParam(none);
    expect(none.has('hideRead')).toBe(false);

    setHideRead(true);
    const on = new URLSearchParams();
    appendHideReadParam(on);
    expect(on.get('hideRead')).toBe('1');
    expect(getHideRead()).toBe(true);

    setHideRead(false);
    const off = new URLSearchParams();
    appendHideReadParam(off);
    expect(off.get('hideRead')).toBe('0');
    setHideRead(null);
  });
});
