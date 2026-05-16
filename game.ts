import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { AI, ALL_AI_VARIANTS, type AIVariants, placeFleetRandomly, parseVars, validateVars, printSchema } from './src/ai';
import { BOARD_SIZE, Board, SHIP_INDEX, SHIP_NAMES, SHOT_PATTERNS, BattleshipMatch } from './src/engine';
import { mulberry32 } from './src/ai-utils';

const VALID_VARIANTS = ALL_AI_VARIANTS;
const COLUMN_LABELS = Array.from({ length: BOARD_SIZE }, (_, index) => String.fromCharCode(65 + index));

const sortShipsForPrompt = (shipNames: string[]) =>
  [...shipNames].sort((a, b) => {
    const sizeDelta = (SHIP_INDEX[b]?.size ?? 0) - (SHIP_INDEX[a]?.size ?? 0);
    if (sizeDelta !== 0) return sizeDelta;
    return (SHIP_INDEX[a]?.index ?? 0) - (SHIP_INDEX[b]?.index ?? 0);
  });

const PROMPT_SHIP_ORDER = sortShipsForPrompt(SHIP_NAMES);
const DISPLAY_SHIP_SYMBOLS = Object.fromEntries(
  PROMPT_SHIP_ORDER.map((shipName, index) => [shipName, String.fromCharCode(90 - index)]),
);

const parseArgs = () => {
  const options = {
    ai: 'expert' as string,
    help: false,
    watch: false,
    sideA: 'expert' as string,
    sideB: 'expert' as string,
    fleetSeed: undefined as number | undefined,
    moveSeed: undefined as number | undefined,
    seed: undefined as number | undefined,
    game: undefined as number | undefined,
    mirror: false,
    auto: false,
    watchFlagsUsed: false,
    vars: {} as Record<string, string>,
    varsA: {} as Record<string, string>,
    varsB: {} as Record<string, string>,
  };

  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--ai') { options.ai = args[i + 1] ?? options.ai; i += 1; }
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--watch') options.watch = true;
    else if (arg === '--sideA') { options.sideA = args[i + 1] ?? options.sideA; options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--sideB') { options.sideB = args[i + 1] ?? options.sideB; options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--vars') { options.vars = parseVars(args[i + 1] ?? ''); i += 1; }
    else if (arg === '--varsA') { options.varsA = parseVars(args[i + 1] ?? ''); options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--varsB') { options.varsB = parseVars(args[i + 1] ?? ''); options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--fleet-seed') { options.fleetSeed = Number(args[i + 1]); options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--move-seed') { options.moveSeed = Number(args[i + 1]); options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--seed') { options.seed = Number(args[i + 1]); options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--game') { options.game = Number(args[i + 1]); options.watchFlagsUsed = true; i += 1; }
    else if (arg === '--mirror') { options.mirror = true; options.watchFlagsUsed = true; }
    else if (arg === '--auto') { options.auto = true; options.watchFlagsUsed = true; }
  }

  return options;
};

const isVariant = (value: string): value is AIVariants => (VALID_VARIANTS as readonly string[]).includes(value);

const clearScreen = () => {
  if (output.isTTY) console.clear();
};

const formatCoord = (x: number, y: number) => `${COLUMN_LABELS[x]}${y + 1}`;

const parseCoord = (value: string) => {
  const match = value.trim().toUpperCase().match(/^([A-J])(10|[1-9])$/);
  if (!match) return null;

  const x = COLUMN_LABELS.indexOf(match[1]);
  const y = Number(match[2]) - 1;
  return { x, y };
};

const getShipSymbol = (board: Board, coord: string) => {
  const shipName = Object.entries(board.shipLayouts).find(([, coords]) => coords.includes(coord))?.[0];
  return shipName ? DISPLAY_SHIP_SYMBOLS[shipName] : 'S';
};

const getCellDisplay = (board: Board, x: number, y: number, revealShips: boolean) => {
  const coord = `${x},${y}`;
  const shipSymbol = getShipSymbol(board, coord);

  if (board.sunkCells.has(coord)) return shipSymbol.toLowerCase();
  if (board.hitsReceived.has(coord)) return '*';
  if (board.misses.has(coord)) return '.';
  if (revealShips && board.grid[x][y] === 1) return shipSymbol;
  return '~';
};

