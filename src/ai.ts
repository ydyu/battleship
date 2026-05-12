import {
  BOARD_SIZE,
  Board,
  Move,
  SHIP_INDEX,
  SHIP_NAMES,
  SHIP_TYPES,
  SHOT_PATTERNS,
  ShipDefinition,
} from './engine';

export type AIDifficulty = 'novice' | 'medium' | 'expert' | 'experiment';

export interface HeatmapResult {
  heatmap: number[][];
  rawHeatmap: number[][];
  maxVal: number;
}

interface RawHeatmapResult {
  rawHeatmap: number[][];
  maxVal: number;
}

interface HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult;
}

interface PlacementStrategy {
  placeFleet(shipTypes?: ShipDefinition[]): Board;
}

const createHeatmap = (fill = 0): number[][] =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(fill));

const getShipSize = (shipName: string): number => SHIP_INDEX[shipName]?.size ?? 0;
const getUnsunkHits = (board: Board): Set<string> =>
  new Set([...board.hitsReceived].filter((coord) => !board.sunkCells.has(coord)));

const normalizeHeatmap = (rawHeatmap: number[][], maxVal: number): number[][] => {
  if (maxVal <= 0) {
    return createHeatmap(0);
  }

  return rawHeatmap.map((column) => column.map((value) => value / maxVal));
};

const getLargestShip = (activeShips: string[]): string =>
  activeShips.reduce<string | null>((largest, shipName) => {
    if (!largest) return shipName;

    const currentShip = SHIP_INDEX[shipName];
    const largestShip = SHIP_INDEX[largest];

    if (!largestShip) return shipName;
    if (!currentShip) return largest;
    if (currentShip.size !== largestShip.size) {
      return currentShip.size > largestShip.size ? shipName : largest;
    }

    return currentShip.index < largestShip.index ? shipName : largest;
  }, null) ?? SHIP_NAMES[SHIP_NAMES.length - 1];

const getRandomMove = (board: Board, ship: string): Move => {
  const validMoves: Move[] = [];

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      if (board.canTargetCell(x, y, ship)) {
        validMoves.push({ x, y, ship });
      }
    }
  }

  if (validMoves.length > 0) {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  return { x: 0, y: 0, ship };
};

