import { AI, ALL_AI_VARIANTS, AI_PARAM_SCHEMAS, type AIVariants } from './src/ai';
import { BattleshipMatch } from './src/engine';
import { mulberry32, type RngFn } from './src/ai-utils';

const VALID_VARIANTS = ALL_AI_VARIANTS;

const parseVars = (raw: string): Record<string, string> => {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(',').map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return [pair, ''];
      return [pair.slice(0, eq), pair.slice(eq + 1)];
    }),
  );
};

const parseArgs = () => {
  const options = {
    sideA: 'expert',
    sideB: 'expert',
    games: 1,
    verbose: false,
    seed: undefined as number | undefined,
    fleetSeed: undefined as number | undefined,
    moveSeed: undefined as number | undefined,
    game: undefined as number | undefined,
    varsA: {} as Record<string, string>,
    varsB: {} as Record<string, string>,
    listVars: undefined as string | undefined,
  };

  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--sideA') { options.sideA = args[i + 1] ?? options.sideA; i += 1; }
    else if (arg === '--sideB') { options.sideB = args[i + 1] ?? options.sideB; i += 1; }
    else if (arg === '--games') { options.games = Number(args[i + 1] ?? options.games); i += 1; }
    else if (arg === '--verbose') { options.verbose = true; }
    else if (arg === '--seed') { options.seed = Number(args[i + 1]); i += 1; }
    else if (arg === '--fleet-seed') { options.fleetSeed = Number(args[i + 1]); i += 1; }
    else if (arg === '--move-seed') { options.moveSeed = Number(args[i + 1]); i += 1; }
    else if (arg === '--game') { options.game = Number(args[i + 1]); i += 1; }
    else if (arg === '--varsA') { options.varsA = parseVars(args[i + 1] ?? ''); i += 1; }
    else if (arg === '--varsB') { options.varsB = parseVars(args[i + 1] ?? ''); i += 1; }
    else if (arg === '--list-vars') { options.listVars = args[i + 1]; i += 1; }
  }

  return options;
};

const isVariant = (value: string): value is AIVariants => (VALID_VARIANTS as readonly string[]).includes(value);

