import unittest
import json
import os
from flask import Flask
from flask_cors import CORS
from utils.pathfinder import a_star

# Setup a dummy app for testing
app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


@app.route("/api/buildings")
def get_buildings():
    with open(os.path.join(DATA_DIR, "buildings.json"), "r") as f:
        return (json.load(f), 200)


@app.route("/api/path", methods=["POST"])
def get_path():
    from flask import request

    data = request.json
    start = tuple(data.get("start", (0, 0)))
    goal = tuple(data.get("goal", (10, 10)))
    obstacles = set(tuple(o) for o in data.get("obstacles", []))
    path = a_star(start, goal, obstacles, grid_size=(1000, 1000))
    return ({"path": path}, 200)


class TestGameLogic(unittest.TestCase):
    def setUp(self):
        self.buildings = json.load(open(os.path.join(DATA_DIR, "buildings.json")))

    def test_buildings_loaded(self):
        self.assertIn("smelter_basic", self.buildings["buildings"])
        self.assertIn("conveyor_mk1", self.buildings["buildings"])
        self.assertIn("storage_basic", self.buildings["buildings"])
        self.assertIn("refinery", self.buildings["buildings"])
        self.assertIn("fabricator", self.buildings["buildings"])
        self.assertIn("assembler", self.buildings["buildings"])
        self.assertIn("manufacturer", self.buildings["buildings"])

    def test_pathfinding_basic(self):
        # Test a simple straight path with no obstacles
        start = (0, 0)
        goal = (5, 0)
        obstacles = []
        path = a_star(start, goal, set(obstacles), grid_size=(10, 10))
        self.assertIsNotNone(path)
        self.assertEqual(path[-1], goal)

    def test_pathfinding_with_obstacle(self):
        # Test path around a wall
        start = (0, 0)
        goal = (2, 0)
        # Wall at (1,0)
        obstacles = [(1, 0)]
        path = a_star(start, goal, set(obstacles), grid_size=(5, 5))
        self.assertIsNotNone(path)
        self.assertNotIn((1, 0), path)
        self.assertEqual(path[-1], goal)

    def test_building_dimensions(self):
        smelter = self.buildings["buildings"]["smelter_basic"]
        self.assertEqual(smelter["dimensions"]["width"], 8)
        self.assertEqual(smelter["dimensions"]["length"], 8)

        refinery = self.buildings["buildings"]["refinery"]
        self.assertEqual(refinery["dimensions"]["width"], 12)
        self.assertEqual(refinery["dimensions"]["length"], 12)

        assembler = self.buildings["buildings"]["assembler"]
        self.assertEqual(assembler["dimensions"]["width"], 12)
        self.assertEqual(assembler["dimensions"]["length"], 12)


if __name__ == "__main__":
    unittest.main()
