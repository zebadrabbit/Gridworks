import * as PIXI from 'pixi.js';
import { BuildMenu } from './UI.js';

class Item {
    constructor(type, x, y, engine) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.engine = engine;
        this.currentConveyor = null;
        this.progress = 0; 
        this.targetPort = null; 
        this.sprite = new PIXI.Graphics();
        
        this.sprite.beginFill(0x00ffff);
        this.sprite.drawRect(-4, -4, 8, 8);
        this.sprite.endFill();
        this.sprite.shadowColor = 0x00ffff;
        this.sprite.shadowBlur = 10;
        
        this.sprite.x = x * engine.gridSize;
        this.sprite.y = y * engine.gridSize;
        this.engine.app.stage.addChild(this.sprite);
    }

    update() {
        if (this.currentConveyor) {
            this.progress += this.currentConveyor.speed * 0.01;
            if (this.progress >= 1) {
                this.progress = 1;
                const endX = this.currentConveyor.x + this.currentConveyor.length;
                const endY = this.currentConveyor.y;
                
                const port = this.engine.findPortAt(endX, endY);
                if (port) {
                    this.currentConveyor = null;
                    this.targetPort = port;
                } else {
                    this.progress = 1;
                }
            }
            this.sprite.x = this.currentConveyor.x * this.engine.gridSize + (this.currentConveyor.length * this.engine.gridSize * this.progress);
            this.sprite.y = this.currentConveyor.y * this.engine.gridSize;
        } else if (this.targetPort) {
            const dx = this.targetPort.x * this.engine.gridSize - this.sprite.x;
            const dy = this.targetPort.y * this.engine.gridSize - this.sprite.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 5) {
                this.sprite.x = this.targetPort.x * this.engine.gridSize;
                this.sprite.y = this.targetPort.y * this.engine.gridSize;
            } else {
                this.sprite.x += (dx / dist) * 2;
                this.sprite.y += (dy / dist) * 2;
            }
        }
    }
}

class Conveyor {
    constructor(x, y, engine) {
        this.x = x;
        this.y = y;
        this.engine = engine;
        this.sprite = new PIXI.Graphics();
        
        this.sprite.beginFill(0x333333);
        this.sprite.drawRect(0, 0, engine.gridSize, engine.gridSize);
        this.sprite.endFill();
        
        this.line = new PIXI.Graphics();
        this.line.lineStyle(3, 0x00ff00);
        this.line.moveTo(0, 0);
        this.line.lineTo(engine.gridSize, engine.gridSize);
        this.sprite.addChild(this.line);
        
        this.sprite.x = x * engine.gridSize;
        this.sprite.y = y * engine.gridSize;
        this.engine.app.stage.addChild(this.sprite);
        
        this.items = [];
        this.speed = 10;
        this.length = 1;
    }

    update() {
        const time = Date.now() * 0.005;
        this.line.clear();
        this.line.lineStyle(3, 0x00ff00);
        const offset = (time % 10) * (this.gridSize / 10);
        this.line.moveTo(offset, 0);
        this.line.lineTo(offset + this.gridSize, this.gridSize);

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.update();
            if (!item.currentConveyor) {
                this.items.splice(i, 1);
            }
        }
    }
}

class Building {
    constructor(type, x, y, engine) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.engine = engine;
        this.data = engine.buildingsData[type];
        this.sprite = new PIXI.Graphics();
        
        const w = this.data.dimensions.width * engine.gridSize;
        const h = this.data.dimensions.length * engine.gridSize;
        this.sprite.beginFill(0x222222);
        this.sprite.drawRect(0, 0, w, h);
        this.sprite.endFill();
        
        this.sprite.lineStyle(2, 0x444444);
        this.sprite.drawRect(0, 0, w, h);
        
        if (type.includes('smelter')) {
            this.sprite.beginFill(0xff4400, 0.3);
            this.sprite.drawRect(2, 2, w-4, h-4);
            this.sprite.endFill();
        } else if (type.includes('resource')) {
            this.sprite.beginFill(0x00ff00, 0.3);
            this.sprite.drawRect(2, 2, w-4, h-4);
            this.sprite.endFill();
        } else if (type.includes('storage')) {
            this.sprite.beginFill(0x0000ff, 0.3);
            this.sprite.drawRect(2, 2, w-4, h-4);
            this.sprite.endFill();
        }

