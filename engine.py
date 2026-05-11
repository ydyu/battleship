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
        # Track active ships: {ship_name: set_of_coordinates}
        self.active_ships: Dict[str, Set[Tuple[int, int]]] = {}
        
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
                    self.active_ships[name] = coords
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
                    del self.active_ships[ship_name] # Ship is sunk
                break

    def is_game_over(self) -> bool:
        """Win condition check."""
        return len(self.active_ships) == 0


# ==========================================
# 3. ALGORITHM / STRATEGY (The AI)
# ==========================================
class Agent:
    def __init__(self):
        # The agent keeps track of its own knowledge here
        self.known_hits: Set[Tuple[int, int]] = set()

    def choose_weapon(self, active_ships: List[str]) -> str:
        """Strategy for which ship to fire from."""
        # Simple rule: Always use the biggest weapon available
        for weapon in ["Carrier", "Battleship", "Submarine", "Destroyer", "PatrolBoat"]:
            if weapon in active_ships:
                return weapon
        return "PatrolBoat"

    def generate_target(self, board_size: int, history: Set[Tuple[int, int]]) -> Tuple[int, int]:
        """
        Strategy for WHERE to shoot. 
        """
        # Minimal implementation: Pure random hunt
        while True:
            x = random.randint(0, board_size - 1)
            y = random.randint(0, board_size - 1)
            # Prevent targeting the exact same center peg twice
            if (x, y) not in history: 
                return x, y
