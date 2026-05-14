import { describe, expect, it } from 'vitest';
import { AI, placeFleetRandomly } from './ai';
import { Board, SHIPS, BattleshipMatch } from './engine';

describe('ai', () => {
  it('places a full fleet without overlaps', () => {
    const board = placeFleetRandomly();
    const expectedCells = SHIPS.reduce((total, ship) => total + ship.size, 0);
    const occupiedCells = board.grid.flat().filter((cell) => cell === 1).length;

    expect(Object.keys(board.activeShips)).toHaveLength(SHIPS.length);
    expect(occupiedCells).toBe(expectedCells);
  });

  it('returns normalized heatmaps for the selected difficulty', () => {
    const board = new Board();
    board.placeShip('Destroyer', 0, 0, 'vertical');

    const heatmap = new AI('expert').getHeatmap(board);
    const values = heatmap.heatmap.flat();

    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(values.some((value) => value > 0)).toBe(true);
  });

  it('selects valid moves for every supported difficulty', () => {
    const targetBoard = new Board();
    targetBoard.placeShip('Destroyer', 0, 0, 'vertical');

    ['novice', 'medium', 'expert'].forEach((difficulty) => {
      const ai = new AI(difficulty);
      const move = ai.selectMove(targetBoard, ['Carrier', 'Battleship', 'Destroyer']);

      expect(['Carrier', 'Battleship', 'Destroyer']).toContain(move.ship);
      expect(targetBoard.canTargetCell(move.x, move.y, move.ship)).toBe(true);
    });
  });

  it('ExpertAI: behavior check (disables open-ocean scouting when ships are wounded)', () => {
    const ai = new AI('expert');
    const board = new Board();

    // High-level behavior test: when scouting is redundant, open water should have 0 weight.
    board.placeShip('PatrolBoat', 0, 0, 'horizontal');
    board.fire(0, 0, [[0, 0]], 'PatrolBoat');
    
    // With only 1 ship left and 1 hit, scouting is redundant.
    const heatmap = ai.getHeatmap(board, ['PatrolBoat']);
    expect(heatmap.rawHeatmap[9][9]).toBe(0);
  });

  it('completes a full game between expert and medium without errors', () => {
    const aiA = new AI('expert');
    const aiB = new AI('medium');
    const match = new BattleshipMatch(aiA.placeFleet(), aiB.placeFleet(), 'sideA', 'sideB');

    while (!match.isGameOver) {
      expect(match.round).toBeLessThan(500);
      const moveA = aiA.selectMove(match.boardB, match.boardA.getActiveShipNames());
      const moveB = aiB.selectMove(match.boardA, match.boardB.getActiveShipNames());
      match.resolveTurn(moveA, moveB);
    }

    expect(match.isGameOver).toBe(true);
  });
});
