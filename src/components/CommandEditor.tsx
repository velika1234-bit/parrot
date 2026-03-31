import React, { useState } from 'react';
import { 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, 
  RotateCcw, RotateCw, Play, Trash2, 
  ChevronUp, ChevronDown, Rocket, Anchor,
  Save, Upload, GripVertical, Target, Scissors,
  Repeat, GitBranch, Gauge, Code, Copy, X
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Command, CommandType } from '../types';
import { cn } from '../lib/utils';
import { generatePythonCode } from '../services/pythonGenerator';

interface CommandEditorProps {
  commands: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  onRun: () => void;
  isRunning: boolean;
}

const CATEGORIES = [
  { id: 'motion', label: 'Движение', color: 'bg-blue-500' },
  { id: 'control', label: 'Контрол', color: 'bg-amber-500' },
  { id: 'logic', label: 'Логика', color: 'bg-orange-500' },
  { id: 'flips', label: 'Трикове', color: 'bg-purple-500' },
  { id: 'accessories', label: 'Добавки', color: 'bg-rose-500' },
];

const COMMAND_DEFS: { type: CommandType; label: string; icon: any; color: string; category: string }[] = [
  { type: 'takeoff', label: 'Излитане', icon: Rocket, color: 'bg-emerald-500', category: 'control' },
  { type: 'land', label: 'Кацане', icon: Anchor, color: 'bg-rose-500', category: 'control' },
  { type: 'loop', label: 'Повтори', icon: Repeat, color: 'bg-orange-500', category: 'logic' },
  { type: 'if', label: 'Ако...', icon: GitBranch, color: 'bg-orange-600', category: 'logic' },
  { type: 'forward', label: 'Напред', icon: ArrowUp, color: 'bg-blue-500', category: 'motion' },
  { type: 'backward', label: 'Назад', icon: ArrowDown, color: 'bg-blue-500', category: 'motion' },
  { type: 'left', label: 'Наляво', icon: ArrowLeft, color: 'bg-blue-500', category: 'motion' },
  { type: 'right', label: 'Надясно', icon: ArrowRight, color: 'bg-blue-500', category: 'motion' },
  { type: 'up', label: 'Нагоре', icon: ChevronUp, color: 'bg-sky-500', category: 'motion' },
  { type: 'down', label: 'Надолу', icon: ChevronDown, color: 'bg-sky-500', category: 'motion' },
  { type: 'turn_left', label: 'Завой Ляво', icon: RotateCcw, color: 'bg-indigo-500', category: 'motion' },
  { type: 'turn_right', label: 'Завой Дясно', icon: RotateCw, color: 'bg-indigo-500', category: 'motion' },
  { type: 'flip_front', label: 'Салто Напред', icon: Rocket, color: 'bg-purple-500', category: 'flips' },
  { type: 'flip_back', label: 'Салто Назад', icon: Rocket, color: 'bg-purple-500', category: 'flips' },
  { type: 'flip_left', label: 'Салто Наляво', icon: RotateCcw, color: 'bg-purple-600', category: 'flips' },
  { type: 'flip_right', label: 'Салто Надясно', icon: RotateCw, color: 'bg-purple-600', category: 'flips' },
  { type: 'fire_cannon', label: 'Стрелба', icon: Target, color: 'bg-rose-600', category: 'accessories' },
  { type: 'open_claw', label: 'Отвори Щипка', icon: Scissors, color: 'bg-rose-500', category: 'accessories' },
  { type: 'close_claw', label: 'Затвори Щипка', icon: Anchor, color: 'bg-rose-700', category: 'accessories' },
];

