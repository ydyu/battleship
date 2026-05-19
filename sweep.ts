import { execSync } from 'child_process';

const printHelp = () => {
  console.log([
    'Usage: npx tsx sweep.ts [options]',
    '',
    'Options:',
    '  --var <name>            Parameter to sweep (default: overlapBase)',
    '  --start <n>            Start value for side B (default: 1.0)',
    '  --end <n>              End value for side B (default: 10.0)',
    '  --step <n>             Step size (default: 1.0)',
    '  --baseline-val <n>     Value of --var for side A (default: 4.0)',
    '  --control <k=v,...>    Static overrides for BOTH sides (e.g. overlapMult=2,scoutMult=3)',
    '  --games <n>            Games per step (default: 500)',
    '  --seed <n>             Seed for reproducibility (default: 42)',
    '  --variant <name>       AI variant (default: expert)',
    '',
    'Example:',
    '  # Sweep overlapBase while holding overlapMult at 3.0',
    '  npx tsx sweep.ts --var overlapBase --start 3.0 --end 5.0 --step 0.1 --control overlapMult=3.0',
  ].join('\n'));
};

const main = () => {
  const args = process.argv.slice(2);
  let sweepVar = 'overlapBase';
  let start = 1.0;
  let end = 10.0;
  let step = 1.0;
  let games = 250;
  let seed = 42;
  let variant = 'expert';
  let baselineVal = 4.0;
  let controlStr = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--var') sweepVar = args[++i];
    else if (arg === '--start') start = Number(args[++i]);
    else if (arg === '--end') end = Number(args[++i]);
    else if (arg === '--step') step = Number(args[++i]);
    else if (arg === '--games') games = Number(args[++i]);
    else if (arg === '--seed') seed = Number(args[++i]);
    else if (arg === '--variant') variant = args[++i];
    else if (arg === '--baseline-val') baselineVal = Number(args[++i]);
    else if (arg === '--control') controlStr = args[++i];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // Validation
  const controls = controlStr ? controlStr.split(',') : [];
  for (const c of controls) {
    const [k] = c.split('=');
    if (k === sweepVar) {
      console.error(`Error: Cannot have '${sweepVar}' in both --var and --control.`);
      process.exit(1);
    }
  }

  console.log(`Sweeping ${sweepVar} | Games: ${games} | Baseline: ${baselineVal}`);
  console.log('='.repeat(55));
  console.log(`${sweepVar.padEnd(12)} | Side A % | Side B % | Diff`);
  console.log('-'.repeat(55));

  const results: any[] = [];

  for (let val = start; val <= end; val += step) {
    const currentVal = Number(val.toFixed(4));
    
    const varsA = controlStr ? `${controlStr},${sweepVar}=${baselineVal}` : `${sweepVar}=${baselineVal}`;
    const varsB = controlStr ? `${controlStr},${sweepVar}=${currentVal}` : `${sweepVar}=${currentVal}`;

    const cmd = `npx tsx sim.ts --sideA ${variant} --sideB ${variant} --varsA ${varsA} --varsB ${varsB} --games ${games} --seed ${seed} --mirror --json`;
    
    try {
      const output = execSync(cmd, { encoding: 'utf-8' });
      const data = JSON.parse(output);
      
      const aWinRate = data.sideA.winRate;
      const bWinRate = data.sideB.winRate;
      const diff = Number((bWinRate - aWinRate).toFixed(1));

      console.log(
        `${currentVal.toString().padEnd(12)} | ` +
        `${aWinRate.toFixed(1).padStart(7)}% | ` +
        `${bWinRate.toFixed(1).padStart(7)}% | ` +
        `${diff > 0 ? '+' : ''}${diff.toFixed(1).padStart(5)}%`
      );

      results.push({ val: currentVal, aWinRate, bWinRate, diff });
    } catch (e) {
      console.error(`Error running simulation for ${sweepVar}=${currentVal}:`, e);
    }
  }

  console.log('='.repeat(55));
  
  const sorted = [...results].sort((a, b) => b.diff - a.diff);

  if (sorted.length > 0) {
    const best = sorted[0];
    console.log(`Best ${sweepVar}: ${best.val} (${best.diff > 0 ? '+' : ''}${best.diff}% diff)`);
  }
};

main();
