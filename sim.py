import argparse
from engine import Board, SHIPS, SHOT_PATTERNS, BOARD_SIZE, BattleshipMatch
from ai import AI

# ==========================================
# 4. SIMULATION HARNESS (Independent Loop)
# ==========================================
class SimulationHarness:
    def __init__(self, iterations: int = 100, side_a_diff: str = 'expert', side_b_diff: str = 'expert'):
        self.iterations = iterations
        self.side_a_diff = side_a_diff
        self.side_b_diff = side_b_diff

    def run_single_game(self) -> tuple:
        """Runs one complete simultaneous-turn game and returns (winner, turns)."""
        match = BattleshipMatch()
        
        agent_a = AI(difficulty=self.side_a_diff)
        agent_b = AI(difficulty=self.side_b_diff)
        
        turns = 0
        while True:
            turns += 1
            
            # --- PHASE 1: PRE-FIRE EVALUATION (SIMULTANEOUS) ---
            active_a_start = list(match.board_a.active_ships.keys())
            active_b_start = list(match.board_b.active_ships.keys())
            
            # --- PHASE 2: TARGET SELECTION ---
            move_a = agent_a.select_move(match.board_b, active_a_start)
            move_b = agent_b.select_move(match.board_a, active_b_start)
            
            # --- PHASE 3: SIMULTANEOUS RESOLUTION ---
            match.resolve_turn(move_a, move_b)
            
            # --- PHASE 4: EVALUATION ---
            over_a, over_b = match.is_game_over()
            
            if over_a and over_b:
                return 'Draw', turns
            if over_b:
                return 'A', turns
            if over_a:
                return 'B', turns
            
            # Failsafe
            if turns > (BOARD_SIZE * BOARD_SIZE): 
                return 'Draw', turns

    def run_batch(self):
        """Executes the simulation loop and aggregates the metrics."""
        print(f"Simulation: {self.side_a_diff} (A) vs {self.side_b_diff} (B)")
        print(f"Mode: SIMULTANEOUS TURNS")
        print(f"Running {self.iterations} games...")
        
        wins_a = 0
        wins_b = 0
        draws = 0
        
        turns_a = []
        turns_b = []
        turns_draw = []
        
        for i in range(self.iterations):
            winner, turns = self.run_single_game()
            
            if winner == 'A':
                wins_a += 1
                turns_a.append(turns)
            elif winner == 'B':
                wins_b += 1
                turns_b.append(turns)
            else:
                draws += 1
                turns_draw.append(turns)
            
            if (i + 1) % (max(1, self.iterations // 10)) == 0:
                print(f" Progress: {i+1}/{self.iterations}...")
            
        print("\n" + "="*40)
        print("SIMULATION RESULTS")
        print("="*40)
        
        # --- Side A Report ---
        print(f"Side A ({self.side_a_diff.upper()}):")
        print(f"  Wins:      {wins_a} ({wins_a/self.iterations*100:.1f}%)")
        if turns_a:
            print(f"  Avg Turns: {sum(turns_a)/len(turns_a):.2f}")
            print(f"  Min/Max:   {min(turns_a)} / {max(turns_a)}")
        else:
            print(f"  Avg Turns: N/A")
            
        # --- Side B Report ---
        print(f"\nSide B ({self.side_b_diff.upper()}):")
        print(f"  Wins:      {wins_b} ({wins_b/self.iterations*100:.1f}%)")
        if turns_b:
            print(f"  Avg Turns: {sum(turns_b)/len(turns_b):.2f}")
            print(f"  Min/Max:   {min(turns_b)} / {max(turns_b)}")
        else:
            print(f"  Avg Turns: N/A")

        # --- Draw Report ---
        if draws > 0:
            print(f"\nDraws:       {draws} ({draws/self.iterations*100:.1f}%)")
            print(f"  Avg Turns: {sum(turns_draw)/len(turns_draw):.2f}")

        # --- Global Stats ---
        all_turns = turns_a + turns_b + turns_draw
        print("\n" + "-"*20)
        print(f"Global Average: {sum(all_turns)/len(all_turns):.2f} turns per game")
        print("="*40)

# ==========================================
# EXECUTION
# ==========================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Tactical Battleship Simulation Harness')
    parser.add_argument('--iter', type=int, default=100, help='Number of iterations (default: 100)')
    parser.add_argument('--sideA', type=str, default='expert', choices=['novice', 'medium', 'expert'], help='AI for Side A')
    parser.add_argument('--sideB', type=str, default='expert', choices=['novice', 'medium', 'expert'], help='AI for Side B')
    
    args = parser.parse_args()
    
    harness = SimulationHarness(iterations=args.iter, side_a_diff=args.sideA, side_b_diff=args.sideB)
    harness.run_batch()
