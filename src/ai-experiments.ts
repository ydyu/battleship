import { Board, Move, BOARD_SIZE, SHIP_TYPES, SHIP_INDEX } from './engine';
import {
  AIVariant,
  HeatmapStrategy,
  HeatmapTargeting,
  MaxTargeting,
  RawHeatmapResult,
  AiParamSchema,
} from './ai-base';
import {
  createHeatmap,
  getUnsunkHits,
  getShipSize,
  fromCoord,
  maxRunThrough,
  getLargestShip,
  getSaturationCount,
  remainderIsValid,
  RngFn,
} from './ai-utils';

/**
 * EXPERIMENTAL AI REGISTRY
 * 
 * To add a new experimental AI:
 * 1. Define your HeatmapStrategy class.
 * 2. Define your AIVariant class.
 * 3. Add an entry to the EXPERIMENTS object.
 * 
 * It will immediately be available in sim.ts via the name you give it here.
 */
class HailMaryHeatmap implements HeatmapStrategy {
  constructor(
    private readonly config: {
      overlapBase: number;
      killCapital: number;
      searchCapital: number;
      killSmall: number;
      searchSmall: number;
      biggestShipBias: number;
      isHailMary: boolean;
    },
  ) {}

  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    const maxActiveSize = activeShipNames.length > 0 ? Math.max(...activeShipNames.map(getShipSize)) : 0;

    const saturationCount = getSaturationCount(
      unsunkHits,
      maxActiveSize,
      board,
      activeShipNames.length,
    );
    const isScoutingRedundant = saturationCount >= activeShipNames.length;

