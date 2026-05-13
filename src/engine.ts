export const BOARD_SIZE = 10;

export type Orientation = 'horizontal' | 'vertical';
export type Coordinate = string;
export type PatternOffset = [number, number];

export interface ShipDefinition {
  name: string;
  size: number;
  shotPattern: PatternOffset[];
}

export interface Move {
  x: number;
  y: number;
  ship: string;
  pattern?: PatternOffset[];
}

export interface PlacementPreview {
  valid: boolean;
  coords: Coordinate[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface AttackResult {
  ship: string;
  origin: [number, number];
  impactCells: Coordinate[];
  hits: number;
  sunkShips: string[];
}

export interface BattleLogEvent {
  round: number;
  kind: 'attack' | 'sink' | 'outcome';
  actorId?: string;
  targetId?: string;
  ship?: string;
  origin?: [number, number];
  coords: Coordinate[];
  hits?: number;
  shipCells?: Coordinate[];
  winnerId?: string | 'draw';
}

export interface ReplayLogLike {
  kind?: string;
  targetId?: string | null;
  coords?: Coordinate[];
}

export interface TurnResolution {
  boardA: Board;
  boardB: Board;
  attackA: AttackResult;
  attackB: AttackResult;
  eventsA: BattleLogEvent[];
  eventsB: BattleLogEvent[];
  outcomeEvent: BattleLogEvent | null;
  winnerId: string | 'draw' | null;
  round: number;
}

export const SHIP_TYPES: ShipDefinition[] = [
  { name: 'Carrier', size: 5, shotPattern: [[0, 0], [1, 1], [-1, -1], [-1, 1], [1, -1]] },
  { name: 'Battleship', size: 4, shotPattern: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'Submarine', size: 3, shotPattern: [[0, 0], [1, 0], [2, 0]] },
  { name: 'Destroyer', size: 3, shotPattern: [[0, 0], [0, 1], [0, 2]] },
  { name: 'PatrolBoat', size: 2, shotPattern: [[0, 0]] },
];

export const SHIP_INDEX = Object.fromEntries(
  SHIP_TYPES.map((ship, index) => [ship.name, { ...ship, index }]),
) as Record<string, ShipDefinition & { index: number }>;

export const SHIP_NAMES = SHIP_TYPES.map(({ name }) => name);
export const SHIPS = SHIP_TYPES.map(({ name, size }) => ({ name, size }));
export const SHOT_PATTERNS = Object.fromEntries(
  SHIP_TYPES.map(({ name, shotPattern }) => [name, shotPattern]),
) as Record<string, PatternOffset[]>;

const toCoord = (x: number, y: number): Coordinate => `${x},${y}`;
const fromCoord = (coord: Coordinate): [number, number] => coord.split(',').map(Number) as [number, number];
const cloneShipMap = (shipMap: Record<string, Coordinate[]>): Record<string, Coordinate[]> =>
  Object.fromEntries(Object.entries(shipMap).map(([name, coords]) => [name, [...coords]]));

export class Board {
  size: number;

  grid: number[][];

  shotsFired: Set<Coordinate>;

  hitsReceived: Set<Coordinate>;

  misses: Set<Coordinate>;

  activeShips: Record<string, Coordinate[]>;

  shipLayouts: Record<string, Coordinate[]>;

  sunkCells: Set<Coordinate>;

  constructor(size: number = BOARD_SIZE) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(0));
    this.shotsFired = new Set();
    this.hitsReceived = new Set();
    this.misses = new Set();
    this.activeShips = {};
    this.shipLayouts = {};
    this.sunkCells = new Set();
  }

  clone(): Board {
    const board = new Board(this.size);
    board.grid = this.grid.map((row) => [...row]);
    board.shotsFired = new Set(this.shotsFired);
    board.hitsReceived = new Set(this.hitsReceived);
    board.misses = new Set(this.misses);
    board.activeShips = cloneShipMap(this.activeShips);
    board.shipLayouts = cloneShipMap(this.shipLayouts);
    board.sunkCells = new Set(this.sunkCells);
    return board;
  }

  getActiveShipNames(): string[] {
    return Object.keys(this.activeShips);
  }

  isGameOver(): boolean {
    return this.getActiveShipNames().length === 0;
  }

