import { Board, BOARD_SIZE, SHIP_INDEX, SHIP_NAMES, SHOT_PATTERNS } from './engine';
import { AI_PARAM_SCHEMAS, ALL_AI_VARIANTS, type AIVariants } from './ai';

export type { AIVariants };
export const VALID_VARIANTS = ALL_AI_VARIANTS;
export const isVariant = (value: string): value is AIVariants => (VALID_VARIANTS as readonly string[]).includes(value);

export const COLUMN_LABELS = Array.from({ length: BOARD_SIZE }, (_, index) => String.fromCharCode(65 + index));

const sortShipsForPrompt = (shipNames: string[]) =>
  [...shipNames].sort((a, b) => {
    const sizeDelta = (SHIP_INDEX[b]?.size ?? 0) - (SHIP_INDEX[a]?.size ?? 0);
    if (sizeDelta !== 0) return sizeDelta;
    return (SHIP_INDEX[a]?.index ?? 0) - (SHIP_INDEX[b]?.index ?? 0);
  });

export const PROMPT_SHIP_ORDER = sortShipsForPrompt(SHIP_NAMES);
export const DISPLAY_SHIP_SYMBOLS = Object.fromEntries(
  PROMPT_SHIP_ORDER.map((shipName, index) => [shipName, String.fromCharCode(90 - index)]),
);

export const ANSI_RESET = '\x1b[0m';

export const clearScreen = () => {
  if (process.stdout.isTTY) console.clear();
};

export const formatCoord = (x: number, y: number) => `${COLUMN_LABELS[x]}${y + 1}`;

export const parseCoord = (value: string) => {
  const match = value.trim().toUpperCase().match(/^([A-J])(10|[1-9])$/);
  if (!match) return null;

  const x = COLUMN_LABELS.indexOf(match[1]);
  const y = Number(match[2]) - 1;
  return { x, y };
};

export const getShipSymbol = (board: Board, coord: string) => {
  const shipName = Object.entries(board.shipLayouts).find(([, coords]) => coords.includes(coord))?.[0];
  return shipName ? DISPLAY_SHIP_SYMBOLS[shipName] : 'S';
};

export const getCellDisplay = (board: Board, x: number, y: number, revealShips: boolean) => {
  const coord = `${x},${y}`;
  const shipSymbol = getShipSymbol(board, coord);

  if (board.sunkCells.has(coord)) return shipSymbol.toLowerCase();
  if (board.hitsReceived.has(coord)) return '*';
  if (board.misses.has(coord)) return '.';
  if (revealShips && board.grid[x][y] === 1) return shipSymbol;
  return '~';
};

export const renderBoard = (
  title: string,
  board: Board,
  revealShips: boolean,
  pendingMove?: { origin: { x: number; y: number }; impactCells: Set<string> },
) => {
  const header = COLUMN_LABELS.join(' ');
  const rows = Array.from({ length: BOARD_SIZE }, (_, y) => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, x) => {
      const coord = `${x},${y}`;

      if (pendingMove && x === pendingMove.origin.x && y === pendingMove.origin.y) {
        return `\x1b[1;97m@\x1b[0m`;
      }

      const char = getCellDisplay(board, x, y, revealShips);
      if (pendingMove && pendingMove.impactCells.has(coord)) {
        return `\x1b[1;97m${char}\x1b[0m`;
      }

      return char;
    }).join(' ');

    return `${String(y + 1).padStart(2, ' ')} ${cells}`;
  });

  return `${title}\n   ${header}\n${rows.join('\n')}`;
};

export const heatColor = (ratio: number) => {
  if (ratio >= 1)   return '\x1b[1;95m'; // bright magenta — max
  if (ratio >= 0.9) return '\x1b[1;31m'; // bright red
  if (ratio >= 0.7) return '\x1b[31m';   // red
  if (ratio >= 0.5) return '\x1b[33m';   // yellow
  if (ratio >= 0.3) return '\x1b[32m';   // green
  if (ratio >= 0.1) return '\x1b[36m';   // cyan
  return '\x1b[34m';                      // blue — cold
};

