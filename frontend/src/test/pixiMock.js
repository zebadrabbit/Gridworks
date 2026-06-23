// Minimal stand-in for pixi.js so engine logic can run headless under vitest.
// ponytail: covers only what Engine.js/UI.js touch; extend if new PIXI APIs get used.
export class Graphics {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.children = [];
    this.interactive = false;
  }
  addChild(child) {
    this.children.push(child);
    return child;
  }
  beginFill() {
    return this;
  }
  drawRect() {
    return this;
  }
  drawCircle() {
    return this;
  }
  endFill() {
    return this;
  }
  lineStyle() {
    return this;
  }
  moveTo() {
    return this;
  }
  lineTo() {
    return this;
  }
  clear() {
    return this;
  }
  on() {
    return this;
  }
}

export class Text extends Graphics {
  constructor(text, style) {
    super();
    this.text = text;
    this.style = style;
    this.anchor = { set: () => {} };
  }
}

export class Container {
  constructor() {
    this.children = [];
    this.x = 0;
    this.y = 0;
    this.scale = { set: () => {} };
  }
  addChild(child) {
    this.children.push(child);
    return child;
  }
}

export class Application {
  constructor() {
    this.view = {};
    this.stage = new Container();
    this.stage.eventMode = 'static';
    this.stage.hitArea = null;
    this.stage.on = () => {};
    this.screen = { width: 800, height: 600 };
    this.ticker = { add: () => {} };
  }
}