export const CommandEditor: React.FC<CommandEditorProps> = ({ 
  commands, 
  setCommands, 
  onRun, 
  isRunning 
}) => {
  const [activeCategory, setActiveCategory] = useState('motion');
  const [showPythonModal, setShowPythonModal] = useState(false);
  const [generatedPythonCode, setGeneratedPythonCode] = useState('');

  const addCommand = (type: CommandType) => {
    const newCommand: Command = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      value: type === 'loop' ? 2 : 1, // default 2 loops or 1 second
      speed: 50, // default 50% speed
      commands: (type === 'loop' || type === 'if') ? [] : undefined,
      condition: type === 'if' ? 'is_flying' : undefined,
    };
    setCommands([...commands, newCommand]);
  };

  const removeCommand = (id: string) => {
    setCommands(commands.filter(c => c.id !== id));
  };

  const updateCommandValue = (id: string, value: number) => {
    setCommands(commands.map(c => c.id === id ? { ...c, value } : c));
  };

  const updateCommandSpeed = (id: string, speed: number) => {
    setCommands(commands.map(c => c.id === id ? { ...c, speed } : c));
  };

  const updateCommandCondition = (id: string, condition: string) => {
    setCommands(commands.map(c => c.id === id ? { ...c, condition } : c));
  };

  const updateNestedCommands = (id: string, nested: Command[]) => {
    setCommands(commands.map(c => c.id === id ? { ...c, commands: nested } : c));
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    // Handle nested drag and drop
    const sourceId = result.source.droppableId;
    const destId = result.destination.droppableId;

    if (sourceId === 'workspace' && destId === 'workspace') {
      const items = Array.from(commands);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);
      setCommands(items);
    } else if (destId.startsWith('nested-')) {
      const parentId = destId.replace('nested-', '');
      const parent = commands.find(c => c.id === parentId);
      if (parent && parent.commands) {
        const nested = Array.from(parent.commands);
        if (sourceId === destId) {
          const [reorderedItem] = nested.splice(result.source.index, 1);
          nested.splice(result.destination.index, 0, reorderedItem);
        } else if (sourceId === 'workspace') {
          const items = Array.from(commands);
          const [movedItem] = items.splice(result.source.index, 1);
          nested.splice(result.destination.index, 0, movedItem);
          setCommands(items);
        }
        updateNestedCommands(parentId, nested);
      }
    } else if (sourceId.startsWith('nested-') && destId === 'workspace') {
      const parentId = sourceId.replace('nested-', '');
      const parent = commands.find(c => c.id === parentId);
      if (parent && parent.commands) {
        const nested = Array.from(parent.commands);
        const [movedItem] = nested.splice(result.source.index, 1);
        const items = Array.from(commands);
        items.splice(result.destination.index, 0, movedItem);
        updateNestedCommands(parentId, nested);
        setCommands(items);
      }
    }
  };

  const saveProgram = () => {
    const data = JSON.stringify(commands, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mambo_program_${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadProgram = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const loadedCommands = JSON.parse(content);
        if (Array.isArray(loadedCommands)) {
          setCommands(loadedCommands);
        } else {
          alert('Невалиден формат на файла!');
        }
      } catch (err) {
        alert('Грешка при зареждане на файла!');
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  const isValueCommand = (type: CommandType) => {
    const noValue = ['takeoff', 'land', 'fire_cannon', 'open_claw', 'close_claw', 'if'];
    return !noValue.includes(type) && !type.startsWith('flip');
  };

  const isSpeedCommand = (type: CommandType) => {
    const motion = ['forward', 'backward', 'left', 'right', 'up', 'down', 'turn_left', 'turn_right'];
    return motion.includes(type);
  };

  const handleGeneratePython = () => {
    const pythonCode = generatePythonCode(commands);
    setGeneratedPythonCode(pythonCode);
    setShowPythonModal(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPythonCode);
    alert('Кодът е копиран в клипборда!');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Python Code Modal */}
      {showPythonModal && (
        <div className="absolute inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl h-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div className="flex items-center gap-2">
                <Code size={18} className="text-blue-400" />
                <h3 className="font-bold text-sm text-slate-200">Генериран Python код</h3>
              </div>
              <button 
                onClick={() => setShowPythonModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-blue-300 leading-relaxed custom-scrollbar">
              <pre className="whitespace-pre-wrap">{generatedPythonCode}</pre>
            </div>

            <div className="p-4 border-t border-slate-800 flex gap-3 bg-slate-950/50">
              <button
                onClick={copyToClipboard}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-700 transition-all active:scale-95"
              >
                <Copy size={16} />
                КОПИРАЙ КОДА
              </button>
              <button
                onClick={() => setShowPythonModal(false)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 transition-all active:scale-95"
              >
                ЗАТВОРИ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content: Sidebar + Toolbox + Workspace */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* Categories Sidebar */}
        <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-4 shrink-0">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                activeCategory === cat.id ? "opacity-100 scale-110" : "opacity-40 hover:opacity-70"
              )}
            >
              <div className={cn("w-8 h-8 rounded-lg shadow-lg", cat.color)} />
              <span className="text-[8px] font-bold uppercase tracking-tighter text-center px-1">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Toolbox */}
        <div className="w-44 bg-slate-900/50 border-r border-slate-800 overflow-y-auto custom-scrollbar shrink-0 p-2">
          <div className="grid grid-cols-1 gap-1.5">
            {COMMAND_DEFS.filter(d => d.category === activeCategory).map(def => (
              <button
                key={def.type}
                onClick={() => addCommand(def.type)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:translate-x-1 active:scale-95 text-white shadow-md",
                  def.color,
                  "block-bump"
                )}
              >
                <def.icon size={14} />
                {def.label}
              </button>
            ))}
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex flex-col bg-slate-950/50 overflow-hidden">
          <div className="p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Работно пространство</h3>
            <span className="text-[9px] font-mono text-slate-600">{commands.length} блока</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="workspace">
                {(provided) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef}
                    className="space-y-1 min-h-[200px]"
                  >
                    {commands.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-slate-700 py-10">
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-800 flex items-center justify-center mb-4">
                          <GripVertical size={20} className="opacity-20" />
                        </div>
                        <p className="text-[10px] font-medium">Плъзнете блокове тук</p>
                      </div>
                    )}
                    {commands.map((cmd, index) => {
                      const def = COMMAND_DEFS.find(d => d.type === cmd.type);
                      const isNested = cmd.type === 'loop' || cmd.type === 'if';
                      
                      return (
                        <Draggable key={cmd.id} draggableId={cmd.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "relative flex flex-col gap-2 p-2 rounded-lg text-white shadow-lg transition-all",
                                def?.color,
                                "block-notch block-bump",
                                snapshot.isDragging ? "z-50 scale-105 rotate-1" : ""
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded">
                                  <GripVertical size={14} className="opacity-50" />
                                </div>
                                
                                <div className="flex-1 flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    {def && <def.icon size={14} />}
                                    <span className="font-bold text-xs">{def?.label}</span>
                                  </div>

                                  {cmd.type === 'if' && (
                                    <select 
                                      value={cmd.condition}
                                      onChange={(e) => updateCommandCondition(cmd.id, e.target.value)}
                                      className="bg-black/20 px-2 py-0.5 rounded-full text-[10px] focus:outline-none border-none"
                                    >
                                      <option value="is_flying" className="bg-slate-800">лети</option>
                                      <option value="is_landed" className="bg-slate-800">на земята</option>
                                    </select>
                                  )}

                                  {isValueCommand(cmd.type) && (
                                    <div className="flex items-center gap-1.5 bg-black/20 px-2 py-0.5 rounded-full">
                                      <input 
                                        type="number" 
                                        min={cmd.type === 'loop' ? "1" : "0.1"} 
                                        max="100" 
                                        step={cmd.type === 'loop' ? "1" : "0.1"} 
                                        value={cmd.value} 
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          updateCommandValue(cmd.id, cmd.type === 'loop' ? Math.max(1, Math.floor(val)) : val);
                                        }}
                                        className="w-8 bg-transparent text-center font-mono text-[10px] focus:outline-none"
                                      />
                                      <span className="text-[9px] opacity-50">{cmd.type === 'loop' ? 'пъти' : 'сек'}</span>
                                    </div>
                                  )}

                                  {isSpeedCommand(cmd.type) && (
                                    <div className="flex items-center gap-1.5 bg-black/20 px-2 py-0.5 rounded-full" title="Скорост">
                                      <Gauge size={10} className="opacity-50" />
                                      <input 
                                        type="number" 
                                        min="1" 
                                        max="100" 
                                        step="1" 
                                        value={cmd.speed} 
                                        onChange={(e) => updateCommandSpeed(cmd.id, parseInt(e.target.value))}
                                        className="w-8 bg-transparent text-center font-mono text-[10px] focus:outline-none"
                                      />
                                      <span className="text-[9px] opacity-50">%</span>
                                    </div>
                                  )}
                                </div>

                                <button 
                                  onClick={() => removeCommand(cmd.id)}
                                  className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                                >
                                  <Trash2 size={14} className="opacity-50 hover:opacity-100" />
                                </button>
                              </div>

                              {isNested && (
                                <Droppable droppableId={`nested-${cmd.id}`}>
                                  {(nestedProvided, nestedSnapshot) => (
                                    <div
                                      ref={nestedProvided.innerRef}
                                      {...nestedProvided.droppableProps}
                                      className={cn(
                                        "ml-6 mt-1 p-2 rounded-lg bg-black/20 min-h-[40px] space-y-1 border border-dashed border-white/10",
                                        nestedSnapshot.isDraggingOver ? "bg-black/40 border-white/30" : ""
                                      )}
                                    >
                                      {cmd.commands?.map((nestedCmd, nestedIndex) => {
                                        const nestedDef = COMMAND_DEFS.find(d => d.type === nestedCmd.type);
                                        return (
                                          <Draggable key={nestedCmd.id} draggableId={nestedCmd.id} index={nestedIndex}>
                                            {(p, s) => (
                                              <div
                                                ref={p.innerRef}
                                                {...p.draggableProps}
                                                className={cn(
                                                  "flex items-center gap-2 p-1.5 rounded bg-white/10 text-white text-[10px] font-bold",
                                                  s.isDragging ? "z-50 scale-105" : ""
                                                )}
                                              >
                                                <div {...p.dragHandleProps} className="p-0.5">
                                                  <GripVertical size={10} className="opacity-30" />
                                                </div>
                                                {nestedDef && <nestedDef.icon size={12} />}
                                                <span>{nestedDef?.label}</span>
                                                <div className="flex-1" />
                                                <button 
                                                  onClick={() => {
                                                    const newNested = cmd.commands?.filter(c => c.id !== nestedCmd.id) || [];
                                                    updateNestedCommands(cmd.id, newNested);
                                                  }}
                                                >
                                                  <Trash2 size={10} className="opacity-30 hover:opacity-100" />
                                                </button>
                                              </div>
                                            )}
                                          </Draggable>
                                        );
                                      })}
                                      {nestedProvided.placeholder}
                                    </div>
                                  )}
                                </Droppable>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-3">
        <button
          onClick={onRun}
          disabled={isRunning || commands.length === 0}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs tracking-widest transition-all",
            isRunning || commands.length === 0 
              ? "bg-slate-800 text-slate-600" 
              : "bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-xl hover:shadow-emerald-500/20 active:scale-95"
          )}
        >
          <Play size={16} fill="currentColor" />
          {isRunning ? 'ИЗПЪЛНЕНИЕ...' : 'СТАРТ'}
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={handleGeneratePython}
            disabled={commands.length === 0}
            className="p-3 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 hover:text-blue-400 hover:bg-slate-700 transition-all"
            title="Генерирай Python код"
          >
            <Code size={16} />
          </button>

          <label className="p-3 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700 transition-all cursor-pointer" title="Зареди програма">
            <Upload size={16} />
            <input type="file" accept=".json" onChange={loadProgram} className="hidden" />
          </label>
          
          <button
            onClick={saveProgram}
            disabled={commands.length === 0}
            className="p-3 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700 transition-all"
            title="Запази програма"
          >
            <Save size={16} />
          </button>

          <button
            onClick={() => {
              setCommands([]);
              alert('Работната област бе изчистена.');
            }}
            className="p-3 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            title="Изчисти всичко"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
