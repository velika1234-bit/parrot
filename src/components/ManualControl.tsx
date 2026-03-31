import React, { useEffect, useRef, useState } from 'react';
import nipplejs from 'nipplejs';
import { mamboBle } from '../services/mamboBle';
import { Rocket, Anchor, RotateCcw, RotateCw, Target, Scissors, Gauge, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ManualControlProps {
  isBleConnected: boolean;
  isFlying: boolean;
  flightState: string;
  setIsFlying: (v: boolean) => void;
}

export const ManualControl: React.FC<ManualControlProps> = ({ isBleConnected, isFlying, flightState, setIsFlying }) => {
  const leftJoystickRef = useRef<HTMLDivElement>(null);
  const rightJoystickRef = useRef<HTMLDivElement>(null);
  const pilotingState = useRef({ roll: 0, pitch: 0, yaw: 0, gaz: 0 });
  const intervalRef = useRef<any>(null);
  const [isClawOpen, setIsClawOpen] = useState(true);
  const [speed, setSpeed] = useState(50);

  useEffect(() => {
    if (!leftJoystickRef.current || !rightJoystickRef.current) return;

    const leftManager = nipplejs.create({
      zone: leftJoystickRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#3b82f6',
      size: 120,
    });

    const rightManager = nipplejs.create({
      zone: rightJoystickRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#3b82f6',
      size: 120,
    });

    (leftManager as any).on('move', (_: any, data: any) => {
      const { x, y } = data.vector;
      pilotingState.current.yaw = x * speed;
      pilotingState.current.gaz = y * speed;
    });

    (leftManager as any).on('end', () => {
      pilotingState.current.yaw = 0;
      pilotingState.current.gaz = 0;
    });

    (rightManager as any).on('move', (_: any, data: any) => {
      const { x, y } = data.vector;
      pilotingState.current.roll = x * speed;
      pilotingState.current.pitch = y * speed;
    });

    (rightManager as any).on('end', () => {
      pilotingState.current.roll = 0;
      pilotingState.current.pitch = 0;
    });

    // Start piloting loop
    intervalRef.current = setInterval(() => {
      // Only send piloting commands if connected and actually flying/hovering
      // This prevents flooding the drone during takeoff
      const isActuallyFlying = mamboBle.flightState === 'hovering' || mamboBle.flightState === 'taking_off' || mamboBle.flightState === 'rolling';
      
      if (isBleConnected && isActuallyFlying) {
        const { roll, pitch, yaw, gaz } = pilotingState.current;
        mamboBle.setPiloting(roll, pitch, yaw, gaz);
      }
    }, 100);

    return () => {
      leftManager.destroy();
      rightManager.destroy();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isBleConnected, isFlying, speed]);

  const handleTakeoff = async () => {
    if (!isBleConnected || isFlying) return;
    await mamboBle.takeoff();
    // We don't set setIsFlying(true) here anymore, 
    // we wait for the drone to report its state via onFlightStateUpdate in App.tsx
  };

  const handleLand = async () => {
    if (!isBleConnected || !isFlying) return;
    await mamboBle.land();
    setIsFlying(false);
  };

  const handleEmergency = async () => {
    if (!isBleConnected) return;
    await mamboBle.emergency();
    setIsFlying(false);
  };

  const handleFlatTrim = async () => {
    if (!isBleConnected) return;
    await mamboBle.flatTrim();
  };

  const handleFlip = async (dir: 'front' | 'back') => {
    if (isBleConnected && isFlying) {
      await mamboBle.flip(dir);
    }
  };

  const handleFireCannon = async () => {
    if (isBleConnected) {
      await mamboBle.fireCannon();
    }
  };

  const handleToggleClaw = async () => {
    if (isBleConnected) {
      const newState = !isClawOpen;
      await mamboBle.controlClaw(newState);
      setIsClawOpen(newState);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-6 gap-8">
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Ръчно управление</h3>
          <div className={cn(
            "text-[10px] font-mono mt-1 uppercase tracking-wider",
            flightState === 'landed' ? "text-slate-500" : "text-blue-400 animate-pulse"
          )}>
            Статус: {flightState.replace('_', ' ')}
          </div>
        </div>
        
        <div className="flex items-center gap-4 bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-400">
            <Gauge size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Скорост</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="100" 
            value={speed} 
            onChange={(e) => setSpeed(parseInt(e.target.value))}
            className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-[10px] font-mono text-blue-400 w-6">{speed}%</span>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={handleFireCannon}
            className="p-2 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-600/30 transition-all"
            title="Стрелба с оръдие"
          >
            <Target size={18} />
          </button>
          <button 
            onClick={handleToggleClaw}
            className={cn(
              "p-2 border rounded-lg transition-all",
              isClawOpen 
                ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/30" 
                : "bg-amber-600/20 text-amber-400 border-amber-500/30 hover:bg-amber-600/30"
            )}
            title={isClawOpen ? "Затвори щипка" : "Отвори щипка"}
          >
            <Scissors size={18} />
          </button>
          <div className="w-px h-8 bg-slate-800 mx-1" />
          <button 
            onClick={() => handleFlip('front')}
            className="p-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-all"
            title="Салто Напред"
          >
            <RotateCw size={18} />
          </button>
          <button 
            onClick={() => handleFlip('back')}
            className="p-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-all"
            title="Салто Назад"
          >
            <RotateCcw size={18} />
          </button>
          <div className="w-px h-8 bg-slate-800 mx-1" />
          <button 
            onClick={() => {
              mamboBle.reset();
              setIsFlying(false);
              alert('Bluetooth връзката бе нулирана.');
            }}
            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
            title="Нулиране на Bluetooth"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-4 items-center">
        <div className="flex flex-col items-center gap-4">
          <div ref={leftJoystickRef} className="relative w-40 h-40 bg-slate-950/50 rounded-full border border-slate-800 shadow-inner" />
          <span className="text-[10px] font-bold text-slate-500 uppercase">Височина / Завой</span>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div ref={rightJoystickRef} className="relative w-40 h-40 bg-slate-950/50 rounded-full border border-slate-800 shadow-inner" />
          <span className="text-[10px] font-bold text-slate-500 uppercase">Посока (Roll/Pitch)</span>
        </div>
      </div>

      <div className="flex justify-center gap-4">
        {!isFlying ? (
          <button
            onClick={handleTakeoff}
            disabled={!isBleConnected}
            className={cn(
              "w-full max-w-xs flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-xl",
              !isBleConnected 
                ? "bg-slate-800 text-slate-600" 
                : "bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-emerald-500/20"
            )}
          >
            <Rocket size={20} />
            ИЗЛИТАНЕ
          </button>
        ) : (
          <>
            <button
              onClick={handleLand}
              disabled={!isBleConnected}
              className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-xl bg-blue-500 text-white hover:bg-blue-400 hover:shadow-blue-500/20"
            >
              <Anchor size={20} />
              КАЦАНЕ
            </button>
            <button
              onClick={handleFlatTrim}
              disabled={!isBleConnected}
              className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-xl bg-slate-700 text-white hover:bg-slate-600 hover:shadow-slate-700/20"
            >
              <RotateCcw size={20} />
              FLAT TRIM
            </button>
            <button
              onClick={handleEmergency}
              disabled={!isBleConnected}
              className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-xl bg-rose-600 text-white hover:bg-rose-500 hover:shadow-rose-600/20"
            >
              <AlertTriangle size={20} />
              АВАРИЙНО
            </button>
          </>
        )}
      </div>
    </div>
  );
};