        this.ports = [];
        if (this.data.ports) {
            if (this.data.ports.output) {
                this.data.ports.output.forEach(p => {
                    const port = new PIXI.Graphics();
                    port.beginFill(0x00ff00);
                    port.drawCircle(p.x * engine.gridSize, p.y * engine.gridSize, 6);
                    port.endFill();
                    port.lineStyle(2, 0xffffff);
                    port.interactive = true;
                    port.on('pointerdown', () => this.engine.handlePortClick(this, p));
                    this.sprite.addChild(port);
                    this.ports.push({x: p.x, y: p.y, type: 'output', sprite: port});
                });
            }
            if (this.data.ports.input) {
                this.data.ports.input.forEach(p => {
                    const port = new PIXI.Graphics();
                    port.beginFill(0xff0000);
                    port.drawCircle(p.x * engine.gridSize, p.y * engine.gridSize, 6);
                    port.endFill();
                    port.lineStyle(2, 0xffffff);
                    port.interactive = true;
                    port.on('pointerdown', () => this.engine.handlePortClick(this, p));
                    this.sprite.addChild(port);
                    this.ports.push({x: p.x, y: p.y, type: 'input', sprite: port});
                });
            }
        }

        this.sprite.x = x * engine.gridSize;
        this.sprite.y = y * engine.gridSize;
        this.engine.app.stage.addChild(this.sprite);
        
