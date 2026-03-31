import { Command } from '../types';

export const generatePythonCode = (commands: Command[]): string => {
  let code = `from pyparrot.Mambo import Mambo

# Set the address of your Mambo drone
mamboAddr = "CHANGE_ME"

# Initialize the Mambo object
mambo = Mambo(mamboAddr, use_wifi=True)

print("Connecting...")
success = mambo.connect(num_retries=3)
print("Connected: %s" % success)

if success:
    try:
`;

  const indent = '        ';
  
  const translateCommand = (cmd: Command, currentIndent: string): string => {
    let result = '';
    const speed = cmd.speed || 50;
    const value = cmd.value || 1;

    switch (cmd.type) {
      case 'takeoff':
        result += `${currentIndent}print("Taking off")\n`;
        result += `${currentIndent}mambo.safe_takeoff(5)\n`;
        break;
      case 'land':
        result += `${currentIndent}print("Landing")\n`;
        result += `${currentIndent}mambo.safe_land(5)\n`;
        break;
      case 'forward':
        result += `${currentIndent}print("Moving forward")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=0, pitch=${speed}, yaw=0, vertical_movement=0, duration=${value})\n`;
        break;
      case 'backward':
        result += `${currentIndent}print("Moving backward")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=0, pitch=-${speed}, yaw=0, vertical_movement=0, duration=${value})\n`;
        break;
      case 'left':
        result += `${currentIndent}print("Moving left")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=-${speed}, pitch=0, yaw=0, vertical_movement=0, duration=${value})\n`;
        break;
      case 'right':
        result += `${currentIndent}print("Moving right")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=${speed}, pitch=0, yaw=0, vertical_movement=0, duration=${value})\n`;
        break;
      case 'up':
        result += `${currentIndent}print("Moving up")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=0, pitch=0, yaw=0, vertical_movement=${speed}, duration=${value})\n`;
        break;
      case 'down':
        result += `${currentIndent}print("Moving down")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=0, pitch=0, yaw=0, vertical_movement=-${speed}, duration=${value})\n`;
        break;
      case 'turn_left':
        result += `${currentIndent}print("Turning left")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=0, pitch=0, yaw=-${speed}, vertical_movement=0, duration=${value})\n`;
        break;
      case 'turn_right':
        result += `${currentIndent}print("Turning right")\n`;
        result += `${currentIndent}mambo.fly_direct(roll=0, pitch=0, yaw=${speed}, vertical_movement=0, duration=${value})\n`;
        break;
      case 'flip_front':
        result += `${currentIndent}print("Flipping front")\n`;
        result += `${currentIndent}mambo.flip(direction="front")\n`;
        break;
      case 'flip_back':
        result += `${currentIndent}print("Flipping back")\n`;
        result += `${currentIndent}mambo.flip(direction="back")\n`;
        break;
      case 'flip_left':
        result += `${currentIndent}print("Flipping left")\n`;
        result += `${currentIndent}mambo.flip(direction="left")\n`;
        break;
      case 'flip_right':
        result += `${currentIndent}print("Flipping right")\n`;
        result += `${currentIndent}mambo.flip(direction="right")\n`;
        break;
      case 'fire_cannon':
        result += `${currentIndent}print("Firing cannon")\n`;
        result += `${currentIndent}mambo.fire_gun()\n`;
        break;
      case 'open_claw':
        result += `${currentIndent}print("Opening claw")\n`;
        result += `${currentIndent}mambo.open_claw()\n`;
        break;
      case 'close_claw':
        result += `${currentIndent}print("Closing claw")\n`;
        result += `${currentIndent}mambo.close_claw()\n`;
        break;
      case 'loop':
        result += `${currentIndent}print("Starting loop: ${value} times")\n`;
        result += `${currentIndent}for i in range(${value}):\n`;
        if (cmd.commands && cmd.commands.length > 0) {
          cmd.commands.forEach(nestedCmd => {
            result += translateCommand(nestedCmd, currentIndent + '    ');
          });
        } else {
          result += `${currentIndent}    pass\n`;
        }
        break;
      case 'if':
        const condition = cmd.condition === 'is_flying' ? 'mambo.sensors.flying_state == "flying"' : 'mambo.sensors.flying_state != "flying"';
        result += `${currentIndent}if ${condition}:\n`;
        if (cmd.commands && cmd.commands.length > 0) {
          cmd.commands.forEach(nestedCmd => {
            result += translateCommand(nestedCmd, currentIndent + '    ');
          });
        } else {
          result += `${currentIndent}    pass\n`;
        }
        break;
    }
    return result;
  };

  commands.forEach(cmd => {
    code += translateCommand(cmd, indent);
  });

  code += `
    finally:
        print("Disconnecting")
        mambo.disconnect()
`;

  return code;
};
