from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
from utils.pathfinder import a_star

app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


@app.route("/api/buildings")
def get_buildings():
    with open(os.path.join(DATA_DIR, "buildings.json"), "r") as f:
        return jsonify(json.load(f))


@app.route("/api/recipes")
def get_recipes():
    with open(os.path.join(DATA_DIR, "recipes.json"), "r") as f:
        return jsonify(json.load(f))


@app.route("/api/items")
def get_items():
    with open(os.path.join(DATA_DIR, "items.json"), "r") as f:
        return jsonify(json.load(f))


@app.route("/api/path", methods=["POST"])
def get_path():
    data = request.json
    start = tuple(data.get("start", (0, 0)))
    goal = tuple(data.get("goal", (10, 10)))
    obstacles = data.get("obstacles", [])

    # Convert obstacles to a set of tuples for the pathfinder
    obstacle_set = set(tuple(o) for o in obstacles)

    path = a_star(start, goal, obstacle_set, grid_size=(1000, 1000))
    return jsonify({"path": path})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
