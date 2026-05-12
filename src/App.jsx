import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Target, Ship, RefreshCw, AlertCircle, Crosshair, Navigation, ChevronDown, ChevronUp, Trophy, Skull, Shield, RotateCw, Trash2, Dices, Radar, Bug, FastForward, Brain, Volume2, VolumeX } from 'lucide-react';

// ==========================================
// 1. CONFIGURATION
// ==========================================
const BOARD_SIZE = 10;

const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 3 },
  { name: "PatrolBoat", size: 2 }
];

const SHOT_PATTERNS = {
  "Carrier": [[0, 0], [1, 1], [-1, -1], [-1, 1], [1, -1]], 
  "Battleship": [[0, 0], [1, 0], [0, 1], [1, 1]],       
  "Submarine": [[0, 0], [1, 0], [2, 0]],               
  "Destroyer": [[0, 0], [0, 1], [0, 2]],               
  "PatrolBoat": [[0, 0]]                               
};

const MINI_ICONS = {
  "Carrier": { cols: 3, rows: 3, active: [0, 2, 4, 6, 8] },
  "Battleship": { cols: 2, rows: 2, active: [0, 1, 2, 3] },
  "Submarine": { cols: 3, rows: 1, active: [0, 1, 2] },
  "Destroyer": { cols: 1, rows: 3, active: [0, 1, 2] },
  "PatrolBoat": { cols: 1, rows: 1, active: [0] }
};

// ==========================================
// 2. SFX SYNTHESIZER (Web Audio API)
// ==========================================
let audioCtx = null;

const playSynth = (type) => {
  if (typeof window === 'undefined') return;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'miss') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'hit') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'sink') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.start(now);
    osc.stop(now + 0.6);
  } else if (type === 'start') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.setValueAtTime(400, now + 0.1);
    osc.frequency.setValueAtTime(500, now + 0.2);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'win') {
    // Ascending Arpeggio
    [300, 400, 500, 600].forEach((freq, i) => {
       const o = audioCtx.createOscillator();
       const g = audioCtx.createGain();
       o.type = 'sine';
       o.connect(g);
       g.connect(audioCtx.destination);
       o.frequency.value = freq;
       g.gain.setValueAtTime(0, now);
       g.gain.setValueAtTime(0.1, now + (i * 0.15));
       g.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.15) + 0.4);
       o.start(now + (i * 0.15));
       o.stop(now + (i * 0.15) + 0.4);
    });
  } else if (type === 'lose') {
    // Descending Arpeggio
    [300, 250, 200, 150].forEach((freq, i) => {
       const o = audioCtx.createOscillator();
       const g = audioCtx.createGain();
       o.type = 'sawtooth';
       o.connect(g);
       g.connect(audioCtx.destination);
       o.frequency.value = freq;
       g.gain.setValueAtTime(0, now);
       g.gain.setValueAtTime(0.15, now + (i * 0.3));
       g.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.3) + 0.5);
       o.start(now + (i * 0.3));
       o.stop(now + (i * 0.3) + 0.5);
    });
  } else if (type === 'draw') {
    // Oscillating neutral settlement (D, E, lowB, C)
    [294, 330, 247, 262].forEach((freq, i) => {
       const o = audioCtx.createOscillator();
       const g = audioCtx.createGain();
       o.type = 'triangle'; // Neutral waveform
       o.connect(g);
       g.connect(audioCtx.destination);
       o.frequency.value = freq;
       g.gain.setValueAtTime(0, now);
       g.gain.setValueAtTime(0.12, now + (i * 0.25));
       g.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.25) + 0.6);
       o.start(now + (i * 0.25));
       o.stop(now + (i * 0.25) + 0.6);
    });
  }
};

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================
const createEmptyBoard = () => ({
  grid: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0)),
  shotsFired: new Set(),
  hitsReceived: new Set(),
  misses: new Set(),
  activeShips: {},
  shipLayouts: {}, 
  sunkCells: new Set() 
});

const placeRandomly = () => {
  const board = createEmptyBoard();

  SHIPS.forEach(({ name, size }) => {
    let placed = false;
    while (!placed) {
      const x = Math.floor(Math.random() * BOARD_SIZE);
      const y = Math.floor(Math.random() * BOARD_SIZE);
      const horizontal = Math.random() > 0.5;

      let valid = true;
      const coords = [];

      for (let i = 0; i < size; i++) {
        const nx = horizontal ? x + i : x;
        const ny = horizontal ? y : y + i;

        if (nx >= BOARD_SIZE || ny >= BOARD_SIZE || board.grid[nx][ny] === 1) {
          valid = false;
          break;
        }
        coords.push(`${nx},${ny}`);
      }

      if (valid) {
        coords.forEach(c => {
          const [cx, cy] = c.split(',').map(Number);
          board.grid[cx][cy] = 1;
        });
        board.activeShips[name] = coords;
        board.shipLayouts[name] = coords;
        placed = true;
      }
    }
  });

  return board;
};

const cloneSet = (set) => new Set(set);
const cloneBoard = (board) => ({
  grid: board.grid.map(row => [...row]),
  shotsFired: cloneSet(board.shotsFired),
  hitsReceived: cloneSet(board.hitsReceived),
  misses: cloneSet(board.misses),
  activeShips: JSON.parse(JSON.stringify(board.activeShips)),
  shipLayouts: board.shipLayouts, 
  sunkCells: cloneSet(board.sunkCells)
});

const canTargetCell = (board, startX, startY, weapon) => {
  const pattern = SHOT_PATTERNS[weapon];
  return pattern.some(([dx, dy]) => {
    const nx = startX + dx;
    const ny = startY + dy;
    return nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && !board.shotsFired.has(`${nx},${ny}`);
  });
};

