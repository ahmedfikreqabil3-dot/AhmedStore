import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  it('renders the production platform foundation', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Ahmed Store' })).toBeInTheDocument();
    expect(screen.getByText('Production platform foundation is ready.')).toBeInTheDocument();
  });
});
