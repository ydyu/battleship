# Battleship

A terminal Battleship game focused on pattern-based targeting and AI simulation.

### Key Features
- **Unique Shot Patterns**: Each ship fires in a different shape. The Carrier hits a cross, while the Submarine fires in a straight line.
- **Tactical Heatmaps**: View a live probability map while playing. It calculates the most likely ship locations based on current board state.
- **AI Simulation**: Run hundreds of games in seconds to compare AI strategies or test specific seeds.
- **Web Version**: Play a visual version of the game at [ydyu.github.io/battleship.html](https://ydyu.github.io/battleship.html).

### How to Play
- **Launch**: Run `npx tsx game.ts`.
- **Target**: Type a ship number and coordinate (e.g., `1 A5`).
- **Preview**: View the highlighted hit pattern on the board before pressing Enter to fire.
- **Analyze**: Toggle the heatmap with `h` or view shot patterns with `?`.
- **Watch**: Replay AI matches in slow motion with `npx tsx game.ts --watch`.

### Advanced Usage
Run `npx tsx game.ts --help` or `npx tsx sim.ts --help` to see all parameters for seeding, mirroring, and AI configuration.

### Simulations
Use `sim.ts` to benchmark AI variants:
```bash
npx tsx sim.ts --sideA medium --sideB expert --games 100
```
