import { AI } from './src/ai';
import { BattleshipMatch, Board, SHIP_TYPES, SHIP_NAMES } from './src/engine';
import { mulberry32, type RngFn } from './src/ai-utils';
import {
  VALID_VARIANTS,
  isVariant,
  parseVars,
  validateVars,
  printSchema,
  parseCommonArgs,
} from './src/cli';

const printHelp = () => {
  const variants = VALID_VARIANTS.join('|');
  console.log([
    'Usage: npx tsx sim.ts [options]',
    '',
    'Options:',
    `  --sideA <variant>        AI for side A (default: expert) [${variants}]`,
    `  --sideB <variant>        AI for side B (default: expert)`,
    '  --games <n>             Number of games to simulate (default: 1)',
    '  --verbose               Print round-by-round detail',
    '',
    '  --seed <n>              Seed entire run; game i uses fleet=n+i*2, move=n+i*2+1',
    '  --fleet-seed <n>        Fix both sides to same fleet positions every game (intentional',
    '                          asymmetry: A draws first half of RNG, B draws second half)',
    '  --move-seed <n>         Fix move tie-breaking RNG every game',
    '  --game <i>              Replay game index i from a seeded run (requires --seed)',
    '  --mirror                Give both sides identical fleets + move RNG (use with --fleet-seed',
    '                          to eliminate layout luck; produces all-draws with identical AIs)',
    '',
    '  --varsA key=val,...     Override AI params for side A',
    '  --varsB key=val,...     Override AI params for side B',
    '  --list-vars [variant]   Print param schema for a variant (or all) and exit',
    '',
    'Examples:',
    '  npx tsx sim.ts --sideA expert --sideB expert --games 200 --seed 42',
    '  npx tsx sim.ts --fleet-seed 0 --games 200               # test fleet position A vs B',
    '  npx tsx sim.ts --fleet-seed 0 --mirror --games 200      # isolate AI quality (all draws with identical AIs)',
    '  npx tsx sim.ts --seed 42 --game 7 --sideA expert --sideB expert --mirror',
    '  npx tsx sim.ts --list-vars expert',
  ].join('\n'));
};

const printFleet = (side: string, board: Board) => {
  console.log(`  ${side} fleet:`);
  for (const { name } of SHIP_TYPES) {
    const coords = board.shipLayouts[name];
    if (!coords) continue;
    const cells = coords.map((c) => `(${c})`).join(' ');
    console.log(`    ${name.padEnd(12)} ${cells}`);
  }
};

interface MatchEndState {
  totalHP: number;
  untouchedShips: number;
  woundedShips: number;
}

interface MatchResult {
  winnerId: 'sideA' | 'sideB' | 'draw';
  rounds: number;
  roundsA: number | null;
  roundsB: number | null;
  endState: MatchEndState | null;
}

