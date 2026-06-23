import * as PIXI from 'pixi.js';

export class BuildMenu {
    constructor(engine) {
        this.engine = engine;
        this.selectedType = null;
        this.menu = new PIXI.Container();
        
        // Simple UI styling
        const title = new PIXI.Text('BUILD MENU', {
            style: {
                fill: '#ffffff',
                fontSize: 24,
                fontWeight: 'bold',
                dropShadow: true
            }
        });
        title.anchor.set(0, 0.5);
        title.x = 20;
        title.y = 20;
        this.menu.addChild(title);

        // Create buttons for each building type
        Object.keys(engine.buildingsData).forEach(type => {
            const btn = new PIXI.Text(engine.buildingsData[type].name, {
                style: {
                    fill: '#00ff00',
                    fontSize: 18,
                    padding: 10,
                    backgroundColor: 0x333333,
                    dropShadow: true
                }
            });
            btn.anchor.set(0, 0.5);
            btn.x = 20;
            btn.y = 60 + (Object.keys(engine.buildingsData).indexOf(type) * 30);
            btn.interactive = true;
            btn.on('pointerdown', () => {
                this.selectedType = type;
                this.engine.selectedType_global = type;
                console.log(`Selected for placement: ${type}`);
            });
            this.menu.addChild(btn);
        });

        this.engine.app.stage.addChild(this.menu);
    }
}
