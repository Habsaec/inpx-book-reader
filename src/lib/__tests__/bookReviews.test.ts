import { describe, expect, it } from 'vitest';
import { formatReviewTime, parseBookReviews, reviewInitials } from '../bookReviews';

const sample = [
  '<div class="flib-reviews">',
  '<div class="flib-review-item"><p class="flib-review-meta"><strong>Анна &amp; Ко</strong> <span class="muted">1609459200</span></p>',
  '<div class="flib-review-text"><p>Сильно.</p><div>И ещё абзац</div></div></div>',
  '<div class="flib-review-item"><p class="flib-review-meta"><strong>Пётр</strong></p>',
  '<div class="flib-review-text"><p>Коротко</p></div></div>',
  '</div>',
].join('');

describe('parseBookReviews', () => {
  it('reads name, date and text from the server review list', () => {
    const items = parseBookReviews(sample);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Анна & Ко');
    expect(items[0].timeLabel).toBe('1 января 2021');
    expect(items[0].html).toContain('<p>Сильно.</p>');
    expect(items[0].html).toContain('<div>И ещё абзац</div>');
    expect(items[1].name).toBe('Пётр');
    expect(items[1].timeLabel).toBe('');
  });

  it('leaves a single annotation fragment unstructured', () => {
    expect(parseBookReviews('<p>Просто текст</p>')).toEqual([]);
  });
});

describe('formatReviewTime', () => {
  it('keeps a date the server already wrote in words', () => {
    expect(formatReviewTime('вчера')).toBe('вчера');
  });
});

describe('reviewInitials', () => {
  it('uses the first letters of the name', () => {
    expect(reviewInitials('анна петрова')).toBe('АП');
    expect(reviewInitials('ник')).toBe('Н');
  });
});
