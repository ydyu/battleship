import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Target, Ship, RefreshCw, AlertCircle, Crosshair, Navigation, ChevronDown, ChevronUp, Trophy, Skull, Shield, RotateCw, Trash2, Dices, Radar, Bug, FastForward, Brain, Volume2, VolumeX } from 'lucide-react';
import { AI, AI_VARIANTS, placeFleetRandomly } from './ai';
import {
  BOARD_SIZE,
  SHIPS,
  SHOT_PATTERNS,
  cloneBoard,
  createEmptyBoard,
  BattleshipMatch,
} from './engine';

const buildMiniIcons = (shotPatterns) =>
  Object.fromEntries(
    Object.entries(shotPatterns).map(([shipName, pattern]) => {
      const xs = pattern.map(([x]) => x);
      const ys = pattern.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const cols = maxX - minX + 1;
      const rows = maxY - minY + 1;
      const active = pattern
        .map(([x, y]) => ((y - minY) * cols) + (x - minX))
        .sort((a, b) => a - b);

      return [shipName, { cols, rows, active }];
    })
  );

const MINI_ICONS = buildMiniIcons(SHOT_PATTERNS);

// ==========================================
// 2. SFX SYNTHESIZER (Web Audio API)
// ==========================================
let audioCtx = null;
let soundEffectsEnabled = true;

