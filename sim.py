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
# You can easily swap these to test balance (e.g., changing an X to a straight line)
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
        # Track active ships: {ship_name: set_of_coordinates}
        self.active_ships: Dict[str, Set[Tuple[int, int]]] = {}
        
    def place_randomly(self, ships: List[Tuple[str, int]]):
        """Randomly places ships for the simulation setup."""
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
                        self._process_damage(x, y)
                        
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
        self.available_weapons = [name for name, _ in SHIPS]

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
        [!] Plug your Hunt/Target algorithms here.
        """
        # Minimal implementation: Pure random hunt
        while True:
            x = random.randint(0, board_size - 1)
            y = random.randint(0, board_size - 1)
            # Prevent targeting the exact same center peg twice
            if (x, y) not in history: 
                return x, y


# ==========================================
# 4. SIMULATION HARNESS (Independent Loop)
# ==========================================
class SimulationHarness:
    def __init__(self, iterations: int = 1000):
        self.iterations = iterations

    def run_single_game(self) -> int:
        """Runs one complete game and returns the number of turns it took."""
        board = Board()
        board.place_randomly(SHIPS)
        agent = Agent()
        
        turns = 0
        while not board.is_game_over():
            turns += 1
            
            # 1. Agent evaluates state and picks weapon
            active_ships = list(board.active_ships.keys())
            weapon_choice = agent.choose_weapon(active_ships)
            pattern = SHOT_PATTERNS[weapon_choice]
            
            # 2. Agent picks target coordinate
            tx, ty = agent.generate_target(board.size, board.shots_fired)
            
            # 3. Fire and record results
            hits = board.fire(tx, ty, pattern)
            
            # (Optional) Feed hit data back to agent for Target mode logic
            if hits > 0:
                agent.known_hits.add((tx, ty))
                
            # Failsafe for infinite loops during testing
            if turns > (BOARD_SIZE * BOARD_SIZE): 
                break
                
        return turns

    def run_batch(self):
        """Executes the simulation loop and aggregates the metrics."""
        print(f"Starting simulation of {self.iterations} games...")
        results = []
        
        for _ in range(self.iterations):
            turns_to_win = self.run_single_game()
            results.append(turns_to_win)
            
        avg_turns = sum(results) / len(results)
        min_turns = min(results)
        max_turns = max(results)
        
        print("--- Simulation Complete ---")
        print(f"Average Turns to Win: {avg_turns:.2f}")
        print(f"Fastest Game: {min_turns} turns")
        print(f"Longest Game: {max_turns} turns")

# ==========================================
# EXECUTION
# ==========================================
if __name__ == "__main__":
    harness = SimulationHarness(iterations=1000)
    harness.run_batch()

