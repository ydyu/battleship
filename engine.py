import random
from typing import List, Tuple, Dict, Set

# ==========================================
# 1. CONFIGURATION (Easy to Modify Shapes)
# ==========================================
# Grid size
BOARD_SIZE = 10

# Ship definitions: (Name, Size)
SHIPS = [
    ("Carrier", 5),
    ("Battleship", 4),
    ("Submarine", 3),
    ("Destroyer", 3),
    ("PatrolBoat", 2)
]

# Firing patterns defined as (dx, dy) relative to the target origin (0,0)
SHOT_PATTERNS: Dict[str, List[Tuple[int, int]]] = {
    "Carrier": [(0,0), (1,1), (-1,-1), (-1,1), (1,-1)], # The "X" pattern
    "Battleship": [(0,0), (1,0), (0,1), (1,1)],       # The 2x2 Block
    "Submarine": [(0,0), (1,0), (2,0)],               # 3-peg horizontal line
    "Destroyer": [(0,0), (0,1), (0,2)],               # 3-peg vertical line
    "PatrolBoat": [(0,0)]                             # Single peg
}

# ==========================================
# 2. CORE MECHANICS (Board & Constraints)
# ==========================================
class Board:
    def __init__(self, size: int = BOARD_SIZE):
        self.size = size
        # 0 = Empty, 1 = Ship present
        self.grid = [[0 for _ in range(size)] for _ in range(size)]
        # Track history: set of (x, y) coordinates already fired upon
        self.shots_fired: Set[Tuple[int, int]] = set()
        # Track hits received: set of (x, y) coordinates
        self.hits_received: Set[Tuple[int, int]] = set()
        # Track misses: set of (x, y) coordinates
        self.misses: Set[Tuple[int, int]] = set()
        # Track active ships: {ship_name: set_of_coordinates} (remaining)
        self.active_ships: Dict[str, Set[Tuple[int, int]]] = {}
        # Track initial ship layouts: {ship_name: set_of_coordinates} (all)
        self.ship_layouts: Dict[str, Set[Tuple[int, int]]] = {}
        # Track coordinates of ships that are fully sunk
        self.sunk_cells: Set[Tuple[int, int]] = set()
        
    def place_randomly(self, ships: List[Tuple[str, int]]):
        """Randomly places ships for the setup."""
        for name, length in ships:
            placed = False
            while not placed:
                x, y = random.randint(0, self.size - 1), random.randint(0, self.size - 1)
                horizontal = random.choice([True, False])
                coords = set()
                
                # Check constraints
                valid = True
                for i in range(length):
                    nx, ny = (x + i, y) if horizontal else (x, y + i)
                    if nx >= self.size or ny >= self.size or self.grid[nx][ny] == 1:
                        valid = False
                        break
                    coords.add((nx, ny))
                
                if valid:
                    for cx, cy in coords:
                        self.grid[cx][cy] = 1
                    self.active_ships[name] = set(coords)
                    self.ship_layouts[name] = set(coords)
                    placed = True

    def fire(self, target_x: int, target_y: int, pattern: List[Tuple[int, int]]) -> int:
        """Applies a shot pattern to the board. Returns the number of new hits."""
        hits_this_turn = 0
        
        for dx, dy in pattern:
            x, y = target_x + dx, target_y + dy
            
            # Constraint check: Ignore shots that fall off the edge of the map
            if 0 <= x < self.size and 0 <= y < self.size:
                if (x, y) not in self.shots_fired:
                    self.shots_fired.add((x, y))
                    if self.grid[x][y] == 1:
                        hits_this_turn += 1
                        self.hits_received.add((x, y))
                        self._process_damage(x, y)
                    else:
                        self.misses.add((x, y))
                        
        return hits_this_turn

    def _process_damage(self, x: int, y: int):
        """Removes hit coordinates from active ships to track sinkings."""
        for ship_name, coords in list(self.active_ships.items()):
            if (x, y) in coords:
                coords.remove((x, y))
                if not coords:
                    # Ship is sunk - add all its original coordinates to sunk_cells
                    self.sunk_cells.update(self.ship_layouts[ship_name])
                    del self.active_ships[ship_name] 
                break

    def is_game_over(self) -> bool:
        """Win condition check."""
        return len(self.active_ships) == 0

    def get_ship_symbol(self, x: int, y: int) -> str:
        """Returns the single-letter symbol for the ship at (x, y), or None."""
        for name, coords in self.ship_layouts.items():
            if (x, y) in coords:
                return name[0].upper()
        return None