const validateVars = (
  vars: Record<string, string>,
  variant: string,
  side: string,
): Record<string, number | boolean> | null => {
  const schema = AI_PARAM_SCHEMAS[variant] ?? {};
  const result: Record<string, number | boolean> = {};

  for (const [key, val] of Object.entries(vars)) {
    if (!(key in schema)) {
      console.error(`Error: Unknown parameter '${key}' for ${side} variant '${variant}'.`);
      console.error(`  Hint: run \`npx tsx sim.ts --list-vars ${variant}\` to see valid parameters.`);
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

const runMatch = (
  sideAVariant: AIVariants,
  sideBVariant: AIVariants,
  verbose: boolean,
  rngFleet?: RngFn,
  rngMove?: RngFn,
) => {
  const sideA = new AI(sideAVariant);
  const sideB = new AI(sideBVariant);
  const match = new BattleshipMatch(sideA.placeFleet(undefined, rngFleet), sideB.placeFleet(undefined, rngFleet), 'sideA', 'sideB');

  while (!match.isGameOver) {
    const moveA = sideA.selectMove(match.boardB, match.boardA.getActiveShipNames(), rngMove);
    const moveB = sideB.selectMove(match.boardA, match.boardB.getActiveShipNames(), rngMove);
    const result = match.resolveTurn(moveA, moveB);

    if (verbose) {
      console.log(
        `Round ${match.round}: sideA ${moveA.ship} @ (${moveA.x},${moveA.y}) => ${result.attackA.hits} hits | ` +
          `sideB ${moveB.ship} @ (${moveB.x},${moveB.y}) => ${result.attackB.hits} hits`,
      );
    }
  }

  return { winnerId: match.winner ?? 'draw', rounds: match.round };
};

const main = () => {
  const { sideA, sideB, games, verbose, seed, fleetSeed, moveSeed, game, varsA, varsB, listVars } = parseArgs();

  if (listVars !== undefined) {
    if (!isVariant(listVars)) {
      const variants = VALID_VARIANTS.join('|');
      console.error(`Error: Unknown variant '${listVars}'. Valid variants: ${variants}`);
      process.exit(1);
    }
    const schema = AI_PARAM_SCHEMAS[listVars] ?? {};
    console.log(`Parameters for ${listVars}:`);
    for (const [key, def] of Object.entries(schema)) {
      console.log(`  ${key.padEnd(14)}${def.type.padEnd(9)}default=${def.default}   ${def.description}`);
    }
    process.exit(0);
  }

  if (!isVariant(sideA) || !isVariant(sideB) || !Number.isInteger(games) || games < 1) {
    const variants = VALID_VARIANTS.join('|');
    console.error(
      `Usage: npm run sim -- --sideA <${variants}> --sideB <${variants}> --games <positive-int> [--verbose]`,
    );
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
      console.error('Error: --game requires --seed');
      process.exit(1);
    }
    const i = game!;
    const effectiveFleetSeed = fleetSeed ?? seed + i * 2;
    const effectiveMoveSeed = moveSeed ?? seed + i * 2 + 1;
    console.log(`Replaying game ${i} (seed=${seed}, fleetSeed=${effectiveFleetSeed}, moveSeed=${effectiveMoveSeed})`);
    console.log(`${sideA} (A) vs ${sideB} (B)`);
    runMatch(
      sideA,
      sideB,
      true,
      mulberry32(effectiveFleetSeed),
      mulberry32(effectiveMoveSeed),
    );
    return;
  }

  console.log(`Simulation: ${sideA} (A) vs ${sideB} (B)`);
  console.log(`Mode: SIMULTANEOUS TURNS`);
  if (isSeeded) console.log(`Seed: ${seed ?? '(fleet=' + fleetSeed + ', move=' + moveSeed + ')'}`);
  console.log(`Running ${games} games...`);

  const summary = {
    sideA: { wins: 0, rounds: [] as number[] },
    sideB: { wins: 0, rounds: [] as number[] },
    draw: { count: 0, rounds: [] as number[] },
  };
  type LossEntry = { game: number; rounds: number; fleetSeed: number; moveSeed: number };
  const lossesA: LossEntry[] = []; // games sideA lost (sideB won)
  const lossesB: LossEntry[] = []; // games sideB lost (sideA won)

  for (let i = 0; i < games; i += 1) {
    const effectiveFleetSeed = fleetSeed ?? (seed !== undefined ? seed + i * 2 : undefined);
    const effectiveMoveSeed = moveSeed ?? (seed !== undefined ? seed + i * 2 + 1 : undefined);
    const rngFleet = effectiveFleetSeed !== undefined ? mulberry32(effectiveFleetSeed) : undefined;
    const rngMove = effectiveMoveSeed !== undefined ? mulberry32(effectiveMoveSeed) : undefined;

    const result = runMatch(sideA, sideB, verbose, rngFleet, rngMove);

    const mkEntry = (): LossEntry | null =>
      isSeeded && effectiveFleetSeed !== undefined && effectiveMoveSeed !== undefined
        ? { game: i, rounds: result.rounds, fleetSeed: effectiveFleetSeed, moveSeed: effectiveMoveSeed }
        : null;

    if (result.winnerId === 'sideA') {
      summary.sideA.wins += 1;
      summary.sideA.rounds.push(result.rounds);
      const e = mkEntry(); if (e) lossesB.push(e);
    } else if (result.winnerId === 'sideB') {
      summary.sideB.wins += 1;
      summary.sideB.rounds.push(result.rounds);
      const e = mkEntry(); if (e) lossesA.push(e);
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

  const statsB = getStats(summary.sideB.rounds);
  console.log(`\nSide B (${sideB.toUpperCase()}):`);
  console.log(`  Wins:      ${summary.sideB.wins} (${((summary.sideB.wins / games) * 100).toFixed(1)}%)`);
  console.log(`  Avg Rounds: ${statsB.avg}`);
  if (summary.sideB.rounds.length > 0) {
    console.log(`  Min/Max:   ${statsB.min} / ${statsB.max}`);
  }

  if (summary.draw.count > 0) {
    const statsDraw = getStats(summary.draw.rounds);
    console.log(`\nDraws:       ${summary.draw.count} (${((summary.draw.count / games) * 100).toFixed(1)}%)`);
    console.log(`  Avg Rounds: ${statsDraw.avg}`);
  }

  const allRounds = [...summary.sideA.rounds, ...summary.sideB.rounds, ...summary.draw.rounds];
  const globalAvg = (allRounds.reduce((a, b) => a + b, 0) / allRounds.length).toFixed(2);
  console.log('\n' + '-'.repeat(20));
  console.log(`Global Average: ${globalAvg} rounds per game`);

  if ((lossesA.length > 0 || lossesB.length > 0) && seed !== undefined) {
    const replayBase = `npx tsx sim.ts --seed ${seed} --sideA ${sideA} --sideB ${sideB} --game`;
    const pickNotable = (list: LossEntry[]): Array<[string, LossEntry]> => {
      const sorted = [...list].sort((a, b) => a.rounds - b.rounds);
      const fastest = sorted[0];
      const slowest = sorted[sorted.length - 1];
      const sample = list[Math.floor(list.length / 2)];
      const seen = new Set<number>();
      const result: Array<[string, LossEntry]> = [];
      for (const [label, entry] of [['fastest', fastest], ['sample ', sample], ['slowest', slowest]] as Array<[string, LossEntry]>) {
        if (!seen.has(entry.game)) { seen.add(entry.game); result.push([label, entry]); }
      }
      return result;
    };
    const printNotable = (heading: string, list: LossEntry[]) => {
      if (list.length === 0) return;
      console.log(`\nNotable ${heading} losses:`);
      for (const [kind, entry] of pickNotable(list)) {
        const replay = `npx tsx sim.ts --fleet-seed ${entry.fleetSeed} --move-seed ${entry.moveSeed} --sideA ${sideA} --sideB ${sideB} --games 1 --verbose`;
        console.log(`  ${kind}  game ${entry.game}  (${entry.rounds} rds)  →  ${replay}`);
      }
    };
    printNotable('sideA', lossesA);
    printNotable('sideB', lossesB);
  }

  console.log('='.repeat(40));
};

main();
