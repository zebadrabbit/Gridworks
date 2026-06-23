import { describe, it, expect } from 'vitest';
import { Building } from './Engine.js';

const buildingsData = {
  smelter_basic: {
    name: 'Basic Smelter',
    dimensions: { width: 8, length: 8, height: 8 },
    ports: {
      input: [{ x: 0, y: 0, type: 'raw_material' }],
      output: [{ x: 8, y: 0, type: 'processed_material' }],
    },
  },
  resource_node_iron: {
    name: 'Iron Ore Node',
    dimensions: { width: 28, length: 28, height: 28 },
    ports: { output: [{ x: 14, y: 14, type: 'raw_material' }] },
  },
};

function makeEngine(recipes = {}) {
  const spawned = [];
  return {
    gridSize: 32,
    buildingsData,
    recipes,
    app: { stage: { addChild: () => {} } },
    spawnItem: (type, x, y) => spawned.push({ type, x, y }),
    spawned,
  };
}

describe('Building production loop', () => {
  const recipe = { inputs: { iron_ore: 1 }, outputs: { iron_ingot: 1 }, time: 10 };

  it('consumes inputs and advances the timer while powered', () => {
    const engine = makeEngine({ smelter_basic: recipe });
    const smelter = new Building('smelter_basic', 10, 10, engine);
    smelter.inventory.iron_ore = 1;
    smelter.isPowered = true;

    smelter.update();

    expect(smelter.inventory.iron_ore).toBe(0);
    expect(smelter.productionTimer).toBe(1);
  });

  it('spawns the output and resets the timer once production completes', () => {
    const engine = makeEngine({ smelter_basic: recipe });
    const smelter = new Building('smelter_basic', 10, 10, engine);
    smelter.inventory.iron_ore = 1;
    smelter.isPowered = true;
    smelter.productionTimer = 9;

    smelter.update();

    expect(smelter.productionTimer).toBe(0);
    expect(engine.spawned).toEqual([{ type: 'iron_ingot', x: 18, y: 10 }]);
  });

  it('does not consume inputs or produce while unpowered', () => {
    const engine = makeEngine({ smelter_basic: recipe });
    const smelter = new Building('smelter_basic', 10, 10, engine);
    smelter.inventory.iron_ore = 1;
    smelter.isPowered = false;

    smelter.update();

    expect(smelter.inventory.iron_ore).toBe(1);
    expect(smelter.productionTimer).toBe(0);
  });

  it('does not produce when an input is short', () => {
    const engine = makeEngine({ smelter_basic: recipe });
    const smelter = new Building('smelter_basic', 10, 10, engine);
    smelter.isPowered = true;

    smelter.update();

    expect(smelter.productionTimer).toBe(0);
  });
});

describe('Resource node', () => {
  it('spawns ore every 60 ticks regardless of power', () => {
    const engine = makeEngine();
    const node = new Building('resource_node_iron', 0, 0, engine);
    node.productionTimer = 59;

    node.update();

    expect(node.productionTimer).toBe(0);
    expect(engine.spawned).toEqual([{ type: 'iron_ore', x: 14, y: 14 }]);
  });
});
