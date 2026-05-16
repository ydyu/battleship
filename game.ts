import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { AI, placeFleetRandomly } from './src/ai';
import { Board, SHIP_NAMES, BattleshipMatch, SHOT_PATTERNS } from './src/engine';
import { mulberry32 } from './src/ai-utils';
import {
  COLUMN_LABELS,
  PROMPT_SHIP_ORDER,
  DISPLAY_SHIP_SYMBOLS,
  VALID_VARIANTS,
  isVariant,
  type AIVariants,
  clearScreen,
  formatCoord,
  parseCoord,
  renderBoard,
  renderHeatmap,
  printPatternHelp,
  parseVars,
  validateVars,
  parseCommonArgs,
} from './src/cli';

const renderInteractiveBoards = (
  playerBoard: Board,
  aiBoard: Board,
  aiController: AI,
  showHeatmap: boolean,
  statusLine = '',
  pendingMove?: { origin: { x: number; y: number }; impactCells: Set<string> },
) => {
  clearScreen();

  if (showHeatmap) {
    console.log(
      renderHeatmap(
        'Enemy Waters',
        aiBoard,
        aiController.getHeatmap(aiBoard).heatmap,
        false,
        pendingMove,
      ),
    );
    console.log();
    console.log(renderHeatmap('Your Fleet', playerBoard, aiController.getHeatmap(playerBoard).heatmap));
  } else {
    console.log(renderBoard('Enemy Waters', aiBoard, false, pendingMove));
    console.log();
    console.log(renderBoard('Your Fleet', playerBoard, true));
  }

  console.log(`\n${statusLine}`);
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
        const previewA =
          phase === 1
            ? {
                origin: { x: moveB.x, y: moveB.y },
                impactCells: new Set(
                  match.boardA.getImpactCoordinates(moveB.x, moveB.y, SHOT_PATTERNS[moveB.ship] ?? []),
                ),
              }
            : undefined;
        const previewB =
          phase === 1
            ? {
                origin: { x: moveA.x, y: moveA.y },
                impactCells: new Set(
                  match.boardB.getImpactCoordinates(moveA.x, moveA.y, SHOT_PATTERNS[moveA.ship] ?? []),
                ),
              }
            : undefined;

        // A's board overlaid with B's targeting heatmap (B is attacking A)
        console.log(
          renderHeatmap(
            `Side A (${sideAVariant}) [alive: ${aliveA}]`,
            match.boardA,
            aiB.getHeatmap(match.boardA).heatmap,
            false,
            previewA,
          ),
        );
        console.log();
        // B's board overlaid with A's targeting heatmap (A is attacking B)
        console.log(
          renderHeatmap(
            `Side B (${sideBVariant}) [alive: ${aliveB}]`,
            match.boardB,
            aiA.getHeatmap(match.boardB).heatmap,
            false,
            previewB,
          ),
        );
        console.log('\nLegend: 0-9 scaled heat, $ = 100%, @ = target');
      } else {
        const previewA =
          phase === 1
            ? {
                origin: { x: moveB.x, y: moveB.y },
                impactCells: new Set(
                  match.boardA.getImpactCoordinates(moveB.x, moveB.y, SHOT_PATTERNS[moveB.ship] ?? []),
                ),
              }
            : undefined;
        const previewB =
          phase === 1
            ? {
                origin: { x: moveA.x, y: moveA.y },
                impactCells: new Set(
                  match.boardB.getImpactCoordinates(moveA.x, moveA.y, SHOT_PATTERNS[moveA.ship] ?? []),
                ),
              }
            : undefined;

        console.log(renderBoard(`Side A (${sideAVariant}) [alive: ${aliveA}]`, match.boardA, true, previewA));
        console.log();
        console.log(renderBoard(`Side B (${sideBVariant}) [alive: ${aliveB}]`, match.boardB, true, previewB));
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
  let pending: { ship: string; x: number; y: number } | null = null;

  while (true) {
    const impactCells = pending
      ? new Set(targetBoard.getImpactCoordinates(pending.x, pending.y, SHOT_PATTERNS[pending.ship] ?? []))
      : new Set<string>();

    renderInteractiveBoards(
      playerBoard,
      targetBoard,
      aiController,
      showHeatmap,
      statusLine,
      pending ? { origin: { x: pending.x, y: pending.y }, impactCells } : undefined,
    );

    const shipList = PROMPT_SHIP_ORDER.filter((s) => activeShips.includes(s))
      .map((s) => `${PROMPT_SHIP_ORDER.indexOf(s) + 1}:${s}`)
      .join(', ');

    const prompt = pending
      ? `Previewing ${pending.ship} at ${formatCoord(pending.x, pending.y)}. Enter to FIRE, or new command: `
      : `Enter command (e.g. '1 A5' or 'Carrier A5', ships: ${shipList}, h, ?): `;

    const inputRaw = (await rl.question(`\n${prompt}`)).trim();

    if (inputRaw === '' && pending) {
      return pending;
    }

    if (inputRaw === '?') {
      printPatternHelp();
      await rl.question('\nPress Enter to continue...');
      continue;
    }

    if (inputRaw.toLowerCase() === 'h') {
      showHeatmap = !showHeatmap;
      statusLine = showHeatmap ? 'Heat map view enabled.' : '';
      continue;
    }

    const parts = inputRaw.split(/\s+/);
    if (parts.length < 2) {
      statusLine = 'Invalid command format. Use "[ship] [coordinate]", e.g., "1 A5".';
      pending = null;
      continue;
    }

    const [shipToken, coordToken] = parts;
    const selectedShip = PROMPT_SHIP_ORDER[Number(shipToken) - 1];
    const matchedShip =
      (selectedShip && activeShips.includes(selectedShip) ? selectedShip : null) ??
      activeShips.find((s) => s.toLowerCase() === shipToken.toLowerCase());

    if (!matchedShip) {
      statusLine = `Invalid ship: ${shipToken}.`;
      pending = null;
      continue;
    }

    const parsedCoord = parseCoord(coordToken);
    if (!parsedCoord) {
      statusLine = `Invalid coordinate: ${coordToken}.`;
      pending = null;
      continue;
    }

    if (!targetBoard.canTargetCell(parsedCoord.x, parsedCoord.y, matchedShip)) {
      statusLine = 'That shot pattern cannot hit any new cell from that origin.';
      pending = null;
      continue;
    }

    pending = { x: parsedCoord.x, y: parsedCoord.y, ship: matchedShip };
    statusLine = '';
  }
};

const main = async () => {
  const options = parseCommonArgs(process.argv.slice(2));
  const { ai, help, watch, sideA, sideB, fleetSeed, moveSeed, seed, game, mirror, auto, vars, varsA, varsB } = options;

  const watchFlags = ['--sideA', '--sideB', '--varsA', '--varsB', '--fleet-seed', '--move-seed', '--seed', '--game', '--mirror', '--auto'];
  const watchFlagsUsed = process.argv.some((arg) => watchFlags.includes(arg));

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
