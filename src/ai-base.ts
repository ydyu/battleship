import { Board, Move, BOARD_SIZE, SHIP_INDEX, SHIP_NAMES, SHIP_TYPES, SHOT_PATTERNS, ShipDefinition } from './engine';
import { 
  getShipSize, 
  getLargestShip, 
  getUnsunkHits, 
  normalizeHeatmap, 
  createHeatmap 
} from './ai-utils';

export interface HeatmapResult {
  heatmap: number[][];
  rawHeatmap: number[][];
  maxVal: number;
}

export interface RawHeatmapResult {
  rawHeatmap: number[][];
  maxVal: number;
}

export interface HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult;
}

export interface PlacementStrategy {
  placeFleet(shipTypes?: ShipDefinition[]): Board;
}

export class RandomPlacementStrategy implements PlacementStrategy {
  placeFleet(shipTypes: ShipDefinition[] = SHIP_TYPES): Board {
    const board = new Board();

    shipTypes.forEach((ship) => {
      let placed = false;

      while (!placed) {
        const x = Math.floor(Math.random() * board.size);
        const y = Math.floor(Math.random() * board.size);
        const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        placed = board.placeShip(ship.name, x, y, orientation);
      }
    });

    return board;
  }
}

export class HeatmapTargeting {
  constructor(
    private readonly useParityCheck: boolean,
    private readonly testAllShips: boolean,
  ) {}

  selectMove(enemyBoard: Board, myActiveShips: string[], heatmapStrategy: HeatmapStrategy): Move {
    const activeEnemyShipNames = enemyBoard.getActiveShipNames();
    const { rawHeatmap } = heatmapStrategy.generate(enemyBoard, activeEnemyShipNames);
    const shipsToTest = this.testAllShips ? myActiveShips : [getLargestShip(myActiveShips)];
    const unsunkHits = getUnsunkHits(enemyBoard);

    let globalBestScore = -1;
    let globalBestMoves: Move[] = [];

    shipsToTest.forEach((ship) => {
      const pattern = SHOT_PATTERNS[ship] ?? [];

      for (let x = 0; x < BOARD_SIZE; x += 1) {
        for (let y = 0; y < BOARD_SIZE; y += 1) {
          if (!enemyBoard.canTargetCell(x, y, ship)) continue;

          let score = 0;

          pattern.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
              const coord = `${nx},${ny}`;

              if (!enemyBoard.shotsFired.has(coord)) {
                score += rawHeatmap[nx][ny];
              }
            }
          });

          if (this.useParityCheck && unsunkHits.size === 0 && (x + y) % 2 === 0) {
            score *= 2;
          }

          if (score > globalBestScore) {
            globalBestScore = score;
            globalBestMoves = [{ x, y, ship }];
          } else if (score === globalBestScore) {
            globalBestMoves.push({ x, y, ship });
          }
        }
      }
    });

    if (globalBestMoves.length > 0) {
      return globalBestMoves[Math.floor(Math.random() * globalBestMoves.length)];
    }

    // Fallback: This is locally defined in ai.ts currently, but we can't easily import it back without circularity.
    // We'll use a simple random fallback here if needed, or pass it in.
    // For now, let's keep it simple.
    return { x: 0, y: 0, ship: getLargestShip(myActiveShips) };
  }
}

export class MaxTargeting {
  constructor(
    private readonly testAllShips: boolean,
  ) {}

  selectMove(enemyBoard: Board, myActiveShips: string[], heatmapStrategy: HeatmapStrategy): Move {
    const activeEnemyShipNames = enemyBoard.getActiveShipNames();
    const { rawHeatmap, maxVal } = heatmapStrategy.generate(enemyBoard, activeEnemyShipNames);
    const shipsToTest = this.testAllShips ? myActiveShips : [getLargestShip(myActiveShips)];

    let globalBestScore = -1;
    let globalBestMoves: Move[] = [];

    shipsToTest.forEach((ship) => {
      const pattern = SHOT_PATTERNS[ship] ?? [];

      for (let x = 0; x < BOARD_SIZE; x += 1) {
        for (let y = 0; y < BOARD_SIZE; y += 1) {
          if (!enemyBoard.canTargetCell(x, y, ship)) continue;

          let score = 0;

          pattern.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
              const coord = `${nx},${ny}`;

              if (!enemyBoard.shotsFired.has(coord)) {
                const cellVal = rawHeatmap[nx][ny];
                score += (cellVal === maxVal && maxVal > 0) ? cellVal * 2 : cellVal;
              }
            }
          });

          if (score > globalBestScore) {
            globalBestScore = score;
            globalBestMoves = [{ x, y, ship }];
          } else if (score === globalBestScore) {
            globalBestMoves.push({ x, y, ship });
          }
        }
      }
    });

    if (globalBestMoves.length > 0) {
      return globalBestMoves[Math.floor(Math.random() * globalBestMoves.length)];
    }

    return { x: 0, y: 0, ship: getLargestShip(myActiveShips) };
  }
}

export abstract class AIVariant {
  protected abstract readonly heatmapStrategy: HeatmapStrategy;

  protected readonly placementStrategy: PlacementStrategy = new RandomPlacementStrategy();

  getHeatmap(board: Board, activeShipNames: string[] = board.getActiveShipNames()): HeatmapResult {
    const { rawHeatmap, maxVal } = this.heatmapStrategy.generate(board, activeShipNames);

    return {
      heatmap: normalizeHeatmap(rawHeatmap, maxVal),
      rawHeatmap,
      maxVal,
    };
  }

  placeFleet(shipTypes: ShipDefinition[] = SHIP_TYPES): Board {
    return this.placementStrategy.placeFleet(shipTypes);
  }

  abstract selectMove(enemyBoard: Board, myActiveShips: string[]): Move;
}