const renderBoard = (title: string, board: Board, revealShips: boolean) => {
  const header = COLUMN_LABELS.join(' ');
  const rows = Array.from({ length: BOARD_SIZE }, (_, y) => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, x) => getCellDisplay(board, x, y, revealShips)).join(' ');
    return `${String(y + 1).padStart(2, ' ')} ${cells}`;
  });

  return `${title}\n   ${header}\n${rows.join('\n')}`;
};

const ANSI_RESET = '\x1b[0m';
const heatColor = (ratio: number) => {
  if (ratio >= 1)   return '\x1b[1;95m'; // bright magenta — max
  if (ratio >= 0.9) return '\x1b[1;31m'; // bright red
  if (ratio >= 0.7) return '\x1b[31m';   // red
  if (ratio >= 0.5) return '\x1b[33m';   // yellow
  if (ratio >= 0.3) return '\x1b[32m';   // green
  if (ratio >= 0.1) return '\x1b[36m';   // cyan
  return '\x1b[34m';                      // blue — cold
};

const renderHeatmap = (title: string, board: Board, heatmap: number[][], includeLegend = true, pendingTarget?: { x: number, y: number }) => {
  const header = COLUMN_LABELS.join(' ');
  const rows = Array.from({ length: BOARD_SIZE }, (_, y) => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, x) => {
      const coord = `${x},${y}`;

      if (pendingTarget && x === pendingTarget.x && y === pendingTarget.y) {
        return `\x1b[1;97m@${ANSI_RESET}`; // target — bright white bold
      }

      if (board.shotsFired.has(coord) || board.hitsReceived.has(coord) || board.misses.has(coord) || board.sunkCells.has(coord)) {
        const cell = getCellDisplay(board, x, y, false);
        if (cell === '*') return `\x1b[1;31m*${ANSI_RESET}`;          // hit — bright red
        if (cell === '.') return `\x1b[2m.${ANSI_RESET}`;             // miss — dim
        return `\x1b[90m${cell}${ANSI_RESET}`;                        // sunk — gray
      }

      const ratio = heatmap[x][y] ?? 0;
      const digit = ratio >= 1 ? '$' : String(Math.max(0, Math.min(9, Math.floor(ratio * 10))));
      return `${heatColor(ratio)}${digit}${ANSI_RESET}`;
    }).join(' ');

    return `${String(y + 1).padStart(2, ' ')} ${cells}`;
  });

  const legend = `\x1b[34m0\x1b[0m\x1b[36m2\x1b[0m\x1b[32m4\x1b[0m\x1b[33m6\x1b[0m\x1b[31m8\x1b[0m\x1b[1;95m$\x1b[0m cool→hot→max`;
  return `${title}\n   ${header}\n${rows.join('\n')}${includeLegend ? `\n\nLegend: ${legend}` : ''}`;
};

const renderInteractiveBoards = (
  playerBoard: Board,
  aiBoard: Board,
  aiController: AI,
  showHeatmap: boolean,
  statusLine = '',
) => {
  clearScreen();

  if (showHeatmap) {
    console.log(renderHeatmap('Enemy Heat Map', aiBoard, aiController.getHeatmap(aiBoard).heatmap, false));
    console.log();
    console.log(renderHeatmap('Your Heat Map', playerBoard, aiController.getHeatmap(playerBoard).heatmap));
  } else {
    console.log(renderBoard('Enemy Waters', aiBoard, false));
    console.log();
    console.log(renderBoard('Your Fleet', playerBoard, true));
  }

  console.log(`\n${statusLine}`);
};

const printPatternHelp = () => {
  console.log('\nAvailable shot patterns:');
  SHIP_NAMES.forEach((shipName) => {
    console.log(`- ${shipName}: ${JSON.stringify(SHOT_PATTERNS[shipName])}`);
  });
};

