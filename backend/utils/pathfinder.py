import heapq


def a_star(start, goal, obstacles, grid_size=(100, 100)):
    """
    Standard A* Pathfinding.
    start: (x, y)
    goal: (x, y)
    obstacles: set of (x, y)
    grid_size: (max_x, max_y)
    """
    neighbors = [(0, 1), (0, -1), (1, 0), (-1, 0)]

    close_set = set()
    came_from = {}
    gscore = {start: 0}
    fscore = {start: heuristic(start, goal)}
    o_open_set = []

    heapq.heappush(o_open_set, (fscore[start], start))

    while o_open_set:
        current = heapq.heappop(o_open_set)[1]

        if current == goal:
            data = []
            while current in came_from:
                data.append(current)
                current = came_from[current]
            return data[::-1]

        close_set.add(current)
        for i, j in neighbors:
            neighbor = (current[0] + i, current[1] + j)

            if (
                0 <= neighbor[0] < grid_size[0]
                and 0 <= neighbor[1] < grid_size[1]
                and neighbor not in obstacles
                and neighbor not in close_set
            ):
                tentative_g_score = gscore[current] + 1

                if tentative_g_score < gscore.get(neighbor, float("inf")):
                    came_from[neighbor] = current
                    gscore[neighbor] = tentative_g_score
                    fscore[neighbor] = tentative_g_score + heuristic(neighbor, goal)
                    if neighbor not in o_open_set:
                        heapq.heappush(o_open_set, (fscore[neighbor], neighbor))
    return None


def heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


if __name__ == "__main__":
    # Example: Smelter at (0,0) output at (1,0)
    # Constructor at (5,0) input at (4,0)
    # Path should be (1,0) -> (2,0) -> (3,0) -> (4,0)
    start = (1, 0)
    goal = (4, 0)
    obstacles = set()  # Add building footprints here

    path = a_star(start, goal, obstacles)
    print(f"Path from {start} to {goal}: {path}")
