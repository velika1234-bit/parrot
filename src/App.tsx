import React, { useState, useCallback, useRef, useEffect } from 'react';
import { CommandEditor } from './components/CommandEditor';
import { ManualControl } from './components/ManualControl';
import { Command, DroneState } from './types';
import { mamboBle } from './services/mamboBle';
import { 
  Rocket, 
  Info, 
  Github, 
  Bluetooth,
  BluetoothOff,
  Zap,
  Gamepad2,
  Code2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

const INITIAL_STATE: DroneState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  isFlying: false,
};

export default function App() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [droneState, setDroneState] = useState<DroneState>(INITIAL_STATE);
  const [isRunning, setIsRunning] = useState(false);
  const [currentCommandIndex, setCurrentCommandIndex] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isBleConnected, setIsBleConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStage, setConnectionStage] = useState<string>('');
  const [mode, setMode] = useState<'programming' | 'manual'>('programming');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [flightState, setFlightState] = useState<string>('landed');

  useEffect(() => {
    mamboBle.onDisconnect = () => {
      setIsBleConnected(false);
      setDroneState(prev => ({ ...prev, isFlying: false }));
      setBatteryLevel(null);
      setFlightState('landed');
    };

    mamboBle.onBatteryUpdate = (level: number) => {
      setBatteryLevel(level);
    };

    mamboBle.onFlightStateUpdate = (state: string) => {
      setFlightState(state);
      setDroneState(prev => ({ ...prev, isFlying: ['taking_off', 'hovering', 'landing'].includes(state) }));
    };

    const logInterval = setInterval(() => {
      const currentLogs = [...mamboBle.logs];
      setLogs(currentLogs);
      
      // Update connection stage from logs
      if (isConnecting) {
        const lastLog = currentLogs[currentLogs.length - 1];
        if (lastLog) {
          if (lastLog.includes('ЕТАП 1')) setConnectionStage('Bluetooth...');
          if (lastLog.includes('ЕТАП 2')) setConnectionStage('Инициализация...');
          if (lastLog.includes('Извличане')) setConnectionStage('Услуги...');
        }
      }
    }, 500);

    return () => clearInterval(logInterval);
  }, []);

  const connectDrone = async () => {
    setIsConnecting(true);
    setConnectionStage('Търсене...');
    try {
      const success = await mamboBle.connect();
      setIsBleConnected(success);
      if (success) {
        alert('Дронът е свързан успешно!');
      }
    } catch (error: any) {
      console.error('Connection error:', error);
      setIsBleConnected(false);
      
      const errorMessage = error.message || 'Неизвестна грешка';
      
      if (errorMessage.includes('User cancelled')) {
        // Do nothing
      } else {
        const isAndroid = /Android/.test(navigator.userAgent);
        const androidTip = isAndroid 
          ? '\n\nСЪВЕТ ЗА ANDROID (12/13+):\n1. Включете GPS (Location) и Bluetooth.\n2. Дайте разрешение за "Устройства наблизо" (Nearby Devices) на Chrome.\n3. Уверете се, че Chrome има разрешение за Местоположение.\n4. Изключете и включете Bluetooth.\n5. Уверете се, че дронът НЕ е сдвоен в настройките на телефона.\n6. HARD RESET: Извадете батерията на дрона за 10 сек.\n7. Опитайте да рестартирате Chrome.' 
          : '\n\nСЪВЕТ: Ако дронът не се свързва, извадете батерията му за 10 сек и опитайте пак.';
        alert(`Грешка при свързване: ${errorMessage}${androidTip}`);
      }
    } finally {
      setIsConnecting(false);
      setConnectionStage('');
    }
  };

  const disconnectDrone = () => {
    mamboBle.disconnect();
    setIsBleConnected(false);
  };

  const runProgram = async () => {
    if (commands.length === 0) return;
    
    setIsRunning(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    const executeCommand = async (cmd: Command, index: number | null) => {
      if (index !== null) setCurrentCommandIndex(index);

      if (isBleConnected) {
        try {
          const speed = cmd.speed || 50;
          switch (cmd.type) {
            case 'takeoff': 
              await mamboBle.takeoff(); 
              setDroneState(prev => ({ ...prev, isFlying: true }));
              break;
            case 'land': 
              await mamboBle.land(); 
              setDroneState(prev => ({ ...prev, isFlying: false }));
              break;
            case 'forward': await mamboBle.move(0, speed, 0, 0, cmd.value || 1); break;
            case 'backward': await mamboBle.move(0, -speed, 0, 0, cmd.value || 1); break;
            case 'left': await mamboBle.move(-speed, 0, 0, 0, cmd.value || 1); break;
            case 'right': await mamboBle.move(speed, 0, 0, 0, cmd.value || 1); break;
            case 'up': await mamboBle.move(0, 0, 0, speed, cmd.value || 1); break;
            case 'down': await mamboBle.move(0, 0, 0, -speed, cmd.value || 1); break;
            case 'turn_left': await mamboBle.move(0, 0, -speed, 0, 1); break;
            case 'turn_right': await mamboBle.move(0, 0, speed, 0, 1); break;
            case 'flip_front': await mamboBle.flip('front'); break;
            case 'flip_back': await mamboBle.flip('back'); break;
            case 'flip_left': await mamboBle.flip('left'); break;
            case 'flip_right': await mamboBle.flip('right'); break;
            case 'fire_cannon': await mamboBle.fireCannon(); break;
            case 'open_claw': await mamboBle.controlClaw(true); break;
            case 'close_claw': await mamboBle.controlClaw(false); break;
            case 'loop':
              const iterations = cmd.value || 1;
              for (let j = 0; j < iterations; j++) {
                if (cmd.commands) {
                  for (const nested of cmd.commands) {
                    await executeCommand(nested, null);
                  }
                }
              }
              break;
            case 'if':
              let conditionMet = false;
              if (cmd.condition === 'is_flying') conditionMet = droneState.isFlying;
              if (cmd.condition === 'is_landed') conditionMet = !droneState.isFlying;
              
              if (conditionMet && cmd.commands) {
                for (const nested of cmd.commands) {
                  await executeCommand(nested, null);
                }
              }
              break;
          }
        } catch (err) {
          console.error('BLE Command Error:', err);
        }
      }

      // Wait for command duration (except for containers)
      if (cmd.type !== 'loop' && cmd.type !== 'if') {
        await new Promise(resolve => setTimeout(resolve, (cmd.value || 1) * 1000));
      }
    };

    for (let i = 0; i < commands.length; i++) {
      await executeCommand(commands[i], i);
    }

    setIsRunning(false);
    setCurrentCommandIndex(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-600/20">
            <Rocket className="text-white" size={18} />
          </div>
          <div className="hidden xs:block">
            <h1 className="text-sm sm:text-lg font-bold tracking-tight">Mambo Code Studio</h1>
            <p className="text-[8px] sm:text-[10px] text-slate-500 font-mono uppercase tracking-widest">Drone Programming Interface</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mode Toggle */}
          <div className="flex bg-slate-950/50 p-1 rounded-full border border-slate-800">
            <button 
              onClick={() => setMode('programming')}
              className={cn(
                "p-2 rounded-full transition-all",
                mode === 'programming' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300"
              )}
              title="Програмиране"
            >
              <Code2 size={16} />
            </button>
            <button 
              onClick={() => setMode('manual')}
              className={cn(
                "p-2 rounded-full transition-all",
                mode === 'manual' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300"
              )}
              title="Ръчно управление"
            >
              <Gamepad2 size={16} />
            </button>
          </div>

          <button
            onClick={() => {
              mamboBle.reset();
              setIsBleConnected(false);
              setBatteryLevel(null);
              alert('Връзката бе нулирана. Моля, опитайте да се свържете отново.');
            }}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-full transition-all"
            title="Нулиране на Bluetooth"
          >
            <RotateCcw size={18} />
          </button>

          <div className="h-6 w-px bg-slate-800" />

          {/* Bluetooth Connection Button */}
          <button
            onClick={isBleConnected ? disconnectDrone : connectDrone}
            disabled={isConnecting}
            className={cn(
              "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-bold transition-all",
              isBleConnected 
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20" 
                : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20"
            )}
          >
            {isConnecting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isBleConnected ? (
              <Bluetooth size={14} />
            ) : (
              <BluetoothOff size={14} />
            )}
            <span className="hidden xs:inline">{isConnecting ? (connectionStage || 'СВЪРЗВАНЕ...') : isBleConnected ? 'СВЪРЗАН' : 'СВЪРЖИ ДРОН'}</span>
          </button>
          
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all hidden sm:block"
          >
            <Info size={20} />
          </button>

          <button 
            onClick={() => setShowLogs(!showLogs)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all"
            title="Debug Logs"
          >
            <div className="text-[10px] font-bold border border-current px-1 rounded">LOG</div>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-[1200px] mx-auto w-full flex flex-col gap-6 overflow-hidden">
        {/* Android 12/13+ Warning */}
        {/Android/.test(navigator.userAgent) && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={18} />
            <p className="text-[10px] sm:text-xs text-amber-200/80 leading-tight">
              <span className="font-bold text-amber-400">Android 12/13+ Потребители:</span> Поради промени в Bluetooth стека, 
              уверете се, че Chrome има разрешение за <span className="text-white font-bold">"Устройства наблизо"</span> (Nearby Devices).
            </p>
          </div>
        )}

        {/* Status Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg relative">
              <Zap className="text-emerald-400" size={20} />
              {batteryLevel !== null && (
                <div className="absolute -top-1 -right-1 bg-emerald-500 text-[8px] font-bold px-1 rounded-full text-white">
                  {batteryLevel}%
                </div>
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">
                {isBleConnected ? (
                  <span className="flex items-center gap-2">
                    Дронът е готов за полет!
                    {batteryLevel !== null && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border",
                        batteryLevel > 20 ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30 animate-pulse"
                      )}>
                        {batteryLevel}% Батерия
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 uppercase tracking-wider font-mono",
                      flightState === 'emergency' && "text-rose-400 border-rose-500/30 animate-pulse"
                    )}>
                      {flightState.replace('_', ' ')}
                    </span>
                  </span>
                ) : 'Свържете се с дрона, за да започнете.'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {isBleConnected 
                  ? 'Можете да изпълнявате програми или да управлявате ръчно.' 
                  : 'Използвайте Bluetooth бутона горе, за да намерите вашия Parrot Mambo.'}
              </p>
            </div>
          </div>

          {/* Current Command Indicator */}
          <AnimatePresence>
            {currentCommandIndex !== null && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold shadow-lg flex items-center gap-3 whitespace-nowrap text-xs"
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                {commands[currentCommandIndex].type.toUpperCase()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0">
          {mode === 'programming' ? (
            <CommandEditor 
              commands={commands} 
              setCommands={setCommands} 
              onRun={runProgram}
              isRunning={isRunning}
            />
          ) : (
            <ManualControl 
              isBleConnected={isBleConnected} 
              isFlying={droneState.isFlying}
              flightState={flightState}
              setIsFlying={(v) => setDroneState(prev => ({ ...prev, isFlying: v }))}
            />
          )}
        </div>
      </main>

      {/* Debug Logs */}
      {showLogs && (
        <div className="fixed bottom-20 left-4 right-4 bg-black/90 text-green-400 p-4 rounded-lg font-mono text-xs max-h-48 overflow-y-auto z-50 border border-green-500/30">
          <div className="flex justify-between items-center mb-2 border-b border-green-500/30 pb-1">
            <span>Debug Logs</span>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(logs.join('\n'));
                  alert('Логът е копиран в клипборда!');
                }} 
                className="text-[10px] bg-white/10 px-1 rounded hover:bg-white/20"
              >
                COPY
              </button>
              <button onClick={() => { mamboBle.logs = []; setLogs([]); }} className="text-[10px] bg-white/10 px-1 rounded hover:bg-white/20">CLEAR</button>
              <button onClick={() => setShowLogs(false)} className="text-white">✕</button>
            </div>
          </div>
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          {logs.length === 0 && <div className="opacity-50 italic">No logs yet...</div>}
        </div>
      )}

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHelp(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <Info className="text-blue-500" />
                Относно Mambo Code Studio
              </h2>
              
              <div className="space-y-6 text-slate-300">
                <section>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Какво е това?</h3>
                  <p className="text-sm leading-relaxed">
                    Това е визуална среда за програмиране на дрони Parrot Mambo. Можете да създавате последователности от команди 
                    и да управлявате истинския дрон директно през браузъра чрез Web Bluetooth.
                  </p>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Възможности:</h3>
                  <ul className="text-sm space-y-2 list-disc list-inside">
                    <li><span className="text-blue-400 font-bold">Web Bluetooth</span>: Свържете дрона към браузъра и натиснете СТАРТ. Не се изисква инсталация.</li>
                    <li><span className="text-emerald-400 font-bold">Локално запазване</span>: Запазете вашите програми като JSON файлове на устройството си и ги зареждайте по-късно.</li>
                    <li><span className="text-rose-400 font-bold">Аксесоари</span>: Пълна поддръжка за оръдието и щипката на Parrot Mambo.</li>
                  </ul>
                </section>

                <section className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Zap size={14} />
                    Android 12/13+ Специфични стъпки за свързване
                  </h3>
                  <ul className="text-[11px] space-y-2 text-slate-400">
                    <li>• <span className="text-amber-500 font-bold">Разрешения:</span> Отидете в <span className="text-slate-200">Settings &gt; Apps &gt; Chrome &gt; Permissions</span>. Уверете се, че <span className="text-emerald-400 font-bold">"Nearby Devices"</span> е разрешено.</li>
                    <li>• <span className="text-amber-500 font-bold">GPS:</span> Уверете се, че <span className="text-slate-200">Location (GPS)</span> е включен (нужно за по-стари версии и някои браузъри).</li>
                    <li>• <span className="text-amber-500 font-bold">Bluetooth:</span> Дронът <span className="text-rose-400 font-bold">НЕ трябва да е сдвоен (paired)</span> в системните настройки на телефона. Ако е - премахнете го (Unpair).</li>
                    <li>• <span className="text-amber-500 font-bold">Конфликти:</span> Затворете официалното приложение <span className="text-slate-200">FreeFlight Mini</span>, ако е отворено.</li>
                    <li>• <span className="text-amber-500 font-bold">Hard Reset:</span> Ако нищо не помага, задръжте бутона за включване на дрона за 10 секунди.</li>
                    <li>• <span className="text-amber-500 font-bold">Браузър:</span> Използвайте <span className="text-slate-200">Chrome</span> (Android) или <span className="text-slate-200">Bluefy</span> (iOS).</li>
                  </ul>
                </section>

                <div className="pt-6 border-t border-slate-800 flex justify-end items-center">
                  <button 
                    onClick={() => setShowHelp(false)}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors"
                  >
                    Затвори
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