// --- ELEGANT PROBABILITY DENSITY MAP ---
const getHeatmap = (board, activeShipNames, unsunkHits, difficulty = 'expert') => {
  const heatmap = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
  let maxVal = 0;
  
  const isExpert = difficulty === 'expert';

  // Find the absolute largest ship still alive on the board
  const maxActiveSize = isExpert && activeShipNames.length > 0 
    ? Math.max(...activeShipNames.map(name => SHIPS.find(s => s.name === name).size)) 
    : 0;

  // 1. CRIME SCENE ANALYSIS (Expert Only)
  let maxCapacity = 0;
  if (isExpert && unsunkHits.size > 0) {
    unsunkHits.forEach(hitCoord => {
      const [hx, hy] = hitCoord.split(',').map(Number);
      
      let left = 0;
      for (let x = hx - 1; x >= 0; x--) {
        const c = `${x},${hy}`;
        if (board.misses.has(c) || board.sunkCells.has(c)) break;
        left++;
      }
      let right = 0;
      for (let x = hx + 1; x < BOARD_SIZE; x++) {
        const c = `${x},${hy}`;
        if (board.misses.has(c) || board.sunkCells.has(c)) break;
        right++;
      }
      maxCapacity = Math.max(maxCapacity, left + 1 + right);

      let up = 0;
      for (let y = hy - 1; y >= 0; y--) {
        const c = `${hx},${y}`;
        if (board.misses.has(c) || board.sunkCells.has(c)) break;
        up++;
      }
      let down = 0;
      for (let y = hy + 1; y < BOARD_SIZE; y++) {
        const c = `${hx},${y}`;
        if (board.misses.has(c) || board.sunkCells.has(c)) break;
        down++;
      }
      maxCapacity = Math.max(maxCapacity, up + 1 + down);
    });
  }

  // 2. DEDUCE THE VICTIM (Expert Only)
  let assumedWoundedShipName = null;
  if (isExpert && unsunkHits.size > 0) {
    const activeShipsSorted = activeShipNames
      .map(name => SHIPS.find(s => s.name === name))
      .sort((a, b) => b.size - a.size);
    const assumedShip = activeShipsSorted.find(s => s.size <= maxCapacity) || activeShipsSorted[activeShipsSorted.length - 1];
    assumedWoundedShipName = assumedShip.name;
  }

  // 3. GENERATE HEATMAP
  activeShipNames.forEach(shipName => {
    const size = SHIPS.find(s => s.name === shipName).size;
    
    // WEAPON ECONOMY AWARENESS:
    // If the ship is the biggest threat left, it gets full size*size weight.
    // If it's smaller, it's demoted to base weight 1 so the AI ignores it in open water.
    const baseThreat = isExpert 
      ? (size === maxActiveSize ? (size * size) : 1) 
      : 1;

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        
        // --- Horizontal Fit Check ---
        let validH = true;
        let overlapsH = 0;
        for (let i = 0; i < size; i++) {
          const nx = x + i;
          if (nx >= BOARD_SIZE) { validH = false; break; }
          const coord = `${nx},${y}`;
          if (board.misses.has(coord) || board.sunkCells.has(coord)) { validH = false; break; }
          if (unsunkHits.has(coord)) overlapsH++;
        }

        if (validH) {
          const isGhost = isExpert && (overlapsH === 0 && shipName === assumedWoundedShipName);
          
          if (!isGhost) {
            const weight = baseThreat * Math.pow(4, overlapsH);
            for (let i = 0; i < size; i++) {
              heatmap[x + i][y] += weight;
              maxVal = Math.max(maxVal, heatmap[x + i][y]);
            }
          }
        }

        // --- Vertical Fit Check ---
        if (size > 1) {
          let validV = true;
          let overlapsV = 0;
          for (let i = 0; i < size; i++) {
            const ny = y + i;
            if (ny >= BOARD_SIZE) { validV = false; break; }
            const coord = `${x},${ny}`;
            if (board.misses.has(coord) || board.sunkCells.has(coord)) { validV = false; break; }
            if (unsunkHits.has(coord)) overlapsV++;
          }

          if (validV) {
            const isGhost = isExpert && (overlapsV === 0 && shipName === assumedWoundedShipName);
            
            if (!isGhost) {
              const weight = baseThreat * Math.pow(4, overlapsV);
              for (let i = 0; i < size; i++) {
                heatmap[x][y + i] += weight;
                maxVal = Math.max(maxVal, heatmap[x][y + i]);
              }
            }
          }
        }

      }
    }
  });
  
  return { heatmap, maxVal };
};

// --- ACTION TARGETING SCORES ---
const getTargetingScores = (targetBoard, activeShipNames, weapon, difficulty) => {
  const unsunkHits = new Set([...targetBoard.hitsReceived].filter(c => !targetBoard.sunkCells.has(c)));
  const { heatmap: rawHeatmap } = getHeatmap(targetBoard, activeShipNames, unsunkHits, difficulty);
  
  let maxScore = -1;
  let bestMoves = [];

  const pattern = SHOT_PATTERNS[weapon];

  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (!canTargetCell(targetBoard, x, y, weapon)) continue;

      let score = 0;
      
      pattern.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
          const coord = `${nx},${ny}`;
          if (!targetBoard.shotsFired.has(coord)) {
            score += rawHeatmap[nx][ny];
          }
        }
      });

      // EXPERT Parity Check: Essential to avoid useless adjacent shots in open ocean
      if (difficulty === 'expert' && unsunkHits.size === 0) {
        if ((x + y) % 2 === 0) score *= 2; 
      }

      if (score > maxScore) {
        maxScore = score;
        bestMoves = [{ x, y, weapon }];
      } else if (score === maxScore) {
        bestMoves.push({ x, y, weapon });
      }
    }
  }

  return { maxVal: maxScore, bestMoves };
};

// ==========================================
// 4. SUB-COMPONENTS
// ==========================================

const DifficultyButton = ({ level, currentDifficulty, phase, onSelect }) => {
  const isSelected = currentDifficulty === level;
  const isDisabled = phase === 'battle';
  
  const baseClasses = "px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-bold uppercase rounded transition-all duration-300 whitespace-nowrap shrink-0 select-none";
  const cursorClass = isDisabled ? 'cursor-not-allowed' : 'cursor-pointer';
  
  let colorClasses = "";
  if (isDisabled) {
     colorClasses = isSelected ? "bg-slate-800 text-slate-500 ring-1 ring-inset ring-slate-700/50" : "text-slate-800";
  } else {
     colorClasses = isSelected ? "bg-cyan-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800";
  }

  return (
    <button
      aria-disabled={isDisabled}
      onClick={() => !isDisabled && onSelect(level)}
      className={`${baseClasses} ${cursorClass} ${colorClasses}`}
    >
      <span className="sm:hidden leading-none mt-[1px]">{level.substring(0, 3)}</span>
      <span className="hidden sm:inline leading-none mt-[1px]">{level}</span>
    </button>
  );
};

const GameHeader = ({ phase, difficulty, setDifficulty, showDebug, setShowDebug, soundEnabled, setSoundEnabled, resetGame, winner }) => (
  <div className="w-full max-w-5xl flex justify-between items-center mb-4 gap-2">
    <div className="flex items-center gap-1.5 shrink-0">
      <Target className="w-5 h-5 text-cyan-400" />
      <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Battleship</h1>
    </div>
    
    <div className="flex items-center gap-1 sm:gap-2">
      <div 
        className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 items-center shrink-0 transition-colors duration-300"
        title={phase === 'battle' ? "Difficulty locked during combat" : "Select AI Difficulty"}
      >
        <div className={`hidden sm:flex items-center justify-center px-1.5 transition-colors duration-300 ${phase === 'battle' ? 'text-slate-700' : 'text-slate-400'}`}>
          <Brain className="w-3.5 h-3.5" />
        </div>

        <div className="flex gap-0.5">
          {['novice', 'medium', 'expert'].map(level => (
            <DifficultyButton 
              key={level} 
              level={level} 
              currentDifficulty={difficulty} 
              phase={phase} 
              onSelect={setDifficulty} 
            />
          ))}
        </div>
      </div>

      <button 
        onClick={() => {
          if (!soundEnabled) playSynth('start'); // Prime the pump if turning on
          setSoundEnabled(s => !s);
        }}
        className={`p-1.5 sm:p-2 border rounded-lg transition-colors flex-shrink-0
          ${soundEnabled ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-500'}`}
        title="Toggle Sound Effects"
      >
        {soundEnabled ? <Volume2 className="w-4 h-4 sm:w-4 sm:h-4" /> : <VolumeX className="w-4 h-4 sm:w-4 sm:h-4" />}
      </button>

      <button 
        onClick={() => setShowDebug(d => !d)}
        className={`p-1.5 sm:p-2 border rounded-lg transition-colors flex-shrink-0
          ${showDebug ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'}`}
        title="Toggle Debug Heatmap"
      >
        <Bug className="w-4 h-4 sm:w-4 sm:h-4" />
      </button>
      
      <button 
        onClick={resetGame}
        className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-slate-300 flex-shrink-0"
        title="New Game"
      >
        <RefreshCw className={`w-4 h-4 sm:w-4 sm:h-4 ${(winner || phase === 'setup') ? '' : 'opacity-70'}`} />
      </button>
    </div>
  </div>
);

