import { DataType } from './memoryjs-mock';
import EventEmitter from 'events';
import { encodeText } from './lib/fftext';
import { OpcodeWriter } from './opcodewriter';
import { RngMode } from './state';
import { webcrypto } from 'crypto';

const memoryjs = require('memoryjs')

interface ProcessObj {
  szExeFile: string;
  handle: number;
  th32ProcessID: number;
}

enum FF7Events {
  Connect = 'connect',
  Disconnect = 'disconnect',
}

export enum FF7Address {
  FieldFPSValue = 0xCFF890,
  FieldFPSLimiterSet = 0x60E425,
  BattleFPSValue = 0x9AB090,
  BattleFPSLimiterSet = 0x41B6CF,
  MenuStartNilFunction = 0x721301,
  MenuStartDrawBusterFn = 0x721840,
  MenuStartDrawBusterAddr = 0x7224D7,
  MenuStartNewGameAddr = 0x7222A4,
  MenuSetIsOpenFn = 0x6CDC09,
  srand = 0x7AE9B0,
  CustomStartFunction = 0x6CCDA5,
  SpeedSquareTextAddr = 0x6CCEA5,
  CurrentModule = 0xCBF9DC,
  DrawText = 0x6F5b03,
  RngSeedParam = 0x6CCDBE,
  GetTimeFn = 0x660370,
  DiffTimeFn = 0x6603a0,
  FieldFpsLimiterFn = 0x6384E6,
  CustomGetTimeFn = 0x6386F0,
  CustomDiffTimeFn = 0x638710,
  CustomInt2Double = 0x638740,
  CustomConstants = 0x638760,
  CustomLastGametime = 0xcff8d8,
}

export class FF7 {
  private processObj: ProcessObj | null = null;
  private gameRunning = false;
  private monitoring = false;
  private emitter = new EventEmitter();

  // If the app was just launched and the game was already running we
  // skip the initialization timeout to connect to the game faster
  private firstCheck = true;

  // Battle RNG Seed memory location
  public battleRNGSeedAddr = 0;
  
  // RNG Seed setting function
  private battleRNGSeedSetFn = 0;

  // Memory transactions for rolling back memory writes
  private transactions: Record<string, { addr: number; value: number | Buffer; type: DataType }[]> = {};
  private currentTransaction: string | null = null;

  public currentRNGSeed = 0;
  public currentJokerInject = 0;
  public currentAnimInject = 0;
  public currentRNGMode: 'none' | 'random' | 'set' = 'none';

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

  startTransaction(name: string) {
    // If a transaction is already in progress, do nothing
    if (this.currentTransaction) return;

    // If a transaction by this name already exists, do nothing
    if (this.transactions[name]) return;

    this.currentTransaction = name;
    this.transactions[name] = [];
  }

  stopTransaction() {
    this.currentTransaction = null;
  }

  getRandomSeed() {
    // Generate a random seed that's at least equal to Jan 1, 1980 and is capped at 2^31 - 1
    let rng = 0;
    while (rng < 315529200) {
      const arr = new Uint32Array(1);
      webcrypto.getRandomValues(arr);
      rng = arr[0] % (2 ** 31 - 1);
    }
    return rng;
  }

  async rollbackTransaction(name: string) {
    const transaction = this.transactions[name];
    if (!transaction) return;

    for (const { addr, value, type } of transaction) {
      // Log the transaction data, format address and values as hex
      if (typeof value === 'number')
        console.log(
          `Rolling back transaction ${name} at ${addr.toString(16)} to ${value.toString(16)} (${type})`
        );
      else {
        console.log(
          `Rolling back transaction ${name} at ${addr.toString(16)} to ${value.toString('hex')} (${type})`
        );
      }

      await this.writeMemory(addr, value, type);
    }

    delete this.transactions[name];
  }

  async readMemory(addr: number, type: DataType, length?: number) {
    return new Promise((resolve: (value: number | Buffer) => void, reject) => {
      if (!this.processObj?.handle) return reject('No process handle found.');

      if (type === DataType.buffer) {
        memoryjs.readBuffer(this.processObj.handle, addr, length, (error: string, value: Buffer) => {
          if (!error) resolve(value);
          else reject(error);
        });
      }
      else {
        memoryjs.readMemory(this.processObj.handle, addr, type, (error: string, value: number) => {
          if (!error) resolve(value);
          else reject(error);
        });
      }
    });
  }

  async writeMemory(addr: number, value: number | Buffer, type: DataType) {
    return new Promise(async (resolve, reject) => {
      if (!this.processObj?.handle) return reject('No process handle found.');

      // If there's a transaction in progress, read the current value from memory and store it in transaction
      if (this.currentTransaction) {
        try {
          const length = type === DataType.buffer ? (value as Buffer).length : undefined;
          const currentValue = await this.readMemory(addr, type, length);
          this.transactions[this.currentTransaction].push({ addr, value: currentValue, type });

          if (typeof value === 'number')
            console.log(
              `Transaction ${this.currentTransaction} at ${addr.toString(16)} from ${(currentValue as number).toString(
                16
              )} (${type}) to ${value.toString(16)} (${type})`
            );
          else {
            console.log(
              `Transaction ${this.currentTransaction} at ${addr.toString(16)} from ${(currentValue as Buffer).toString(
                'hex'
              )} (${type}) to ${value.toString('hex')} (${type})`
            );
          }
        } catch (e) {
          console.error(e)
        }
      }

      if (type === DataType.buffer) {
        memoryjs.writeBuffer(this.processObj.handle, addr, value as Buffer);
      } else {
        memoryjs.writeMemory(this.processObj.handle, addr, value as number, type);
      }
      resolve(true);
    });
  }
  
