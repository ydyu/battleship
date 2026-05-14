import { BOARD_SIZE, Board, SHIP_INDEX, SHIP_NAMES } from './engine';

export const getShipSize = (shipName: string): number => SHIP_INDEX[shipName]?.size ?? 0;

export const getUnsunkHits = (board: Board): Set<string> =>
  new Set([...board.hitsReceived].filter((coord) => !board.sunkCells.has(coord)));

export const fromCoord = (coord: string): [number, number] =>
  coord.split(',').map(Number) as [number, number];

export const getLargestShip = (activeShips: string[]): string =>
  activeShips.reduce<string | null>((largest, shipName) => {
    if (!largest) return shipName;

    const currentShip = SHIP_INDEX[shipName];
    const largestShip = SHIP_INDEX[largest];

    if (!largestShip) return shipName;
    if (!currentShip) return largest;
    if (currentShip.size !== largestShip.size) {
      return currentShip.size > largestShip.size ? shipName : largest;
    }

    return currentShip.index < largestShip.index ? shipName : largest;
  }, null) ?? SHIP_NAMES[SHIP_NAMES.length - 1];

/**
 * Calculates the minimum number of ships required to explain the current unsunk hits.
 * Used to determine if scouting is redundant.
 */
export const getSaturationCount = (
  unsunkHits: Set<string>,
  maxSize: number,
  board: Board,
  limit: number,
): number => {
  const hits = Array.from(unsunkHits).map(fromCoord);
  if (hits.length === 0) return 0;
  if (hits.length > 16) return 1;

  let maxCount = 0;
  const currentSet: [number, number][] = [];

  const canBeSame = (p1: [number, number], p2: [number, number]): boolean => {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    if (x1 !== x2 && y1 !== y2) return false;

    const dist = Math.abs(x1 - x2) + Math.abs(y1 - y2);
    if (dist >= maxSize) return false;

    if (x1 === x2) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let y = minY + 1; y < maxY; y += 1) {
        const coord = `${x1},${y}`;
        if (board.misses.has(coord) || board.sunkCells.has(coord)) return false;
      }
    } else {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX + 1; x < maxX; x += 1) {
        const coord = `${x},${y1}`;
        if (board.misses.has(coord) || board.sunkCells.has(coord)) return false;
      }
    }
    return true;
  };

  const solve = (idx: number) => {
    if (maxCount >= limit) return;
    if (idx === hits.length) {
      maxCount = Math.max(maxCount, currentSet.length);
      return;
    }
    if (currentSet.length + (hits.length - idx) <= maxCount) return;

    let canAdd = true;
    for (let i = 0; i < currentSet.length; i += 1) {
      if (canBeSame(hits[idx], currentSet[i])) {
        canAdd = false;
        break;
      }
    }

    if (canAdd) {
      currentSet.push(hits[idx]);
      solve(idx + 1);
      currentSet.pop();
    }
    solve(idx + 1);
  };

  solve(0);
  return maxCount;
};

/**
 * Finds the maximum length of a straight line (horizontal or vertical) that passes 
 * through (x, y) without hitting misses or sunk cells.
 */
export const maxRunThrough = (
  board: Board,
  x: number,
  y: number,
  excluded: Set<string> = new Set(),
): number => {
  const blocked = (coord: string) =>
    board.misses.has(coord) || board.sunkCells.has(coord) || excluded.has(coord);
  let hL = 0, hR = 0, vU = 0, vD = 0;
  for (let nx = x - 1; nx >= 0 && !blocked(`${nx},${y}`); nx -= 1) hL += 1;
  for (let nx = x + 1; nx < BOARD_SIZE && !blocked(`${nx},${y}`); nx += 1) hR += 1;
  for (let ny = y - 1; ny >= 0 && !blocked(`${x},${ny}`); ny -= 1) vU += 1;
  for (let ny = y + 1; ny < BOARD_SIZE && !blocked(`${x},${ny}`); ny += 1) vD += 1;
  return Math.max(hL + 1 + hR, vU + 1 + vD);
};

/**
 * Validates if the remaining ships can physically account for all remaining unsunk hits
 * if a hypothetical placement is made.
 */
export const remainderIsValid = (
  board: Board,
  remainingWounds: Set<string>,
  remainingShips: string[],
  excluded: Set<string> = new Set(),
): boolean => {
  if (remainingWounds.size === 0) return true;
  if (remainingShips.length === 0) return false;

  const sizes = remainingShips.map(getShipSize);
  const maxSize = Math.max(...sizes);

  for (const w of remainingWounds) {
    const [wx, wy] = fromCoord(w);
    const run = maxRunThrough(board, wx, wy, excluded);
    if (!sizes.some((sz) => sz <= run)) return false;
  }

  const sat = getSaturationCount(remainingWounds, maxSize, board, remainingShips.length + 1);
  return sat <= remainingShips.length;
};
