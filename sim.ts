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
    console.error('Usage: npm run sim -- --sideA <novice|medium|expert|experiment> --sideB <novice|medium|expert|experiment> --games <positive-int> [--verbose]');
    process.exit(1);
  }

  const summary = {
    sideA: 0,
    sideB: 0,
    draw: 0,
    rounds: 0,
  };

  for (let i = 0; i < games; i += 1) {
    const result = runMatch(sideA, sideB, verbose);
    summary.rounds += result.rounds;

    if (result.winnerId === 'sideA') summary.sideA += 1;
    else if (result.winnerId === 'sideB') summary.sideB += 1;
    else summary.draw += 1;
  }

  console.log(`Simulated ${games} game(s)`);
  console.log(`sideA (${sideA}) wins: ${summary.sideA}`);
  console.log(`sideB (${sideB}) wins: ${summary.sideB}`);
  console.log(`draws: ${summary.draw}`);
  console.log(`average rounds: ${(summary.rounds / games).toFixed(2)}`);
};

main();
