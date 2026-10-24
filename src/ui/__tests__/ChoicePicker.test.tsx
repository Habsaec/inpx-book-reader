// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ChoicePicker from '../ChoicePicker';

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { id: 'recent', label: 'Недавно открытые' },
  { id: 'title', label: 'Название' },
];

describe('ChoicePicker', () => {
  it('shows the current choice and names the control', () => {
    render(<ChoicePicker title="Сортировка" value="title" options={OPTIONS} onChange={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Сортировка: Название' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a sheet with the options and reports a new choice', () => {
    const onChange = vi.fn();
    render(<ChoicePicker title="Сортировка" value="recent" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка: Недавно открытые' }));
    expect(screen.getByRole('heading', { name: 'Сортировка' })).toBeTruthy();
    const current = screen.getByRole('radio', { name: 'Недавно открытые' });
    expect(current.getAttribute('aria-checked')).toBe('true');
    // A real tap: the sheet ignores the click that ends the opening touch.
    const other = screen.getByRole('radio', { name: 'Название' });
    fireEvent.pointerDown(other);
    fireEvent.pointerUp(other);
    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledWith('title');
  });

  it('does not report the choice that is already selected', () => {
    const onChange = vi.fn();
    render(<ChoicePicker title="Книга" value="all" options={[{ id: 'all', label: 'Все книги' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга: Все книги' }));
    const only = screen.getByRole('radio', { name: 'Все книги' });
    fireEvent.pointerDown(only);
    fireEvent.pointerUp(only);
    fireEvent.click(only);
    expect(onChange).not.toHaveBeenCalled();
  });
});