const runWatchMode = async (
  sideAVariant: AIVariants,
  sideBVariant: AIVariants,
  effectiveFleetSeed: number | undefined,
  effectiveMoveSeed: number | undefined,
  mirror: boolean,
  auto: boolean,
  rl: ReturnType<typeof createInterface>,
  configA?: Record<string, number | boolean>,
  configB?: Record<string, number | boolean>,
) => {
  // Seeding logic matches sim.ts exactly:
  // without mirror: both sides share the same RNG instance (A draws first, B draws next)
  // with mirror: each side gets an independent instance from the same seed (identical sequences)
  const rngFleet = effectiveFleetSeed !== undefined ? mulberry32(effectiveFleetSeed) : undefined;
  const rngFleetA = rngFleet;
  const rngFleetB = mirror && effectiveFleetSeed !== undefined ? mulberry32(effectiveFleetSeed) : rngFleet;
  const rngMoveA = effectiveMoveSeed !== undefined ? mulberry32(effectiveMoveSeed) : undefined;
  const rngMoveB = mirror && effectiveMoveSeed !== undefined ? mulberry32(effectiveMoveSeed) : rngMoveA;

  const aiA = new AI(sideAVariant, configA);
  const aiB = new AI(sideBVariant, configB);
  const fleetA = aiA.placeFleet(undefined, rngFleetA);
  const fleetB = aiB.placeFleet(undefined, rngFleetB);
  const match = new BattleshipMatch(fleetA, fleetB, 'sideA', 'sideB');

  const fleetSeedStr = effectiveFleetSeed !== undefined ? String(effectiveFleetSeed) : '(random)';
  const moveSeedStr = effectiveMoveSeed !== undefined ? String(effectiveMoveSeed) : '(random)';
  console.log(`Watch: ${sideAVariant} vs ${sideBVariant}${mirror ? ' [MIRRORED]' : ''}`);
  console.log(`fleet-seed: ${fleetSeedStr}  move-seed: ${moveSeedStr}\n`);
  console.log(renderBoard(`Side A (${sideAVariant})`, match.boardA, true));
  console.log();
  console.log(renderBoard(`Side B (${sideBVariant})`, match.boardB, true));

  if (!auto) await rl.question('\nPress Enter to start...');

  let showHeatmap = false;
  let totalHitsA = 0;
  let totalHitsB = 0;
  let quit = false;

  while (!match.isGameOver && !quit) {
    const moveA = aiA.selectMove(match.boardB, match.boardA.getActiveShipNames(), rngMoveA);
    const moveB = aiB.selectMove(match.boardA, match.boardB.getActiveShipNames(), rngMoveB);

    let result: any = null;

    const renderState = (phase: 1 | 2) => {
      clearScreen();
      const round = match.round + (phase === 2 ? 0 : 1);
      const avgA = (totalHitsA / Math.max(1, match.round)).toFixed(2);
      const avgB = (totalHitsB / Math.max(1, match.round)).toFixed(2);

      const aliveA = match.boardA.getActiveShipNames().join(' ') || 'none';
      const aliveB = match.boardB.getActiveShipNames().join(' ') || 'none';
      if (showHeatmap) {
        // A's board overlaid with B's targeting heatmap (B is attacking A)
        console.log(renderHeatmap(`Side A (${sideAVariant}) [alive: ${aliveA}]`, match.boardA, aiB.getHeatmap(match.boardA).heatmap, false, phase === 1 ? moveB : undefined));
        console.log();
        // B's board overlaid with A's targeting heatmap (A is attacking B)
        console.log(renderHeatmap(`Side B (${sideBVariant}) [alive: ${aliveB}]`, match.boardB, aiA.getHeatmap(match.boardB).heatmap, false, phase === 1 ? moveA : undefined));
        console.log('\nLegend: 0-9 scaled heat, $ = 100%, @ = target');
      } else {
        console.log(renderBoard(`Side A (${sideAVariant}) [alive: ${aliveA}]`, match.boardA, true));
        console.log();
        console.log(renderBoard(`Side B (${sideBVariant}) [alive: ${aliveB}]`, match.boardB, true));
      }
      console.log(`\nRound ${round} | A avg hits/round: ${avgA} | B avg hits/round: ${avgB}`);
      
      if (phase === 1) {
        console.log(`→ Side A (${moveA.ship}) targets ${formatCoord(moveA.x, moveA.y)}  |  Side B (${moveB.ship}) targets ${formatCoord(moveB.x, moveB.y)}`);
      } else {
        const hitsAStr = result.attackA.hits > 0 ? `+${result.attackA.hits} hit${result.attackA.sunkShips.length ? `, sunk: ${result.attackA.sunkShips.join(', ')}` : ''}` : 'miss';
        const hitsBStr = result.attackB.hits > 0 ? `+${result.attackB.hits} hit${result.attackB.sunkShips.length ? `, sunk: ${result.attackB.sunkShips.join(', ')}` : ''}` : 'miss';
        console.log(`A: ${moveA.ship} → ${formatCoord(moveA.x, moveA.y)} (${hitsAStr})`);
        console.log(`B: ${moveB.ship} → ${formatCoord(moveB.x, moveB.y)} (${hitsBStr})`);
        if (match.isGameOver) {
          const winner = match.winner;
          if (winner === 'draw') console.log(`DRAW: Both fleets destroyed after ${match.round} rounds.`);
          else if (winner === 'sideA') console.log(`WINNER: Side A (${sideAVariant}) after ${match.round} rounds.`);
          else console.log(`WINNER: Side B (${sideBVariant}) after ${match.round} rounds.`);
        }
      }
    };

    renderState(1);

    if (!auto) {
      let advancing = false;
      while (!advancing) {
        const key = (await rl.question('\nEnter=fire, h=heatmap, q=quit: ')).trim().toLowerCase();
        if (key === 'q') { quit = true; advancing = true; }
        else if (key === 'h') { showHeatmap = !showHeatmap; renderState(1); }
        else { advancing = true; }
      }
      if (quit) break;
    }

    result = match.resolveTurn(moveA, moveB);
    totalHitsA += result.attackA.hits;
    totalHitsB += result.attackB.hits;

    renderState(2);

    if (!auto && !match.isGameOver) {
      let advancing = false;
      while (!advancing) {
        const key = (await rl.question('\nEnter=next turn, h=heatmap, q=quit: ')).trim().toLowerCase();
        if (key === 'q') { quit = true; advancing = true; }
        else if (key === 'h') { showHeatmap = !showHeatmap; renderState(2); }
        else { advancing = true; }
      }
    }
  }
};

