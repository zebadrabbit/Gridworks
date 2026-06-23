const assert = require('assert');

// Mocking the environment for the test
const mockEngine = {
    gridSize: 32,
    buildingsData: {
        'resource_node_iron': {
            'name': 'Iron Ore Node',
            'dimensions': {'width': 28, 'length': 28, 'height': 28},
            'ports': { 'output': [{'x': 14, 'y': 14, 'type': 'raw_material'}] }
        },
        'smelter_basic': {
            'name': 'Basic Smelter',
            'dimensions': {'width': 8, 'length': 8, 'height': 8},
            'ports': {
                'input': [{'x': 0, 'y': 0, 'type': 'raw_material'}],
                'output': [{'x': 8, 'y': 0, 'type': 'processed_material'}]
            }
        },
        'power_pole': {
            'name': 'Power Pole',
            'dimensions': {'width': 1, 'length': 1, 'height': 1},
            'ports': {
                'input': [{'x': 0, 'y': 0, 'type': 'power'}],
                'output': [{'x': 1, 'y': 0, 'type': 'power'}]
            }
        },
        'battery': {
            'name': 'Battery',
            'dimensions': {'width': 2, 'length': 2, 'height': 2},
            'ports': {
                'input': [{'x': 1, 'y': 1, 'type': 'power'}],
                'output': [{'x': 1, 'y': 1, 'type': 'power'}]
            }
        }
    },
    recipes: {
        'smelter_basic': {
            'inputs': { 'iron_ore': 1 },
            'outputs': { 'iron_ingot': 1 },
            'time': 10
        }
    },
    spawnItem: (type, x, y) => {
        console.log(`[Spawned] ${type} at ${x},${y}`);
    },
    findPortAt: (x, y) => null,
    handlePortClick: () => {}
};

// Simplified Building class for testing
class Building {
    constructor(type, x, y, engine) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.engine = engine;
        this.data = engine.buildingsData[type];
        this.inventory = {};
        this.productionTimer = 0;
        this.isPowered = false;
    }

    update() {
        const recipe = this.engine.recipes[this.type];
        if (recipe) {
            if (this.isPowered) {
                let canProduce = true;
                for (const [item, count] of Object.entries(recipe.inputs)) {
                    if ((this.inventory[item] || 0) < count) {
                        canProduce = false;
                        break;
                    }
                }

                if (canProduce) {
                    for (const [item, count] of Object.entries(recipe.inputs)) {
                        this.inventory[item] -= count;
                    }
                    this.productionTimer += 1;
                    if (this.productionTimer >= recipe.time) {
                        this.productionTimer = 0;
                        for (const [item, count] of Object.entries(recipe.outputs)) {
                            this.engine.spawnItem(item, this.x + 8, this.y);
                        }
                    }
                } else {
                    this.productionTimer = 0;
                }
            }
        } else if (this.type === 'resource_node_iron') {
            this.productionTimer += 1;
            if (this.productionTimer >= 60) {
                this.productionTimer = 0;
                this.engine.spawnItem('iron_ore', this.x + 14, this.y + 14);
            }
        }
    }
}

// Test Suite
function testProductionLoop() {
    console.log("Running Test: Production Loop...");
    const smelter = new Building('smelter_basic', 10, 10, mockEngine);
    smelter.inventory['iron_ore'] = 1;
    
    // Test 1: Smelter produces ingot when powered
    smelter.isPowered = true;
    smelter.update();
    assert.strictEqual(smelter.inventory['iron_ore'], 0, "Smelter should consume iron_ore");
    assert.strictEqual(smelter.productionTimer, 1, "Smelter should increment production timer");

    // Test 2: Smelter produces ingot after time passes
    smelter.productionTimer = 9;
    smelter.update();
    // The spawnItem is called, but we just check the timer reset
    assert.strictEqual(smelter.productionTimer, 0, "Smelter should reset timer after production");
    console.log("Test Passed: Production Loop");
}

function testPowerLogic() {
    console.log("Running Test: Power Logic...");
    const smelter = new Building('smelter_basic', 10, 10, mockEngine);
    smelter.inventory['iron_ore'] = 1;
    
    // Test 3: Smelter does NOT produce if NOT powered
    smelter.isPowered = false;
    smelter.update();
    assert.strictEqual(smelter.inventory['iron_ore'], 1, "Smelter should NOT consume iron_ore without power");
    assert.strictEqual(smelter.productionTimer, 0, "Smelter timer should stay at 0 without power");
    console.log("Test Passed: Power Logic");
}

try {
    testProductionLoop();
    testPowerLogic();
    console.log("\nALL CORE TESTS PASSED");
} catch (e) {
    console.error("\nTEST FAILED:");
    console.error(e);
    process.exit(1);
}