    activeShipNames.forEach((shipName) => {
      const size = getShipSize(shipName);
      const isCapitalShip = size === maxActiveSize;
      const bias = isCapitalShip ? this.config.biggestShipBias : 1.0;

      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          const orientations = size === 1 ? (['h'] as const) : (['h', 'v'] as const);

          for (const orient of orientations) {
            let valid = true;
            let overlaps = 0;
            const cells: string[] = [];

            for (let i = 0; i < size; i += 1) {
              const nx = orient === 'h' ? x + i : x;
              const ny = orient === 'h' ? y : y + i;
              const coord = `${nx},${ny}`;

              if (
                nx >= BOARD_SIZE ||
                ny >= BOARD_SIZE ||
                board.misses.has(coord) ||
                board.sunkCells.has(coord)
              ) {
                valid = false;
                break;
              }

              cells.push(coord);
              if (unsunkHits.has(coord)) overlaps += 1;
            }

            if (!valid) continue;

            let weight = 0;
            if (overlaps > 0) {
              const covered = new Set(cells);
              const remWounds = new Set([...unsunkHits].filter((w) => !covered.has(w)));
              const remShips = activeShipNames.filter((s) => s !== shipName);
              if (remainderIsValid(board, remWounds, remShips, covered)) {
                if (this.config.isHailMary) {
                  // Tiered Probability weighting: Linear (no exponential runaway)
                  weight = isCapitalShip 
                    ? this.config.killCapital 
                    : this.config.killSmall;
                } else {
                  weight = bias * this.config.overlapBase ** overlaps;
                }
              }
            } else if (!isScoutingRedundant) {
              if (this.config.isHailMary) {
                weight = isCapitalShip 
                  ? this.config.searchCapital 
                  : this.config.searchSmall;
              } else {
                weight = bias;
              }
            }

            if (weight > 0) {
              for (const coord of cells) {
                const [cx, cy] = fromCoord(coord);
                rawHeatmap[cx][cy] += weight;
                maxVal = Math.max(maxVal, rawHeatmap[cx][cy]);
              }
            }
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class HailMaryAI extends AIVariant {
  static paramSchema: AiParamSchema = {
    overlapBase: { type: 'number', default: 3.0, description: 'Base of overlap boon (base^overlaps)' },
    biggestShipBias: { type: 'number', default: 2.0, description: 'Weight multiplier for biggest ship' },
    hailMaryThreshold: { type: 'number', default: 12, description: 'Remaining cells threshold for Hail Mary mode' },
    killCapital: { type: 'number', default: 200.0, description: 'Flat weight for killing big ships in Hail Mary' },
    searchCapital: { type: 'number', default: 10.0, description: 'Flat weight for searching big ships in Hail Mary' },
    killSmall: { type: 'number', default: 1.0, description: 'Flat weight for killing small ships in Hail Mary' },
    searchSmall: { type: 'number', default: 0.1, description: 'Flat weight for searching small ships in Hail Mary' },
  };

  constructor(private readonly config: Record<string, number | boolean> = {}) {
    super();
  }

  private getConfigVal<T>(key: string, def: T): T {
    return (this.config[key] as T) ?? def;
  }

  protected get heatmapStrategy(): HeatmapStrategy {
    return new HailMaryHeatmap({
      overlapBase: this.getConfigVal('overlapBase', 3.0),
      killCapital: this.getConfigVal('killCapital', 200.0),
      searchCapital: this.getConfigVal('searchCapital', 10.0),
      killSmall: this.getConfigVal('killSmall', 1.0),
      searchSmall: this.getConfigVal('searchSmall', 0.1),
      biggestShipBias: this.getConfigVal('biggestShipBias', 2.0),
      isHailMary: false,
    });
  }

  private readonly targeting = new HeatmapTargeting(false, true);

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    const remainingCells = myActiveShips.reduce((sum, name) => sum + (SHIP_INDEX[name]?.size ?? 0), 0);
    const threshold = this.getConfigVal('hailMaryThreshold', 12);

    if (remainingCells <= threshold) {
      // HAIL MARY MODE
      const strategy = new HailMaryHeatmap({
        overlapBase: this.getConfigVal('overlapBase', 3.0),
        killCapital: this.getConfigVal('killCapital', 200.0),
        searchCapital: this.getConfigVal('searchCapital', 10.0),
        killSmall: this.getConfigVal('killSmall', 1.0),
        searchSmall: this.getConfigVal('searchSmall', 0.1),
        biggestShipBias: this.getConfigVal('biggestShipBias', 2.0),
        isHailMary: true,
      });
      return this.targeting.selectMove(enemyBoard, myActiveShips, strategy, rng);
    }

    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy, rng);
  }
}

class FlatHeatmap implements HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(1);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 1;

    unsunkHits.forEach((coord) => {
      const [x, y] = fromCoord(coord);

      const blocked = (nx: number, ny: number) => {
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) return true;
        const c = `${nx},${ny}`;
        return board.misses.has(c) || board.sunkCells.has(c);
      };

      let hL = 0, hR = 0, vU = 0, vD = 0;
      for (let nx = x - 1; nx >= 0 && !blocked(nx, y); nx -= 1) hL += 1;
      for (let nx = x + 1; nx < BOARD_SIZE && !blocked(nx, y); nx += 1) hR += 1;
      for (let ny = y - 1; ny >= 0 && !blocked(x, ny); ny -= 1) vU += 1;
      for (let ny = y + 1; ny < BOARD_SIZE && !blocked(x, ny); ny += 1) vD += 1;

      const hRun = hL + 1 + hR;
      const vRun = vU + 1 + vD;
      const maxR = Math.max(hRun, vRun);

      if (hRun === maxR) {
        if (!blocked(x - 1, y)) {
          rawHeatmap[x - 1][y] += 1;
          maxVal = Math.max(maxVal, rawHeatmap[x - 1][y]);
        }
        if (!blocked(x + 1, y)) {
          rawHeatmap[x + 1][y] += 1;
          maxVal = Math.max(maxVal, rawHeatmap[x + 1][y]);
        }
      }
      if (vRun === maxR) {
        if (!blocked(x, y - 1)) {
          rawHeatmap[x][y - 1] += 1;
          maxVal = Math.max(maxVal, rawHeatmap[x][y - 1]);
        }
        if (!blocked(x, y + 1)) {
          rawHeatmap[x][y + 1] += 1;
          maxVal = Math.max(maxVal, rawHeatmap[x][y + 1]);
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class LegacyHeatmap1 implements HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    const maxActiveSize =
      activeShipNames.length > 0 ? Math.max(...activeShipNames.map(getShipSize)) : 0;

    let maxCapacity = 0;

    if (unsunkHits.size > 0) {
      unsunkHits.forEach((hitCoord) => {
        const [hx, hy] = fromCoord(hitCoord);
        maxCapacity = Math.max(maxCapacity, maxRunThrough(board, hx, hy));
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
          const orientations = size === 1 ? (['h'] as const) : (['h', 'v'] as const);

          for (const orient of orientations) {
            let valid = true;
            let overlaps = 0;
            const cells: string[] = [];

            for (let i = 0; i < size; i += 1) {
              const nx = orient === 'h' ? x + i : x;
              const ny = orient === 'h' ? y : y + i;
              const coord = `${nx},${ny}`;

              if (nx >= BOARD_SIZE || ny >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
                valid = false;
                break;
              }

              cells.push(coord);
              if (unsunkHits.has(coord)) overlaps += 1;
            }

            if (!valid) continue;

            const isGhost = overlaps === 0 && shipName === assumedWoundedShipName;

            if (!isGhost) {
              const weight = baseThreat * 4 ** overlaps;

              for (const coord of cells) {
                const [cx, cy] = fromCoord(coord);
                rawHeatmap[cx][cy] += weight;
                maxVal = Math.max(maxVal, rawHeatmap[cx][cy]);
              }
            }
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class LegacyAI1 extends AIVariant {
  static paramSchema: AiParamSchema = {};
  protected readonly heatmapStrategy = new LegacyHeatmap1();

  private readonly targeting = new HeatmapTargeting(true, true);

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy, rng);
  }
}

class Big1Heatmap implements HeatmapStrategy {
  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    const maxActiveSize = activeShipNames.length > 0 ? Math.max(...activeShipNames.map(getShipSize)) : 0;

    const saturationCount = getSaturationCount(
      unsunkHits,
      maxActiveSize,
      board,
      activeShipNames.length,
    );
    const isScoutingRedundant = saturationCount >= activeShipNames.length;

    activeShipNames.forEach((shipName) => {
      const size = getShipSize(shipName);
      const threatMultiplier = size === maxActiveSize ? 2 : 1;

      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          const orientations = size === 1 ? (['h'] as const) : (['h', 'v'] as const);

          for (const orient of orientations) {
            let valid = true;
            let overlaps = 0;
            const cells: string[] = [];

            for (let i = 0; i < size; i += 1) {
              const nx = orient === 'h' ? x + i : x;
              const ny = orient === 'h' ? y : y + i;
              const coord = `${nx},${ny}`;

              if (nx >= BOARD_SIZE || ny >= BOARD_SIZE || board.misses.has(coord) || board.sunkCells.has(coord)) {
                valid = false;
                break;
              }

              cells.push(coord);
              if (unsunkHits.has(coord)) overlaps += 1;
            }

            if (!valid) continue;

            let threat = 0;

            if (overlaps > 0) {
              const covered = new Set(cells);
              const remWounds = new Set([...unsunkHits].filter((w) => !covered.has(w)));
              const remShips = activeShipNames.filter((s) => s !== shipName);
              if (remainderIsValid(board, remWounds, remShips, covered)) {
                threat = threatMultiplier * 4 ** overlaps;
              }
            } else if (!isScoutingRedundant) {
              threat = 1;
            }

            if (threat > 0) {
              for (const coord of cells) {
                const [cx, cy] = fromCoord(coord);
                rawHeatmap[cx][cy] += threat;
                maxVal = Math.max(maxVal, rawHeatmap[cx][cy]);
              }
            }
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class Big2AI extends AIVariant {
  static paramSchema: AiParamSchema = {};
  protected readonly heatmapStrategy = new Big1Heatmap();
  private readonly targeting = new HeatmapTargeting(false, true);

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy, rng);
  }
}

export const EXPERIMENTS: Record<string, any> = {
  legacy1: LegacyAI1,
  big2: Big2AI,
  hailmary: HailMaryAI,
};
