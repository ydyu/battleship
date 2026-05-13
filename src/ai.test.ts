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

  it('ExpertAI: disables open-ocean scouting when all remaining ships are wounded (Saturation Heuristic)', () => {
    const ai = new AI('expert');
    const board = new Board();

    // Setup: 2 ships left, only 1 hit. Scouting should NOT be redundant.
    board.placeShip('PatrolBoat', 0, 0, 'horizontal');
    board.placeShip('Destroyer', 5, 5, 'horizontal');
    
    // Fake a hit on the PatrolBoat
    board.grid[0][0] = 1;
    board.fire(0, 0, [[0, 0]], 'PatrolBoat');

    const heatmap1 = ai.getHeatmap(board, ['PatrolBoat', 'Destroyer']);
    // Open ocean (e.g., 9,9) should have weight > 0
    expect(heatmap1.rawHeatmap[9][9]).toBeGreaterThan(0);

    // Setup: 2 ships left, 2 distinct hits. Scouting SHOULD be redundant.
    // Add a hit on the Destroyer at (5,5)
    board.grid[5][5] = 1;
    board.fire(5, 5, [[0, 0]], 'Destroyer');

    const heatmap2 = ai.getHeatmap(board, ['PatrolBoat', 'Destroyer']);
    // Open ocean (9,9) should now have weight 0 because both ships are wounded
    expect(heatmap2.rawHeatmap[9][9]).toBe(0);
    // Areas around hits should still have high weight
    expect(heatmap2.rawHeatmap[0][1]).toBeGreaterThan(0);
    expect(heatmap2.rawHeatmap[5][6]).toBeGreaterThan(0);
  });

  it('ExpertAI: identifies separate ships when hits are separated by an obstacle (Saturation Heuristic)', () => {
    const ai = new AI('expert');
    const board = new Board();

    // Setup: 2 ships left (size 5). Hits at (0,0) and (0,2). 
    // Place ships HORIZONTALLY so the vertical gap at (0,1) is empty.
    board.placeShip('Carrier', 0, 0, 'horizontal');   // (0,0) to (4,0)
    board.placeShip('Battleship', 0, 2, 'horizontal'); // (0,2) to (3,2)

    // Add hits at (0,0) and (0,2)
    board.grid[0][0] = 1;
    board.grid[0][2] = 1;
    board.fire(0, 0, [[0, 0]], 'Carrier');
    board.fire(0, 2, [[0, 0]], 'Battleship');

    const heatmap1 = ai.getHeatmap(board, ['Carrier', 'Battleship']);
    // (9,9) should have weight because these two hits COULD be one vertical ship
    expect(heatmap1.rawHeatmap[9][9]).toBeGreaterThan(0);

    // NOW: Add a MISS at (0,1) blocking the potential vertical ship
    board.fire(0, 1, [[0, 0]], 'Miss');

    const heatmap2 = ai.getHeatmap(board, ['Carrier', 'Battleship']);
    // (9,9) should now be 0 because the miss proves (0,0) and (0,2) are DIFFERENT ships
    expect(heatmap2.rawHeatmap[9][9]).toBe(0);
  });

  it('ExpertAI: prunes placements whose remainder wound cannot be reached by any remaining ship', () => {
    const board = new Board();

    // Board corner (see pruning-sample.txt):
    //   (0,0)=wound  (1,0)=open   (2,0)=miss
    //   (0,1)=open   (1,1)=miss
    //   (0,2)=wound  (1,2)=miss
    //   (0,3)=miss   (rest is open ocean)
    board.hitsReceived.add('0,0');
    board.hitsReceived.add('0,2');
    board.misses.add('2,0');
    board.misses.add('1,1');
    board.misses.add('1,2');
    board.misses.add('0,3');

    const activeShips = ['Destroyer', 'PatrolBoat'];

    const ai = new AI('expert');
    const heatmap = ai.getHeatmap(board, activeShips);

    // Cell (1,0) is only reachable via PatrolH(0,0)→(1,0) [wound-overlapping].
    // All other horizontal/vertical ships through (1,0) are blocked by misses.
    //
    // PatrolH(0,0)→(1,0): remainder wound (0,2), ships=[Destroyer].
    //   With pruning + excluded={(0,0),(1,0)}: maxRunThrough(0,2) can reach (0,1)
    //   but not (0,0) → run=2, Destroyer(3)>2 → PRUNED → weight=0.
    expect(heatmap.rawHeatmap[1][0]).toBe(0);
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
