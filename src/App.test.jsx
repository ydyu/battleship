import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DifficultyButton, GameBoard } from './App';
import { createEmptyBoard } from './engine';

describe('App module components', () => {
  it('renders difficulty buttons as always enabled (never disabled during battle)', () => {
    const markup = renderToStaticMarkup(
      <DifficultyButton
        level="expert"
        currentDifficulty="expert"
        phase="battle"
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-disabled="false"');
    expect(markup).toContain('exp');
  });

  it('renders normalized debug scores on the board overlay', () => {
    const board = createEmptyBoard();
    const heatmap = Array.from({ length: 10 }, () => Array(10).fill(0));
    heatmap[0][0] = 1;

    const markup = renderToStaticMarkup(
      <GameBoard
        board={board}
        isEnemy
        phase="battle"
        turn="player"
        winner={null}
        isScrubbing={false}
        targetCell={null}
        selectedWeapon="PatrolBoat"
        showDebug
        activeHeatmap={{ heatmap }}
        highlightCoords={[]}
        currentSetupShip={null}
        setupOrientation="horizontal"
        onCellClick={vi.fn()}
      />,
    );

    expect(markup).toContain('100');
  });
});
