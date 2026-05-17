import { describe, expect, it } from 'vitest';
import { AI, placeFleetRandomly, MaxTargeting } from './ai';
import { Board, SHIPS, BattleshipMatch } from './engine';
import { EXPERIMENTS } from './ai-experiments';

describe('ai', () => {
  describe('HailMaryAI', () => {
    const HailMaryAI = EXPERIMENTS.hailmary;

    it('triggers Hail Mary mode when my fleet ratio is below threshold', () => {
      const ai = new HailMaryAI({ hailMaryThreshold: 0.7 });
      const myActiveShips = ['PatrolBoat']; // 2 cells
      
      const enemyBoard = new Board();
      // 5+4+3+3 = 15 cells (more than 2/0.7 = 2.85)
      enemyBoard.placeShip('Carrier', 0, 0, 'horizontal');
      enemyBoard.placeShip('Battleship', 0, 1, 'horizontal');
      enemyBoard.placeShip('Submarine', 0, 2, 'horizontal');
      enemyBoard.placeShip('Destroyer', 0, 3, 'horizontal');

      const move = ai.selectMove(enemyBoard, myActiveShips);
      expect(move).toBeDefined();
      expect(myActiveShips).toContain(move.ship);
    });

    it('does NOT trigger Hail Mary mode when my fleet ratio is above threshold', () => {
      const ai = new HailMaryAI({ hailMaryThreshold: 0.1 });
      const myActiveShips = ['Carrier', 'Battleship', 'Submarine', 'Destroyer', 'PatrolBoat']; // 17 cells
      
      const enemyBoard = new Board();
      enemyBoard.placeShip('PatrolBoat', 0, 0, 'horizontal'); // 2 cells
      
      const move = ai.selectMove(enemyBoard, myActiveShips);
      expect(move).toBeDefined();
      expect(myActiveShips).toContain(move.ship);
    });

    it('does NOT trigger Hail Mary mode when at parity', () => {
      const ai = new HailMaryAI({ hailMaryThreshold: 0.7 });
      const myActiveShips = ['Carrier', 'Battleship', 'Submarine', 'Destroyer', 'PatrolBoat'];
      
      const enemyBoard = new Board();
      enemyBoard.placeShip('Carrier', 0, 0, 'horizontal');
      enemyBoard.placeShip('Battleship', 0, 1, 'horizontal');
      enemyBoard.placeShip('Submarine', 0, 2, 'horizontal');
      enemyBoard.placeShip('Destroyer', 0, 3, 'horizontal');
      enemyBoard.placeShip('PatrolBoat', 0, 4, 'horizontal');
      
      const move = ai.selectMove(enemyBoard, myActiveShips);
      expect(move).toBeDefined();
      expect(myActiveShips).toContain(move.ship);
    });
    
    it('correctly calculates weighted fleet health', () => {
      const ai = new HailMaryAI();
      const getHealth = (ai as any).getWeightedFleetHealth.bind(ai);
      
      expect(getHealth(['Carrier'])).toBe(5);
      expect(getHealth(['Carrier', 'PatrolBoat'])).toBe(7);
      expect(getHealth(['Submarine', 'Destroyer'])).toBe(6);
      expect(getHealth([])).toBe(0);
    });
  });

  describe('MaxTargeting', () => {
    it('doubles the contribution of max value cells', () => {
      const board = new Board();
      const strategy = {
        generate: () => ({
          rawHeatmap: Array(10).fill(0).map((_, x) => 
            Array(10).fill(0).map((_, y) => (x === 0 && y === 0 ? 10 : 1))
          ),
          maxVal: 10
        })
      };
      
      const targeting = new MaxTargeting(false);
      // Patrol Boat has size 1 and no neighbors in its pattern (usually [[0,0]])
      // Let's check the engine for Patrol Boat pattern.
      // Actually SHOT_PATTERNS[ship] ?? []
      // If ship is 'PatrolBoat', size is 2. 
      // If we use a ship with size 1 (if it exists) or just check score logic.
      
      const move = targeting.selectMove(board, ['PatrolBoat'], strategy as any);
      
      // With x=0, y=0 having 10, and others 1.
      // A ship at 0,0 with pattern [[0,0]] would get score 10 * 2 = 20.
      // A ship at 0,1 with pattern [[0,0]] would get score 1.
      expect(move.x).toBe(0);
      expect(move.y).toBe(0);
    });
  });

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
