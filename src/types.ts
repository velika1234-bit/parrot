export type CommandType = 
  | 'takeoff' 
  | 'land' 
  | 'forward' 
  | 'backward' 
  | 'left' 
  | 'right' 
  | 'up' 
  | 'down' 
  | 'turn_left' 
  | 'turn_right' 
  | 'flip_front' 
  | 'flip_back'
  | 'flip_left'
  | 'flip_right'
  | 'fire_cannon'
  | 'open_claw'
  | 'close_claw'
  | 'loop'
  | 'if';

export interface Command {
  id: string;
  type: CommandType;
  value?: number; // duration or loop count
  speed?: number; // 0-100%
  commands?: Command[]; // nested commands for loop/if
  condition?: string; // for 'if'
}

export interface DroneState {
  position: [number, number, number];
  rotation: [number, number, number];
  isFlying: boolean;
}
