import { DataType } from './memoryjs-mock';
import EventEmitter from 'events';
import { encodeText } from './lib/fftext';
import { OpcodeWriter } from './opcodewriter';

const memoryjs = require('memoryjs')

interface ProcessObj {
  szExeFile: string;
  handle: number;
}

enum FF7Events {
  Connect = 'connect',
  Disconnect = 'disconnect',
}

export enum FF7Address {
  FieldFPSValue = 0xCFF890,
  FieldFPSLimiterSet = 0x60E425,
  MenuStartNilFunction = 0x721306,
  StoreRngSeed = 0x7AE9B0,
  CustomStartFunction = 0x6CCDA5,
  CurrentModule = 0xCBF9DC,
  DrawText = 0x6F5b03,
  RngSeedParam = 0x6CCDBE,
}

export class FF7 {
  private processObj: ProcessObj | null = null;
  private gameRunning = false;
  private monitoring = false;
  private emitter = new EventEmitter();

  // If the app was just launched and the game was already running we
  // skip the initialization timeout to connect to the game faster
  private firstCheck = true;

  LOOP_INTERVAL_MS = 100;

  constructor() {
    this.connectionLoop();
  }

  _runff7() {
    memoryjs._runff7();
  }

  _stopff7() {
    memoryjs._stopff7();
  }

  start() {
    this.monitoring = true;
    this.connectionLoop();
  }

  stop() {
    this.monitoring = false;
  }

  isRunning() {
    return this.gameRunning;
  }

  onConnect(callback: (...args: any[]) => void) {
    this.emitter.on(FF7Events.Connect, callback);
  }

  onDisconnect(callback: (...args: any[]) => void) {
    this.emitter.on(FF7Events.Disconnect, callback);
  }

  async readMemory(addr: number, type: DataType) {
    return new Promise((resolve, reject) => {
      if (!this.processObj?.handle) return reject('No process handle found.');
      memoryjs.readMemory(this.processObj.handle, addr, type, (error: string, value: number) => {
        if (!error) resolve(value);
        else reject(error);
      });
    });
  }

  async writeMemory(addr: number, value: number | Buffer, type: DataType) {
    return new Promise((resolve, reject) => {
      if (!this.processObj?.handle) return reject('No process handle found.');
      if (type === DataType.buffer) {
        memoryjs.writeBuffer(this.processObj.handle, addr, value as Buffer);
      } else {
        memoryjs.writeMemory(this.processObj.handle, addr, value as number, type);
      }
      resolve(true);
    });
  }

  async applyPatches() {
    // Remove code that sets the field FPS when field module initializes
    // because we will set this value ourselves
    const nops = Buffer.from(new Array(21).fill(0x90))
    await this.writeMemory(FF7Address.FieldFPSLimiterSet, nops, DataType.buffer)

    // Patch the MenuStart function to call our custom function
    let writer = new OpcodeWriter(FF7Address.MenuStartNilFunction)
    writer.writeCall(FF7Address.CustomStartFunction)
    await this.writeMemory(FF7Address.MenuStartNilFunction, writer.toBuffer(), DataType.buffer)

    const encodedText = encodeText("SpeedSquare is active")
    const encodedTextAddress = FF7Address.CustomStartFunction + 50
    await this.writeMemory(encodedTextAddress, encodedText, DataType.buffer)

    const functionStart = FF7Address.CustomStartFunction + 3
    writer = new OpcodeWriter(functionStart) // skipping initial 2 opcodes
    writer.writeCall(FF7Address.DrawText, [10, 10, encodedTextAddress, 6, 0])
    writer.writeCall(FF7Address.StoreRngSeed, [2048]) // the argument here is a placeholder to be replaced at runtime
    writer.writeReturn()
    await this.writeMemory(functionStart, writer.toBuffer(), DataType.buffer)
  }

  connect() {
    // start a loop that scans available processes and connects to ff7 process if it exists 
    const processNames = ['ff7.exe', 'ff7_en.exe', 'ff7_mo.exe', 'ff7_bc.exe'];
    if (this.processObj === null) {
      for (const name of processNames) {
        try {
          this.processObj = memoryjs.openProcess(name);
          this.gameRunning = true;
          console.log('Found FF7 executable with process name: ' + name);
  
          // Patch the code (wait a bit to not crash the app when starting)
          setTimeout(async () => {
            await this.applyPatches()
            this.emitter.emit(FF7Events.Connect);
          }, this.firstCheck ? 50 : 2500);
          break;
        } catch (e) {
          console.log('FF7 executable not found under process name: ' + name);
        }
      }

      // If the game was running but there is no process found anymore - reset the gameRunning flag
      if (!this.processObj && this.gameRunning) {
        this.gameRunning = false;
        this.emitter.emit(FF7Events.Disconnect);
      }
    } else {
      // Check if there still exists FF7 game process in memory
      try {
        const processes = memoryjs.getProcesses();
        const game = processes.find((process: any) => process.szExeFile === this.processObj!.szExeFile);
        if (!game) {
          console.log("Game not found anymore.");
          this.gameRunning = false;
          this.processObj = null;
          this.emitter.emit(FF7Events.Disconnect);
        }
      } catch(e) {
        console.log("Error occured while trying to get the process list:", e);
      }
    }    

    this.firstCheck = false;
  }

  connectionLoop() {
    if (this.monitoring) this.connect();
    setTimeout(this.connectionLoop.bind(this), this.LOOP_INTERVAL_MS);
  }
}