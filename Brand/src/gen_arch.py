#!/usr/bin/env python3
"""Measure the Gridworks build and print it as JSON.

This is the brand pack's measurement pass. The architecture figure in the
README is not a diagram somebody drew and then forgot to update: it is a
rendering of what `src/sim.js` and `data/source/satisfactory_data.json`
actually contain right now. Add a milestone, rebuild, and the ladder in the
figure grows a rung.

The sim is *parsed*, not executed. `src/sim.js` is an ES module that imports
nothing but does export live closures (`ACHIEVEMENTS[].test`, `TUTORIAL[].goal`
predicates), and running a game's rules engine to draw its logo would be a
strange dependency to take on — a brand build should not need a JS runtime, and
on a machine without node this would simply stop working. So there is a small
tolerant reader for JS literals below. It understands objects, arrays, strings,
numbers and bare identifier keys, and it refuses anything it does not
understand rather than guessing.

    python3 gen_arch.py [path/to/repo] > arch.json
"""
import json
import os
import re
import sys


# --------------------------------------------------------------- JS literals
class Reader:
    """Just enough of a JS literal parser to read a `const X = <literal>;`.

    Deliberately narrow. If the sim starts putting an expression, a template
    string or a spread inside one of the tables read below, this raises and the
    build says so — which is the correct outcome. A parser that silently
    coerced whatever it found would let the figure drift from the source, and
    the figure's entire claim is that it cannot."""

    def __init__(self, s, i=0):
        self.s, self.i = s, i

    def ws(self):
        while self.i < len(self.s):
            c = self.s[self.i]
            if c in " \t\r\n":
                self.i += 1
            elif self.s.startswith("//", self.i):
                self.i = self.s.find("\n", self.i)
                if self.i < 0:
                    self.i = len(self.s)
            elif self.s.startswith("/*", self.i):
                self.i = self.s.find("*/", self.i) + 2
            else:
                return

    def value(self):
        self.ws()
        c = self.s[self.i]
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c in "\"'":
            return self.string()
        m = re.match(r"-?\d+(\.\d+)?(e-?\d+)?", self.s[self.i:])
        if m:
            self.i += m.end()
            t = m.group(0)
            return float(t) if ("." in t or "e" in t) else int(t)
        for lit, val in (("true", True), ("false", False), ("null", None)):
            if self.s.startswith(lit, self.i):
                self.i += len(lit)
                return val
        raise ValueError("unreadable JS value at %d: %r"
                         % (self.i, self.s[self.i:self.i + 40]))

    def string(self):
        q = self.s[self.i]
        self.i += 1
        out = []
        while self.s[self.i] != q:
            if self.s[self.i] == "\\":
                self.i += 1
                out.append({"n": "\n", "t": "\t"}.get(self.s[self.i], self.s[self.i]))
            else:
                out.append(self.s[self.i])
            self.i += 1
        self.i += 1
        return "".join(out)

    def key(self):
        self.ws()
        if self.s[self.i] in "\"'":
            return self.string()
        m = re.match(r"[A-Za-z_$][\w$]*", self.s[self.i:])
        if not m:
            raise ValueError("unreadable key at %d" % self.i)
        self.i += m.end()
        return m.group(0)

    def obj(self):
        self.i += 1        # {
        out = {}
        while True:
            self.ws()
            if self.s[self.i] == "}":
                self.i += 1
                return out
            k = self.key()
            self.ws()
            if self.s[self.i] != ":":
                raise ValueError("expected ':' after key %r" % k)
            self.i += 1
            out[k] = self.value()
            self.ws()
            if self.s[self.i] == ",":
                self.i += 1

    def arr(self):
        self.i += 1        # [
        out = []
        while True:
            self.ws()
            if self.s[self.i] == "]":
                self.i += 1
                return out
            out.append(self.value())
            self.ws()
            if self.s[self.i] == ",":
                self.i += 1


def const(src, name):
    """Read `export const NAME = <literal>` out of a source string."""
    m = re.search(r"export\s+const\s+%s\s*=\s*" % re.escape(name), src)
    if not m:
        raise KeyError("no `export const %s` in sim.js" % name)
    return Reader(src, m.end()).value()


def count_entries(src, name, key="id"):
    """Number of `key:` entries inside `export const NAME = [ ... ]`, for
    tables that hold closures and so cannot be read as literals."""
    m = re.search(r"export\s+const\s+%s\s*=\s*\[" % re.escape(name), src)
    if not m:
        return 0
    depth, i = 1, m.end()
    while i < len(src) and depth:
        if src[i] == "[":
            depth += 1
        elif src[i] == "]":
            depth -= 1
        i += 1
    return len(re.findall(r"\b%s\s*:" % re.escape(key), src[m.end():i]))


# ------------------------------------------------------------------ measure
def measure(repo):
    sim_path = os.path.join(repo, "src", "sim.js")
    data_path = os.path.join(repo, "data", "source", "satisfactory_data.json")
    src = open(sim_path, encoding="utf-8").read()
    data = json.load(open(data_path, encoding="utf-8"))

    milestones = const(src, "MILESTONES")
    phases = const(src, "ELEVATOR_PHASES")
    start = const(src, "START_UNLOCKED")

    def num(name):
        m = re.search(r"export\s+const\s+%s\s*=\s*(\d+)" % name, src)
        return int(m.group(1)) if m else None

    # Buildings the player can only reach by climbing the ladder.
    unlocked_by = []
    for i, ms in enumerate(milestones):
        unlocked_by.append({
            "name": ms["name"],
            "cost": ms.get("cost", {}),
            "buildings": ms.get("rewards", {}).get("buildings", []),
            "beltMark": ms.get("rewards", {}).get("beltMark"),
            "pipeMark": ms.get("rewards", {}).get("pipeMark"),
        })

    return {
        "world": {
            "tile": num("TILE"), "w": num("WORLD_W"), "h": num("WORLD_H"),
            "startRadius": num("START_RADIUS"),
        },
        "catalog": {
            "buildings": len(data["buildings"]),
            "miners": len(data["miners"]),
            "belts": len(data["belts"]),
            "pipes": len(data["pipes"]),
            "items": len(data["items"]),
            "fluids": len(data["fluids"]),
            "recipes": len(data["recipes"]),
            "resources": len(data["resources"]),
        },
        "startUnlocked": start,
        "milestones": unlocked_by,
        "phases": [{"name": p["name"], "cost": p.get("cost", {})} for p in phases],
        "totals": {
            "milestones": len(milestones),
            "phases": len(phases),
            # ACHIEVEMENTS is derived in the sim from exactly these two ladders,
            # so it is derived here the same way rather than counted separately.
            "achievements": len(milestones) + len(phases),
            "tutorial": count_entries(src, "TUTORIAL"),
            "startUnlocked": len(start),
            "unlockables": sum(len(m["buildings"]) for m in unlocked_by),
            "beltMarks": max([m["beltMark"] for m in unlocked_by if m["beltMark"]] or [0]),
            "pipeMarks": max([m["pipeMark"] for m in unlocked_by if m["pipeMark"]] or [0]),
        },
    }


if __name__ == "__main__":
    repo = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..")
    repo = os.path.abspath(repo)
    data = measure(repo)
    if not data["milestones"] or not data["catalog"]["recipes"]:
        sys.exit("measured nothing — is %s a Gridworks checkout?" % repo)
    print(json.dumps(data, indent=1))