const runMatch = (
  sideAVariant: AIVariants,
  sideBVariant: AIVariants,
  verbose: boolean,
  rngFleetA?: RngFn,
  rngFleetB?: RngFn,
  rngMoveA?: RngFn,
  rngMoveB?: RngFn,
  configA?: Record<string, number | boolean>,
  configB?: Record<string, number | boolean>,
  preplacedA?: Board,
  preplacedB?: Board,
): MatchResult => {
  const sideA = new AI(sideAVariant, configA);
  const sideB = new AI(sideBVariant, configB);
  const fleetA = preplacedA ?? sideA.placeFleet(undefined, rngFleetA);
  const fleetB = preplacedB ?? sideB.placeFleet(undefined, rngFleetB);
  const match = new BattleshipMatch(fleetA, fleetB, 'sideA', 'sideB');

  let roundsA: number | null = null;
  let roundsB: number | null = null;
  let firstWinnerId: 'sideA' | 'sideB' | 'draw' | null = null;
  let endState: MatchEndState | null = null;

  while ((roundsA === null || roundsB === null) && match.round < 100) {
    const moveA = roundsA === null
      ? sideA.selectMove(match.boardB, match.boardA.getActiveShipNames().length > 0 ? match.boardA.getActiveShipNames() : SHIP_NAMES, rngMoveA)
      : { x: 0, y: 0, ship: 'None', pattern: [] };
    const moveB = roundsB === null
      ? sideB.selectMove(match.boardA, match.boardB.getActiveShipNames().length > 0 ? match.boardB.getActiveShipNames() : SHIP_NAMES, rngMoveB)
      : { x: 0, y: 0, ship: 'None', pattern: [] };

    const result = match.resolveTurn(moveA, moveB);

    if (match.boardB.isGameOver() && roundsA === null) {
      roundsA = match.round;
    }
    if (match.boardA.isGameOver() && roundsB === null) {
      roundsB = match.round;
    }

    // Capture endState of winner at the moment of first victory
    if (match.winner && !firstWinnerId) {
      firstWinnerId = match.winner as any;
      const winnerBoard = firstWinnerId === 'sideA' ? match.boardA : match.boardB;
      // If it's a draw, winnerBoard could be sideA (arbitrarily) or we handle it
      const boardToMeasure = firstWinnerId === 'draw' ? match.boardA : winnerBoard;

      const shipLayouts = boardToMeasure.shipLayouts;
      const hitsReceived = boardToMeasure.hitsReceived;
      const activeShips = boardToMeasure.activeShips;

      let totalHP = 0;
      for (const coords of Object.values(activeShips)) {
        totalHP += coords.length;
      }

      let untouchedShips = 0;
      let woundedShips = 0;
      for (const [name, coords] of Object.entries(shipLayouts)) {
        const hits = coords.filter(c => hitsReceived.has(c)).length;
        if (hits === 0) {
          untouchedShips += 1;
        } else if (activeShips[name]) {
          woundedShips += 1;
        }
      }

      endState = { totalHP, untouchedShips, woundedShips };
    }

    if (verbose) {
      console.log(
        `Round ${match.round}: sideA ${moveA.ship} @ (${moveA.x},${moveA.y}) => ${result.attackA.hits} hits | ` +
          `sideB ${moveB.ship} @ (${moveB.x},${moveB.y}) => ${result.attackB.hits} hits`,
      );
    }
  }

  return {
    winnerId: firstWinnerId ?? 'draw',
    rounds: match.round,
    roundsA,
    roundsB,
    endState,
  };
};

