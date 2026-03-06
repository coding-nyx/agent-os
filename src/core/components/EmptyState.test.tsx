import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { Search } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data found" />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try again later" />);
    expect(screen.getByText('Try again later')).toBeInTheDocument();
  });

  it('does not render description when omitted', () => {
    const { container } = render(<EmptyState title="Empty" />);
    // The description paragraph should not exist
    const paragraphs = container.querySelectorAll('p');
    // Should only have the title paragraph (the one with white/80 class)
    expect(paragraphs).toHaveLength(1);
  });

  it('renders an action element when provided', () => {
    render(
      <EmptyState
        title="No items"
        action={<button>Add Item</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('uses small size classes for size=sm', () => {
    const { container } = render(<EmptyState title="Small" size="sm" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('p-4');
  });

  it('uses large size classes for size=lg', () => {
    const { container } = render(<EmptyState title="Large" size="lg" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('p-8');
  });

  it('uses medium size classes by default', () => {
    const { container } = render(<EmptyState title="Medium" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('p-6');
  });

  it('accepts custom className', () => {
    const { container } = render(<EmptyState title="Test" className="my-class" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('my-class');
  });
});
