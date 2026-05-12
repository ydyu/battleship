import os
from engine import Board, SHIPS, SHOT_PATTERNS, BOARD_SIZE
from ai import AI

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def show_patterns():
    """Displays visual hints for all ship shot patterns."""
    print("\n--- SHOT PATTERN REFERENCE ---")
    print("O = Origin (Your target), X = Hit area, . = Empty")
    
    for ship, pattern in SHOT_PATTERNS.items():
        print(f"\n{ship}:")
        # Find bounds of the pattern
        min_x = min(dx for dx, dy in pattern + [(0,0)])
        max_x = max(dx for dx, dy in pattern + [(0,0)])
        min_y = min(dy for dx, dy in pattern + [(0,0)])
        max_y = max(dy for dx, dy in pattern + [(0,0)])
        
        # Add a bit of padding
        for y in range(min_y, max_y + 1):
            row = []
            for x in range(min_x, max_x + 1):
                if (x, y) == (0, 0):
                    row.append("O")
                elif (x, y) in pattern:
                    row.append("X")
                else:
                    row.append(".")
            print(" " + " ".join(row))
    print("------------------------------")

class Game:
    def __init__(self):
        self.player_board = Board()
        self.player_board.place_randomly(SHIPS)
        
        self.ai_board = Board()
        self.ai_board.place_randomly(SHIPS)
        
        self.ai_agent = AI(difficulty='experiment')

    def render_board(self, reveal_enemy=False):
        """Displays the player's board and the tracking board for enemy shots."""
        # Header labels centered above the grids
        print("\n        PLAYER BOARD                     ENEMY BOARD")
        print("        (Your Ships)                    (Target Area)")
        
        header = "     " + " ".join([str(i) for i in range(BOARD_SIZE)])
        edge = "     " + "- " * BOARD_SIZE
        
        # Fixed alignment: Header and edge now align with the grid symbols
        print(f"{header}        {header}")
        print(f"{edge}       {edge}")
        
        for y in range(BOARD_SIZE):
            player_row = []
            for x in range(BOARD_SIZE):
                if (x, y) in self.player_board.sunk_cells:
                    player_row.append(self.player_board.get_ship_symbol(x, y).lower())
                elif (x, y) in self.player_board.hits_received:
                    player_row.append("*")  # Hit on active ship
                elif self.player_board.grid[x][y] == 1:
                    player_row.append(self.player_board.get_ship_symbol(x, y))  # Your active ship
                elif (x, y) in self.player_board.misses:
                    player_row.append(".")  # Miss
                else:
                    player_row.append("~")  # Water
            
            enemy_row = []
            for x in range(BOARD_SIZE):
                if (x, y) in self.ai_board.sunk_cells:
                    enemy_row.append(self.ai_board.get_ship_symbol(x, y).lower())
                elif (x, y) in self.ai_board.hits_received:
                    enemy_row.append("*")  # Hit on active enemy ship
                elif (x, y) in self.ai_board.misses:
                    enemy_row.append(".")  # Miss
                elif reveal_enemy and self.ai_board.grid[x][y] == 1:
                    enemy_row.append(self.ai_board.get_ship_symbol(x, y)) # Revealed ship
                else:
                    enemy_row.append("~")  # Water
            
            y_str = str(y).ljust(2)
            print(f"{y_str} | {' '.join(player_row)} |      {y_str} | {' '.join(enemy_row)} |")
        
        # Fixed alignment: Bottom edge now aligns with the grid symbols
        print(f"{edge}       {edge}")

        # --- FLEET STATUS SUMMARY ---
        print("\nFLEET STATUS:")
        max_ship_len = max(len(name) for name, _ in SHIPS)
        print(f"{'  YOUR SHIPS':<{max_ship_len + 12}} | {'  ENEMY SHIPS':<{max_ship_len + 12}}")
        
        for (name, _) in SHIPS:
            p_status = "ALIVE" if name in self.player_board.active_ships else "SUNK "
            e_status = "ALIVE" if name in self.ai_board.active_ships else "SUNK "
            
            p_label = f"{name:<{max_ship_len}} [{p_status}]"
            e_label = f"{name:<{max_ship_len}} [{e_status}]"
            print(f" {p_label}     |  {e_label}")
        print("\nLegend: C/B/S/D/P=Ship, *=Hit, c/b/s/d/p=SUNK, .=Miss, ~=Water")

    def get_player_input(self, active_ships):
        """Prompts the player for ship choice and target coordinates."""
        while True:
            print("\n--- YOUR TURN ---")
            print("Available Ships (Weapons):")
            for i, ship in enumerate(active_ships):
                print(f" {i}: {ship.ljust(12)} Pattern: {len(SHOT_PATTERNS[ship])} squares")
            print(" ?: Show visual pattern guide")
            
            choice = input(f"\nSelect ship to fire with (0-{len(active_ships)-1} or ?): ")
            
            if choice == "?":
                clear_screen()
                show_patterns()
                input("\nPress Enter to return to the game...")
                clear_screen()
                self.render_board()
                continue
                
            try:
                idx = int(choice)
                if 0 <= idx < len(active_ships):
                    ship_name = active_ships[idx]
                    break
                else:
                    print(f"Please enter a number between 0 and {len(active_ships)-1}.")
            except ValueError:
                print("Invalid input. Please enter a number or '?'.")

        target = None
        while target is None:
            try:
                coords = input("Enter target coordinates (x,y) e.g., 5,3: ")
                if "," not in coords:
                    print("Invalid format. Use x,y")
                    continue
                x, y = map(int, coords.split(","))
                if 0 <= x < BOARD_SIZE and 0 <= y < BOARD_SIZE:
                    target = (x, y)
                else:
                    print(f"Coordinates must be between 0 and {BOARD_SIZE-1}.")
            except ValueError:
                print("Invalid input. Use numbers for x and y.")
                
        return ship_name, target

    def play(self):
        print("Welcome to Tactical Battleship!")
        print("Each ship has a unique shot pattern. Protect your fleet to keep your options open!")
        input("\nPress Enter to begin...")

        while True:
            clear_screen()
            self.render_board()
            
            # --- PHASE 1: PRE-ROUND STATE ---
            # Capture available ships before any shots are fired
            player_active_start = list(self.player_board.active_ships.keys())
            ai_active_start = list(self.ai_board.active_ships.keys())

            # Check for existing game over (from previous round resolution)
            player_dead = len(player_active_start) == 0
            ai_dead = len(ai_active_start) == 0

            if player_dead or ai_dead:
                clear_screen()
                self.render_board(reveal_enemy=True)
                if player_dead and ai_dead:
                    print("\n!!! MUTUAL DESTRUCTION !!!")
                    print("Both fleets have been destroyed. It's a draw!")
                elif ai_dead:
                    print("\n!!! VICTORY !!!")
                    print("You have sunk the entire enemy fleet.")
                elif player_dead:
                    print("\n!!! DEFEAT !!!")
                    print("Your fleet has been destroyed.")
                break
                
            # --- PHASE 2: PLAYER SELECTION ---
            active_ships_sorted = sorted(player_active_start)
            ship_name, (tx, ty) = self.get_player_input(active_ships_sorted)
            pattern = SHOT_PATTERNS[ship_name]
            
            # --- PHASE 3: AI SELECTION (Simultaneous) ---
            # AI selects move based on pre-shot state
            atx, aty, ai_weapon = self.ai_agent.select_move(self.player_board, ai_active_start)
            ai_pattern = SHOT_PATTERNS[ai_weapon]

            # --- PHASE 4: SIMULTANEOUS RESOLUTION ---
            hits = self.ai_board.fire(tx, ty, pattern)
            ai_hits = self.player_board.fire(atx, aty, ai_pattern)
            
            clear_screen()
            self.render_board()
            
            # Show Player Result
            print(f"\nYOU FIRED: {ship_name} at ({tx},{ty}).")
            if hits > 0:
                print(f"BOOM! {hits} hit(s) recorded!")
            else:
                print("Splash... You missed.")
            
            # Show AI Result
            print(f"\nAI FIRED: {ai_weapon} at ({atx},{aty}).")
            if ai_hits > 0:
                print(f"DANGER! The enemy scored {ai_hits} hit(s) on your fleet!")
            else:
                print("The enemy missed.")
                
            input("\nPress Enter for next round...")

def main():
    game = Game()
    game.play()

if __name__ == "__main__":
    main()
