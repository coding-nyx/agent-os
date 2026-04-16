import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AliveEntityInputPanel } from './AliveEntityInputPanel';

describe('AliveEntityInputPanel', () => {
  it('renders grouped alive entities and supports injection clicks', () => {
    const onEntitySelected = vi.fn();

    render(
      <AliveEntityInputPanel
        context={{
          total: 2,
          moduleIds: ['atlas', 'ledger'],
          byModule: {
            atlas: [
              {
                id: 'alive.goal.1',
                label: 'Morning planning',
                type: 'ACTION',
                sourceModule: 'atlas',
                provenance: 'adapter',
                semantic_tags: ['planning', 'focus'],
                updatedAt: '2026-03-24T00:00:00.000Z',
              },
            ],
            ledger: [
              {
                id: 'alive.ledger.goal.1',
                label: 'Emergency fund',
                type: 'ACTION',
                sourceModule: 'ledger',
                provenance: 'adapter',
                semantic_tags: ['finance', 'safety'],
                updatedAt: '2026-03-24T00:00:00.000Z',
              },
            ],
          },
          tags: ['finance', 'focus', 'planning', 'safety'],
          lastUpdatedAt: '2026-03-24T00:00:00.000Z',
        }}
        onEntitySelected={onEntitySelected}
      />,
    );

    expect(screen.getByTestId('alive-entity-input-panel')).toHaveTextContent('Alive inputs');
    expect(screen.getByTestId('alive-entity-input-panel')).toHaveTextContent('Morning planning');
    expect(screen.getByTestId('alive-entity-input-panel')).toHaveTextContent('Emergency fund');

    fireEvent.click(screen.getByTestId('alive-entity-alive.goal.1'));
    expect(onEntitySelected).toHaveBeenCalledWith(expect.objectContaining({
      id: 'alive.goal.1',
      label: 'Morning planning',
    }));
  });
});
