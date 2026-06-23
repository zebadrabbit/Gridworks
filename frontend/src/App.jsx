import React, { useEffect, useState } from 'react';
import { GameEngine } from './game/Engine';

function App() {
  const [engine, setEngine] = useState(null);
  const [selectedType, setSelectedType] = useState('smelter_basic');
  const [status, setStatus] = useState({ building: null, inventory: {} });

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gameEngine = new GameEngine(canvas);
    setEngine(gameEngine);

    // Update status every 100ms
    const interval = setInterval(() => {
      if (gameEngine.selectedBuilding) {
        setStatus({
          building: gameEngine.selectedBuilding.data.name,
          inventory: gameEngine.selectedBuilding.inventory,
        });
      } else {
        setStatus({ building: null, inventory: {} });
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const handleAddBuilding = (x, y) => {
    if (engine) engine.addBuilding(selectedType, x, y);
  };

  return (
    <div
      style={{
        background: '#1a1a1a',
        color: '#eee',
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: '250px',
          background: '#2a2a2a',
          padding: '20px',
          borderRight: '1px solid #444',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Gridworks</h1>

        <div>
          <h3 style={{ marginBottom: '10px' }}>Build</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => setSelectedType('smelter_basic')}
              style={{
                padding: '10px',
                background: selectedType === 'smelter_basic' ? '#444' : '#333',
                color: 'white',
                border: '1px solid #666',
                cursor: 'pointer',
              }}
            >
              Basic Smelter
            </button>
            <button
              onClick={() => setSelectedType('gatherer_basic')}
              style={{
                padding: '10px',
                background: selectedType === 'gatherer_basic' ? '#444' : '#333',
                color: 'white',
                border: '1px solid #666',
                cursor: 'pointer',
              }}
            >
              Basic Gatherer
            </button>
            <button
              onClick={() => setSelectedType('resource_node_iron')}
              style={{
                padding: '10px',
                background: selectedType === 'resource_node_iron' ? '#444' : '#333',
                color: 'white',
                border: '1px solid #666',
                cursor: 'pointer',
              }}
            >
              Iron Ore Node
            </button>
          </div>
        </div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid #444', paddingTop: '20px' }}>
          <h3>Status</h3>
          {status.building ? (
            <div>
              <p>Selected: {status.building}</p>
              <pre style={{ fontSize: '0.8rem' }}>{JSON.stringify(status.inventory, null, 2)}</pre>
            </div>
          ) : (
            <p>Select a building</p>
          )}
        </div>
      </div>

      {/* Game Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        {engine && <div style={{ width: '100%', height: '100%' }}>{engine.app.view}</div>}
      </div>
    </div>
  );
}

export default App;
