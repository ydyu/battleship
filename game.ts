import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { AI, ALL_AI_VARIANTS, type AIVariants, placeFleetRandomly } from './src/ai';
import { BOARD_SIZE, Board, SHIP_INDEX, SHIP_NAMES, SHOT_PATTERNS, BattleshipMatch } from './src/engine';

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
    ai: 'expert',
    help: false,
  };

  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--ai') options.ai = args[i + 1] ?? options.ai;
    if (arg === '--help' || arg === '-h') options.help = true;
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
  if (board.misses.has(coord)) return 'o';
  if (revealShips && board.grid[x][y] === 1) return shipSymbol;
  return '.';
};

const renderBoard = (title: string, board: Board, revealShips: boolean) => {
  const header = COLUMN_LABELS.join(' ');
  const rows = Array.from({ length: BOARD_SIZE }, (_, y) => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, x) => getCellDisplay(board, x, y, revealShips)).join(' ');
    return `${String(y + 1).padStart(2, ' ')} ${cells}`;
  });

  return `${title}\n   ${header}\n${rows.join('\n')}`;
};

const renderHeatmap = (title: string, board: Board, heatmap: number[][]) => {
  const header = COLUMN_LABELS.join(' ');
  const rows = Array.from({ length: BOARD_SIZE }, (_, y) => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, x) => {
      const coord = `${x},${y}`;

      if (board.shotsFired.has(coord) || board.hitsReceived.has(coord) || board.misses.has(coord) || board.sunkCells.has(coord)) {
        return getCellDisplay(board, x, y, false);
      }

      const ratio = heatmap[x][y] ?? 0;
      if (ratio >= 1) return '$';
      return String(Math.max(0, Math.min(9, Math.floor(ratio * 10))));
    }).join(' ');

    return `${String(y + 1).padStart(2, ' ')} ${cells}`;
  });

  return `${title}\n   ${header}\n${rows.join('\n')}\n\nLegend: 0-9 scaled heat, $ = 100%`;
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
    console.log(renderHeatmap('Enemy Heat Map', aiBoard, aiController.getHeatmap(aiBoard).heatmap));
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
  const { ai, help } = parseArgs();

  if (help) {
    console.log(`Usage: npm run game -- --ai <${VALID_VARIANTS.join('|')}>`);
    return;
  }

  if (!isVariant(ai)) {
    console.error(`Invalid AI variant. Use one of: ${VALID_VARIANTS.join(', ')}.`);
    process.exit(1);
  }

  const rl = createInterface({ input, output });
  const aiController = new AI(ai);
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