class RandomPlacementStrategy implements PlacementStrategy {
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

class FlatHeatmap implements HeatmapStrategy {
  generate(): RawHeatmapResult {
    return { rawHeatmap: createHeatmap(1), maxVal: 1 };
  }
}

class MediumHeatmap implements HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    activeShipNames.forEach((shipName) => {
      const size = getShipSize(shipName);

      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          let validH = true;
          let overlapsH = 0;

          for (let i = 0; i < size; i += 1) {
            const nx = x + i;
            const coord = `${nx},${y}`;

            if (nx >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
              validH = false;
              break;
            }

            if (unsunkHits.has(coord)) overlapsH += 1;
          }

          if (validH) {
            const weight = 4 ** overlapsH;

            for (let i = 0; i < size; i += 1) {
              rawHeatmap[x + i][y] += weight;
              maxVal = Math.max(maxVal, rawHeatmap[x + i][y]);
            }
          }

          if (size === 1) continue;

          let validV = true;
          let overlapsV = 0;

          for (let i = 0; i < size; i += 1) {
            const ny = y + i;
            const coord = `${x},${ny}`;

            if (ny >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
              validV = false;
              break;
            }

            if (unsunkHits.has(coord)) overlapsV += 1;
          }

          if (!validV) continue;

          const weight = 4 ** overlapsV;

          for (let i = 0; i < size; i += 1) {
            rawHeatmap[x][y + i] += weight;
            maxVal = Math.max(maxVal, rawHeatmap[x][y + i]);
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class ExpertHeatmap implements HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    const maxActiveSize =
      activeShipNames.length > 0 ? Math.max(...activeShipNames.map(getShipSize)) : 0;

    let maxCapacity = 0;

    if (unsunkHits.size > 0) {
      unsunkHits.forEach((hitCoord) => {
        const [hx, hy] = hitCoord.split(',').map(Number) as [number, number];

        let left = 0;
        for (let x = hx - 1; x >= 0; x -= 1) {
          const coord = `${x},${hy}`;
          if (board.misses.has(coord) || board.sunkCells.has(coord)) break;
          left += 1;
        }

        let right = 0;
        for (let x = hx + 1; x < BOARD_SIZE; x += 1) {
          const coord = `${x},${hy}`;
          if (board.misses.has(coord) || board.sunkCells.has(coord)) break;
          right += 1;
        }

        maxCapacity = Math.max(maxCapacity, left + 1 + right);

        let up = 0;
        for (let y = hy - 1; y >= 0; y -= 1) {
          const coord = `${hx},${y}`;
          if (board.misses.has(coord) || board.sunkCells.has(coord)) break;
          up += 1;
        }

        let down = 0;
        for (let y = hy + 1; y < BOARD_SIZE; y += 1) {
          const coord = `${hx},${y}`;
          if (board.misses.has(coord) || board.sunkCells.has(coord)) break;
          down += 1;
        }

        maxCapacity = Math.max(maxCapacity, up + 1 + down);
      });
    }

    let assumedWoundedShipName: string | null = null;

    if (unsunkHits.size > 0) {
      const activeShipsSorted = [...activeShipNames].sort((a, b) => getShipSize(b) - getShipSize(a));
      assumedWoundedShipName =
        activeShipsSorted.find((shipName) => getShipSize(shipName) <= maxCapacity) ??
        activeShipsSorted[activeShipsSorted.length - 1] ??
        null;
    }

    activeShipNames.forEach((shipName) => {
      const size = getShipSize(shipName);
      const baseThreat = size === maxActiveSize ? size * size : 1;

      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          let validH = true;
          let overlapsH = 0;

          for (let i = 0; i < size; i += 1) {
            const nx = x + i;
            const coord = `${nx},${y}`;

            if (nx >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
              validH = false;
              break;
            }

            if (unsunkHits.has(coord)) overlapsH += 1;
          }

          if (validH) {
            const isGhost = overlapsH === 0 && shipName === assumedWoundedShipName;

            if (!isGhost) {
              const weight = baseThreat * 4 ** overlapsH;

              for (let i = 0; i < size; i += 1) {
                rawHeatmap[x + i][y] += weight;
                maxVal = Math.max(maxVal, rawHeatmap[x + i][y]);
              }
            }
          }

          if (size === 1) continue;

          let validV = true;
          let overlapsV = 0;

          for (let i = 0; i < size; i += 1) {
            const ny = y + i;
            const coord = `${x},${ny}`;

            if (ny >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
              validV = false;
              break;
            }

            if (unsunkHits.has(coord)) overlapsV += 1;
          }

          if (!validV) continue;

          const isGhost = overlapsV === 0 && shipName === assumedWoundedShipName;

          if (isGhost) continue;

          const weight = baseThreat * 4 ** overlapsV;

          for (let i = 0; i < size; i += 1) {
            rawHeatmap[x][y + i] += weight;
            maxVal = Math.max(maxVal, rawHeatmap[x][y + i]);
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class ExperimentHeatmap implements HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    const maxActiveSize =
      activeShipNames.length > 0 ? Math.max(...activeShipNames.map(getShipSize)) : 0;
    const isLastShipWounded = activeShipNames.length === 1 && unsunkHits.size > 0;

    activeShipNames.forEach((shipName) => {
      const size = getShipSize(shipName);
      const isBiggest = size === maxActiveSize;

      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          let validH = true;
          let overlapsH = 0;

          for (let i = 0; i < size; i += 1) {
            const nx = x + i;
            const coord = `${nx},${y}`;

            if (nx >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
              validH = false;
              break;
            }

            if (unsunkHits.has(coord)) overlapsH += 1;
          }

          if (validH) {
            let weight = 0;

            if (overlapsH > 0) {
              weight = (isBiggest ? 2 : 1) * 4 ** overlapsH;
            } else if (!isLastShipWounded) {
              weight = 1;
            }

            if (weight > 0) {
              for (let i = 0; i < size; i += 1) {
                rawHeatmap[x + i][y] += weight;
                maxVal = Math.max(maxVal, rawHeatmap[x + i][y]);
              }
            }
          }

          if (size === 1) continue;

          let validV = true;
          let overlapsV = 0;

          for (let i = 0; i < size; i += 1) {
            const ny = y + i;
            const coord = `${x},${ny}`;

            if (ny >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
              validV = false;
              break;
            }

            if (unsunkHits.has(coord)) overlapsV += 1;
          }

          if (!validV) continue;

          let weight = 0;

          if (overlapsV > 0) {
            weight = (isBiggest ? 2 : 1) * 4 ** overlapsV;
          } else if (!isLastShipWounded) {
            weight = 1;
          }

          if (weight <= 0) continue;

          for (let i = 0; i < size; i += 1) {
            rawHeatmap[x][y + i] += weight;
            maxVal = Math.max(maxVal, rawHeatmap[x][y + i]);
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class HeatmapTargeting {
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

    return getRandomMove(enemyBoard, getLargestShip(myActiveShips));
  }
}

abstract class AIVariant {
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

class NoviceAI extends AIVariant {
  protected readonly heatmapStrategy = new FlatHeatmap();

  selectMove(enemyBoard: Board, myActiveShips: string[]): Move {
    return getRandomMove(enemyBoard, getLargestShip(myActiveShips));
  }
}

class MediumAI extends AIVariant {
  protected readonly heatmapStrategy = new MediumHeatmap();

  private readonly targeting = new HeatmapTargeting(false, false);

  selectMove(enemyBoard: Board, myActiveShips: string[]): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy);
  }
}

class ExpertAI extends AIVariant {
  protected readonly heatmapStrategy = new ExpertHeatmap();

  private readonly targeting = new HeatmapTargeting(true, true);

  selectMove(enemyBoard: Board, myActiveShips: string[]): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy);
  }
}

class ExperimentAI extends AIVariant {
  protected readonly heatmapStrategy = new ExperimentHeatmap();

  private readonly targeting = new HeatmapTargeting(true, true);

  selectMove(enemyBoard: Board, myActiveShips: string[]): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy);
  }
}

export class AI {
  private readonly variant: AIVariant;

  constructor(difficulty: AIDifficulty = 'expert') {
    switch (difficulty) {
      case 'novice':
        this.variant = new NoviceAI();
        break;
      case 'medium':
        this.variant = new MediumAI();
        break;
      case 'experiment':
        this.variant = new ExperimentAI();
        break;
      case 'expert':
      default:
        this.variant = new ExpertAI();
        break;
    }
  }

  getHeatmap(board: Board, activeShipNames: string[] = board.getActiveShipNames()): HeatmapResult {
    return this.variant.getHeatmap(board, activeShipNames);
  }

  placeFleet(shipTypes: ShipDefinition[] = SHIP_TYPES): Board {
    return this.variant.placeFleet(shipTypes);
  }

  selectMove(enemyBoard: Board, myActiveShips: string[]): Move {
    return this.variant.selectMove(enemyBoard, myActiveShips);
  }
}

export const placeFleetRandomly = (shipTypes: ShipDefinition[] = SHIP_TYPES): Board =>
  new RandomPlacementStrategy().placeFleet(shipTypes);
