import random
from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Set
from engine import Board, SHIPS, SHOT_PATTERNS, BOARD_SIZE

# ==========================================
# 1. HEATMAP STRATEGIES
# ==========================================

class HeatmapStrategy(ABC):
    @abstractmethod
    def generate(self, board: Board, active_ship_names: List[str], unsunk_hits: Set[Tuple[int, int]]) -> Tuple[List[List[float]], float]:
        pass

class FlatHeatmap(HeatmapStrategy):
    """Uniform probability across the entire board (for Novice AI)."""
    def generate(self, board: Board, active_ship_names: List[str], unsunk_hits: Set[Tuple[int, int]]) -> Tuple[List[List[float]], float]:
        heatmap = [[1.0 for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        return heatmap, 1.0

class MediumHeatmap(HeatmapStrategy):
    """Standard density mapping based on remaining ship sizes."""
    def generate(self, board: Board, active_ship_names: List[str], unsunk_hits: Set[Tuple[int, int]]) -> Tuple[List[List[float]], float]:
        heatmap = [[0.0 for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        max_val = 0.0
        ship_info = {name: size for name, size in SHIPS}

        for ship_name in active_ship_names:
            size = ship_info[ship_name]
            base_threat = 1.0

            for y in range(BOARD_SIZE):
                for x in range(BOARD_SIZE):
                    # Horizontal Check
                    valid_h = True
                    overlaps_h = 0
                    for i in range(size):
                        nx = x + i
                        if nx >= BOARD_SIZE or (nx, y) in board.misses or (nx, y) in board.sunk_cells:
                            valid_h = False
                            break
                        if (nx, y) in unsunk_hits:
                            overlaps_h += 1
                    if valid_h:
                        weight = base_threat * (4 ** overlaps_h)
                        for i in range(size):
                            heatmap[x + i][y] += weight
                            max_val = max(max_val, heatmap[x + i][y])

                    # Vertical Check
                    if size > 1:
                        valid_v = True
                        overlaps_v = 0
                        for i in range(size):
                            ny = y + i
                            if ny >= BOARD_SIZE or (x, ny) in board.misses or (x, ny) in board.sunk_cells:
                                valid_v = False
                                break
                            if (x, ny) in unsunk_hits:
                                overlaps_v += 1
                        if valid_v:
                            weight = base_threat * (4 ** overlaps_v)
                            for i in range(size):
                                heatmap[x][y + i] += weight
                                max_val = max(max_val, heatmap[x][y + i])
        return heatmap, max_val

class ExpertHeatmap(HeatmapStrategy):
    """Original expert logic with complex Crime Scene Analysis."""
    def generate(self, board: Board, active_ship_names: List[str], unsunk_hits: Set[Tuple[int, int]]) -> Tuple[List[List[float]], float]:
        heatmap = [[0.0 for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        max_val = 0.0
        ship_info = {name: size for name, size in SHIPS}

        # 1. CRIME SCENE ANALYSIS
        max_capacity = 0
        if unsunk_hits:
            for hx, hy in unsunk_hits:
                left = 0
                for x in range(hx - 1, -1, -1):
                    if (x, hy) in board.misses or (x, hy) in board.sunk_cells: break
                    left += 1
                right = 0
                for x in range(hx + 1, BOARD_SIZE):
                    if (x, hy) in board.misses or (x, hy) in board.sunk_cells: break
                    right += 1
                max_capacity = max(max_capacity, left + 1 + right)
                up = 0
                for y in range(hy - 1, -1, -1):
                    if (hx, y) in board.misses or (hx, y) in board.sunk_cells: break
                    up += 1
                down = 0
                for y in range(hy + 1, BOARD_SIZE):
                    if (hx, y) in board.misses or (hx, y) in board.sunk_cells: break
                    down += 1
                max_capacity = max(max_capacity, up + 1 + down)

        # 2. DEDUCE THE VICTIM
        assumed_wounded_ship_name = None
        if unsunk_hits:
            active_ships_sorted = sorted(active_ship_names, key=lambda n: ship_info[n], reverse=True)
            for name in active_ships_sorted:
                if ship_info[name] <= max_capacity:
                    assumed_wounded_ship_name = name
                    break
            if not assumed_wounded_ship_name and active_ships_sorted:
                assumed_wounded_ship_name = active_ships_sorted[-1]

        # 3. GENERATE HEATMAP
        max_active_size = max(ship_info[n] for n in active_ship_names) if active_ship_names else 0
        for ship_name in active_ship_names:
            size = ship_info[ship_name]
            base_threat = float(size * size) if size == max_active_size else 1.0

            for y in range(BOARD_SIZE):
                for x in range(BOARD_SIZE):
                    # Horizontal Check
                    valid_h = True
                    overlaps_h = 0
                    for i in range(size):
                        nx = x + i
                        if nx >= BOARD_SIZE or (nx, y) in board.misses or (nx, y) in board.sunk_cells:
                            valid_h = False
                            break
                        if (nx, y) in unsunk_hits:
                            overlaps_h += 1
                    if valid_h:
                        is_ghost = (overlaps_h == 0 and ship_name == assumed_wounded_ship_name)
                        if not is_ghost:
                            weight = base_threat * (4 ** overlaps_h)
                            for i in range(size):
                                heatmap[x + i][y] += weight
                                max_val = max(max_val, heatmap[x + i][y])

                    # Vertical Check
                    if size > 1:
                        valid_v = True
                        overlaps_v = 0
                        for i in range(size):
                            ny = y + i
                            if ny >= BOARD_SIZE or (x, ny) in board.misses or (x, ny) in board.sunk_cells:
                                valid_v = False
                                break
                            if (x, ny) in unsunk_hits:
                                overlaps_v += 1
                        if valid_v:
                            is_ghost = (overlaps_v == 0 and ship_name == assumed_wounded_ship_name)
                            if not is_ghost:
                                weight = base_threat * (4 ** overlaps_v)
                                for i in range(size):
                                    heatmap[x][y + i] += weight
                                    max_val = max(max_val, heatmap[x][y + i])
        return heatmap, max_val

class ExperimentHeatmap(HeatmapStrategy):
    """Improved heatmap that balances scouting and hunting."""
    def generate(self, board: Board, active_ship_names: List[str], unsunk_hits: Set[Tuple[int, int]]) -> Tuple[List[List[float]], float]:
        heatmap = [[0.0 for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        max_val = 0.0
        ship_info = {name: size for name, size in SHIPS}

        max_active_size = max(ship_info[n] for n in active_ship_names) if active_ship_names else 0
        is_last_ship_wounded = len(active_ship_names) == 1 and len(unsunk_hits) > 0

        for ship_name in active_ship_names:
            size = ship_info[ship_name]
            is_biggest = (size == max_active_size)

            for y in range(BOARD_SIZE):
                for x in range(BOARD_SIZE):
                    # Horizontal Check
                    valid_h = True
                    overlaps_h = 0
                    for i in range(size):
                        nx = x + i
                        if nx >= BOARD_SIZE or (nx, y) in board.misses or (nx, y) in board.sunk_cells:
                            valid_h = False
                            break
                        if (nx, y) in unsunk_hits:
                            overlaps_h += 1
                    
                    if valid_h:
                        weight = 0.0
                        if overlaps_h > 0:
                            threat = 2.0 if is_biggest else 1.0
                            weight = threat * (4 ** overlaps_h)
                        else:
                            if not is_last_ship_wounded:
                                weight = 1.0 

                        if weight > 0:
                            for i in range(size):
                                heatmap[x + i][y] += weight
                                max_val = max(max_val, heatmap[x + i][y])

                    # Vertical Check
                    if size > 1:
                        valid_v = True
                        overlaps_v = 0
                        for i in range(size):
                            ny = y + i
                            if ny >= BOARD_SIZE or (x, ny) in board.misses or (x, ny) in board.sunk_cells:
                                valid_v = False
                                break
                            if (x, ny) in unsunk_hits:
                                overlaps_v += 1
                        
                        if valid_v:
                            weight = 0.0
                            if overlaps_v > 0:
                                threat = 2.0 if is_biggest else 1.0
                                weight = threat * (4 ** overlaps_v)
                            else:
                                if not is_last_ship_wounded:
                                    weight = 1.0 

                            if weight > 0:
                                for i in range(size):
                                    heatmap[x][y + i] += weight
                                    max_val = max(max_val, heatmap[x][y + i])
        return heatmap, max_val

# ==========================================
# 2. TARGETING STRATEGIES
# ==========================================

class TargetingStrategy(ABC):
    @abstractmethod
    def select_move(self, enemy_board: Board, my_active_ships: List[str], heatmap_strategy: HeatmapStrategy = None) -> Tuple[int, int, str]:
        pass

    def _choose_biggest_weapons(self, active_ships: List[str]) -> List[str]:
        """Identifies all available ships sharing the maximum size."""
        if not active_ships:
            return ["PatrolBoat"]
        ship_info = {name: size for name, size in SHIPS}
        max_size = max(ship_info[w] for w in active_ships if w in ship_info)
        return [w for w in active_ships if ship_info.get(w, 0) == max_size]

class HeatmapTargeting(TargetingStrategy):
    def __init__(self, use_parity_check: bool = False, test_all_weapons: bool = False):
        self.use_parity_check = use_parity_check
        self.test_all_weapons = test_all_weapons

    def select_move(self, enemy_board: Board, my_active_ships: List[str], heatmap_strategy: HeatmapStrategy = None) -> Tuple[int, int, str]:
        # Capture current unsunk hits for parity and evaluation
        unsunk_hits = enemy_board.hits_received - enemy_board.sunk_cells
        active_enemy_ships = list(enemy_board.active_ships.keys())
        
        # Generate the heatmap using the provided strategy
        raw_heatmap, _ = heatmap_strategy.generate(enemy_board, active_enemy_ships, unsunk_hits)
        
        # Determine which weapons to evaluate
        if self.test_all_weapons:
            weapons_to_test = my_active_ships
        else:
            weapons_to_test = self._choose_biggest_weapons(my_active_ships)
        
        global_best_score = -1.0
        global_best_moves = []

        for weapon in weapons_to_test:
            pattern = SHOT_PATTERNS[weapon]
            for x in range(BOARD_SIZE):
                for y in range(BOARD_SIZE):
                    score = 0.0
                    can_hit = False
                    for dx, dy in pattern:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < BOARD_SIZE and 0 <= ny < BOARD_SIZE and (nx, ny) not in enemy_board.shots_fired:
                            score += raw_heatmap[nx][ny]
                            can_hit = True
                    
                    if not can_hit: continue

                    # Apply parity check bonus if enabled and in scouting mode
                    if self.use_parity_check and not unsunk_hits and (x + y) % 2 == 0:
                        score *= 2.0

                    if score > global_best_score:
                        global_best_score = score
                        global_best_moves = [(x, y, weapon)]
                    elif score == global_best_score:
                        global_best_moves.append((x, y, weapon))

        if global_best_moves:
            return random.choice(global_best_moves)
        else:
            # Native fallback: Pick any unfired spot with the biggest weapon
            fallback_weapon = weapons_to_test[0]
            while True:
                rx, ry = random.randint(0, BOARD_SIZE-1), random.randint(0, BOARD_SIZE-1)
                if (rx, ry) not in enemy_board.shots_fired:
                    return rx, ry, fallback_weapon

# ==========================================
# 3. AI VARIANTS (Composition)
# ==========================================

class AIVariant(ABC):
    @abstractmethod
    def select_move(self, enemy_board: Board, my_active_ships: List[str]) -> Tuple[int, int, str]:
        pass

class NoviceAI(AIVariant):
    """Pure random explorer using the standard heatmap pipeline."""
    def __init__(self):
        self.heatmap = FlatHeatmap()
        self.targeting = HeatmapTargeting(use_parity_check=False, test_all_weapons=False)
    def select_move(self, enemy_board: Board, my_active_ships: List[str]) -> Tuple[int, int, str]:
        return self.targeting.select_move(enemy_board, my_active_ships, self.heatmap)

class MediumAI(AIVariant):
    """Standard density hunter that sticks to its largest guns."""
    def __init__(self):
        self.heatmap = MediumHeatmap()
        self.targeting = HeatmapTargeting(use_parity_check=False, test_all_weapons=False)
    def select_move(self, enemy_board: Board, my_active_ships: List[str]) -> Tuple[int, int, str]:
        return self.targeting.select_move(enemy_board, my_active_ships, self.heatmap)

class ExpertAI(AIVariant):
    """Advanced tactician with weapon economy and crime scene analysis."""
    def __init__(self):
        self.heatmap = ExpertHeatmap()
        self.targeting = HeatmapTargeting(use_parity_check=True, test_all_weapons=True)
    def select_move(self, enemy_board: Board, my_active_ships: List[str]) -> Tuple[int, int, str]:
        return self.targeting.select_move(enemy_board, my_active_ships, self.heatmap)

class ExperimentAI(AIVariant):
    """The most balanced variant: scouts in the open, hunts when blood is found."""
    def __init__(self):
        self.heatmap = ExperimentHeatmap()
        self.targeting = HeatmapTargeting(use_parity_check=True, test_all_weapons=True)
    def select_move(self, enemy_board: Board, my_active_ships: List[str]) -> Tuple[int, int, str]:
        return self.targeting.select_move(enemy_board, my_active_ships, self.heatmap)

# Factory-like wrapper for backward compatibility or easy use
class AI(AIVariant):
    def __init__(self, difficulty: str = 'expert'):
        if difficulty == 'novice':
            self.variant = NoviceAI()
        elif difficulty == 'medium':
            self.variant = MediumAI()
        elif difficulty == 'experiment':
            self.variant = ExperimentAI()
        else:
            self.variant = ExpertAI()

    def select_move(self, enemy_board: Board, my_active_ships: List[str]) -> Tuple[int, int, str]:
        return self.variant.select_move(enemy_board, my_active_ships)
