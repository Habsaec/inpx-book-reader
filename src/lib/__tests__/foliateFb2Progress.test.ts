import { describe, it, expect } from 'vitest';
import {
  EqualSectionProgress,
  TocFlatProgress,
  SectionProgress,
} from '../../../public/foliate/progress.js';

describe('FB2 foliate progress', () => {
  it('byte-weighted SectionProgress skews early fraction (old model)', () => {
    const sections = [
      { size: 6200, linear: 'yes' },
      { size: 3800, linear: 'yes' },
    ];
    const p = new SectionProgress(sections, 1500, 1600);
    const [idx, anchor] = p.getSection(0.3);
    expect(idx).toBe(0);
    expect(anchor).toBeCloseTo(0.3 / 0.62, 3);
  });

  it('EqualSectionProgress maps 30% across linear sections evenly', () => {
    const sections = Array.from({ length: 10 }, () => ({ size: 1000, linear: 'yes' }));
    const eq = new EqualSectionProgress(sections, 1500, 1600);
    const [idx, anchor] = eq.getSection(0.3);
    expect(idx).toBe(3);
    expect(anchor).toBeCloseTo(0, 3);
  });

  it('TocFlatProgress uses toc chapter not section index (no 62% floor)', () => {
    const flat = [
      { href: '1', label: 'title' },
      { href: '3', label: 'prolog' },
      { href: '4#0', label: 'ch1' },
      { href: '4#1', label: 'ch2' },
      { href: '4#2', label: 'ch3' },
      { href: '7', label: 'part4' },
    ];
    const sections = Array.from({ length: 8 }, (_, i) => ({ size: 1, linear: 'yes', id: i }));
    const splitHref = (href: string) => href.split('#').map((x) => Number(x));
    const getTOCFragment = () => null;
    const p = new TocFlatProgress(flat, sections, splitHref, 1500, 1600, getTOCFragment);
    const prog = p.getProgressFromTocItem({ href: '4#2', label: 'ch3' }, 4, null, 0, 0);
    expect(prog.fraction).toBeCloseTo(4 / 6, 2);
  });
});
