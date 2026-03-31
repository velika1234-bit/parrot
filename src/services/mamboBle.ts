import { Command } from '../types';

// Parrot Mambo BLE UUIDs
const MAMBO_SERVICE = '9a66fb00-0800-9191-11e4-012d1540cb8e';
const COMMAND_CHARACTERISTIC = '9a66fb0a-0800-9191-11e4-012d1540cb8e';
const PCMD_CHARACTERISTIC = '9a66fb0b-0800-9191-11e4-012d1540cb8e';
const NAVDATA_CHARACTERISTIC = '9a66fb0e-0800-9191-11e4-012d1540cb8e';
const EVENTDATA_CHARACTERISTIC = '9a66fb0f-0800-9191-11e4-012d1540cb8e';

export class MamboBLE {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null; // ACK Characteristic (fb0a)
  private pcmdCharacteristic: BluetoothRemoteGATTCharacteristic | null = null; // PCMD Characteristic (fa0b)
  private navDataCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private sequenceNumber = 0;
  private pcmdSequenceNumber = 0;
  private startTime = Date.now();
  private keepAliveInterval: any = null;
  private isTakingOff = false;
  private isConnecting = false;
  public onDisconnect: (() => void) | null = null;
  public onBatteryUpdate: ((level: number) => void) | null = null;
  public onFlightStateUpdate: ((state: string) => void) | null = null;
  public logs: string[] = [];
  public batteryLevel: number | null = null;
  public flightState: string = 'landed';

  private log(msg: string) {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    console.log(entry);
    this.logs.push(entry);
    if (this.logs.length > 50) this.logs.shift();
  }

  reset() {
    this.stopKeepAlive();
    this.isTakingOff = false;
    this.sequenceNumber = 1;
    this.pcmdSequenceNumber = 1;
    this.batteryLevel = null;
    this.flightState = 'landed';
    if (this.device?.gatt?.connected) {
      try {
        this.device.gatt.disconnect();
      } catch (e) {}
    }
    this.device = null;
    this.characteristic = null;
    this.pcmdCharacteristic = null;
    this.navDataCharacteristic = null;
    this.log('Връзката е нулирана напълно.');
  }