        this.productionTimer = 0;
        this.inventory = {};
        this.isPowered = false;
    }

    onPortClick(port) {
        this.engine.handlePortClick(this, port);
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

export class GameEngine {
    constructor(canvasElement) {
        this.app = new PIXI.Application({
            width: 800,
            height: 600,
            backgroundColor: 0x0a0a0a,
            antialias: true,
            resolution: window.devicePixelRatio,
        });
        canvasElement.appendChild(this.app.view);

        this.gridSize = 32;
        this.buildingsData = {};
        this.buildings = [];
        this.conveyors = [];
        this.items = [];
        this.recipes = {};
        this.itemsData = {};
        
        this.selectedPort = null;
        this.selectedBuilding = null;
        this.selectedType_global = null;

        // Camera System
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1.0,
            targetZoom: 1.0,
            speed: 15,
            minZoom: 0.5,
            maxZoom: 3.0
        };

        this.worldContainer = new PIXI.Container();
        this.app.stage.addChild(this.worldContainer);

        this.init();
    }

    async init() {
        const [bRes, rRes, iRes] = await Promise.all([
            fetch('http://localhost:5000/api/buildings'),
            fetch('http://localhost:5000/api/recipes'),
            fetch('http://localhost:5000/api/items')
        ]);
        
        this.buildingsData = await bRes.json();
        const recipesRaw = await rRes.json();
        const itemsRaw = await iRes.json();

        for (const r of recipesRaw) {
            this.recipes[r.machine_id] = r;
        }
        this.itemsData = itemsRaw;
        
        this.renderGrid();
        this.setupInteractions();
        
        new BuildMenu(this);
    }

    renderGrid() {
        const grid = new PIXI.Graphics();
        grid.lineStyle(1, 0x222222);
        for (let x = 0; x < 2000; x += this.gridSize) {
            grid.moveTo(x, 0);
            grid.lineTo(x, 2000);
        }
        for (let y = 0; y < 2000; y += this.gridSize) {
            grid.moveTo(0, y);
            grid.lineTo(2000, y);
        }
        this.worldContainer.addChild(grid);
    }

    setupInteractions() {
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;
        
        this.app.stage.on('wheel', (event) => {
            this.camera.targetZoom -= event.deltaY * 0.001;
            this.camera.targetZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.targetZoom));
        });

        this.app.stage.on('pointerdown', (event) => {
            const worldX = (event.data.global.x - this.app.screen.width / 2 - this.camera.x) / this.camera.zoom;
            const worldY = (event.data.global.y - this.app.screen.height / 2 - this.camera.y) / this.camera.zoom;
            
            const worldX_grid = Math.floor(worldX / this.gridSize);
            const worldY_grid = Math.floor(worldY / this.gridSize);
            
            const clickedBuilding = this.buildings.find(b => 
                worldX_grid >= b.x && worldX_grid < b.x + b.data.dimensions.width &&
                worldY_grid >= b.y && worldY_grid < b.y + b.data.dimensions.length
            );

            if (clickedBuilding) {
                this.selectedBuilding = clickedBuilding;
                console.log(`Selected: ${clickedBuilding.data.name}`);
            } else {
                if (this.selectedPort) {
                    this.completeConnection(worldX_grid, worldY_grid);
                } else if (this.selectedType_global) {
                    this.addBuilding(this.selectedType_global, worldX_grid, worldY_grid);
                    this.selectedType_global = null;
                }
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'w' || e.key === 'ArrowUp') this.camera.y -= this.camera.speed;
            if (e.key === 's' || e.key === 'ArrowDown') this.camera.y += this.camera.speed;
            if (e.key === 'a' || e.key === 'ArrowLeft') this.camera.x -= this.camera.speed;
            if (e.key === 'd' || e.key === 'ArrowRight') this.camera.x += this.camera.speed;
        });
    }

    addBuilding(type, x, y) {
        const footprint = [];
        for (let i = 0; i < this.buildingsData[type].dimensions.width; i++) {
            for (let j = 0; j < this.buildingsData[type].dimensions.length; j++) {
                footprint.push({x: x + i, y: y + j});
            }
        }

        const isOccupied = this.buildings.some(b => 
            footprint.some(p => 
                p.x >= b.x && p.x < b.x + b.data.dimensions.width &&
                p.y >= b.y && p.y < b.y + b.data.dimensions.length
            )
        );

        if (!isOccupied) {
            this.buildings.push(new Building(type, x, y, this));
        } else {
            console.log("Space occupied!");
        }
    }

    handlePortClick(building, port) {
        this.selectedPort = port;
        this.selectedBuilding = building;
        console.log(`Selected port: ${port.type} at ${port.x}, ${port.y}`);
    }

    findPortAt(x, y) {
        for (const b of this.buildings) {
            for (const p of b.ports) {
                if (p.x === x && p.y === y) return p;
            }
        }
        return null;
    }

    async completeConnection(x, y) {
        if (!this.selectedPort) return;

        const start = {x: this.selectedPort.x, y: this.selectedPort.y};
        const goal = {x: x, y: y};

        const obstacles = [];
        this.buildings.forEach(b => {
            for (let i = 0; i < b.data.dimensions.width; i++) {
                for (let j = 0; j < b.data.dimensions.length; j++) {
                    obstacles.push({x: b.x + i, y: b.y + j});
                }
            }
        });

        try {
            const response = await fetch('http://localhost:5000/api/path', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    start: [start.x, start.y],
                    goal: [goal.x, goal.y],
                    obstacles: obstacles
                })
            });
            const data = await response.json();
            
            if (data.path) {
                data.path.forEach(coord => {
                    this.conveyors.push(new Conveyor(coord[0], coord[1], this));
                });
            } else {
                console.log("No path found.");
            }
        } catch (e) {
            console.error("Pathfinding error:", e);
        }

        this.selectedPort = null;
        this.selectedBuilding = null;
    }

    spawnItem(type, x, y) {
        const item = new Item(type, x, y, this);
        this.items.push(item);
    }

    updatePower() {
        const powerSources = this.buildings.filter(b => b.type === 'battery');
        const visited = new Set();
        let queue = [...powerSources.map(s => ({x: s.x, y: s.y, building: s}))];

        while (queue.length > 0) {
            const {x, y, building} = queue.shift();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            
            building.isPowered = true;

            for (const b of this.buildings) {
                if (b === building) continue;
                if (b.type === 'power_wire') {
                    const dist = Math.sqrt(Math.pow(b.x - x, 2) + Math.pow(b.y - y, 2));
                    if (dist <= 1.5) {
                        queue.push({x: b.x, y: b.y, building: b});
                    }
                }
                for (const p of b.ports) {
                    if (p.type === 'power' && Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1) {
                        queue.push({x: b.x, y: b.y, building: b});
                    }
                }
            }
        }
    }

    tick() {
        this.updatePower();
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.1;

        this.worldContainer.x = this.camera.x;
        this.worldContainer.y = this.camera.y;
        this.worldContainer.scale.set(this.camera.zoom);

        this.buildings.forEach(b => b.update());
        this.conveyors.forEach(c => c.update());
        this.items.forEach(i => i.update());
    }
}
