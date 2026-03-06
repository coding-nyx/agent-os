import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassCard } from './GlassCard';

describe('GlassCard', () => {
  it('renders children content', () => {
    render(<GlassCard><p>Card content</p></GlassCard>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('does not apply glow styles by default', () => {
    const { container } = render(<GlassCard>No glow</GlassCard>);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.style.boxShadow).toBe('');
  });

  it('applies glow styles when glow={true}', () => {
    const { container } = render(<GlassCard glow>Glow on</GlassCard>);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.style.boxShadow).toContain('40px');
  });

  it('uses custom glowColor', () => {
    const { container } = render(<GlassCard glow glowColor="rgba(255,0,0,0.5)">Red</GlassCard>);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.style.boxShadow).toContain('rgba(255,0,0,0.5)');
  });

  it('passes through additional className', () => {
    const { container } = render(<GlassCard className="custom-class">Test</GlassCard>);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).toContain('custom-class');
  });
});
