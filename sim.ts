import { AI, type AIDifficulty } from './src/ai';
import { resolveSimultaneousTurn } from './src/engine';

const VALID_DIFFICULTIES = ['novice', 'medium', 'expert', 'experiment'] satisfies AIDifficulty[];

const parseArgs = () => {
  const options = {
    sideA: 'expert',
    sideB: 'expert',
    games: 1,
    verbose: false,
  };

  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--sideA') options.sideA = args[i + 1] ?? options.sideA;
    if (arg === '--sideB') options.sideB = args[i + 1] ?? options.sideB;
    if (arg === '--games') options.games = Number(args[i + 1] ?? options.games);
    if (arg === '--verbose') options.verbose = true;
  }

  return options;
};

const isDifficulty = (value: string): value is AIDifficulty => VALID_DIFFICULTIES.includes(value as AIDifficulty);

const runMatch = (sideADifficulty: AIDifficulty, sideBDifficulty: AIDifficulty, verbose: boolean) => {
  const sideA = new AI(sideADifficulty);
  const sideB = new AI(sideBDifficulty);
  let boardA = sideA.placeFleet();
  let boardB = sideB.placeFleet();
  let rounds = 0;

  while (!boardA.isGameOver() && !boardB.isGameOver()) {
    rounds += 1;

    const moveA = sideA.selectMove(boardB, boardA.getActiveShipNames());
    const moveB = sideB.selectMove(boardA, boardB.getActiveShipNames());
    const result = resolveSimultaneousTurn({
      round: rounds,
      boardA,
      moveA,
      boardB,
      moveB,
      sideAId: 'sideA',
      sideBId: 'sideB',
    });

    boardA = result.boardA;
    boardB = result.boardB;

    if (verbose) {
      console.log(
        `Round ${rounds}: sideA ${moveA.ship} @ (${moveA.x},${moveA.y}) => ${result.attackA.hits} hits | ` +
          `sideB ${moveB.ship} @ (${moveB.x},${moveB.y}) => ${result.attackB.hits} hits`,
      );
    }

    if (result.winnerId) {
      return { winnerId: result.winnerId, rounds };
    }
  }

  return { winnerId: 'draw', rounds };
};

const main = () => {
  const { sideA, sideB, games, verbose } = parseArgs();

  if (!isDifficulty(sideA) || !isDifficulty(sideB) || !Number.isInteger(games) || games < 1) {
    console.error(
      'Usage: npm run sim -- --sideA <novice|medium|expert|experiment> --sideB <novice|medium|expert|experiment> --games <positive-int> [--verbose]',
    );
    process.exit(1);
  }

  console.log(`Simulation: ${sideA} (A) vs ${sideB} (B)`);
  console.log(`Mode: SIMULTANEOUS TURNS`);
  console.log(`Running ${games} games...`);

  const summary = {
    sideA: { wins: 0, rounds: [] as number[] },
    sideB: { wins: 0, rounds: [] as number[] },
    draw: { count: 0, rounds: [] as number[] },
  };

  for (let i = 0; i < games; i += 1) {
    const result = runMatch(sideA, sideB, verbose);

    if (result.winnerId === 'sideA') {
      summary.sideA.wins += 1;
      summary.sideA.rounds.push(result.rounds);
    } else if (result.winnerId === 'sideB') {
      summary.sideB.wins += 1;
      summary.sideB.rounds.push(result.rounds);
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
  console.log('='.repeat(40));
};

main();
