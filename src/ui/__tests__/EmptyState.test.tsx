// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import EmptyState from '../EmptyState';
import { BookOpen } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description for offline empty library', () => {
    render(
      <EmptyState
        icon={BookOpen}
        title="Начните читать"
        description="Скачайте книгу из каталога"
      />,
    );
    expect(screen.getByText('Начните читать')).toBeTruthy();
    expect(screen.getByText('Скачайте книгу из каталога')).toBeTruthy();
  });
});
