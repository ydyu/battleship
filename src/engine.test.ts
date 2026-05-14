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
      { x: 5, y: 5, ship: 'Destroyer' },
      { x: 0, y: 0, ship: 'Destroyer' },
    );

    const rebuilt = rebuildBoardState(boardA, result.eventsB, result.eventsB.length - 1, 'left');

    expect([...rebuilt.hitsReceived].sort()).toEqual([...result.boardA.hitsReceived].sort());
    expect([...rebuilt.sunkCells].sort()).toEqual([...result.boardA.sunkCells].sort());
    expect(Object.keys(rebuilt.activeShips)).toEqual(Object.keys(result.boardA.activeShips));
  });

  it('getSideStats returns zeros for a fresh match', () => {
    const boardA = new Board();
    const boardB = new Board();
    boardA.placeShip('Destroyer', 0, 0, 'vertical');
    boardB.placeShip('Destroyer', 5, 5, 'vertical');

    const match = new BattleshipMatch(boardA, boardB, 'player', 'ai');
    const stats = match.getSideStats('player');

    expect(stats.roundsWithShots).toBe(0);
    expect(stats.roundsWithHits).toBe(0);
    expect(stats.totalHits).toBe(0);
    expect(stats.exploredCells).toBe(0);
    expect(stats.boardSize).toBe(100);
  });

  it('getSideStats accumulates correctly after turns', () => {
    const boardA = new Board();
    const boardB = new Board();
    boardA.placeShip('Destroyer', 0, 0, 'vertical');
    boardB.placeShip('Destroyer', 5, 5, 'vertical');

    const match = new BattleshipMatch(boardA, boardB, 'player', 'ai');
    // Round 1: player hits (5,5 = Destroyer origin on boardB)
    match.resolveTurn({ x: 5, y: 5, ship: 'Destroyer' }, { x: 9, y: 9, ship: 'Destroyer' });
    // Round 2: player misses (0,0 is boardA not boardB, boardB has Destroyer at 5,5)
    match.resolveTurn({ x: 0, y: 0, ship: 'Destroyer' }, { x: 9, y: 8, ship: 'Destroyer' });

    const stats = match.getSideStats('player');
    expect(stats.roundsWithShots).toBe(2);
    expect(stats.roundsWithHits).toBe(1); // only round 1 had hits
    expect(stats.totalHits).toBeGreaterThan(0);
    expect(stats.exploredCells).toBe(6); // 3 cells each shot (Destroyer pattern)
    expect(stats.boardSize).toBe(100);
  });

  it('getSideStats respects upToEventIdx for scrub replay', () => {
    const boardA = new Board();
    const boardB = new Board();
    boardA.placeShip('Destroyer', 0, 0, 'vertical');
    boardB.placeShip('Destroyer', 5, 5, 'vertical');

    const match = new BattleshipMatch(boardA, boardB, 'player', 'ai');
    match.resolveTurn({ x: 5, y: 5, ship: 'Destroyer' }, { x: 9, y: 9, ship: 'Destroyer' });
    match.resolveTurn({ x: 0, y: 0, ship: 'Destroyer' }, { x: 9, y: 8, ship: 'Destroyer' });

    // Before round 2 attack: find index of first player attack event
    const firstPlayerAttackIdx = match.events.findIndex(e => e.kind === 'attack' && e.actorId === 'player');
    const statsAtFirst = match.getSideStats('player', firstPlayerAttackIdx);

    expect(statsAtFirst.roundsWithShots).toBe(1);
    expect(statsAtFirst.exploredCells).toBe(3);

    // Full match
    const statsFull = match.getSideStats('player');
    expect(statsFull.roundsWithShots).toBe(2);
  });
});