const MobileTabs = ({ activeTab, setActiveTab, phase, unseenHits, isScrubbing }) => (
  <div className="flex lg:hidden w-full max-w-[340px] mb-4 bg-slate-900 rounded-lg p-1 border border-slate-800">
    <button 
      onClick={() => setActiveTab('attack')}
      disabled={phase === 'setup'}
      className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-md transition-colors 
        ${phase === 'setup' ? 'opacity-30 cursor-not-allowed' : activeTab === 'attack' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
    >
      <Target className="w-4 h-4" /> Attack
    </button>
    <button 
      onClick={() => setActiveTab('defend')}
      className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-md transition-colors relative 
        ${activeTab === 'defend' ? (phase === 'setup' ? 'bg-slate-700 text-white shadow' : 'bg-emerald-600 text-white shadow') : 'text-slate-400 hover:text-slate-200'}`}
    >
      <Shield className="w-4 h-4" /> Defend
      {unseenHits > 0 && activeTab !== 'defend' && !isScrubbing && (
        <span className="absolute top-1 right-2 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full animate-bounce shadow-lg">
          {unseenHits}
        </span>
      )}
    </button>
  </div>
);

const FleetPanel = ({ 
  title, icon: Icon, shipsAlive, isInteractive, 
  selectedWeapon, onSelectWeapon, 
  isScrubbing, onReturnToPresent,
  children 
}) => {
  return (
    <div className="w-full max-w-[340px] sm:max-w-[400px] bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-col gap-3 relative">
      
      <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
        <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}</span>
        {isScrubbing ? (
          <button 
            onClick={onReturnToPresent} 
            className="text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-500/20 hover:bg-indigo-500/40 px-2 py-0.5 rounded transition-colors animate-pulse z-10"
          >
            Present <FastForward className="w-3 h-3" />
          </button>
        ) : isInteractive ? (
          <span>{selectedWeapon ? "Target Locked" : "Select Weapon"}</span>
        ) : (
          <span>Status</span>
        )}
      </div>
      
      <div className="flex overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 gap-2 snap-x scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {["Carrier", "Battleship", "Submarine", "Destroyer", "PatrolBoat"].map(ship => {
          const isActive = shipsAlive.includes(ship);
          const isSelected = isInteractive && selectedWeapon === ship;
          const iconConfig = MINI_ICONS[ship];
          
          return (
            <button
              key={ship}
              onClick={() => {
                if (isInteractive && isActive) onSelectWeapon(ship);
              }}
              disabled={!isInteractive || !isActive}
              className={`
                snap-start flex-shrink-0 sm:flex-shrink sm:flex-1 flex flex-col items-center justify-between p-2 rounded-lg border transition-all text-center gap-2 w-[68px] sm:w-auto max-w-[72px] h-[80px]
                ${!isActive ? 'opacity-30 cursor-not-allowed bg-slate-950 border-slate-800 grayscale' : 
                  isSelected ? 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500' : 
                  isInteractive ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600' :
                  'bg-slate-800 border-slate-700 cursor-default'}
              `}
            >
              <div className={`font-bold text-[10px] sm:text-xs leading-tight ${isSelected ? 'text-cyan-400' : 'text-slate-200'}`}>
                {ship.replace('Boat', '')}
              </div>
              
              <div 
                className="grid gap-[2px] bg-slate-950 p-1 rounded place-items-center" 
                style={{ gridTemplateColumns: `repeat(${iconConfig.cols}, min-content)` }}
              >
                {Array.from({length: iconConfig.cols * iconConfig.rows}).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-1.5 h-1.5 shrink-0 rounded-[1px] ${iconConfig.active.includes(i) ? (isSelected ? 'bg-cyan-400' : 'bg-slate-400') : 'bg-transparent'}`} 
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {children}
    </div>
  );
};