  getPlacementPreview(shipName: string, x: number, y: number, orientation: Orientation): PlacementPreview {
    const size = SHIP_INDEX[shipName]?.size ?? 0;
    const coords: Coordinate[] = [];
    let valid = true;

    for (let i = 0; i < size; i += 1) {
      const nx = orientation === 'horizontal' ? x + i : x;
      const ny = orientation === 'horizontal' ? y : y + i;

      if (nx >= this.size || ny >= this.size || this.grid[nx][ny] === 1) {
        valid = false;
      }

      coords.push(toCoord(nx, ny));
    }

    const rawMaxX = orientation === 'horizontal' ? x + size - 1 : x;
    const rawMaxY = orientation === 'horizontal' ? y : y + size - 1;

    return {
      valid,
      coords,
      minX: x,
      maxX: Math.min(rawMaxX, this.size - 1),
      minY: y,
      maxY: Math.min(rawMaxY, this.size - 1),
    };
  }

  placeShip(shipName: string, x: number, y: number, orientation: Orientation): boolean {
    const preview = this.getPlacementPreview(shipName, x, y, orientation);

    if (!preview.valid) {
      return false;
    }

    preview.coords.forEach((coord) => {
      const [cx, cy] = fromCoord(coord);
      this.grid[cx][cy] = 1;
    });

    this.activeShips[shipName] = [...preview.coords];
    this.shipLayouts[shipName] = [...preview.coords];
    return true;
  }

  removeShip(shipName: string): boolean {
    const coords = this.shipLayouts[shipName];

    if (!coords) {
      return false;
    }

    coords.forEach((coord) => {
      const [x, y] = fromCoord(coord);
      this.grid[x][y] = 0;
    });

    delete this.activeShips[shipName];
    delete this.shipLayouts[shipName];
    return true;
  }

  removeShipAt(x: number, y: number): string | null {
    const coord = toCoord(x, y);
    const shipName = this.getActiveShipNames().find((name) => this.activeShips[name].includes(coord));

    if (!shipName) {
      return null;
    }

    this.removeShip(shipName);
    return shipName;
  }

  canTargetCell(startX: number, startY: number, ship: string): boolean {
    const pattern = SHOT_PATTERNS[ship] ?? [];

    return pattern.some(([dx, dy]) => {
      const nx = startX + dx;
      const ny = startY + dy;

      return nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && !this.shotsFired.has(toCoord(nx, ny));
    });
  }

  fire(startX: number, startY: number, pattern: PatternOffset[], ship: string = 'Unknown'): AttackResult {
    let hits = 0;
    const impactCells: Coordinate[] = [];
    const sunkShips: string[] = [];

    pattern.forEach(([dx, dy]) => {
      const x = startX + dx;
      const y = startY + dy;

      if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
        return;
      }

      const coord = toCoord(x, y);
      impactCells.push(coord);

      if (this.shotsFired.has(coord)) {
        return;
      }

      this.shotsFired.add(coord);

      if (this.grid[x][y] !== 1) {
        this.misses.add(coord);
        return;
      }

      hits += 1;
      this.hitsReceived.add(coord);
      const sunkShip = this.processDamage(coord);

      if (sunkShip) {
        sunkShips.push(sunkShip);
      }
    });

    return { ship, origin: [startX, startY], impactCells, hits, sunkShips };
  }

  applyLoggedAttack(coords: Coordinate[]): void {
    coords.forEach((coord) => {
      if (this.shotsFired.has(coord)) {
        return;
      }

      this.shotsFired.add(coord);
      const [x, y] = fromCoord(coord);

      if (this.grid[x][y] !== 1) {
        this.misses.add(coord);
        return;
      }

      this.hitsReceived.add(coord);
      this.processDamage(coord);
    });
  }

  private processDamage(coord: Coordinate): string | null {
    for (const shipName of Object.keys(this.activeShips)) {
      if (!this.activeShips[shipName].includes(coord)) {
        continue;
      }

      this.activeShips[shipName] = this.activeShips[shipName].filter((cell) => cell !== coord);

      if (this.activeShips[shipName].length === 0) {
        delete this.activeShips[shipName];
        this.shipLayouts[shipName].forEach((cell) => this.sunkCells.add(cell));
        return shipName;
      }

      return null;
    }

    return null;
  }
}

const buildAttackEvents = (
  round: number,
  actorId: string,
  targetId: string,
  attack: AttackResult,
  targetBoard: Board,
): BattleLogEvent[] => {
  const events: BattleLogEvent[] = [
    {
      round,
      kind: 'attack',
      actorId,
      targetId,
      ship: attack.ship,
      origin: attack.origin,
      coords: attack.impactCells,
      hits: attack.hits,
    },
  ];

  attack.sunkShips.forEach((ship) => {
    events.push({
      round,
      kind: 'sink',
      actorId,
      targetId,
      ship,
      shipCells: [...(targetBoard.shipLayouts[ship] ?? [])],
      coords: [],
    });
  });

  return events;
};

