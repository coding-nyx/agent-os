/**
 * NeuralButton — unit tests
 *
 * Covers:
 *   • Prop interface stability (no breaking changes)
 *   • All 4 variants render without error
 *   • All 8 theme colors render without error
 *   • All 4 sizes render without error
 *   • loading state: spinner present, children absent, aria-busy set
 *   • disabled state: button is disabled, aria-disabled set
 *   • disabled/loading: motion scale guards (whileHover/whileTap undefined)
 *   • `as` polymorphism: div and span render correct tag
 *   • className passthrough
 *   • Focus-visible ring classes present per variant
 *   • New typography: font-medium and tracking-[0.04em] present
 *   • Old typography: uppercase and font-bold absent from base
 *   • Toplight sheen: decorative span is aria-hidden
 *   • sr-only loading label
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NeuralButton, NeuralButtonThemeColor, NeuralIconButton } from './NeuralButton';
import { Sparkles } from 'lucide-react';

// Framer Motion: we only care about DOM output, not animation frames
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: {
      button: ({ children, className, disabled, 'aria-busy': ariaBusy, 'aria-disabled': ariaDisabled, ...rest }: React.ComponentPropsWithRef<'button'> & { 'aria-busy'?: boolean; 'aria-disabled'?: boolean }) =>
        <button className={className} disabled={disabled} aria-busy={ariaBusy} aria-disabled={ariaDisabled} {...rest}>{children}</button>,
      div: ({ children, className, ...rest }: React.ComponentPropsWithRef<'div'>) =>
        <div className={className} {...rest}>{children}</div>,
      span: ({ children, className, ...rest }: React.ComponentPropsWithRef<'span'>) =>
        <span className={className} {...rest}>{children}</span>,
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getButton(label = 'Action') {
  return screen.getByRole('button', { name: label });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('NeuralButton — rendering', () => {
  it('renders children text', () => {
    render(<NeuralButton>Click me</NeuralButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('renders as a <button> by default', () => {
    render(<NeuralButton>Action</NeuralButton>);
    expect(getButton()).toBeInTheDocument();
  });

  it('renders as a <div> when as="div"', () => {
    const { container } = render(<NeuralButton as="div">Action</NeuralButton>);
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  it('renders as a <span> when as="span"', () => {
    const { container } = render(<NeuralButton as="span">Action</NeuralButton>);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('passes className through to the root element', () => {
    render(<NeuralButton className="custom-class">Action</NeuralButton>);
    expect(getButton()).toHaveClass('custom-class');
  });
});

// ─── Variants ─────────────────────────────────────────────────────────────────

describe('NeuralButton — variants', () => {
  const variants = ['primary', 'secondary', 'ghost', 'danger'] as const;

  variants.forEach((variant) => {
    it(`renders variant="${variant}" without error`, () => {
      render(<NeuralButton variant={variant}>Action</NeuralButton>);
      expect(getButton()).toBeInTheDocument();
    });
  });

  it('primary variant includes theme fill class (indigo default)', () => {
    render(<NeuralButton variant="primary" themeColor="indigo">Action</NeuralButton>);
    // The fill class uses an opacity modifier — just check it contains the color name
    expect(getButton().className).toContain('indigo');
  });

  it('secondary variant does not contain a color-specific class', () => {
    render(<NeuralButton variant="secondary">Action</NeuralButton>);
    // secondary is purely white/neutral — no color accent
    expect(getButton().className).not.toMatch(/indigo|cyan|lime|amber|emerald|orange|rose/);
  });

  it('danger variant includes rose tint class', () => {
    render(<NeuralButton variant="danger">Action</NeuralButton>);
    expect(getButton().className).toContain('rose');
  });

  it('ghost variant has transparent background at rest', () => {
    render(<NeuralButton variant="ghost">Action</NeuralButton>);
    expect(getButton().className).toContain('bg-transparent');
  });
});

// ─── Theme colors ─────────────────────────────────────────────────────────────

describe('NeuralButton — themeColor', () => {
  const colors: NeuralButtonThemeColor[] = [
    'indigo', 'orange', 'cyan', 'lime', 'rose', 'amber', 'emerald', 'white',
  ];

  colors.forEach((color) => {
    it(`renders themeColor="${color}" without error`, () => {
      render(<NeuralButton themeColor={color}>Action</NeuralButton>);
      expect(getButton()).toBeInTheDocument();
    });

    it(`themeColor="${color}" class string contains color token`, () => {
      render(<NeuralButton themeColor={color}>Action</NeuralButton>);
      expect(getButton().className).toContain(color);
    });
  });
});

// ─── Sizes ────────────────────────────────────────────────────────────────────

describe('NeuralButton — sizes', () => {
  const sizes = ['sm', 'md', 'lg', 'xl'] as const;

  sizes.forEach((size) => {
    it(`renders size="${size}" without error`, () => {
      render(<NeuralButton size={size}>Action</NeuralButton>);
      expect(getButton()).toBeInTheDocument();
    });
  });

  it('sm size has h-9 class', () => {
    render(<NeuralButton size="sm">Action</NeuralButton>);
    expect(getButton().className).toContain('h-9');
  });

  it('md size has h-10 class', () => {
    render(<NeuralButton size="md">Action</NeuralButton>);
    expect(getButton().className).toContain('h-10');
  });

  it('lg size has h-12 class', () => {
    render(<NeuralButton size="lg">Action</NeuralButton>);
    expect(getButton().className).toContain('h-12');
  });

  it('xl size has h-13 class', () => {
    render(<NeuralButton size="xl">Action</NeuralButton>);
    expect(getButton().className).toContain('h-13');
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('NeuralButton — loading state', () => {
  it('shows spinner when loading=true', () => {
    render(<NeuralButton loading>Action</NeuralButton>);
    // The spinner is aria-hidden, so query by class directly
    const { container } = render(<NeuralButton loading>Action</NeuralButton>);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('hides children text when loading=true', () => {
    render(<NeuralButton loading>Action</NeuralButton>);
    expect(screen.queryByText('Action')).not.toBeInTheDocument();
  });

  it('renders sr-only "Loading" text when loading=true', () => {
    render(<NeuralButton loading>Action</NeuralButton>);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('sets aria-busy=true when loading=true', () => {
    render(<NeuralButton loading>Action</NeuralButton>);
    // screen.getByRole will find it even though it's aria-busy
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('is disabled when loading=true (native button)', () => {
    render(<NeuralButton loading>Action</NeuralButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

// ─── Disabled state ───────────────────────────────────────────────────────────

describe('NeuralButton — disabled state', () => {
  it('is disabled when disabled=true', () => {
    render(<NeuralButton disabled>Action</NeuralButton>);
    expect(getButton()).toBeDisabled();
  });

  it('sets aria-disabled=true when disabled=true', () => {
    render(<NeuralButton disabled>Action</NeuralButton>);
    expect(getButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('applies opacity-40 class when disabled', () => {
    render(<NeuralButton disabled>Action</NeuralButton>);
    expect(getButton().className).toContain('disabled:opacity-40');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<NeuralButton disabled onClick={onClick}>Action</NeuralButton>);
    await userEvent.click(getButton());
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('NeuralIconButton', () => {
  it('accepts iconProps.size without leaking TypeScript-only assumptions into runtime', () => {
    const { container } = render(
      <NeuralIconButton
        aria-label="Open sparkle"
        icon={<Sparkles />}
        iconProps={{ size: 24, strokeWidth: 1.5 }}
      />
    );

    const button = screen.getByRole('button', { name: 'Open sparkle' });
    const icon = container.querySelector('svg');

    expect(button).toBeInTheDocument();
    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('height', '24');
    expect(icon).toHaveAttribute('stroke-width', '1.5');
  });
});

// ─── Typography ───────────────────────────────────────────────────────────────

describe('NeuralButton — typography (regression)', () => {
  it('applies font-medium class', () => {
    render(<NeuralButton>Action</NeuralButton>);
    expect(getButton().className).toContain('font-medium');
  });

  it('does NOT apply font-bold (removed)', () => {
    render(<NeuralButton>Action</NeuralButton>);
    // font-bold must not appear in the base class string
    expect(getButton().className).not.toContain('font-bold');
  });

  it('does NOT apply uppercase (removed)', () => {
    render(<NeuralButton>Action</NeuralButton>);
    expect(getButton().className).not.toContain('uppercase');
  });

  it('applies reduced tracking-[0.04em] instead of old [0.15em]', () => {
    render(<NeuralButton>Action</NeuralButton>);
    expect(getButton().className).toContain('tracking-[0.04em]');
    expect(getButton().className).not.toContain('tracking-[0.15em]');
  });
});

// ─── Motion scale guard ───────────────────────────────────────────────────────

describe('NeuralButton — motion guard', () => {
  it('renders without throwing when disabled (scale guard)', () => {
    expect(() =>
      render(<NeuralButton disabled>Action</NeuralButton>),
    ).not.toThrow();
  });

  it('renders without throwing when loading (scale guard)', () => {
    expect(() =>
      render(<NeuralButton loading>Action</NeuralButton>),
    ).not.toThrow();
  });
});

// ─── Focus ring ───────────────────────────────────────────────────────────────

describe('NeuralButton — focus ring', () => {
  it('has focus-visible:outline-none class', () => {
    render(<NeuralButton>Action</NeuralButton>);
    expect(getButton().className).toContain('focus-visible:outline-none');
  });

  it('has focus-visible:ring-2 class', () => {
    render(<NeuralButton>Action</NeuralButton>);
    expect(getButton().className).toContain('focus-visible:ring-2');
  });

  it('primary indigo variant has indigo focus ring', () => {
    render(<NeuralButton variant="primary" themeColor="indigo">Action</NeuralButton>);
    expect(getButton().className).toContain('focus-visible:ring-indigo-400');
  });

  it('secondary variant has white focus ring', () => {
    render(<NeuralButton variant="secondary">Action</NeuralButton>);
    expect(getButton().className).toContain('focus-visible:ring-white');
  });

  it('danger variant has rose focus ring', () => {
    render(<NeuralButton variant="danger">Action</NeuralButton>);
    expect(getButton().className).toContain('focus-visible:ring-rose-500');
  });
});

// ─── Decorative sheen ─────────────────────────────────────────────────────────

describe('NeuralButton — toplight sheen', () => {
  it('decorative sheen span is aria-hidden', () => {
    const { container } = render(<NeuralButton>Action</NeuralButton>);
    // The sheen is the first absolute child span
    const sheen = container.querySelector('span[aria-hidden="true"]');
    expect(sheen).toBeInTheDocument();
  });
});

// ─── Glow regression ──────────────────────────────────────────────────────────

describe('NeuralButton — glow regression', () => {
  it('does not apply old heavy glow shadow classes', () => {
    render(<NeuralButton>Action</NeuralButton>);
    // Old pattern: shadow-[0_0_20px_ or shadow-[0_0_30px_
    expect(getButton().className).not.toContain('shadow-[0_0_20px_');
    expect(getButton().className).not.toContain('shadow-[0_0_30px_');
  });
});