  async connect(): Promise<boolean> {
    if (this.isConnecting) {
      this.log('Вече се прави опит за свързване...');
      return false;
    }
    this.isConnecting = true;

    if (!navigator.bluetooth) {
      this.isConnecting = false;
      throw new Error('Web Bluetooth не се поддържа от този браузър.');
    }

    try {
      this.reset();
      this.log('ЕТАП 1: Търсене на Bluetooth устройство...');
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Mambo' },
          { namePrefix: 'Minidrone' },
          { namePrefix: 'Mars' },
          { namePrefix: 'Travis' }
        ],
        optionalServices: [
          '9a66fa00-0800-9191-11e4-012d1540cb8e',
          '9a66fb00-0800-9191-11e4-012d1540cb8e',
          '9a66fe00-0800-9191-11e4-012d1540cb8e'
        ]
      });

      this.log(`Устройството е избрано: ${this.device.name}`);
      
      this.device.addEventListener('gattserverdisconnected', () => {
        this.log('Връзката с дрона бе прекъсната.');
        this.reset();
        if (this.onDisconnect) this.onDisconnect();
      });

      this.log('Свързване към Bluetooth (GATT)...');
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error('Неуспешно свързване към GATT сървър.');
      this.log('ЕТАП 1: Bluetooth връзката е успешна!');

      this.log('ЕТАП 2: Инициализиране на услугите...');
      
      const service = await server.getPrimaryService(MAMBO_SERVICE);
      this.characteristic = await service.getCharacteristic(COMMAND_CHARACTERISTIC);
      this.pcmdCharacteristic = await service.getCharacteristic(PCMD_CHARACTERISTIC);
      
      const setupNotify = async (uuid: string, name: string) => {
        try {
          const char = await service.getCharacteristic(uuid);
          await char.startNotifications();
          char.addEventListener('characteristicvaluechanged', (event: any) => {
            this.handleNavData(event.target.value);
          });
          this.log(`Абонаментът за ${name} е активен.`);
          if (name === 'NavData') this.navDataCharacteristic = char;
        } catch (e) {
          this.log(`Предупреждение: Неуспешен абонамент за ${name}`);
        }
      };

      await setupNotify(NAVDATA_CHARACTERISTIC, 'NavData');
      await setupNotify(EVENTDATA_CHARACTERISTIC, 'EventData');

      this.log('Връзката е напълно установена и готова за команди!');
      await new Promise(r => setTimeout(r, 1000));
      await this.sendHandshake();
      
      this.isConnecting = false;
      return true;
    } catch (error: any) {
      this.isConnecting = false;
      this.log(`Грешка при свързване: ${error.message}`);
      this.reset();
      throw error;
    }
  }

  private handleNavData(value: DataView) {
    try {
      const buffer = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const hex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(' ');
      
      // Log EVERYTHING for debugging
      this.log(`Данни от дрона: ${hex}`);

      if (buffer.length < 2) return;
      const type = buffer[0];
      const seq = buffer[1];
      
      // Handle ACK (Type 1)
      if (type === 0x01) {
        this.log(`ACK получено за Seq: ${seq}`);
        return;
      }

      if (buffer.length < 6) return;
      
      const project = buffer[2];
      const clazz = buffer[3];
      const command = buffer[4] | (buffer[5] << 8);
      const payloadOffset = 6;

      // Handle DATA_WITH_ACK (Type 4)
      if (type === 0x04) {
        // Send ACK back: Type 1, Seq
        const ackFrame = new Uint8Array([0x01, seq]);
        this.sendCommandRaw(ackFrame).catch(() => {});
      }

      // Handle Ping (Type 2, Project 0, Class 0, Command 0)
      if (type === 0x02 && project === 0x00 && clazz === 0x00 && command === 0x00) {
        const pongFrame = new Uint8Array([0x02, seq, 0x00, 0x00, 0x00, 0x00]);
        this.sendCommandRaw(pongFrame).catch(() => {});
        return;
      }

      // Battery: Project 0, Class 5, Command 1
      if (project === 0x00 && clazz === 0x05 && command === 0x01) {
        const level = buffer[payloadOffset];
        if (this.batteryLevel !== level) {
          this.log(`Ниво на батерията: ${level}%`);
          this.batteryLevel = level;
          if (this.onBatteryUpdate) this.onBatteryUpdate(level);
        }
      }
      
      // Flight State: Project 2, Class 3, Command 1 (FlightStateChanged)
      // OR Project 2, Class 3, Command 3 (FlyingStateChanged)
      if (project === 0x02 && clazz === 0x03 && (command === 0x01 || command === 0x03)) {
        const stateCode = buffer[payloadOffset];
        const states = ['landed', 'taking_off', 'hovering', 'flying', 'landing', 'emergency', 'rolling', 'init'];
        const state = states[stateCode] || 'unknown';
        if (this.flightState !== state) {
          this.log(`СЪСТОЯНИЕ НА ПОЛЕТА: ${state.toUpperCase()}`);
          this.flightState = state;
          if (this.onFlightStateUpdate) this.onFlightStateUpdate(state);
        }
      }

      // Motor Error: Project 2, Class 3, Command 2
      if (project === 0x02 && clazz === 0x03 && command === 0x02) {
        const motorError = buffer[payloadOffset];
        if (motorError !== 0) {
          const errors = ['None', 'Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Battery Low', 'Emergency'];
          this.log(`ГРЕШКА В МОТОРИТЕ: ${errors[motorError] || motorError}`);
        }
      }
    } catch (e) {
      this.log(`Грешка при обработка на данни: ${e}`);
    }
  }

  private async sendCommandRaw(buffer: Uint8Array, forceResponse: boolean = false) {
    // Type 3 (NON_ACK) always goes to PCMD characteristic (fb0b)
    const isPcmd = buffer[0] === 0x03;
    const char = isPcmd ? this.pcmdCharacteristic : this.characteristic;
    
    if (!char) return;
    
    try {
      const hex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(' ');
      
      // Only log PCMD occasionally to avoid flooding
      if (!isPcmd || this.pcmdSequenceNumber % 10 === 0) {
        this.log(`Изпратено: ${hex}`);
      }

      if (isPcmd && !forceResponse) {
        await char.writeValueWithoutResponse(buffer);
      } else {
        await char.writeValue(buffer);
      }
    } catch (error: any) {
      this.log(`Грешка при изпращане: ${error.message}`);
    }
  }

  private async sendCommand(buffer: Uint8Array, forceResponse: boolean = false, incrementSequence: boolean = true) {
    await this.sendCommandRaw(buffer, forceResponse);
    
    if (incrementSequence) {
      const isPcmd = buffer[0] === 0x03;
      if (isPcmd) {
        this.pcmdSequenceNumber = (this.pcmdSequenceNumber + 1) % 255;
        if (this.pcmdSequenceNumber === 0) this.pcmdSequenceNumber = 1;
      } else {
        this.sequenceNumber = (this.sequenceNumber + 1) % 255;
        if (this.sequenceNumber === 0) this.sequenceNumber = 1;
      }
    }
  }

  private createCommand(project: number, clazz: number, command: number, data?: string | number[] | Uint8Array, type: number = 0x02): Uint8Array {
    let dataBytes: Uint8Array = new Uint8Array(0);
    if (data !== undefined) {
      if (typeof data === 'string') {
        dataBytes = new TextEncoder().encode(data + '\0');
      } else if (Array.isArray(data)) {
        dataBytes = new Uint8Array(data);
      } else if (data instanceof Uint8Array) {
        dataBytes = data;
      }
    }
    
    const buffer = new Uint8Array(6 + dataBytes.length);
    buffer[0] = type; 
    buffer[1] = (type === 0x03) ? this.pcmdSequenceNumber : this.sequenceNumber;
    buffer[2] = project;
    buffer[3] = clazz;
    buffer[4] = command & 0xFF;
    buffer[5] = (command >> 8) & 0xFF;
    
    if (dataBytes.length > 0) {
      buffer.set(dataBytes, 6);
    }
    return buffer;
  }

  private async sendHandshake() {
    this.log('Инициализиране на сесията (Handshake)...');
    try {
      // 1. Identify as Smartphone (Project 0, Class 1, Command 1)
      await this.sendCommand(this.createCommand(0, 1, 1, [1, 0, 0, 0]));
      await new Promise(r => setTimeout(r, 300));

      // 2. Request all settings
      await this.sendCommand(this.createCommand(0, 2, 0));
      await new Promise(r => setTimeout(r, 300));

      // 3. Request all states
      await this.sendCommand(this.createCommand(0, 5, 0));
      await new Promise(r => setTimeout(r, 300));
      
      this.log('Свързан успешно и инициализиран!');
      this.startKeepAlive();
    } catch (error) {
      this.log(`Грешка при инициализация: ${error}`);
    }
  }

  async takeoff() {
    if (!this.characteristic || this.isTakingOff) return;
    this.isTakingOff = true;
    this.log('ПРОЦЕДУРА ПО ИЗЛИТАНЕ...');
    
    try {
      // 1. Flat Trim (Crucial for stability)
      await this.flatTrim();
      await new Promise(r => setTimeout(r, 1000));

      // 2. Takeoff (Project 2, Class 0, Command 1)
      // Use Type 4 (DATA_WITH_ACK) for guaranteed delivery
      this.log('Изпращане на Takeoff...');
      await this.sendCommand(this.createCommand(2, 0, 1, undefined, 0x04), true);
      
      this.log('Командата е изпратена. Изчакайте...');

    } catch (e: any) {
      this.log(`Грешка при излитане: ${e.message}`);
    } finally {
      this.isTakingOff = false;
    }
  }

  async land() {
    if (!this.characteristic) return;
    this.log('Команда за кацане...');
    this.stopKeepAlive();
    try {
      // Land (Project 2, Class 0, Command 3)
      // Type 4 (DATA_WITH_ACK)
      await this.sendCommand(this.createCommand(2, 0, 3, undefined, 0x04));
      setTimeout(() => this.startKeepAlive(), 3000);
    } catch (e: any) {
      this.log(`Грешка при кацане: ${e.message}`);
      this.startKeepAlive();
    }
  }

  async emergency() {
    if (!this.characteristic) return;
    this.log('АВАРИЙНО СПИРАНЕ!');
    // Emergency is project 2, class 0, command 4
    // We use Type 2 (DATA) for emergency as it's often handled faster
    await this.sendCommand(this.createCommand(2, 0, 4, undefined, 0x02));
  }

  async flatTrim() {
    if (!this.characteristic) return;
    this.log('Flat Trim...');
    // FlatTrim is project 2, class 0, command 0
    await this.sendCommand(this.createCommand(2, 0, 0, undefined, 0x02));
  }

  async move(roll: number, pitch: number, yaw: number, vertical: number, duration: number) {
    const startTime = Date.now();
    while (Date.now() - startTime < duration * 1000) {
      await this.setPiloting(roll, pitch, yaw, vertical);
      await new Promise(r => setTimeout(r, 50));
    }
    await this.setPiloting(0, 0, 0, 0);
  }

  async flip(direction: 'front' | 'back' | 'left' | 'right') {
    let dirByte = 0x00;
    if (direction === 'front') dirByte = 0x00;
    else if (direction === 'back') dirByte = 0x01;
    else if (direction === 'right') dirByte = 0x02;
    else if (direction === 'left') dirByte = 0x03;
    
    await this.sendCommand(this.createCommand(2, 4, 0, [dirByte, 0, 0, 0]));
  }

  async fireCannon() {
    await this.sendCommand(this.createCommand(2, 16, 2, [0, 0, 0, 0]));
  }

  async controlClaw(open: boolean) {
    const action = open ? 0x00 : 0x01;
    await this.sendCommand(this.createCommand(2, 16, 1, [0, action, 0, 0]));
  }

  async setPiloting(roll: number, pitch: number, yaw: number, gaz: number) {
    if (!this.pcmdCharacteristic) return;

    const flag = (roll === 0 && pitch === 0) ? 0x00 : 0x01;
    const toByte = (v: number) => {
      const b = Math.max(-100, Math.min(100, Math.round(v)));
      return b < 0 ? 256 + b : b;
    };

    const buffer = new Uint8Array(11);
    buffer[0] = 0x03; // Type 3 (NON_ACK)
    buffer[1] = this.pcmdSequenceNumber;
    buffer[2] = 2; // Project
    buffer[3] = 0; // Class
    buffer[4] = 2; // Command LSB
    buffer[5] = 0; // Command MSB
    buffer[6] = flag;
    buffer[7] = toByte(roll);
    buffer[8] = toByte(pitch);
    buffer[9] = toByte(yaw);
    buffer[10] = toByte(gaz);
    
    await this.sendCommand(buffer);
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    this.log('Keep-alive стартиран (500ms)');
    let count = 0;
    this.keepAliveInterval = setInterval(() => {
      if (this.pcmdCharacteristic && this.device?.gatt?.connected) {
        this.setPiloting(0, 0, 0, 0).catch(() => {});
        count++;
      }
    }, 500);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  disconnect() {
    this.stopKeepAlive();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }
}

export const mamboBle = new MamboBLE();
