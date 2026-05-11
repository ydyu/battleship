from engine import Board, Agent, SHIPS, SHOT_PATTERNS, BOARD_SIZE

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
