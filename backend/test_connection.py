from utils.pathfinder import a_star


def simulate_connection():
    # Building A: Smelter
    # Footprint: (0,0) to (7,7) [8x8 area]
    building_a_pos = (0, 0)
    building_a_footprint = set((x, y) for x in range(0, 8) for y in range(0, 8))
    # Port is just outside the footprint
    port_a = (8, 0)

    # Building B: Constructor
    # Footprint: (15,0) to (22,7) [8x8 area]
    building_b_pos = (15, 0)
    building_b_footprint = set((x, y) for x in range(15, 23) for y in range(0, 8))
    # Port is just outside the footprint
    port_b = (14, 0)

    # Obstacles are all occupied grid cells
    obstacles = building_a_footprint.union(building_b_footprint)

    print(f"Connecting Port A {port_a} to Port B {port_b}...")

    path = a_star(port_a, port_b, obstacles)

    if path:
        print(f"Success! Conveyor segments to place:")
        for i, coord in enumerate(path):
            print(f"  Segment {i+1}: {coord}")
    else:
        print("Failed to find a path. Check for collisions.")


if __name__ == "__main__":
    simulate_connection()