const main = () => {
  const options = parseCommonArgs(process.argv.slice(2));
  const { sideA, sideB, games, verbose, seed, fleetSeed, moveSeed, game, mirror, varsA, varsB, listVars, help } = options;

  if (help) {
    printHelp();
    process.exit(0);
  }

  if (listVars !== undefined) {
    if (listVars === '' || listVars === undefined) {
      // No variant specified — show all
      for (const variant of VALID_VARIANTS) {
        console.log(`Parameters for ${variant}:`);
        printSchema(variant);
      }
    } else if (!isVariant(listVars)) {
      const variants = VALID_VARIANTS.join('|');
      console.error(`Error: Unknown variant '${listVars}'. Valid variants: ${variants}\n`);
      printHelp();
      process.exit(1);
    } else {
      console.log(`Parameters for ${listVars}:`);
      printSchema(listVars);
    }
    process.exit(0);
  }

  if (!isVariant(sideA) || !isVariant(sideB) || !Number.isInteger(games) || games < 1) {
    const variants = VALID_VARIANTS.join('|');
    if (!isVariant(sideA)) console.error(`Error: Unknown --sideA variant '${sideA}'. Valid: ${variants}`);
    if (!isVariant(sideB)) console.error(`Error: Unknown --sideB variant '${sideB}'. Valid: ${variants}`);
    if (!Number.isInteger(games) || games < 1) console.error(`Error: --games must be a positive integer, got '${games}'.`);
    console.error('');
    printHelp();
    process.exit(1);
  }

  const parsedVarsA = validateVars(varsA, sideA, '--varsA');
  if (parsedVarsA === null) process.exit(1);
  const parsedVarsB = validateVars(varsB, sideB, '--varsB');
  if (parsedVarsB === null) process.exit(1);

  const isSeeded = seed !== undefined || fleetSeed !== undefined || moveSeed !== undefined;
  const replayMode = game !== undefined;

  if (replayMode) {
    if (seed === undefined) {
      console.error('Error: --game requires --seed\n');
      printHelp();
      process.exit(1);
    }
    const i = game!;
    const effectiveFleetSeed = fleetSeed ?? seed + i * 2;
    const effectiveMoveSeed = moveSeed ?? seed + i * 2 + 1;
    const aiA = new AI(sideA, parsedVarsA);
    const aiB = new AI(sideB, parsedVarsB);
    const rngFleetA = mulberry32(effectiveFleetSeed);
    const rngFleetB = mirror ? mulberry32(effectiveFleetSeed) : rngFleetA;
    const fleetA = aiA.placeFleet(undefined, rngFleetA);
    const fleetB = aiB.placeFleet(undefined, rngFleetB);
    console.log(`Replaying game ${i} (seed=${seed}, fleetSeed=${effectiveFleetSeed}, moveSeed=${effectiveMoveSeed})`);
    console.log(`${sideA} (A) vs ${sideB} (B)${mirror ? ' [MIRRORED]' : ''}`);
    printFleet('sideA', fleetA);
    printFleet('sideB', fleetB);
    console.log('');
    runMatch(
      sideA,
      sideB,
      true,
      undefined,
      undefined,
      mulberry32(effectiveMoveSeed),
      mirror ? mulberry32(effectiveMoveSeed) : undefined,
      parsedVarsA,
      parsedVarsB,
      fleetA,
      fleetB,
    );
    return;
  }

  console.log(`Simulation: ${sideA} (A) vs ${sideB} (B)`);
  console.log(`Mode: SIMULTANEOUS TURNS`);
  if (isSeeded) console.log(`Seed: ${seed ?? '(fleet=' + fleetSeed + ', move=' + moveSeed + ')'}`);
  console.log(`Running ${games} games...`);

  const summary = {
    sideA: { wins: 0, rounds: [] as number[], lossMetrics: [] as { extraRounds: number; endState: MatchEndState }[] },
    sideB: { wins: 0, rounds: [] as number[], lossMetrics: [] as { extraRounds: number; endState: MatchEndState }[] },
    draw: { count: 0, rounds: [] as number[] },
  };
  type LossEntry = {
    game: number;
    rounds: number;
    fleetSeed?: number;
    moveSeed?: number;
    extraRounds: number;
    endState: MatchEndState;
  };
  const lossesA: LossEntry[] = []; // games sideA lost (sideB won)
  const lossesB: LossEntry[] = []; // games sideB lost (sideA won)

  for (let i = 0; i < games; i += 1) {
    const effectiveFleetSeed = fleetSeed ?? (seed !== undefined ? seed + i * 2 : undefined);
    const effectiveMoveSeed = moveSeed ?? (seed !== undefined ? seed + i * 2 + 1 : undefined);

    const rngFleetA = effectiveFleetSeed !== undefined ? mulberry32(effectiveFleetSeed) : undefined;
    const rngFleetB = mirror && effectiveFleetSeed !== undefined ? mulberry32(effectiveFleetSeed) : rngFleetA;

    const rngMoveA = effectiveMoveSeed !== undefined ? mulberry32(effectiveMoveSeed) : undefined;
    const rngMoveB = mirror && effectiveMoveSeed !== undefined ? mulberry32(effectiveMoveSeed) : rngMoveA;

    const aiA = new AI(sideA, parsedVarsA ?? undefined);
    const aiB = new AI(sideB, parsedVarsB ?? undefined);
    const placedA = aiA.placeFleet(undefined, rngFleetA);
    const placedB = aiB.placeFleet(undefined, rngFleetB);

    if (verbose) {
      console.log(`\n--- Game ${i} ---`);
      printFleet('sideA', placedA);
      printFleet('sideB', placedB);
    }

    const result = runMatch(
      sideA,
      sideB,
      verbose,
      rngFleetA,
      rngFleetB,
      rngMoveA,
      rngMoveB,
      parsedVarsA,
      parsedVarsB,
      placedA,
      placedB,
    );

    const mkEntry = (r: number, extraRounds: number, endState: MatchEndState): LossEntry | null =>
      isSeeded
        ? {
            game: i,
            rounds: r,
            fleetSeed: effectiveFleetSeed,
            moveSeed: effectiveMoveSeed,
            extraRounds,
            endState,
          }
        : null;

    if (result.winnerId === 'sideA') {
      summary.sideA.wins += 1;
      summary.sideA.rounds.push(result.roundsA!);
      if (result.roundsB !== null && result.endState) {
        const extraRounds = result.roundsB - result.roundsA!;
        summary.sideB.lossMetrics.push({ extraRounds, endState: result.endState });
        const e = mkEntry(result.roundsA!, extraRounds, result.endState);
        if (e) lossesB.push(e);
      }
    } else if (result.winnerId === 'sideB') {
      summary.sideB.wins += 1;
      summary.sideB.rounds.push(result.roundsB!);
      if (result.roundsA !== null && result.endState) {
        const extraRounds = result.roundsA - result.roundsB!;
        summary.sideA.lossMetrics.push({ extraRounds, endState: result.endState });
        const e = mkEntry(result.roundsB!, extraRounds, result.endState);
        if (e) lossesA.push(e);
      }
    } else {
      summary.draw.count += 1;
      summary.draw.rounds.push(result.rounds);
    }

    const progressInterval = Math.max(1, Math.floor(games / 10));
    if ((i + 1) % progressInterval === 0 || i + 1 === games) {
      console.log(` Progress: ${i + 1}/${games}...`);
    }
  }

  const getStats = (rounds: number[]) => {
    if (rounds.length === 0) return { avg: 'N/A', min: 'N/A', max: 'N/A' };
    const sum = rounds.reduce((a, b) => a + b, 0);
    return {
      avg: (sum / rounds.length).toFixed(2),
      min: Math.min(...rounds),
      max: Math.max(...rounds),
    };
  };

  const getLossStats = (metrics: { extraRounds: number; endState: MatchEndState }[]) => {
    if (metrics.length === 0) return 'N/A';
    const count = metrics.length;
    const avgExtra = (metrics.reduce((s, m) => s + m.extraRounds, 0) / count).toFixed(1);
    const avgHP = (metrics.reduce((s, m) => s + m.endState.totalHP, 0) / count).toFixed(1);
    const avgUntouched = (metrics.reduce((s, m) => s + m.endState.untouchedShips, 0) / count).toFixed(1);
    const avgWounded = (metrics.reduce((s, m) => s + m.endState.woundedShips, 0) / count).toFixed(1);
    return `+${avgExtra}rd, ${avgHP}HP left (${avgUntouched} untouched, ${avgWounded} wounded) avg`;
  };

  console.log('\n' + '='.repeat(40));
  console.log('SIMULATION RESULTS');
  console.log('='.repeat(40));

  const statsA = getStats(summary.sideA.rounds);
  console.log(`Side A (${sideA.toUpperCase()}):`);
  console.log(`  Wins:      ${summary.sideA.wins} (${((summary.sideA.wins / games) * 100).toFixed(1)}%)`);
  console.log(`  Avg Rounds: ${statsA.avg}`);
  if (summary.sideA.rounds.length > 0) {
    console.log(`  Min/Max:   ${statsA.min} / ${statsA.max}`);
  }
  console.log(`  When Lost: ${getLossStats(summary.sideA.lossMetrics)}`);

  const statsB = getStats(summary.sideB.rounds);
  console.log(`\nSide B (${sideB.toUpperCase()}):`);
  console.log(`  Wins:      ${summary.sideB.wins} (${((summary.sideB.wins / games) * 100).toFixed(1)}%)`);
  console.log(`  Avg Rounds: ${statsB.avg}`);
  if (summary.sideB.rounds.length > 0) {
    console.log(`  Min/Max:   ${statsB.min} / ${statsB.max}`);
  }
  console.log(`  When Lost: ${getLossStats(summary.sideB.lossMetrics)}`);

  if (summary.draw.count > 0) {
    const statsDraw = getStats(summary.draw.rounds);
    console.log(`\nDraws:       ${summary.draw.count} (${((summary.draw.count / games) * 100).toFixed(1)}%)`);
    console.log(`  Avg Rounds: ${statsDraw.avg}`);
  }

  const allRounds = [...summary.sideA.rounds, ...summary.sideB.rounds, ...summary.draw.rounds];
  const globalAvg = (allRounds.reduce((a, b) => a + b, 0) / allRounds.length).toFixed(2);
  console.log('\n' + '-'.repeat(20));
  console.log(`Global Average: ${globalAvg} rounds per game`);

  if (lossesA.length > 0 || lossesB.length > 0) {
    const pickNotable = (list: LossEntry[]): Array<[string, LossEntry]> => {
      const sorted = [...list].sort((a, b) => a.rounds - b.rounds);
      const fastest = sorted[0];
      const slowest = sorted[sorted.length - 1];
      const sample = list[Math.floor(list.length / 2)];
      const seen = new Set<number>();
      const result: Array<[string, LossEntry]> = [];
      for (const [label, entry] of [
        ['fastest', fastest],
        ['sample ', sample],
        ['slowest', slowest],
      ] as Array<[string, LossEntry]>) {
        if (!seen.has(entry.game)) {
          seen.add(entry.game);
          result.push([label, entry]);
        }
      }
      return result;
    };
    const printNotable = (heading: string, list: LossEntry[]) => {
      if (list.length === 0) return;
      console.log(`\nNotable ${heading} losses:`);
      const fmtVars = (v: Record<string, string>) =>
        Object.entries(v)
          .map(([k, val]) => `${k}=${val}`)
          .join(',');
      const strA = Object.keys(varsA).length > 0 ? ` --varsA ${fmtVars(varsA)}` : '';
      const strB = Object.keys(varsB).length > 0 ? ` --varsB ${fmtVars(varsB)}` : '';

      for (const [kind, entry] of pickNotable(list)) {
        const seedParts: string[] = [];
        if (entry.fleetSeed !== undefined) seedParts.push(`--fleet-seed ${entry.fleetSeed}`);
        if (entry.moveSeed !== undefined) seedParts.push(`--move-seed ${entry.moveSeed}`);
        const seedStr = seedParts.length > 0 ? ' ' + seedParts.join(' ') : '';
        const replay = `npx tsx sim.ts${seedStr} --sideA ${sideA} --sideB ${sideB}${strA}${strB} --games 1 --verbose${
          mirror ? ' --mirror' : ''
        }`;
        const es = entry.endState;
        const metrics = `(+${entry.extraRounds}rd, ${es.totalHP}HP left (${es.untouchedShips} untouched, ${es.woundedShips} wounded))`;
        console.log(`  ${kind}  game ${entry.game.toString().padEnd(3)} ${metrics.padEnd(45)}  →  ${replay}`);
      }
    };
    printNotable('sideA', lossesA);
    printNotable('sideB', lossesB);
  }

  console.log('='.repeat(40));
};

main();