const SetupControlsPanel = ({ currentSetupShip, setupOrientation, setSetupOrientation, setPlayerBoard, setHoverCell }) => {
  return (
    <div className="w-full max-w-[340px] sm:max-w-[400px] mt-3 flex flex-col gap-2">
      
      <div className="flex items-center justify-between bg-slate-900 p-2 rounded-xl border border-slate-800 h-[60px]">
        {currentSetupShip ? (
          <div className="flex items-center gap-2 pl-2 flex-1">
            <span className="font-bold text-xs sm:text-sm text-cyan-400 w-[70px] leading-tight">
              {currentSetupShip.name}
            </span>
            <div className="flex-1 flex justify-center items-center h-full">
              <div className={`flex gap-0.5 transition-transform duration-300 ease-in-out ${setupOrientation === 'vertical' ? 'rotate-90' : ''}`}>
                {Array(currentSetupShip.size).fill(0).map((_, i) => (
                  <div key={i} className="w-3 h-2 sm:w-4 sm:h-2.5 rounded-[2px] bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="font-bold text-sm text-emerald-400 flex items-center justify-center w-full gap-2 h-full">
            <Shield className="w-5 h-5"/> All Ships Deployed!
          </div>
        )}
        
        <button 
          onClick={() => setSetupOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal')} 
          disabled={!currentSetupShip}
          className={`flex items-center justify-center gap-1.5 h-full px-3 ml-2 rounded-lg transition-all ${currentSetupShip ? 'bg-slate-800 hover:bg-slate-700 text-white active:scale-95' : 'bg-slate-900 text-slate-700'}`}
        >
          <RotateCw className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${setupOrientation === 'vertical' ? 'rotate-90' : ''}`} />
          <span className="text-xs sm:text-sm font-bold hidden sm:block">Rotate</span>
        </button>
      </div>

      <div className="flex gap-2 w-full mt-1">
        <button 
          onClick={() => setPlayerBoard(placeRandomly())} 
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors active:scale-95"
        >
          <Dices className="w-4 h-4"/> Randomize
        </button>
        <button 
          onClick={() => {
            setPlayerBoard(createEmptyBoard());
            setHoverCell(null);
          }} 
          className="flex-1 py-2.5 bg-slate-800 hover:bg-red-900/50 hover:border-red-800 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors active:scale-95"
        >
          <Trash2 className="w-4 h-4"/> Clear
        </button>
      </div>
    </div>
  );
};

const GameBoard = ({
  board,
  isEnemy,
  phase,
  turn,
  winner,
  isScrubbing,
  targetCell,
  selectedWeapon,
  showDebug,
  activeHeatmap,
  highlightCoords,
  hoverCell,
  currentSetupShip,
  setupOrientation,
  onCellClick,
  onCellMouseEnter,
  onCellMouseLeave
}) => {
  const isSetup = phase === 'setup';
  const cells = [];
  const hulls = [];

  let previewSet = new Set();
  if (!isSetup && isEnemy && turn === 'player' && targetCell && !isScrubbing) {
      const [hx, hy] = targetCell;
      const pattern = SHOT_PATTERNS[selectedWeapon];
      pattern.forEach(([dx, dy]) => {
        const x = hx + dx;
        const y = hy + dy;
        if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) previewSet.add(`${x},${y}`);
      });
  }

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const coord = `${x},${y}`;
      const isFired = board.shotsFired.has(coord);
      const isHit = board.hitsReceived.has(coord);
      const isSunk = board.sunkCells.has(coord);
      const isMiss = board.misses.has(coord);
      const isTargetable = !isSetup && isEnemy && turn === 'player' && phase === 'battle' && !isScrubbing && canTargetCell(board, x, y, selectedWeapon);
      
      const isPlayerHighlight = isEnemy && highlightCoords.includes(coord);
      const isAiHighlight = !isEnemy && highlightCoords.includes(coord);
      
      const heatVal = activeHeatmap ? activeHeatmap.heatmap[x][y] : 0;
      const maxHeat = activeHeatmap ? activeHeatmap.maxVal : 1;
      const heatRatio = maxHeat > 0 ? heatVal / maxHeat : 0;
      
      const displayScore = maxHeat > 0 ? Math.round(heatRatio * 100) : 0;

      let zIndex = "z-0";
      if (isHit || isSunk || isMiss || isPlayerHighlight || isAiHighlight || previewSet.has(coord)) {
        zIndex = "z-20";
      }

      let cellClasses = `aspect-square rounded-[2px] border flex items-center justify-center relative overflow-hidden transition-colors ${zIndex} `;
      
      if (isSetup && !isEnemy) cellClasses += " hover:bg-slate-700 cursor-pointer";
      if (isTargetable) cellClasses += " cursor-crosshair hover:border-cyan-400/50";

      if (isSunk) cellClasses += " bg-red-950 border-red-900";
      else if (isHit) cellClasses += " bg-red-500 border-red-600";
      else cellClasses += " bg-slate-800 border-slate-700/50";

      cells.push(
        <button 
          key={coord}
          style={{ gridColumn: x + 1, gridRow: y + 1 }} 
          onMouseEnter={() => isSetup && !isEnemy && onCellMouseEnter && onCellMouseEnter([x, y])}
          onMouseLeave={() => isSetup && !isEnemy && onCellMouseLeave && onCellMouseLeave()}
          onClick={() => onCellClick(x, y)}
          disabled={isScrubbing || (!isSetup && isEnemy && !canTargetCell(board, x, y, selectedWeapon)) || (isSetup && isEnemy)}
          className={cellClasses}
        >
          {isMiss && <div className="w-1.5 h-1.5 rounded-full bg-slate-400 pointer-events-none" />}
          
          {showDebug && heatVal > 0 && !isFired && (
            <div 
              className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center text-[9px] sm:text-[11px] font-black text-orange-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
              style={{ backgroundColor: `rgba(249, 115, 22, ${heatRatio * 0.35})` }}
            >
              {displayScore}
            </div>
          )}

          {isHit && !isSunk && <div className="absolute inset-0 flex items-center justify-center animate-pulse pointer-events-none"><Target className="w-1/2 h-1/2 text-white/90 drop-shadow-md" strokeWidth={3} /></div>}
          {isSunk && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Skull className="w-1/2 h-1/2 text-white/40 drop-shadow-md" strokeWidth={2} /></div>}

          {isPlayerHighlight && (
            <div className={`absolute inset-0 z-30 pointer-events-none ${
              isScrubbing 
                ? 'ring-2 ring-inset ring-cyan-400 bg-cyan-400/20 animate-pulse' 
                : 'border-2 border-dashed border-cyan-300 bg-cyan-400/15' 
            }`} />
          )}
          
          {isAiHighlight && (
            <div className="absolute inset-0 z-40 pointer-events-none ring-2 ring-inset ring-yellow-400 bg-yellow-400/20 animate-pulse" />
          )}

          {previewSet.has(coord) && (
            <div className={`absolute inset-0 z-50 pointer-events-none border-2 ${
              isFired
                ? 'border-slate-500/40 bg-transparent' 
                : (targetCell && targetCell[0] === x && targetCell[1] === y 
                  ? 'bg-cyan-300/50 border-cyan-200 shadow-[0_0_15px_rgba(103,232,249,0.8)] animate-pulse' 
                  : 'bg-cyan-500/30 border-cyan-400/80 animate-pulse')
            }`} />
          )}
        </button>
      );
    }
  }

  // --- HULL RENDERING ---
  Object.entries(board.shipLayouts).forEach(([shipName, coords]) => {
    const isSunk = !board.activeShips[shipName];
    const isVisible = !isEnemy || isSunk || winner !== null; 

    if (!isVisible) return;

    const xs = coords.map(c => parseInt(c.split(',')[0]));
    const ys = coords.map(c => parseInt(c.split(',')[1]));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    let hullStyle = "";
    if (isSunk) {
      hullStyle = "border-red-500/80 bg-red-500/20 shadow-[inset_0_0_15px_rgba(220,38,38,0.3)]";
    } else if (!isEnemy) {
      hullStyle = "border-emerald-500/60 bg-emerald-500/20 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)]";
    } else {
      hullStyle = "border-cyan-500/40 bg-cyan-500/10 shadow-[inset_0_0_15px_rgba(6,182,212,0.1)]";
    }

    hulls.push(
      <div
        key={`hull-${shipName}`}
        style={{
          gridColumn: `${minX + 1} / ${maxX + 2}`,
          gridRow: `${minY + 1} / ${maxY + 2}`
        }}
        className={`pointer-events-none z-30 m-[2px] rounded-full border-2 ${hullStyle} transition-all duration-500`}
      />
    );
  });

  if (isSetup && hoverCell && currentSetupShip && !isEnemy) {
    const [hx, hy] = hoverCell;
    let isValid = true;
    const coords = [];
    for (let i = 0; i < currentSetupShip.size; i++) {
      const nx = setupOrientation === 'horizontal' ? hx + i : hx;
      const ny = setupOrientation === 'horizontal' ? hy : hy + i;
      if (nx >= BOARD_SIZE || ny >= BOARD_SIZE || board.grid[nx][ny] === 1) {
        isValid = false;
      }
      coords.push(`${nx},${ny}`);
    }

    const rawMaxX = setupOrientation === 'horizontal' ? hx + currentSetupShip.size - 1 : hx;
    const rawMaxY = setupOrientation === 'horizontal' ? hy : hy + currentSetupShip.size - 1;
    const maxX = Math.min(rawMaxX, BOARD_SIZE - 1);
    const maxY = Math.min(rawMaxY, BOARD_SIZE - 1);
    const minX = hx;
    const minY = hy;

    hulls.push(
      <div
        key="preview-hull"
        style={{
          gridColumn: `${minX + 1} / ${maxX + 2}`,
          gridRow: `${minY + 1} / ${maxY + 2}`
        }}
        className={`pointer-events-none z-30 transition-all duration-75 border-2
          ${isValid 
            ? 'm-[2px] rounded-full border-dashed border-emerald-400 bg-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.4)]' 
            : 'm-0 rounded-[2px] border-red-500 bg-red-500/40 shadow-none'}
        `}
      />
    );
  }

  return (
    <div className={`grid grid-cols-10 gap-0.5 p-1 bg-slate-900 rounded-lg shadow-xl shadow-black/20 w-full mx-auto border border-slate-800 max-w-[340px] sm:max-w-[400px] relative`}>
      {cells}
      {hulls}
    </div>
  );
};

const CombatFeed = ({ 
  phase, turn, winner, isScrubbing, displayLog, 
  isFeedExpanded, setIsFeedExpanded, maxRound, currentRound, 
  handleSliderChange, logContainerRef, roundKeys, logsByRound, handleRoundTap 
}) => {
  return (
    <div className="w-full max-w-5xl mb-4 relative z-50">
       <div className={`w-full rounded-xl border shadow-lg transition-colors overflow-hidden flex flex-col ${
          winner === 'Draw' && !isScrubbing ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' :
          winner === 'Player' && !isScrubbing ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' :
          winner === 'AI' && !isScrubbing ? 'bg-red-500/20 border-red-500/50 text-red-400' :
          isScrubbing ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300' :
          displayLog?.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
          displayLog?.type === 'danger' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
          'bg-slate-800 border-slate-700 text-slate-300'
        }`}>
          
          {/* HEADER (Always Visible) */}
          <button 
            onClick={() => setIsFeedExpanded(!isFeedExpanded)}
            className="w-full px-3 py-2 sm:p-4 flex flex-col gap-1 text-left focus:outline-none focus:bg-white/5 transition-colors shrink-0"
          >
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-70 w-full">
              <span className="flex items-center gap-1.5">
                {phase === 'setup' ? <Ship className="w-3.5 h-3.5" /> : 
                 isScrubbing ? <FastForward className="w-3.5 h-3.5 rotate-180" /> :
                 turn === 'player' ? <Crosshair className="w-3.5 h-3.5 animate-pulse" /> : 
                 <AlertCircle className="w-3.5 h-3.5 animate-pulse" />}
                
                {isScrubbing ? 'Time Machine Active' :
                 winner === 'Draw' ? 'Mutual Destruction' :
                 winner ? 'Mission Complete' : 
                 phase === 'setup' ? 'Deployment Phase' : 
                 turn === 'player' ? 'Your Turn' : 'Enemy Turn'}
              </span>
              <span className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded hover:bg-black/40 transition-colors">
                Action Feed
                {isFeedExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </div>

            {winner && !isFeedExpanded && !isScrubbing && (
              <div className="font-black text-2xl sm:text-3xl mt-1 mb-1 tracking-widest flex items-center gap-2">
                {winner === 'Player' ? <Trophy className="w-6 h-6 text-yellow-400" /> : 
                 winner === 'Draw' ? <Shield className="w-6 h-6 text-yellow-500" /> :
                 <Skull className="w-6 h-6 text-red-500" />}
                {winner === 'Player' ? 'VICTORY!' : winner === 'Draw' ? 'DRAW!' : 'DEFEAT!'}
              </div>
            )}

            {!isFeedExpanded && (
              <div className="font-mono text-xs sm:text-sm mt-1 line-clamp-1 flex items-center gap-2">
                <span className="opacity-50">[{String(displayLog?.id || 0).padStart(3, '0')}]</span> {">"} {displayLog?.text}
              </div>
            )}
          </button>

          {/* EXPANDED LOGS (Scrollable portion, sits above slider when open) */}
          {isFeedExpanded && (
            <div className="relative px-1 pb-1 border-t border-black/20 bg-black/50 max-h-[25vh] sm:max-h-[35vh] overflow-y-auto flex flex-col pt-1 shrink" ref={logContainerRef}>
              {roundKeys.map((roundNum) => {
                const logs = logsByRound[roundNum];
                const isCurrentRound = currentRound === roundNum;
                
                const bgClass = isCurrentRound
                  ? 'bg-indigo-900/40 border-indigo-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]'
                  : (roundNum % 2 === 0 ? 'bg-black/20 border-transparent' : 'bg-transparent border-transparent');

                return (
                  <button 
                    key={roundNum} 
                    id={`log-round-${roundNum}`}
                    onClick={() => handleRoundTap(roundNum)}
                    className={`text-left px-3 py-2.5 transition-colors border-l-2 mb-0.5 rounded-r hover:bg-white/5 flex flex-col gap-1.5 ${bgClass}`}
                  >
                    <div className={`text-[9px] sm:text-[10px] font-black tracking-widest uppercase flex items-center gap-2 ${isCurrentRound ? 'text-indigo-300' : 'text-slate-500'}`}>
                      {roundNum === 0 ? 'Deployment Phase' : `Round ${roundNum}`}
                      {isCurrentRound && <FastForward className="w-3 h-3 rotate-180" />}
                    </div>

                    {logs.map(log => (
                       <div key={log.id} className={`flex items-start gap-2 font-mono text-xs sm:text-sm
                          ${log.type === 'success' ? 'text-emerald-400' :
                            log.type === 'danger' ? 'text-red-400' :
                            log.type === 'miss' ? 'text-slate-400' :
                            'text-slate-300'
                          }
                       `}>
                         <span className="opacity-50 text-[10px] mt-0.5 shrink-0 w-8">
                           [{String(log.id).padStart(3, '0')}]
                         </span>
                         <span>{log.text}</span>
                       </div>
                    ))}
                  </button>
                );
              })}
            </div>
          )}

          {/* TIME MACHINE SLIDER (Always pinned to bottom of this container if game started) */}
          {phase === 'battle' && maxRound > 0 && (
            <div className="w-full px-3 py-2 bg-black/40 border-t border-black/20 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 backdrop-blur-sm shrink-0">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <RotateCw className="w-3.5 h-3.5" /> Rewind
                </span>
                <span className="text-[10px] sm:text-xs font-mono text-indigo-300 sm:hidden">
                  Round {currentRound} / {maxRound}
                </span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={maxRound} 
                value={currentRound} 
                onChange={handleSliderChange}
                className="flex-1 accent-indigo-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[10px] sm:text-xs font-mono text-indigo-300 hidden sm:block whitespace-nowrap w-[100px] text-right">
                Round {currentRound} / {maxRound}
              </span>
            </div>
          )}

        </div>
    </div>
  );
};

// ==========================================
// 5. MAIN COMPONENT
// ==========================================
export default function App() {
  const [phase, setPhase] = useState('setup'); 
  const [difficulty, setDifficulty] = useState('expert'); 
  const [showDebug, setShowDebug] = useState(false); 
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Game States (The True Present)
  const [playerBoard, setPlayerBoard] = useState(placeRandomly);
  const [aiBoard, setAiBoard] = useState(placeRandomly);
  const [turn, setTurn] = useState('player'); 
  const [winner, setWinner] = useState(null);
  
  // Time Machine / History States
  const [initialPlayerBoard, setInitialPlayerBoard] = useState(null);
  const [initialAiBoard, setInitialAiBoard] = useState(null);
  const [history, setHistory] = useState([{ id: 0, text: "Welcome to Command. Deploy your fleet on the Defend grid.", type: "info", shooter: null, coords: [], round: 0 }]);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  // Setup / UI States
  const [setupOrientation, setSetupOrientation] = useState('horizontal');
  const [hoverCell, setHoverCell] = useState(null);
  const [selectedWeapon, setSelectedWeapon] = useState('Carrier');
  const [targetCell, setTargetCell] = useState(null);
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('defend'); 
  const [unseenHits, setUnseenHits] = useState(0);

  const logIdCounter = useRef(1);
  const roundRef = useRef(0); 
  const logContainerRef = useRef(null);
  const pendingAiWeapons = useRef([]); 

  const unplacedShips = SHIPS.filter(s => !playerBoard.activeShips[s.name]);
  const currentSetupShip = unplacedShips[0]; 

  const isScrubbing = playbackIndex < history.length - 1;
  const maxRound = history[history.length - 1]?.round || 0;
  const currentRound = history[playbackIndex]?.round || 0;

  // Append new moves to the END of history (Event Sourcing)
  const addHistory = useCallback((text, type = "info", shooter = null, coords = []) => {
    setHistory(prev => {
      const newHistory = [...prev, { id: logIdCounter.current++, text, type, shooter, coords, round: roundRef.current }];
      setPlaybackIndex(newHistory.length - 1); 
      return newHistory;
    });
  }, []);

  const resetGame = () => {
    setPlayerBoard(placeRandomly());
    setAiBoard(placeRandomly());
    setInitialPlayerBoard(null);
    setInitialAiBoard(null);
    setPhase('setup');
    setTurn('player');
    setSelectedWeapon('Carrier');
    setSetupOrientation('horizontal');
    setWinner(null);
    setTargetCell(null);
    setIsFeedExpanded(false);
    setUnseenHits(0);
    setActiveTab('defend');
    
    logIdCounter.current = 1;
    roundRef.current = 0;
    pendingAiWeapons.current = [];
    const initLog = [{ id: 0, text: "Welcome to Command. Deploy your fleet on the Defend grid.", type: "info", shooter: null, coords: [], round: 0 }];
    setHistory(initLog);
    setPlaybackIndex(0);
  };

  const startBattle = () => {
    if (soundEnabled) playSynth('start');
    setPhase('battle');
    setActiveTab('attack');
    setInitialPlayerBoard(cloneBoard(playerBoard));
    setInitialAiBoard(cloneBoard(aiBoard));
    addHistory("Fleet deployed. Engaging enemy forces!", "info");
  };

  useEffect(() => {
    if (phase === 'battle' && !isScrubbing) {
      const available = Object.keys(playerBoard.activeShips);
      if (available.length > 0 && !available.includes(selectedWeapon)) {
        setSelectedWeapon(available[0]);
        setTargetCell(null);
      }
    }
  }, [playerBoard.activeShips, selectedWeapon, phase, isScrubbing]);

  useEffect(() => {
    if (activeTab === 'defend' && !isScrubbing) setUnseenHits(0);
  }, [activeTab, isScrubbing]);

  // Sync expanded log scroll position to Time Machine Slider using internal container scrollTo
  useEffect(() => {
    if (isFeedExpanded && logContainerRef.current) {
      setTimeout(() => {
        const container = logContainerRef.current;
        const targetEl = container.querySelector(`#log-round-${currentRound}`);
        if (targetEl) {
          // Math to center the targeted log item inside the scrollable container
          const offsetTop = targetEl.offsetTop;
          const containerHalfHeight = container.clientHeight / 2;
          const targetHalfHeight = targetEl.clientHeight / 2;
          
          container.scrollTo({
            top: offsetTop - containerHalfHeight + targetHalfHeight,
            behavior: 'smooth'
          });
        }
      }, 50);
    }
  }, [currentRound, isFeedExpanded]);

  const handleFire = (targetBoard, startX, startY, pattern) => {
    const board = cloneBoard(targetBoard);
    let hitsThisTurn = 0;
    const impactCells = [];
    const sunkShips = [];

    pattern.forEach(([dx, dy]) => {
      const x = startX + dx;
      const y = startY + dy;
      const coord = `${x},${y}`;

      if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
        impactCells.push(coord);
        if (!board.shotsFired.has(coord)) {
          board.shotsFired.add(coord);

          if (board.grid[x][y] === 1) {
            hitsThisTurn++;
            board.hitsReceived.add(coord);

            Object.keys(board.activeShips).forEach(shipName => {
              board.activeShips[shipName] = board.activeShips[shipName].filter(c => c !== coord);
              if (board.activeShips[shipName].length === 0) {
                delete board.activeShips[shipName];
                board.shipLayouts[shipName].forEach(c => board.sunkCells.add(c));
                sunkShips.push(shipName);
              }
            });
          } else {
            board.misses.add(coord);
          }
        }
      }
    });

    return { newBoard: board, hits: hitsThisTurn, impactCells, sunkShips };
  };

  // ----------------------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------------------
  const handlePlayerBoardClick = (x, y) => {
    if (phase !== 'setup') return;

    const coord = `${x},${y}`;
    const isHit = playerBoard.hitsReceived.has(coord);
    const isShip = playerBoard.grid[x][y] === 1 && !isHit;

    if (isShip) {
      const shipName = Object.keys(playerBoard.activeShips).find(name => playerBoard.activeShips[name].includes(coord));
      if (shipName) {
        const newBoard = cloneBoard(playerBoard);
        newBoard.activeShips[shipName].forEach(c => {
          const [cx, cy] = c.split(',').map(Number);
          newBoard.grid[cx][cy] = 0;
        });
        delete newBoard.activeShips[shipName];
        delete newBoard.shipLayouts[shipName];
        setPlayerBoard(newBoard);
        setHoverCell(null);
      }
    } else if (currentSetupShip) {
      let valid = true;
      const coords = [];
      for (let i = 0; i < currentSetupShip.size; i++) {
        const nx = setupOrientation === 'horizontal' ? x + i : x;
        const ny = setupOrientation === 'horizontal' ? y : y + i;
        if (nx >= BOARD_SIZE || ny >= BOARD_SIZE || playerBoard.grid[nx][ny] === 1) {
          valid = false;
          break;
        }
        coords.push(`${nx},${ny}`);
      }
      if (valid) {
        const newBoard = cloneBoard(playerBoard);
        coords.forEach(c => {
          const [cx, cy] = c.split(',').map(Number);
          newBoard.grid[cx][cy] = 1;
        });
        newBoard.activeShips[currentSetupShip.name] = coords;
        newBoard.shipLayouts[currentSetupShip.name] = coords;
        setPlayerBoard(newBoard);
        setHoverCell(null);
      }
    }
  };

  const handleEnemyBoardClick = (x, y) => {
    if (phase === 'setup' || isScrubbing || turn !== 'player') return;

    const isTargetable = canTargetCell(aiBoard, x, y, selectedWeapon);

    if (targetCell && targetCell[0] === x && targetCell[1] === y) {
      executeFire();
    } else if (isTargetable) {
      setTargetCell([x, y]);
    }
  };

  const executeFire = () => {
    if (!targetCell || turn !== 'player' || phase !== 'battle' || isScrubbing) return;
    
    const [x, y] = targetCell;
    roundRef.current += 1; 

    // Store AI weapons available at this exact moment for simultaneous counter-fire
    pendingAiWeapons.current = Object.keys(aiBoard.activeShips);

    const pattern = SHOT_PATTERNS[selectedWeapon];
    const { newBoard, hits, impactCells, sunkShips } = handleFire(aiBoard, x, y, pattern);
    
    setAiBoard(newBoard);
    setTargetCell(null);

    if (hits > 0) addHistory(`💥 You scored ${hits} hit(s) with ${selectedWeapon}!`, "success", "player", impactCells);
    else addHistory(`💦 Your ${selectedWeapon} missed.`, "miss", "player", impactCells);

    sunkShips.forEach(ship => {
      addHistory(`💥 Enemy ${ship} destroyed!`, "success", "player", impactCells);
    });
    
    if (soundEnabled) {
      if (sunkShips.length > 0) playSynth('sink');
      else if (hits > 0) playSynth('hit');
      else playSynth('miss');
    }

    setTurn('ai');
  };

  // ----------------------------------------------------
  // AI TURN
  // ----------------------------------------------------
  useEffect(() => {
    if (turn === 'ai' && !winner && phase === 'battle' && !isScrubbing) {
      const timer = setTimeout(() => {
        
        // AI selects weapon based on what it had BEFORE the player's shot landed
        const aiWeapons = pendingAiWeapons.current.length > 0 ? pendingAiWeapons.current : Object.keys(aiBoard.activeShips);
        const largestWeapon = ["Carrier", "Battleship", "Submarine", "Destroyer", "PatrolBoat"].find(w => aiWeapons.includes(w)) || aiWeapons[0];
        
        let selectedMove = { x: 0, y: 0, weapon: largestWeapon };
        
        // Novice gets completely random moves. Medium and Expert use the Heatmap.
        if (difficulty === 'novice') {
            const validMoves = [];
            for (let x = 0; x < BOARD_SIZE; x++) {
              for (let y = 0; y < BOARD_SIZE; y++) {
                if (canTargetCell(playerBoard, x, y, largestWeapon)) validMoves.push({x, y});
              }
            }
            if (validMoves.length > 0) {
                const move = validMoves[Math.floor(Math.random() * validMoves.length)];
                selectedMove = { ...move, weapon: largestWeapon };
            }
        } else {
            const activePlayerShipNames = Object.keys(playerBoard.activeShips);
            const weaponsToTest = difficulty === 'expert' ? aiWeapons : [largestWeapon];
            
            let globalBestScore = -1;
            let globalBestMoves = [];

            for (const weapon of weaponsToTest) {
               const { maxVal, bestMoves } = getTargetingScores(playerBoard, activePlayerShipNames, weapon, difficulty);
               
               if (maxVal > globalBestScore) {
                 globalBestScore = maxVal;
                 globalBestMoves = bestMoves;
               } else if (maxVal === globalBestScore) {
                 globalBestMoves.push(...bestMoves);
               }
            }

            if (globalBestMoves.length > 0) {
               selectedMove = globalBestMoves[Math.floor(Math.random() * globalBestMoves.length)];
            } else {
               const x = Math.floor(Math.random() * BOARD_SIZE);
               const y = Math.floor(Math.random() * BOARD_SIZE);
               selectedMove = { x, y, weapon: largestWeapon };
            }
        }

        const pattern = SHOT_PATTERNS[selectedMove.weapon];
        const { newBoard: newPlayerBoard, hits, impactCells, sunkShips } = handleFire(playerBoard, selectedMove.x, selectedMove.y, pattern);
        
        setPlayerBoard(newPlayerBoard);

        if (hits > 0) {
          addHistory(`⚠️ Enemy scored ${hits} hit(s) using ${selectedMove.weapon}!`, "danger", "ai", impactCells);
          if (activeTab === 'attack') setUnseenHits(prev => prev + hits);
        } else {
          addHistory(`Enemy ${selectedMove.weapon} missed.`, "miss", "ai", impactCells);
        }

        sunkShips.forEach(ship => {
          addHistory(`🚨 CRITICAL: Your ${ship} was destroyed!`, "danger", "ai", impactCells);
        });

        // ==========================================
        // SIMULTANEOUS GAME OVER EVALUATION
        // ==========================================
        const playerDead = Object.keys(newPlayerBoard.activeShips).length === 0;
        const aiDead = Object.keys(aiBoard.activeShips).length === 0;

        if (playerDead && aiDead) {
          if (soundEnabled) playSynth('draw'); // Changed from lose to draw
          setWinner('Draw');
          setTurn('gameover');
          addHistory("MUTUAL DESTRUCTION: Both fleets are sunk. It's a draw!", "danger", null, []);
        } else if (playerDead) {
          if (soundEnabled) playSynth('lose');
          setWinner('AI');
          setTurn('gameover');
          addHistory("CRITICAL FAILURE: Your fleet was sunk! YOU LOSE!", "danger", null, []);
        } else if (aiDead) {
          if (soundEnabled) playSynth('win');
          setWinner('Player');
          setTurn('gameover');
          addHistory("MISSION ACCOMPLISHED: Enemy fleet destroyed! YOU WIN!", "success", null, []);
        } else {
          if (soundEnabled) {
            if (sunkShips.length > 0) playSynth('sink');
            else if (hits > 0) playSynth('hit');
            else playSynth('miss');
          }
          setTurn('player');
        }

      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [turn, winner, aiBoard.activeShips, playerBoard, addHistory, activeTab, difficulty, phase, isScrubbing, soundEnabled]);

  // ----------------------------------------------------
  // EVENT SOURCING: TIME MACHINE REPLAY LOGIC
  // ----------------------------------------------------
  const handleSliderChange = (e) => {
    const targetRound = Number(e.target.value);
    let targetIndex = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].round === targetRound) {
        targetIndex = history[i].id;
        break;
      }
    }
    setPlaybackIndex(targetIndex);
  };

  const handleRoundTap = (targetRound) => {
    let targetIndex = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].round === targetRound) {
        targetIndex = history[i].id;
        break;
      }
    }
    setPlaybackIndex(targetIndex);
  };

  const replayBoard = (initialBoard, fullHistory, targetIndex, isEnemyBoard) => {
    if (!initialBoard) return null;
    const board = cloneBoard(initialBoard);

    for (let i = 0; i <= targetIndex; i++) {
      const action = fullHistory[i];
      if (!action || !action.coords || action.coords.length === 0) continue;
      
      const shouldApply = isEnemyBoard ? action.shooter === 'player' : action.shooter === 'ai';
      
      if (shouldApply) {
        action.coords.forEach(coord => {
          const [x, y] = coord.split(',').map(Number);
          if (!board.shotsFired.has(coord)) {
            board.shotsFired.add(coord);
            if (board.grid[x][y] === 1) {
              board.hitsReceived.add(coord);
              Object.keys(board.activeShips).forEach(shipName => {
                board.activeShips[shipName] = board.activeShips[shipName].filter(c => c !== coord);
                if (board.activeShips[shipName].length === 0) {
                  delete board.activeShips[shipName];
                  board.shipLayouts[shipName].forEach(c => board.sunkCells.add(c));
                }
              });
            } else {
              board.misses.add(coord);
            }
          }
        });
      }
    }
    return board;
  };

  const displayPlayerBoard = useMemo(() => {
    if (phase === 'setup' || !isScrubbing) return playerBoard;
    return replayBoard(initialPlayerBoard, history, playbackIndex, false);
  }, [phase, isScrubbing, playbackIndex, history, playerBoard, initialPlayerBoard]);

  const displayAiBoard = useMemo(() => {
    if (phase === 'setup' || !isScrubbing) return aiBoard;
    return replayBoard(initialAiBoard, history, playbackIndex, true);
  }, [phase, isScrubbing, playbackIndex, history, aiBoard, initialAiBoard]);

  const logsByRound = useMemo(() => {
    const groups = {};
    history.forEach(log => {
      if (!groups[log.round]) groups[log.round] = [];
      groups[log.round].push(log);
    });
    return groups;
  }, [history]);
  
  const roundKeys = useMemo(() => Object.keys(logsByRound).map(Number).sort((a, b) => b - a), [logsByRound]);

  const activeLogsInView = useMemo(() => {
    if (!isScrubbing) {
       const latestRound = history[history.length - 1]?.round || 0;
       if (latestRound === 0) return [];
       return history.filter(log => log.round === latestRound);
    }
    return history.filter(log => log.round === currentRound && log.id <= playbackIndex);
  }, [isScrubbing, history, currentRound, playbackIndex]);

  const playerHighlightCoords = useMemo(() => {
    return activeLogsInView.filter(l => l.shooter === 'player').flatMap(l => l.coords);
  }, [activeLogsInView]);

  const aiHighlightCoords = useMemo(() => {
    return activeLogsInView.filter(l => l.shooter === 'ai').flatMap(l => l.coords);
  }, [activeLogsInView]);

  // ----------------------------------------------------
  // DEBUG HEATMAP CALCULATIONS
  // ----------------------------------------------------
  const playerBoardHeatmap = useMemo(() => {
    if (!showDebug || phase === 'setup') return null;
    const unsunkHits = new Set([...displayPlayerBoard.hitsReceived].filter(c => !displayPlayerBoard.sunkCells.has(c)));
    return getHeatmap(displayPlayerBoard, Object.keys(displayPlayerBoard.activeShips), unsunkHits, difficulty);
  }, [displayPlayerBoard, showDebug, phase, difficulty]);

  const enemyBoardHeatmap = useMemo(() => {
    if (!showDebug || phase === 'setup') return null;
    const unsunkHits = new Set([...displayAiBoard.hitsReceived].filter(c => !displayAiBoard.sunkCells.has(c)));
    return getHeatmap(displayAiBoard, Object.keys(displayAiBoard.activeShips), unsunkHits, difficulty);
  }, [displayAiBoard, showDebug, phase, difficulty]);

  // ----------------------------------------------------
  // DERIVED STATE
  // ----------------------------------------------------
  const activePlayerShipsAtTime = Object.keys(displayPlayerBoard.activeShips);
  const activeEnemyShipsAtTime = Object.keys(displayAiBoard.activeShips);
  const displayLog = history[playbackIndex];

  const getAccuracy = (board) => {
    if (board.shotsFired.size === 0) return 0;
    return Math.round((board.hitsReceived.size / board.shotsFired.size) * 100);
  };

  // ----------------------------------------------------
  // MAIN RENDER (Layout Skeleton)
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-2 sm:p-4 font-sans flex flex-col items-center">
      
      <GameHeader 
        phase={phase}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        showDebug={showDebug}
        setShowDebug={setShowDebug}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        resetGame={resetGame}
        winner={winner}
      />

      <CombatFeed 
        phase={phase}
        turn={turn}
        winner={winner}
        isScrubbing={isScrubbing}
        displayLog={displayLog}
        isFeedExpanded={isFeedExpanded}
        setIsFeedExpanded={setIsFeedExpanded}
        maxRound={maxRound}
        currentRound={currentRound}
        handleSliderChange={handleSliderChange}
        logContainerRef={logContainerRef}
        roundKeys={roundKeys}
        logsByRound={logsByRound}
        handleRoundTap={handleRoundTap}
      />

      {/* GLOBAL ACTION BUTTONS */}
      {(winner || phase === 'setup') && (
        <div className={`w-full max-w-5xl mb-4 flex justify-center transition-all ${isScrubbing ? 'hidden' : 'block'}`}>
          {winner ? (
            <button
              onClick={resetGame}
              className="w-full max-w-[340px] sm:max-w-[400px] lg:max-w-full py-3.5 sm:py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-black text-lg sm:text-xl uppercase tracking-widest transition-all duration-200 shadow-[0_0_20px_rgba(6,182,212,0.4)] animate-pulse"
            >
              Play Again
            </button>
          ) : (
            <button
              disabled={unplacedShips.length > 0}
              onClick={startBattle}
              className={`w-full max-w-[340px] sm:max-w-[400px] lg:max-w-full py-3.5 sm:py-4 rounded-xl font-black text-lg sm:text-xl uppercase tracking-widest transition-all duration-300 shadow-lg
                ${unplacedShips.length === 0 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-pulse cursor-pointer' 
                  : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'}`}
            >
              {unplacedShips.length === 0 ? "Start Battle" : `${unplacedShips.length} Ships Remaining`}
            </button>
          )}
        </div>
      )}

      <MobileTabs 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        phase={phase} 
        unseenHits={unseenHits} 
        isScrubbing={isScrubbing} 
      />

      {/* Main Game Layout */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6 lg:gap-10">
        
        {/* LEFT VIEW: Attack (Enemy Board + Player Arsenal) */}
        <div className={`${activeTab === 'attack' ? 'flex' : 'hidden'} lg:flex relative flex-col items-center flex-1 w-full gap-4`}>
          
          {phase === 'setup' && (
            <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl border border-slate-800 lg:-m-4 lg:p-4">
              <Radar className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
              <span className="text-slate-400 font-bold uppercase tracking-widest text-sm text-center px-4 leading-relaxed">
                Radar Offline<br/>
                <span className="text-slate-500 text-xs">Deploy fleet in "Defend" staging area</span>
              </span>
            </div>
          )}

          <div className="flex flex-col w-full items-center">
            <div className="flex justify-between items-end w-full max-w-[340px] sm:max-w-[400px] mb-2 px-1">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Navigation className="w-4 h-4 text-cyan-400" />
                Enemy Waters
              </h2>
              <span className="text-xs font-mono bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded">
                Accuracy: {getAccuracy(displayAiBoard)}%
              </span>
            </div>
            
            <GameBoard 
              board={displayAiBoard}
              isEnemy={true}
              phase={phase}
              turn={turn}
              winner={winner}
              isScrubbing={isScrubbing}
              targetCell={targetCell}
              selectedWeapon={selectedWeapon}
              showDebug={showDebug}
              activeHeatmap={enemyBoardHeatmap}
              highlightCoords={playerHighlightCoords}
              onCellClick={handleEnemyBoardClick}
            />
          </div>

          {phase !== 'setup' && (
            <FleetPanel 
              title="Player Arsenal" 
              icon={Ship} 
              shipsAlive={activePlayerShipsAtTime} 
              isInteractive={turn === 'player' && !winner && phase === 'battle' && !isScrubbing}
              selectedWeapon={selectedWeapon}
              onSelectWeapon={(s) => {
                setSelectedWeapon(s);
                setTargetCell(null);
              }}
              isScrubbing={isScrubbing}
              onReturnToPresent={() => setPlaybackIndex(history.length - 1)}
            >
              {!winner && (
                <button
                  onClick={executeFire}
                  disabled={!targetCell || turn !== 'player' || phase !== 'battle' || isScrubbing}
                  className={`w-full py-3 rounded-lg font-black text-lg tracking-widest uppercase transition-all duration-200 shadow-lg
                    ${!targetCell || turn !== 'player' || phase !== 'battle' || isScrubbing
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed border-b-4 border-slate-900' 
                      : 'bg-red-600 hover:bg-red-500 text-white border-b-4 border-red-800 active:border-b-0 active:translate-y-1 shadow-[0_0_20px_rgba(220,38,38,0.4)]'
                    }
                  `}
                >
                  {targetCell ? `FIRE!` : 'AIM FIRST'}
                </button>
              )}
            </FleetPanel>
          )}
        </div>

        {/* RIGHT VIEW: Defend (Player Board + Setup OR Enemy Arsenal) */}
        <div className={`${activeTab === 'defend' ? 'flex' : 'hidden'} lg:flex flex-col items-center flex-1 w-full gap-4`}>
          <div className="flex justify-between items-end w-full max-w-[340px] sm:max-w-[400px] mb-2 px-1">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-1.5">
              <Shield className={phase === 'setup' ? "w-4 h-4 text-slate-400" : "w-4 h-4 text-emerald-400"} />
              {phase === 'setup' ? "Staging Area" : "Your Fleet"}
            </h2>
            <span className={`text-[10px] sm:text-xs font-mono px-2 py-1 rounded ${phase === 'setup' ? 'bg-slate-800 text-slate-400' : 'bg-red-500/20 text-red-400'}`}>
              {phase === 'setup' ? `Deployed: ${activePlayerShipsAtTime.length}/5` : `Enemy Acc: ${getAccuracy(displayPlayerBoard)}%`}
            </span>
          </div>
          
          <GameBoard 
            board={displayPlayerBoard}
            isEnemy={false}
            phase={phase}
            turn={turn}
            winner={winner}
            isScrubbing={isScrubbing}
            selectedWeapon={selectedWeapon}
            showDebug={showDebug}
            activeHeatmap={playerBoardHeatmap}
            highlightCoords={aiHighlightCoords}
            hoverCell={hoverCell}
            currentSetupShip={currentSetupShip}
            setupOrientation={setupOrientation}
            onCellClick={handlePlayerBoardClick}
            onCellMouseEnter={(coords) => setHoverCell(coords)}
            onCellMouseLeave={() => setHoverCell(null)}
          />
          
          {phase === 'setup' ? (
            <SetupControlsPanel 
              currentSetupShip={currentSetupShip}
              setupOrientation={setupOrientation}
              setSetupOrientation={setSetupOrientation}
              setPlayerBoard={setPlayerBoard}
              setHoverCell={setHoverCell}
            />
          ) : (
            <FleetPanel 
              title="Enemy Fleet" 
              icon={AlertCircle} 
              shipsAlive={activeEnemyShipsAtTime} 
              isInteractive={false}
              selectedWeapon={null}
              isScrubbing={isScrubbing}
              onReturnToPresent={() => setPlaybackIndex(history.length - 1)}
            />
          )}

        </div>

      </div>
    </div>
  );
}
