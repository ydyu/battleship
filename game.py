import os
from engine import Board, Agent, SHIPS, SHOT_PATTERNS, BOARD_SIZE

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def render_board(player_board: Board, enemy_board: Board):
    """Displays the player's board and the tracking board for enemy shots."""
    # Header
    print("\n      PLAYER BOARD                   ENEMY BOARD")
    print("      (Your Ships)                  (Target Area)")
    header = "    " + " ".join([str(i) for i in range(BOARD_SIZE)])
    print(f"{header}        {header}")
    print("    " + "- " * BOARD_SIZE + "      " + "  " + "- " * BOARD_SIZE)
    
    for y in range(BOARD_SIZE):
        player_row = []
        for x in range(BOARD_SIZE):
            if (x, y) in player_board.hits_received:
                player_row.append("X")
            elif player_board.grid[x][y] == 1:
                player_row.append("S")
            elif (x, y) in player_board.misses:
                player_row.append("O")
            else:
                player_row.append("~")
        
        enemy_row = []
        for x in range(BOARD_SIZE):
            if (x, y) in enemy_board.hits_received:
                enemy_row.append("X")
            elif (x, y) in enemy_board.misses:
                enemy_row.append("O")
            else:
                enemy_row.append("~")
        
        y_str = str(y).ljust(2)
        print(f"{y_str} | {' '.join(player_row)} |      {y_str} | {' '.join(enemy_row)} |")
    
    print("    " + "- " * BOARD_SIZE + "      " + "  " + "- " * BOARD_SIZE)

def get_player_input(active_ships):
    """Prompts the player for ship choice and target coordinates."""
    print("\n--- YOUR TURN ---")
    print("Available Ships (Weapons):")
    for i, ship in enumerate(active_ships):
        print(f" {i}: {ship.ljust(12)} Pattern: {len(SHOT_PATTERNS[ship])} squares")
    
    ship_name = None
    while ship_name is None:
        try:
            choice = input(f"\nSelect ship to fire with (0-{len(active_ships)-1}): ")
            idx = int(choice)
            if 0 <= idx < len(active_ships):
                ship_name = active_ships[idx]
            else:
                print(f"Please enter a number between 0 and {len(active_ships)-1}.")
        except ValueError:
            print("Invalid input. Please enter a number.")

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

def main():
    print("Welcome to Tactical Battleship!")
    print("Each ship has a unique shot pattern. Protect your fleet to keep your options open!")
    input("\nPress Enter to begin...")

    player_board = Board()
    player_board.place_randomly(SHIPS)
    
    ai_board = Board()
    ai_board.place_randomly(SHIPS)
    
    ai_agent = Agent()
    
    while True:
        clear_screen()
        render_board(player_board, ai_board)
        
        # Check Win/Loss
        if ai_board.is_game_over():
            print("\n!!! VICTORY !!!")
            print("You have sunk the entire enemy fleet.")
            break
        if player_board.is_game_over():
            print("\n!!! DEFEAT !!!")
            print("Your fleet has been destroyed.")
            break
            
        # Player turn
        active_ships = sorted(list(player_board.active_ships.keys()))
        ship_name, (tx, ty) = get_player_input(active_ships)
        pattern = SHOT_PATTERNS[ship_name]
        
        hits = ai_board.fire(tx, ty, pattern)
        
        clear_screen()
        render_board(player_board, ai_board)
        print(f"\nResult: You fired {ship_name} at ({tx},{ty}).")
        if hits > 0:
            print(f"BOOM! {hits} hit(s) recorded!")
        else:
            print("Splash... All shots missed or hit dead water.")
        
        input("\nPress Enter for AI turn...")
        
        # AI turn
        if not ai_board.is_game_over():
            ai_active_ships = list(ai_board.active_ships.keys())
            ai_weapon = ai_agent.choose_weapon(ai_active_ships)
            ai_pattern = SHOT_PATTERNS[ai_weapon]
            atx, aty = ai_agent.generate_target(player_board.size, player_board.shots_fired)
            
            ai_hits = player_board.fire(atx, aty, ai_pattern)
            
            clear_screen()
            render_board(player_board, ai_board)
            print(f"\nAI TURN: The enemy fired {ai_weapon} at ({atx},{aty}).")
            if ai_hits > 0:
                print(f"DANGER! The enemy scored {ai_hits} hit(s) on your fleet!")
            else:
                print("The enemy missed.")
            
            input("\nPress Enter for your turn...")

if __name__ == "__main__":
    main()