const buildOutcomeEvent = (round: number, winnerId: string | 'draw' | null): BattleLogEvent | null => {
  if (!winnerId) {
    return null;
  }

  return {
    round,
    kind: 'outcome',
    winnerId,
    coords: [],
  };
};

export class BattleshipMatch {
  boardA: Board;

  boardB: Board;

  readonly initialBoardA: Board;

  readonly initialBoardB: Board;

  sideAId: string;

  sideBId: string;

  round: number = 0;

  winner: string | 'draw' | null = null;

  events: BattleLogEvent[] = [];

  constructor(boardA: Board, boardB: Board, sideAId: string = 'sideA', sideBId: string = 'sideB') {
    this.initialBoardA = boardA.clone();
    this.initialBoardB = boardB.clone();
    this.boardA = boardA.clone();
    this.boardB = boardB.clone();
    this.sideAId = sideAId;
    this.sideBId = sideBId;
  }

  get isGameOver(): boolean {
    return this.winner !== null;
  }

  resolveTurn(moveA: Move, moveB: Move): TurnResolution {
    this.round += 1;
    const patternA = moveA.pattern ?? SHOT_PATTERNS[moveA.ship] ?? [];
    const patternB = moveB.pattern ?? SHOT_PATTERNS[moveB.ship] ?? [];

    const attackA = this.boardB.fire(moveA.x, moveA.y, patternA, moveA.ship);
    const attackB = this.boardA.fire(moveB.x, moveB.y, patternB, moveB.ship);

    const sideADefeated = this.boardA.isGameOver();
    const sideBDefeated = this.boardB.isGameOver();

    let winnerId: string | 'draw' | null = null;
    if (sideADefeated && sideBDefeated) winnerId = 'draw';
    else if (sideBDefeated) winnerId = this.sideAId;
    else if (sideADefeated) winnerId = this.sideBId;
    if (winnerId) this.winner = winnerId;

    const eventsA = buildAttackEvents(this.round, this.sideAId, this.sideBId, attackA, this.boardB);
    const eventsB = buildAttackEvents(this.round, this.sideBId, this.sideAId, attackB, this.boardA);
    const outcomeEvent = buildOutcomeEvent(this.round, winnerId);
    this.events.push(...eventsA, ...eventsB, ...(outcomeEvent ? [outcomeEvent] : []));

    return {
      boardA: this.boardA.clone(),
      boardB: this.boardB.clone(),
      attackA,
      attackB,
      eventsA,
      eventsB,
      outcomeEvent,
      winnerId,
      round: this.round,
    };
  }

  boardAAt(eventIndex: number): Board {
    return BattleshipMatch.rebuildBoardState(this.initialBoardA, this.events, eventIndex, this.sideAId);
  }

  boardBAt(eventIndex: number): Board {
    return BattleshipMatch.rebuildBoardState(this.initialBoardB, this.events, eventIndex, this.sideBId);
  }

  static rebuildBoardState(
    initialBoard: Board,
    history: ReplayLogLike[],
    targetIndex: number,
    targetId: string,
  ): Board {
    const board = initialBoard.clone();

    for (let i = 0; i <= targetIndex; i += 1) {
      const entry = history[i];

      if (!entry || entry.kind !== 'attack' || entry.targetId !== targetId || !entry.coords?.length) {
        continue;
      }

      board.applyLoggedAttack(entry.coords);
    }

    return board;
  }
}

export const createEmptyBoard = (): Board => new Board();
export const cloneBoard = (board: Board): Board => board.clone();
export const canTargetCell = (board: Board, startX: number, startY: number, ship: string): boolean =>
  board.canTargetCell(startX, startY, ship);
export const handleFire = (targetBoard: Board, startX: number, startY: number, pattern: PatternOffset[]) => {
  const board = targetBoard.clone();
  const attack = board.fire(startX, startY, pattern);

  return {
    newBoard: board,
    hits: attack.hits,
    impactCells: attack.impactCells,
    sunkShips: attack.sunkShips,
  };
};
export const isBoardDefeated = (board: Board): boolean => board.isGameOver();
export const rebuildBoardState = BattleshipMatch.rebuildBoardState;
