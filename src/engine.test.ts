import { describe, expect, it } from 'vitest';
import { BattleshipMatch, Board, rebuildBoardState } from './engine';

describe('engine', () => {
  it('resolves simultaneous turns with structured events and a draw outcome', () => {
    const boardA = new Board();
    const boardB = new Board();

    boardA.placeShip('Destroyer', 0, 0, 'vertical');
    boardB.placeShip('Destroyer', 5, 5, 'vertical');

    const match = new BattleshipMatch(boardA, boardB, 'left', 'right');
    const result = match.resolveTurn(
      1,
      { x: 5, y: 5, ship: 'Destroyer' },
      { x: 0, y: 0, ship: 'Destroyer' },
    );

    expect(result.attackA.hits).toBe(3);
    expect(result.attackB.hits).toBe(3);
    expect(result.winnerId).toBe('draw');
    expect(result.eventsA[0]).toMatchObject({
      kind: 'attack',
      actorId: 'left',
      targetId: 'right',
      ship: 'Destroyer',
      hits: 3,
    });
    expect(result.eventsB[1]).toMatchObject({
      kind: 'sink',
      actorId: 'right',
      targetId: 'left',
      ship: 'Destroyer',
    });
    expect(result.outcomeEvent).toMatchObject({
      kind: 'outcome',
      winnerId: 'draw',
    });
  });

  it('rebuilds board state from structured attack logs', () => {
    const boardA = new Board();
    const boardB = new Board();

    boardA.placeShip('Destroyer', 0, 0, 'vertical');
    boardB.placeShip('Destroyer', 5, 5, 'vertical');

    const result = new BattleshipMatch(boardA, boardB, 'left', 'right').resolveTurn(
      1,
      { x: 5, y: 5, ship: 'Destroyer' },
      { x: 0, y: 0, ship: 'Destroyer' },
    );

    const rebuilt = rebuildBoardState(boardA, result.eventsB, result.eventsB.length - 1, 'left');

    expect([...rebuilt.hitsReceived].sort()).toEqual([...result.boardA.hitsReceived].sort());
    expect([...rebuilt.sunkCells].sort()).toEqual([...result.boardA.sunkCells].sort());
    expect(Object.keys(rebuilt.activeShips)).toEqual(Object.keys(result.boardA.activeShips));
  });
});