const getPlayerMove = async (
  rl: ReturnType<typeof createInterface>,
  playerBoard: Board,
  targetBoard: Board,
  activeShips: string[],
  aiController: AI,
) => {
  let showHeatmap = false;
  let statusLine = '';

  while (true) {
    renderInteractiveBoards(playerBoard, targetBoard, aiController, showHeatmap, statusLine);

    const prompt = PROMPT_SHIP_ORDER
      .filter((shipName) => activeShips.includes(shipName))
      .map((shipName, index) => `${PROMPT_SHIP_ORDER.indexOf(shipName) + 1}:${shipName}`)
      .join(', ');
    const shipChoice = (await rl.question(`\nSelect ship to fire with (${prompt}, h, or ?): `)).trim();

    if (shipChoice === '?') {
      printPatternHelp();
      await rl.question('\nPress Enter to continue...');
      continue;
    }

    if (shipChoice.toLowerCase() === 'h') {
      showHeatmap = !showHeatmap;
      statusLine = showHeatmap
        ? 'Heat map view enabled. Enter h again to return to the normal board view.'
        : '';
      continue;
    }

    const selectedShip = PROMPT_SHIP_ORDER[Number(shipChoice) - 1];
    const matchedShip =
      (selectedShip && activeShips.includes(selectedShip) ? selectedShip : null) ??
      activeShips.find((shipName) => shipName.toLowerCase() === shipChoice.toLowerCase());

    if (!matchedShip) {
      statusLine = 'Invalid ship choice.';
      continue;
    }

    const coordInput = (await rl.question('Target (e.g. A5): ')).trim();
    const parsedCoord = parseCoord(coordInput);

    if (!parsedCoord) {
      statusLine = 'Invalid input. Use chess coordinates like A5.';
      continue;
    }

    if (!targetBoard.canTargetCell(parsedCoord.x, parsedCoord.y, matchedShip)) {
      statusLine = 'That shot pattern cannot hit any new cell from that origin.';
      continue;
    }

    return { x: parsedCoord.x, y: parsedCoord.y, ship: matchedShip };
  }
};

