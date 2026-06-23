// Mock PIXI for Node.js testing
const PIXI = {
    Graphics: class {
        constructor() {
            this.sprite = {};
            this.x = 0;
            this.y = 0;
            this.addChild = () => {};
            this.beginFill = () => {};
            this.drawRect = () => {};
            this.endFill = () => {};
            this.lineStyle = () => {};
            this.moveTo = () => {};
            this.lineTo = () => {};
            this.clear = () => {};
            this.interactive = false;
            this.on = () => {};
        }
    },
    Application: class {
        constructor({width, height, backgroundColor, antialias, resolution}) {
            this.view = {};
            this.stage = { addChild: () => {} };
            this.ticker = { add: () => {} };
        }
    },
    Container: class {
        constructor() {
            this.children = [];
            this.addChild = (child) => this.children.push(child);
            this.x = 0;
            this.y = 0;
            this.scale = { set: () => {} };
        }
    }
};

// Import the engine (we'll need to adjust the import for Node)
// Since I can't easily do 'import' in a single file for this, 
// I'll just paste the Engine class here or assume it's available.
// For now, I'll write the test logic assuming the Engine is available.
