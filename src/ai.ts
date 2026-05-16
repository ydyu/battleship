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
import {
  fromCoord,
  getLargestShip,
  getSaturationCount,
  getShipSize,
  getUnsunkHits,
  maxRunThrough,
  remainderIsValid,
  createHeatmap,
  normalizeHeatmap,
  RngFn,
} from './ai-utils';
import { 
  HeatmapResult, 
  RawHeatmapResult, 
  HeatmapStrategy, 
  PlacementStrategy, 
  AIVariant, 
  HeatmapTargeting, 
  MaxTargeting,
  RandomPlacementStrategy,
  AiParamSchema,
  ExpertHeatmapConfig,
  MediumHeatmapConfig,
  DEFAULT_EXPERT_CONFIG,
  DEFAULT_MEDIUM_CONFIG,
} from './ai-base';
import { EXPERIMENTS } from './ai-experiments';

// Re-exporting for convenience and backward compatibility if needed
export type { 
  HeatmapResult, 
  RawHeatmapResult, 
  HeatmapStrategy, 
  PlacementStrategy,
  AiParamSchema,
  ExpertHeatmapConfig,
  MediumHeatmapConfig,
};
export { 
  AIVariant, 
  HeatmapTargeting, 
  MaxTargeting,
  RandomPlacementStrategy,
  createHeatmap,
  normalizeHeatmap
};

export const AI_VARIANTS = ['novice', 'medium', 'expert'] as const;
export const ALL_AI_VARIANTS = [...AI_VARIANTS, ...Object.keys(EXPERIMENTS)] as const;
export type AIVariants = (typeof ALL_AI_VARIANTS)[number];

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

class MediumHeatmap implements HeatmapStrategy {
  constructor(private readonly cfg: MediumHeatmapConfig = DEFAULT_MEDIUM_CONFIG) {}

  generate(board: Board, activeShipNames: string[]): RawHeatmapResult {
    const rawHeatmap = createHeatmap(0);
    const unsunkHits = getUnsunkHits(board);
    let maxVal = 0;

    [getLargestShip(activeShipNames)].forEach((shipName) => {
      const size = getShipSize(shipName);

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

            const weight = this.cfg.overlapBase ** overlaps;

            for (const coord of cells) {
              const [cx, cy] = fromCoord(coord);
              rawHeatmap[cx][cy] += weight;
              maxVal = Math.max(maxVal, rawHeatmap[cx][cy]);
            }
          }
        }
      }
    });

    return { rawHeatmap, maxVal };
  }
}

class ExpertHeatmap implements HeatmapStrategy {
  constructor(private readonly cfg: ExpertHeatmapConfig = DEFAULT_EXPERT_CONFIG) {}

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
      const threatMult = size === maxActiveSize ? this.cfg.overlapMult : 1;
      const scoutW     = size === maxActiveSize ? this.cfg.scoutMult   : 1;

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
                threat = threatMult * this.cfg.overlapBase ** overlaps;
              }
            } else if (!isScoutingRedundant) {
              threat = scoutW;
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

class NoviceAI extends AIVariant {
  static paramSchema: AiParamSchema = {};

  protected readonly heatmapStrategy = new FlatHeatmap();

  private readonly targeting = new MaxTargeting(true);

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy, rng);
  }
}

class MediumAI extends AIVariant {
  static paramSchema: AiParamSchema = {
    overlapBase: { type: 'number', default: 4, description: 'Base of overlap boon (base^overlaps)' },
  };

  protected readonly heatmapStrategy: HeatmapStrategy;

  constructor(cfg?: Partial<MediumHeatmapConfig>) {
    super();
    this.heatmapStrategy = new MediumHeatmap({ ...DEFAULT_MEDIUM_CONFIG, ...cfg });
  }

  private readonly targeting = new HeatmapTargeting(false, false);

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy, rng);
  }
}