export const renderHeatmap = (title: string, board: Board, heatmap: number[][], includeLegend = true, pendingMove?: { origin: { x: number; y: number }; impactCells: Set<string> }) => {
  const header = COLUMN_LABELS.join(' ');
  const rows = Array.from({ length: BOARD_SIZE }, (_, y) => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, x) => {
      const coord = `${x},${y}`;

      if (pendingMove && x === pendingMove.origin.x && y === pendingMove.origin.y) {
        return `\x1b[1;97m@${ANSI_RESET}`; // target — bright white bold
      }

      let rawChar = '';
      let formattedStr = '';

      if (board.shotsFired.has(coord) || board.hitsReceived.has(coord) || board.misses.has(coord) || board.sunkCells.has(coord)) {
        const cell = getCellDisplay(board, x, y, false);
        rawChar = cell;
        if (cell === '*') formattedStr = `\x1b[1;31m*${ANSI_RESET}`;          // hit — bright red
        else if (cell === '.') formattedStr = `\x1b[2m.${ANSI_RESET}`;             // miss — dim
        else formattedStr = `\x1b[90m${cell}${ANSI_RESET}`;                        // sunk — gray
      } else {
        const ratio = heatmap[x][y] ?? 0;
        const digit = ratio >= 1 ? '$' : String(Math.max(0, Math.min(9, Math.floor(ratio * 10))));
        rawChar = digit;
        formattedStr = `${heatColor(ratio)}${digit}${ANSI_RESET}`;
      }

      if (pendingMove && pendingMove.impactCells.has(coord)) {
        return `\x1b[1;97m${rawChar}${ANSI_RESET}`;
      }

      return formattedStr;
    }).join(' ');

    return `${String(y + 1).padStart(2, ' ')} ${cells}`;
  });

  const legend = `\x1b[34m0\x1b[0m\x1b[36m2\x1b[0m\x1b[32m4\x1b[0m\x1b[33m6\x1b[0m\x1b[31m8\x1b[0m\x1b[1;95m$\x1b[0m cool→hot→max`;
  return `${title}\n   ${header}\n${rows.join('\n')}${includeLegend ? `\n\nLegend: ${legend}` : ''}`;
};

export const printPatternHelp = () => {
  console.log('\nAvailable shot patterns:');
  SHIP_NAMES.forEach((shipName) => {
    console.log(`- ${shipName}: ${JSON.stringify(SHOT_PATTERNS[shipName])}`);
  });
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
    if (val === '') {
      console.error(`Error: Parameter '${key}' for ${side} variant '${variant}' is missing a value (expected 'key=value').`);
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

export interface CommonArgs {
  ai: string;
  sideA: string;
  sideB: string;
  seed?: number;
  fleetSeed?: number;
  moveSeed?: number;
  game?: number;
  mirror: boolean;
  vars: Record<string, string>;
  varsA: Record<string, string>;
  varsB: Record<string, string>;
  help: boolean;
  watch: boolean;
  auto: boolean;
  verbose: boolean;
  games: number;
  listVars?: string;
  unknown: string[];
}

export const parseCommonArgs = (argv: string[]): CommonArgs => {
  const options: CommonArgs = {
    ai: 'expert',
    sideA: 'expert',
    sideB: 'expert',
    mirror: false,
    vars: {},
    varsA: {},
    varsB: {},
    help: false,
    watch: false,
    auto: false,
    verbose: false,
    games: 1,
    unknown: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ai') { options.ai = argv[i + 1] ?? options.ai; i += 1; }
    else if (arg === '--sideA') { options.sideA = argv[i + 1] ?? options.sideA; i += 1; }
    else if (arg === '--sideB') { options.sideB = argv[i + 1] ?? options.sideB; i += 1; }
    else if (arg === '--seed') { options.seed = Number(argv[i + 1]); i += 1; }
    else if (arg === '--fleet-seed') { options.fleetSeed = Number(argv[i + 1]); i += 1; }
    else if (arg === '--move-seed') { options.moveSeed = Number(argv[i + 1]); i += 1; }
    else if (arg === '--game') { options.game = Number(argv[i + 1]); i += 1; }
    else if (arg === '--mirror') { options.mirror = true; }
    else if (arg === '--vars') { options.vars = parseVars(argv[i + 1] ?? ''); i += 1; }
    else if (arg === '--varsA') { options.varsA = parseVars(argv[i + 1] ?? ''); i += 1; }
    else if (arg === '--varsB') { options.varsB = parseVars(argv[i + 1] ?? ''); i += 1; }
    else if (arg === '--help' || arg === '-h') { options.help = true; }
    else if (arg === '--watch') { options.watch = true; }
    else if (arg === '--auto') { options.auto = true; }
    else if (arg === '--verbose') { options.verbose = true; }
    else if (arg === '--games') { options.games = Number(argv[i + 1] ?? options.games); i += 1; }
    else if (arg === '--list-vars') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        options.listVars = '';
      } else {
        options.listVars = next;
        i += 1;
      }
    }
    else {
      options.unknown.push(arg);
    }
  }

  return options;
};