const playSynth = (type) => {
  if (typeof window === 'undefined') return;
  if (!soundEffectsEnabled) return;
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
// 2. SUB-COMPONENTS
// ==========================================

// 'experiment' is a placeholder — add to AI_VARIANTS when a new experimental AI is ready.
const DIFFICULTY_LEVELS = ['novice', 'medium', 'expert', 'experiment'];

export const DifficultyButton = ({ level, currentDifficulty, phase, onSelect }) => {
  const isSelected = currentDifficulty === level;
  const isDisabled = false;

  const SHORT_LABELS = { novice: 'nov', medium: 'med', expert: 'exp', experiment: 'xpr' };
  
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
      <span className="sm:hidden leading-none mt-[1px]">{SHORT_LABELS[level] ?? level.substring(0, 3)}</span>
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
        title="Select AI Difficulty"
      >
        <div className="hidden sm:flex items-center justify-center px-1.5 text-slate-400">
          <Brain className="w-3.5 h-3.5" />
        </div>

        <div className="flex gap-0.5">
          {DIFFICULTY_LEVELS.filter(level => AI_VARIANTS.includes(level)).map(level => (
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
          const nextEnabled = !soundEnabled;
          soundEffectsEnabled = nextEnabled;
          if (nextEnabled) playSynth('start'); // Prime the pump when turning sound back on
          setSoundEnabled(nextEnabled);
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
  children 
}) => {
  return (
    <div className="w-full max-w-[340px] sm:max-w-[400px] bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-col gap-3 relative">
      
      <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
        <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}</span>
        {isInteractive ? (
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

export const SetupControlsPanel = ({ currentSetupShip, setupOrientation, setSetupOrientation, setPlayerBoard, setHoverCell }) => {
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
          onClick={() => setPlayerBoard(placeFleetRandomly())} 
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

export const GameBoard = ({
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
      const isTargetable = !isSetup && isEnemy && turn === 'player' && phase === 'battle' && !isScrubbing && board.canTargetCell(x, y, selectedWeapon);
      
      const isPlayerHighlight = isEnemy && highlightCoords.includes(coord);
      const isAiHighlight = !isEnemy && highlightCoords.includes(coord);
      
      const heatRatio = activeHeatmap ? activeHeatmap.heatmap[x][y] : 0;
      const displayScore = Math.round(heatRatio * 100);

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
          disabled={isScrubbing || (!isSetup && isEnemy && !board.canTargetCell(x, y, selectedWeapon)) || (isSetup && isEnemy)}
          className={cellClasses}
        >
          {isMiss && <div className="w-1.5 h-1.5 rounded-full bg-slate-400 pointer-events-none" />}
          
          {showDebug && heatRatio > 0 && !isFired && (
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
    const preview = board.getPlacementPreview(currentSetupShip.name, hx, hy, setupOrientation);

    hulls.push(
      <div
        key="preview-hull"
        style={{
          gridColumn: `${preview.minX + 1} / ${preview.maxX + 2}`,
          gridRow: `${preview.minY + 1} / ${preview.maxY + 2}`
        }}
        className={`pointer-events-none z-30 transition-all duration-75 border-2
          ${preview.valid 
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
  handleSliderChange, logContainerRef, roundKeys, logsByRound, handleRoundTap,
  onReturnToPresent
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
                <span className="opacity-50">[{String(displayLog?.id || 0).padStart(3, '0')}]</span> {">"} {displayLog?.text || "Deploy your fleet on the Defend grid."}
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
              {isScrubbing ? (
                <button
                  onClick={onReturnToPresent}
                  className="text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-500/20 hover:bg-indigo-500/40 px-2 py-1 rounded transition-colors animate-pulse whitespace-nowrap text-[10px] sm:text-xs font-bold"
                >
                  Present <FastForward className="w-3 h-3" />
                </button>
              ) : (
                <span className="text-[10px] sm:text-xs font-mono text-indigo-300 hidden sm:block whitespace-nowrap w-[100px] text-right">
                  Round {currentRound} / {maxRound}
                </span>
              )}
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
  const aiController = useMemo(() => new AI(difficulty), [difficulty]);
  
  // Game States (The True Present)
  const [playerBoard, setPlayerBoard] = useState(() => placeFleetRandomly());
  const [aiBoard, setAiBoard] = useState(() => placeFleetRandomly());
  const [turn, setTurn] = useState('player'); 

  // Match engine ref (stateful BattleshipMatch)
  const matchRef = useRef(null);
  const [tick, setTick] = useState(0);
  const lastSeenEventIdxRef = useRef(-1);

  // Playback / Time Machine
  const [playbackIndex, setPlaybackIndex] = useState(-1);

  // Setup / UI States
  const [setupOrientation, setSetupOrientation] = useState('horizontal');
  const [hoverCell, setHoverCell] = useState(null);
  const [selectedWeapon, setSelectedWeapon] = useState('Carrier');
  const [targetCell, setTargetCell] = useState(null);
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('defend'); 

  const logContainerRef = useRef(null);
  const pendingResolution = useRef(null);

  const unplacedShips = SHIPS.filter(s => !playerBoard.activeShips[s.name]);
  const currentSetupShip = unplacedShips[0]; 

  // Fresh read of match events on each render (tick forces re-read after mutation)
  const events = matchRef.current?.events ?? [];

  const formatBattleEvent = (event) => {
    if (event.kind === 'attack') {
      if (event.actorId === 'player') {
        return event.hits > 0
          ? `💥 You scored ${event.hits} hit(s) with ${event.ship}!`
          : `💦 Your ${event.ship} missed.`;
      }

      return event.hits > 0
        ? `⚠️ Enemy scored ${event.hits} hit(s) using ${event.ship}!`
        : `Enemy ${event.ship} missed.`;
    }

    if (event.kind === 'sink') {
      return event.actorId === 'player'
        ? `💥 Enemy ${event.ship} destroyed!`
        : `🚨 CRITICAL: Your ${event.ship} was destroyed!`;
    }

    if (event.winnerId === 'draw') {
      return "MUTUAL DESTRUCTION: Both fleets are sunk. It's a draw!";
    }

    if (event.winnerId === 'player') {
      return "MISSION ACCOMPLISHED: Enemy fleet destroyed! YOU WIN!";
    }

    return "CRITICAL FAILURE: Your fleet was sunk! YOU LOSE!";
  };

  const getBattleEventType = (event) => {
    if (event.kind === 'attack') {
      if (event.hits > 0) {
        return event.actorId === 'player' ? 'success' : 'danger';
      }

      return 'miss';
    }

    if (event.kind === 'sink') {
      return event.actorId === 'player' ? 'success' : 'danger';
    }

    return event.winnerId === 'player' ? 'success' : 'danger';
  };

  const displayEvents = useMemo(() => events.map((event, idx) => ({
    ...event,
    text: formatBattleEvent(event),
    type: getBattleEventType(event),
    shooter: event.actorId ?? null,
    id: idx,
  })), [tick]);

  const maxRound = matchRef.current?.round ?? 0;
  const currentRound = (playbackIndex >= 0 && playbackIndex < events.length)
    ? (events[playbackIndex]?.round ?? 0)
    : maxRound;
  const isScrubbing = phase === 'battle' && events.length > 0
    && playbackIndex >= 0 && playbackIndex < events.length - 1;
  const displayLog = playbackIndex >= 0 ? displayEvents[playbackIndex] : null;

  const winner = matchRef.current?.winner 
    ? (matchRef.current.winner === 'player' ? 'Player' 
       : matchRef.current.winner === 'ai' ? 'AI' : 'Draw')
    : null;

  const unseenHits = useMemo(() => {
    return events
      .slice(lastSeenEventIdxRef.current + 1)
      .filter(e => e.kind === 'attack' && e.targetId === 'player' && (e.hits ?? 0) > 0)
      .length;
  }, [tick]);

  const logsByRound = useMemo(() => {
    const groups = {};
    displayEvents.forEach((ev, idx) => {
      const r = ev.round;
      if (!groups[r]) groups[r] = [];
      groups[r].push({ ...ev, id: idx });
    });
    return groups;
  }, [tick]);

  const roundKeys = useMemo(() => Object.keys(logsByRound).map(Number).sort((a, b) => b - a), [logsByRound]);

  useEffect(() => {
    soundEffectsEnabled = soundEnabled;
  }, [soundEnabled]);

  const resetGame = () => {
    setPlayerBoard(placeFleetRandomly());
    setAiBoard(placeFleetRandomly());
    matchRef.current = null;
    lastSeenEventIdxRef.current = -1;
    setPhase('setup');
    setTurn('player');
    setSelectedWeapon('Carrier');
    setSetupOrientation('horizontal');
    setTargetCell(null);
    setIsFeedExpanded(false);
    setActiveTab('defend');
    setPlaybackIndex(-1);
    setTick(0);
    pendingResolution.current = null;
  };

  const startBattle = () => {
    playSynth('start');
    const match = new BattleshipMatch(playerBoard, aiBoard, 'player', 'ai');
    matchRef.current = match;
    lastSeenEventIdxRef.current = -1;
    setPlaybackIndex(-1);
    setPhase('battle');
    setActiveTab('attack');
    setTick(t => t + 1);
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
    if (activeTab === 'defend' && !isScrubbing) {
      lastSeenEventIdxRef.current = events.length - 1;
      setTick(t => t + 1);
    }
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

  // ----------------------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------------------
  const handlePlayerBoardClick = (x, y) => {
    if (phase !== 'setup') return;

    const coord = `${x},${y}`;
    const isHit = playerBoard.hitsReceived.has(coord);
    const isShip = playerBoard.grid[x][y] === 1 && !isHit;

    if (isShip) {
      // Infer removed ship's orientation so the player can immediately re-place it the same way.
      const shipName = playerBoard.getActiveShipNames().find(name => playerBoard.activeShips[name].includes(coord));
      if (shipName) {
        const coords = playerBoard.shipLayouts[shipName];
        if (coords && coords.length > 1) {
          const [ax] = coords[0].split(',').map(Number);
          const [bx] = coords[1].split(',').map(Number);
          setSetupOrientation(ax === bx ? 'vertical' : 'horizontal');
        }
      }
      const newBoard = cloneBoard(playerBoard);
      if (newBoard.removeShipAt(x, y)) {
        setPlayerBoard(newBoard);
        setHoverCell(null);
      }
    } else if (currentSetupShip) {
      const newBoard = cloneBoard(playerBoard);
      if (newBoard.placeShip(currentSetupShip.name, x, y, setupOrientation)) {
        setPlayerBoard(newBoard);
        setHoverCell(null);
      } else {
        // Auto-rotate fallback: retry with the opposite orientation.
        const altOrientation = setupOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        if (newBoard.placeShip(currentSetupShip.name, x, y, altOrientation)) {
          setSetupOrientation(altOrientation);
          setPlayerBoard(newBoard);
          setHoverCell(null);
        }
      }
    }
  };

  const handleEnemyBoardClick = (x, y) => {
    if (phase === 'setup' || isScrubbing || turn !== 'player') return;

    const isTargetable = aiBoard.canTargetCell(x, y, selectedWeapon);

    if (targetCell && targetCell[0] === x && targetCell[1] === y) {
      executeFire();
    } else if (isTargetable) {
      setTargetCell([x, y]);
    }
  };

  const executeFire = () => {
    if (!targetCell || turn !== 'player' || phase !== 'battle' || isScrubbing) return;

    const [x, y] = targetCell;
    const aiMove = aiController.selectMove(matchRef.current.boardA, matchRef.current.boardB.getActiveShipNames());
    const resolution = matchRef.current.resolveTurn({ x, y, ship: selectedWeapon }, aiMove);
    pendingResolution.current = resolution;
    setPlayerBoard(matchRef.current.boardA.clone());
    setAiBoard(matchRef.current.boardB.clone());
    setPlaybackIndex(matchRef.current.events.length - 1);
    setTargetCell(null);
    setTick(t => t + 1);

    if (resolution.attackA.sunkShips.length > 0) playSynth('sink');
    else if (resolution.attackA.hits > 0) playSynth('hit');
    else playSynth('miss');
    setTurn('ai');
  };

  // ----------------------------------------------------
  // AI TURN
  // ----------------------------------------------------
  useEffect(() => {
    if (turn === 'ai' && phase === 'battle' && !isScrubbing && pendingResolution.current) {
      const timer = setTimeout(() => {
        const resolution = pendingResolution.current;
        if (!resolution) return;

        if (resolution.winnerId) {
          if (resolution.winnerId === 'draw') playSynth('draw');
          else if (resolution.winnerId === 'ai') playSynth('lose');
          else playSynth('win');
          setTurn('gameover');
        } else {
          if (resolution.attackB.sunkShips.length > 0) playSynth('sink');
          else if (resolution.attackB.hits > 0) playSynth('hit');
          else playSynth('miss');
          setTurn('player');
        }

        pendingResolution.current = null;
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [turn, phase, isScrubbing, soundEnabled, activeTab]);

  // ----------------------------------------------------
  // EVENT SOURCING: TIME MACHINE REPLAY LOGIC
  // ----------------------------------------------------
  const handleSliderChange = (e) => {
    const targetRound = Number(e.target.value);
    let targetIndex = events.length - 1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].round === targetRound) { targetIndex = i; break; }
    }
    setPlaybackIndex(targetIndex);
  };

  const handleRoundTap = (targetRound) => {
    let targetIndex = events.length - 1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].round === targetRound) { targetIndex = i; break; }
    }
    setPlaybackIndex(targetIndex);
  };

  const displayPlayerBoard = useMemo(() => {
    if (phase === 'setup' || !isScrubbing || !matchRef.current) return playerBoard;
    return matchRef.current.boardAAt(playbackIndex);
  }, [phase, isScrubbing, playbackIndex, tick, playerBoard]);

  const displayAiBoard = useMemo(() => {
    if (phase === 'setup' || !isScrubbing || !matchRef.current) return aiBoard;
    return matchRef.current.boardBAt(playbackIndex);
  }, [phase, isScrubbing, playbackIndex, tick, aiBoard]);

  const activeLogsInView = useMemo(() => {
    if (!isScrubbing) {
      const latestRound = maxRound;
      if (latestRound === 0) return [];
      return displayEvents.filter(ev => ev.round === latestRound);
    }
    return displayEvents.slice(0, playbackIndex + 1).filter(ev => ev.round === currentRound);
  }, [isScrubbing, displayEvents, currentRound, playbackIndex, maxRound]);

  const playerHighlightCoords = useMemo(() =>
    activeLogsInView.filter(l => l.shooter === 'player').flatMap(l => l.coords ?? []),
    [activeLogsInView]);

  const aiHighlightCoords = useMemo(() =>
    activeLogsInView.filter(l => l.shooter === 'ai').flatMap(l => l.coords ?? []),
    [activeLogsInView]);

  // ----------------------------------------------------
  // DEBUG HEATMAP CALCULATIONS
  // ----------------------------------------------------
  const playerBoardHeatmap = useMemo(() => {
    if (!showDebug || phase === 'setup') return null;
    return aiController.getHeatmap(displayPlayerBoard, Object.keys(displayPlayerBoard.activeShips));
  }, [aiController, displayPlayerBoard, showDebug, phase]);

  const enemyBoardHeatmap = useMemo(() => {
    if (!showDebug || phase === 'setup') return null;
    return aiController.getHeatmap(displayAiBoard, Object.keys(displayAiBoard.activeShips));
  }, [aiController, displayAiBoard, showDebug, phase]);

  // ----------------------------------------------------
  // DERIVED STATE
  // ----------------------------------------------------
  const activePlayerShipsAtTime = Object.keys(displayPlayerBoard.activeShips);
  const activeEnemyShipsAtTime = Object.keys(displayAiBoard.activeShips);

  const getRoundAccuracy = (shooter) => {
    const relevant = displayEvents.slice(0, playbackIndex + 1)
      .filter(ev => ev.kind === 'attack' && ev.shooter === shooter);
    if (relevant.length === 0) return 0;
    const totalRounds = new Set(relevant.map(ev => ev.round)).size;
    const hitRounds = new Set(relevant.filter(ev => (ev.hits ?? 0) > 0).map(ev => ev.round)).size;
    return Math.round((hitRounds / totalRounds) * 100);
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
        onReturnToPresent={() => setPlaybackIndex(events.length - 1)}
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
                Accuracy: {getRoundAccuracy('player')}%
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
              {phase === 'setup' ? `Deployed: ${activePlayerShipsAtTime.length}/5` : `Enemy Acc: ${getRoundAccuracy('ai')}%`}
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
            />
          )}

        </div>

      </div>
    </div>
  );
}