const main = async () => {
  const { ai, help, watch, sideA, sideB, fleetSeed, moveSeed, seed, game, mirror, auto, watchFlagsUsed, vars, varsA, varsB } = parseArgs();

  if (help) {
    console.log([
      'Usage:',
      `  Normal game:  npx tsx game.ts [--ai <variant>] [--vars key=val,...]`,
      `  Watch mode:   npx tsx game.ts --watch [--sideA <variant>] [--sideB <variant>]`,
      `                  [--varsA key=val,...] [--varsB key=val,...]`,
      `                  [--fleet-seed <n>] [--move-seed <n>]`,
      `                  [--seed <n>] [--game <i>]  (fleet-seed=seed+i*2, move-seed=seed+i*2+1)`,
      `                  [--mirror] [--auto]`,
      '',
      `Variants: ${VALID_VARIANTS.join(', ')}`,
    ].join('\n'));
    return;
  }

  if (watchFlagsUsed && !watch) {
    console.error('Error: --sideA, --sideB, --varsA, --varsB, --fleet-seed, --move-seed, --seed, --game, --mirror, and --auto require --watch.');
    process.exit(1);
  }

  if (watch && Object.keys(vars).length > 0) {
    console.error('Error: --vars is not allowed in --watch mode. Use --varsA and --varsB instead.');
    process.exit(1);
  }

  if (watch) {
    if (!isVariant(sideA)) {
      console.error(`Invalid --sideA variant. Use one of: ${VALID_VARIANTS.join(', ')}.`);
      process.exit(1);
    }
    if (!isVariant(sideB)) {
      console.error(`Invalid --sideB variant. Use one of: ${VALID_VARIANTS.join(', ')}.`);
      process.exit(1);
    }

    const parsedVarsA = validateVars(varsA, sideA, '--varsA');
    if (parsedVarsA === null) process.exit(1);
    const parsedVarsB = validateVars(varsB, sideB, '--varsB');
    if (parsedVarsB === null) process.exit(1);

    if (game !== undefined && seed === undefined) {
      console.error('Error: --game requires --seed');
      process.exit(1);
    }

    const gameIdx = game ?? 0;
    const effectiveFleetSeed = fleetSeed ?? (seed !== undefined ? seed + gameIdx * 2 : undefined);
    const effectiveMoveSeed = moveSeed ?? (seed !== undefined ? seed + gameIdx * 2 + 1 : undefined);

    const rl = createInterface({ input, output });
    try {
      await runWatchMode(sideA, sideB, effectiveFleetSeed, effectiveMoveSeed, mirror, auto, rl, parsedVarsA, parsedVarsB);
    } finally {
      rl.close();
    }
    return;
  }

  if (!isVariant(ai)) {
    console.error(`Invalid AI variant. Use one of: ${VALID_VARIANTS.join(', ')}.`);
    process.exit(1);
  }

  const parsedVars = validateVars(vars, ai, '--vars');
  if (parsedVars === null) process.exit(1);

  const rl = createInterface({ input, output });
  const aiController = new AI(ai, parsedVars);
  const match = new BattleshipMatch(placeFleetRandomly(), aiController.placeFleet(), 'player', 'ai');

  try {
    console.log('Welcome to Tactical Battleship!');
    console.log(`AI variant: ${ai}`);
    await rl.question('\nPress Enter to begin...');

    while (true) {
      const playerDead = match.boardA.isGameOver();
      const aiDead = match.boardB.isGameOver();

      if (playerDead || aiDead) {
        clearScreen();
        console.log(renderBoard('Enemy Waters', match.boardB, true));
        console.log();
        console.log(renderBoard('Your Fleet', match.boardA, true));

        if (playerDead && aiDead) console.log("\n!!! MUTUAL DESTRUCTION !!!\nBoth fleets have been destroyed. It's a draw!");
        else if (aiDead) console.log('\n!!! VICTORY !!!\nYou have sunk the entire enemy fleet.');
        else console.log('\n!!! DEFEAT !!!\nYour fleet has been destroyed.');
        break;
      }

      const playerMove = await getPlayerMove(
        rl,
        match.boardA,
        match.boardB,
        match.boardA.getActiveShipNames(),
        aiController,
      );
      const aiMove = aiController.selectMove(match.boardA, match.boardB.getActiveShipNames());

      const result = match.resolveTurn(playerMove, aiMove);

      clearScreen();
      console.log(renderBoard('Enemy Waters', match.boardB, false));
      console.log();
      console.log(renderBoard('Your Fleet', match.boardA, true));
      console.log(`\nYOU FIRED: ${playerMove.ship} at ${formatCoord(playerMove.x, playerMove.y)}.`);
      console.log(result.attackA.hits > 0 ? `BOOM! ${result.attackA.hits} hit(s) recorded!` : 'Splash... You missed.');
      result.attackA.sunkShips.forEach((ship) => console.log(`Enemy ${ship} destroyed!`));
      console.log(`\nAI FIRED: ${aiMove.ship} at ${formatCoord(aiMove.x, aiMove.y)}.`);
      console.log(result.attackB.hits > 0 ? `DANGER! The enemy scored ${result.attackB.hits} hit(s) on your fleet!` : 'The enemy missed.');
      result.attackB.sunkShips.forEach((ship) => console.log(`CRITICAL: Your ${ship} was destroyed!`));

      if (result.winnerId) {
        await rl.question('\nPress Enter to view final result...');
      } else {
        await rl.question('\nPress Enter for next round...');
      }
    }
  } finally {
    rl.close();
  }
};

main();
