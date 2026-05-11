# Battleship with Special Shot Patterns

This is a variant of the classic Battleship game where each ship provides a unique firing pattern. As long as a ship is afloat, you can use its special ability.

## Shot Patterns

- **Carrier**: "X" pattern (5 squares)
- **Battleship**: 2x2 square (4 squares)
- **Submarine**: 3-peg horizontal line (3 squares)
- **Destroyer**: 3-peg vertical line (3 squares)
- **Patrol Boat**: Single shot (1 square)

## Project Structure

- `sim.py`: A simulation harness to test game balance and AI performance.
- `game.py`: Interactive game implementation.

## How to Run

### Interactive Game

```bash
python game.py
```

### Simulation

```bash
python sim.py
```