class ExpertAI extends AIVariant {
  static paramSchema: AiParamSchema = {
    overlapBase: { type: 'number', default: 4, description: 'Base of overlap boon (base^overlaps)' },
    overlapMult: { type: 'number', default: 2, description: 'Biggest-ship multiplier when covering a wound' },
    scoutMult:   { type: 'number', default: 2, description: 'Biggest-ship multiplier when scouting (no wounds)' },
  };

  protected readonly heatmapStrategy: HeatmapStrategy;

  constructor(cfg?: Partial<ExpertHeatmapConfig>) {
    super();
    this.heatmapStrategy = new ExpertHeatmap({ ...DEFAULT_EXPERT_CONFIG, ...cfg });
  }

  private readonly targeting = new HeatmapTargeting(false, true);

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    return this.targeting.selectMove(enemyBoard, myActiveShips, this.heatmapStrategy, rng);
  }
}


export class AI {
  private readonly variant: AIVariant;

  constructor(variant: AIVariants = 'expert', config?: Record<string, number | boolean>) {
    if (EXPERIMENTS[variant]) {
      this.variant = EXPERIMENTS[variant];
      return;
    }

    switch (variant) {
      case 'novice':
        this.variant = new NoviceAI();
        break;
      case 'medium':
        this.variant = new MediumAI(config as Partial<MediumHeatmapConfig>);
        break;
      case 'expert':
        this.variant = new ExpertAI(config as Partial<ExpertHeatmapConfig>);
        break;
      default:
        this.variant = new ExpertAI();
        break;
    }
  }

  getHeatmap(board: Board, activeShipNames: string[] = board.getActiveShipNames()): HeatmapResult {
    return this.variant.getHeatmap(board, activeShipNames);
  }

  placeFleet(shipTypes: ShipDefinition[] = SHIP_TYPES, rng?: RngFn): Board {
    return this.variant.placeFleet(shipTypes, rng);
  }

  selectMove(enemyBoard: Board, myActiveShips: string[], rng?: RngFn): Move {
    return this.variant.selectMove(enemyBoard, myActiveShips, rng);
  }
}

export const AI_PARAM_SCHEMAS: Record<string, AiParamSchema> = {
  novice: NoviceAI.paramSchema,
  medium: MediumAI.paramSchema,
  expert: ExpertAI.paramSchema,
  ...Object.fromEntries(Object.keys(EXPERIMENTS).map((k) => [k, {}])),
};

export const parseVars = (raw: string): Record<string, string> => {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(',').map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return [pair, ''];
      return [pair.slice(0, eq), pair.slice(eq + 1)];
    }),
  );
};

export const printSchema = (variant: string) => {
  const schema = AI_PARAM_SCHEMAS[variant] ?? {};
  const entries = Object.entries(schema);
  if (entries.length === 0) {
    console.log(`  (no tunable parameters)`);
  } else {
    for (const [key, def] of entries) {
      console.log(`  ${key.padEnd(14)}${def.type.padEnd(9)}default=${def.default}   ${def.description}`);
    }
  }
};

export const validateVars = (
  vars: Record<string, string>,
  variant: string,
  side: string,
): Record<string, number | boolean> | null => {
  const schema = AI_PARAM_SCHEMAS[variant] ?? {};
  const result: Record<string, number | boolean> = {};

  for (const [key, val] of Object.entries(vars)) {
    if (!(key in schema)) {
      console.error(`Error: Unknown parameter '${key}' for ${side} variant '${variant}'.\n`);
      console.error(`Parameters for ${variant}:`);
      printSchema(variant);
      return null;
    }
    const def = schema[key];
    if (def.type === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) {
        console.error(`Error: Parameter '${key}' expects a number, got '${val}'.`);
        return null;
      }
      result[key] = n;
    } else {
      result[key] = val === 'true' || val === '1';
    }
  }

  return result;
};

export const placeFleetRandomly = (shipTypes: ShipDefinition[] = SHIP_TYPES): Board =>
  new RandomPlacementStrategy().placeFleet(shipTypes);