  async writeStartScreenText() {
    const check = Number(await this.readMemory(FF7Address.SpeedSquareTextAddr, DataType.uint));
    if (check !== 0xFFD46067 && check != 0) {
      console.log("Text already written", check.toString(16));
      return;
    }

    // Store SpeedSquare text FF7-encoded in memory
    let text = "SCMSquare. ";
    if (this.currentRNGMode === RngMode.random) {
      text += `Random RNG seed: ${this.currentRNGSeed}. `
    } else if (this.currentRNGMode === RngMode.set) {
      text += `RNG: ${this.currentRNGSeed}. `
    } else {
      text += "Default RNG Seed"
    }

    text += `J: ${this.currentJokerInject}. A: ${this.currentAnimInject}`

    const encodedText = encodeText(text)
    await this.writeMemory(FF7Address.SpeedSquareTextAddr, encodedText, DataType.buffer)
  }

  async applyPatches() {
    const check = Number(await this.readMemory(FF7Address.CustomStartFunction, DataType.uint));
    if (check !== 0x83EC8B55) {
      // Write check in hex, unsigned
      console.log("Patches already applied", check.toString(16));
      return;
    }

    console.log("Applying patches...")

    // Patch the MenuStartLoop function to call our 1st custom function
    let writer = new OpcodeWriter(FF7Address.MenuStartDrawBusterFn)
    writer.writeCall(FF7Address.CustomStartFunction)
    await this.writeMemory(FF7Address.MenuStartDrawBusterFn, writer.toBuffer(), DataType.buffer)

    // First custom function - display SpeedSquare text on the new game screen
    const functionStart = FF7Address.CustomStartFunction + 3
    writer = new OpcodeWriter(functionStart) // skipping initial 2 opcodes
    writer.writeCall(FF7Address.DrawText, [10, 13, FF7Address.SpeedSquareTextAddr, 6, 0])
    writer.writeCall(FF7Address.MenuStartDrawBusterAddr)
    writer.writeReturn()

    const check2 = Number(await this.readMemory(FF7Address.SpeedSquareTextAddr, DataType.uint));
    if (check2 === 0xFFD46067) {
      const encodedText = encodeText("    ")
      await this.writeMemory(FF7Address.SpeedSquareTextAddr, encodedText, DataType.buffer)
    }

    // Second custom function - write battle RNG seed when new game starts
    this.battleRNGSeedSetFn = writer.offset
    writer.writeStart()
    // writer.writeCall(FF7Address.srand, [0x0BAD5EED]) // the argument here is a placeholder to be replaced at runtime
    // this.battleRNGSeedAddr = writer.offset - 12

    // Self modifying code to disable the RNG injection after it runs once
    // writer.write(0xBF) // MOV EDI, battleRNGSeedAddr
    // writer.writeInt32(this.battleRNGSeedSetFn + 8)
    // writer.write([0xB0, 0x90]) // MOV AL, 90
    // writer.write([0xB9, 0x5, 0, 0, 0]) // MOV ECX, 05
    // writer.write(0xFC) // CLD
    // writer.write([0xF3, 0xAA]) // REP STOSB
    
    writer.writeReturn()
    await this.writeMemory(functionStart, writer.toBuffer(), DataType.buffer)

    // Disable write protection for the RNG Seed function memory area
    await memoryjs.virtualProtectEx(this.processObj?.handle, FF7Address.MenuStartNilFunction, 13, memoryjs.PAGE_EXECUTE_READWRITE);
  }

  // Patch the MenuStartLoop function to call our 2st custom function
  async applyRNGSeedPatch() {
    if (this.battleRNGSeedSetFn === 0) {
      console.log("RNG seed function not found, aborting...")
      return;
    }

    const writer = new OpcodeWriter(FF7Address.MenuStartNilFunction) 
    writer.writeCall(this.battleRNGSeedSetFn, [65535])
    await this.writeMemory(FF7Address.MenuStartNilFunction, writer.toBuffer(), DataType.buffer)
    await this.writeStartScreenText()
  }
  
  // Revert the MenuStartLoop patch
  async revertRNGSeedPatch() {
    console.log("Reverting RNG seed patch...")
    const writer = new OpcodeWriter(FF7Address.MenuStartNilFunction) 
    writer.writeDummyCall(1)
    await this.writeMemory(FF7Address.MenuStartNilFunction, writer.toBuffer(), DataType.buffer)
    await this.writeStartScreenText()
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
          // console.log('FF7 executable not found under process name: ' + name);
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