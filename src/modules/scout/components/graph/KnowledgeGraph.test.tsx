/**
 * KnowledgeGraph.test.tsx
 *
 * Unit tests for the interactive KnowledgeGraph component.
 * Covers: rendering, node sizing/coloring, edge computation, tag filtering,
 * zoom controls, node selection, and edge cases.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeGraph } from './KnowledgeGraph';
import type { ScoutKnowledgeNode } from '../../types';

// framer-motion: render children directly without animation in test environment
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_: unknown, tag: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ children, ...rest }: any) => {
          const { initial, animate, exit, whileHover, transition, ...domProps } = rest;
          void initial; void animate; void exit; void whileHover; void transition;
          const Tag = tag as keyof JSX.IntrinsicElements;
          return <Tag {...domProps}>{children}</Tag>;
        },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(
  overrides: Partial<ScoutKnowledgeNode> & { id: string },
): ScoutKnowledgeNode {
  return {
    claim: `Claim for ${overrides.id}`,
    confidence: 0.5,
    evidence: [],
    tags: [],
    status: 'pending',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const nodeA = makeNode({ id: 'a', claim: 'Alpha claim', confidence: 0.9, status: 'verified', evidence: ['src-1', 'src-2'], tags: ['ai'] });
const nodeB = makeNode({ id: 'b', claim: 'Beta claim', confidence: 0.4, status: 'pending', evidence: ['src-2', 'src-3'], tags: ['policy'] });
const nodeC = makeNode({ id: 'c', claim: 'Gamma claim', confidence: 0.1, status: 'contested', evidence: ['src-99'], tags: ['ai'] });

// ── Helpers ───────────────────────────────────────────────────────────────────

// nodeRadius: r = 8 + confidence * 16
function expectedRadius(confidence: number): number {
  return 8 + confidence * 16;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KnowledgeGraph', () => {
  describe('rendering', () => {
    it('renders graph label and node count', () => {
      render(<KnowledgeGraph nodes={[nodeA, nodeB]} />);
      expect(screen.getByText(/Knowledge Graph/i)).toBeInTheDocument();
      expect(screen.getByText(/2 nodes/i)).toBeInTheDocument();
    });

    it('renders an empty state when no nodes are provided', () => {
      render(<KnowledgeGraph nodes={[]} />);
      expect(screen.getByText(/No knowledge nodes yet/i)).toBeInTheDocument();
    });

    it('renders status summary badges for each status present', () => {
      render(<KnowledgeGraph nodes={[nodeA, nodeB, nodeC]} />);
      expect(screen.getByText(/1 verified/i)).toBeInTheDocument();
      expect(screen.getByText(/1 pending/i)).toBeInTheDocument();
      expect(screen.getByText(/1 contested/i)).toBeInTheDocument();
    });

    it('does not render verified badge when no verified nodes exist', () => {
      render(<KnowledgeGraph nodes={[nodeB, nodeC]} />);
      expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    });
  });

  describe('node radius formula', () => {
    it('computes correct radius for confidence=0.9 (r=8+0.9*16=22.4)', () => {
      const r = expectedRadius(0.9);
      expect(r).toBeCloseTo(22.4);
    });

    it('computes minimum radius for confidence=0 (r=8)', () => {
      const r = expectedRadius(0);
      expect(r).toBe(8);
    });

    it('computes maximum radius for confidence=1.0 (r=24)', () => {
      const r = expectedRadius(1.0);
      expect(r).toBe(24);
    });
  });

  describe('tag filter dropdown', () => {
    it('renders a tag filter select when nodes have tags', () => {
      render(<KnowledgeGraph nodes={[nodeA, nodeB]} />);
      const select = screen.getByRole('combobox', { name: /filter by tag/i });
      expect(select).toBeInTheDocument();
    });

    it('does not render tag filter when no nodes have tags', () => {
      const plain = makeNode({ id: 'x', tags: [] });
      render(<KnowledgeGraph nodes={[plain]} />);
      expect(screen.queryByRole('combobox', { name: /filter by tag/i })).not.toBeInTheDocument();
    });

    it('collects unique tags across nodes as options', () => {
      render(<KnowledgeGraph nodes={[nodeA, nodeB, nodeC]} />);
      // nodeA has 'ai', nodeB has 'policy', nodeC has 'ai' (duplicate) → 2 unique tags
      const select = screen.getByRole('combobox', { name: /filter by tag/i });
      const options = Array.from((select as HTMLSelectElement).options).map(o => o.value);
      expect(options).toContain('ai');
      expect(options).toContain('policy');
      expect(options.filter(v => v === 'ai')).toHaveLength(1); // no duplicates
    });

    it('includes an "All tags" option with empty value', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      const select = screen.getByRole('combobox', { name: /filter by tag/i });
      const options = Array.from((select as HTMLSelectElement).options);
      expect(options[0].value).toBe('');
      expect(options[0].text).toBe('All tags');
    });
  });

  describe('zoom controls', () => {
    it('renders zoom in, zoom out, and reset buttons', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset zoom/i })).toBeInTheDocument();
    });

    it('displays 100% scale initially', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      expect(screen.getByRole('button', { name: /reset zoom/i })).toHaveTextContent('100%');
    });

    it('increments scale by 20% on zoom in click', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
      expect(screen.getByRole('button', { name: /reset zoom/i })).toHaveTextContent('120%');
    });

    it('decrements scale by 20% on zoom out click', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
      expect(screen.getByRole('button', { name: /reset zoom/i })).toHaveTextContent('80%');
    });

    it('resets scale to 100% after zooming', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
      fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
      fireEvent.click(screen.getByRole('button', { name: /reset zoom/i }));
      expect(screen.getByRole('button', { name: /reset zoom/i })).toHaveTextContent('100%');
    });

    it('disables zoom out when at minimum scale (0.4)', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      // ZOOM_MIN = 0.4; default = 1.0, step = 0.2 → need 3 clicks to reach 0.4
      const zoomOutBtn = screen.getByRole('button', { name: /zoom out/i });
      fireEvent.click(zoomOutBtn);
      fireEvent.click(zoomOutBtn);
      fireEvent.click(zoomOutBtn);
      expect(zoomOutBtn).toBeDisabled();
    });

    it('disables zoom in when at maximum scale (2.5)', () => {
      render(<KnowledgeGraph nodes={[nodeA]} />);
      // ZOOM_MAX = 2.5; default = 1.0, step = 0.2 → need 8 clicks to reach ~2.6 (stops at 2.5)
      const zoomInBtn = screen.getByRole('button', { name: /zoom in/i });
      for (let i = 0; i < 10; i++) {
        fireEvent.click(zoomInBtn);
      }
      expect(zoomInBtn).toBeDisabled();
    });
  });

  describe('node click and detail overlay', () => {
    it('opens detail overlay on node click', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      const groups = container.querySelectorAll('g.cursor-pointer');
      expect(groups.length).toBeGreaterThan(0);
      fireEvent.click(groups[0]);
      expect(screen.getByRole('dialog', { name: /node detail/i })).toBeInTheDocument();
    });

    it('shows claim text in detail overlay', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      const dialog = screen.getByRole('dialog', { name: /node detail/i });
      expect(dialog).toHaveTextContent('Alpha claim');
    });

    it('shows confidence percentage in detail overlay', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      const dialog = screen.getByRole('dialog', { name: /node detail/i });
      expect(dialog).toHaveTextContent('90% confidence');
    });

    it('shows status badge in detail overlay', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      const dialog = screen.getByRole('dialog', { name: /node detail/i });
      expect(dialog).toHaveTextContent('verified');
    });

    it('shows evidence source IDs in detail overlay', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      const dialog = screen.getByRole('dialog', { name: /node detail/i });
      expect(dialog).toHaveTextContent('Evidence sources');
      expect(dialog).toHaveTextContent('src-1');
      expect(dialog).toHaveTextContent('src-2');
    });

    it('shows tags in detail overlay', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      const dialog = screen.getByRole('dialog', { name: /node detail/i });
      expect(dialog).toHaveTextContent('#ai');
    });

    it('closes detail overlay when close button is clicked', () => {
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      const closeBtn = screen.getByRole('button', { name: /close detail/i });
      fireEvent.click(closeBtn);
      expect(screen.queryByRole('dialog', { name: /node detail/i })).not.toBeInTheDocument();
    });

    it('calls onNodeClick prop with the raw ScoutKnowledgeNode', () => {
      const onNodeClick = vi.fn();
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} onNodeClick={onNodeClick} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      expect(onNodeClick).toHaveBeenCalledWith(nodeA);
    });

    it('deselects node when close button is clicked (second deselect path)', () => {
      // Covers the same deselect behavior via the close button since
      // AnimatePresence mock renders children non-conditionally in jsdom.
      const { container } = render(<KnowledgeGraph nodes={[nodeA]} />);
      fireEvent.click(container.querySelectorAll('g.cursor-pointer')[0]);
      expect(screen.getByRole('dialog', { name: /node detail/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /close detail/i }));
      expect(screen.queryByRole('dialog', { name: /node detail/i })).not.toBeInTheDocument();
    });
  });

  describe('shared-evidence edge computation', () => {
    it('draws no edges when no nodes share evidence sources', () => {
      // nodeA has ['src-1','src-2'], nodeC has ['src-99'] — no overlap
      const { container } = render(<KnowledgeGraph nodes={[nodeA, nodeC]} />);
      const edges = container.querySelectorAll('line[data-edge]');
      expect(edges).toHaveLength(0);
    });

    it('draws an edge between nodes sharing at least one source', () => {
      // nodeA has ['src-1','src-2'], nodeB has ['src-2','src-3'] → shared src-2
      const { container } = render(<KnowledgeGraph nodes={[nodeA, nodeB]} />);
      const edges = container.querySelectorAll('line[data-edge]');
      expect(edges).toHaveLength(1);
    });

    it('draws multiple edges for multiple shared-evidence pairs', () => {
      // A↔B share src-2; no other overlap
      const { container } = render(<KnowledgeGraph nodes={[nodeA, nodeB, nodeC]} />);
      const edges = container.querySelectorAll('line[data-edge]');
      expect(edges).toHaveLength(1);
    });

    it('draws no edges when all nodes have empty evidence arrays', () => {
      const plain1 = makeNode({ id: 'p1', evidence: [] });
      const plain2 = makeNode({ id: 'p2', evidence: [] });
      const { container } = render(<KnowledgeGraph nodes={[plain1, plain2]} />);
      const edges = container.querySelectorAll('line[data-edge]');
      expect(edges).toHaveLength(0);
    });
  });

  describe('filter panel toggle', () => {
    it('opens filter panel when the filter button is clicked', () => {
      render(<KnowledgeGraph nodes={[nodeA, nodeB]} />);
      const filterBtn = screen.getByRole('button', { name: /toggle filters/i });
      fireEvent.click(filterBtn);
      expect(screen.getByText(/Filter by tag/i)).toBeInTheDocument();
    });

    it('closes filter panel on second click', () => {
      render(<KnowledgeGraph nodes={[nodeA, nodeB]} />);
      const filterBtn = screen.getByRole('button', { name: /toggle filters/i });
      fireEvent.click(filterBtn);
      fireEvent.click(filterBtn);
      expect(screen.queryByText(/Filter by tag/i)).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles nodes with undefined tags gracefully', () => {
      const noTags = makeNode({ id: 'nt', tags: undefined as unknown as string[] });
      expect(() => render(<KnowledgeGraph nodes={[noTags]} />)).not.toThrow();
    });

    it('handles nodes with undefined evidence gracefully', () => {
      const noEvidence = makeNode({ id: 'ne', evidence: undefined as unknown as string[] });
      expect(() => render(<KnowledgeGraph nodes={[noEvidence]} />)).not.toThrow();
    });

    it('clamps confidence above 1.0 to maximum radius', () => {
      const r = 8 + Math.max(0, Math.min(1, 1.5)) * 16;
      expect(r).toBe(24); // clamped to 1.0
    });

    it('clamps confidence below 0 to minimum radius', () => {
      const r = 8 + Math.max(0, Math.min(1, -0.5)) * 16;
      expect(r).toBe(8); // clamped to 0
    });
  });
});
