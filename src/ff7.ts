import { DataType } from './memoryjs-mock';
import EventEmitter from 'events';
import { encodeText } from './lib/fftext';
import { OpcodeWriter } from './opcodewriter';
import { callWithTimeout } from './lib/utils';

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
  BattleFPSValue = 0x9AB090,
  BattleFPSLimiterSet = 0x41B6CF,
  MenuStartNilFunction = 0x721306,
  MenuStartDrawBusterFn = 0x721840,
  MenuStartDrawBusterAddr = 0x7224D7,
  MenuStartNewGameAddr = 0x7222A4,
  MenuSetIsOpenFn = 0x6CDC09,
  StoreRngSeed = 0x7AE9B0,
  CustomStartFunction = 0x6CCDA5,
  SpeedSquareTextAddr = 0x6CCEA5,
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

  // Battle RNG Seed memory location
  public battleRNGSeedAddr = 0;
  
  // RNG Seed setting function
  private battleRNGSeedSetFn = 0;

  // Memory transactions for rolling back memory writes
  private transactions: Record<string, { addr: number; value: number | Buffer; type: DataType }[]> = {};
  private currentTransaction: string | null = null;

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
    console.log("Start transaction")
    // If a transaction is already in progress, do nothing
    if (this.currentTransaction) return;

    // If a transaction by this name already exists, do nothing
    if (this.transactions[name]) return;

    this.currentTransaction = name;
    this.transactions[name] = [];
  }

  stopTransaction() {
    console.log("Stop transaction")
    this.currentTransaction = null;
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
  
  // Fix Battle Swirl FPS Limiter
  async patchBattleSwirl() {
    console.log("Patching battle swirl...")
    // Adjust the jump instruction so it lands on our new mov opcode after the conditional
    await this.writeMemory(0x402263, 0x1775, DataType.short); // jne 00402279

    // Set value at 0x9A04E8 (fps limiter flag) to 1 at the start of every battle swirl tick
    // This replaces a debug log function call that serves us no purpose
    const bytesMov = Buffer.from([0xC7, 5, 0xE8, 4, 0x9A, 0, 1, 0, 0, 0, 0x90, 0x90, 0x90]);
    await this.writeMemory(0x40227C, bytesMov, DataType.buffer) // mov [009A04E8],00000001

    // Remove a duplicate swirl call that was called regardless of the limiter
    const bytesNop = Buffer.from(Array(8).fill(0x90));
    await this.writeMemory(0x4022B2, bytesNop, DataType.buffer) 

    // Set the target battle swirl FPS to 60 (originally it's 30)
    await this.writeMemory(0x7BA1B8, 60.0, DataType.double); // 60 fps
  }

  async patchWindowUnfocus(): Promise<void> {
    console.log("Patching window unfocus...")

    // First we need to find the location of Game Object in memory
    const gameObjPtr = await this.readMemory(0xDB2BB8, DataType.int) as number;

    // Check if window already was unfocused (tick function pointer is out of program memory)
    const tickFunctionPtr = await this.readMemory(gameObjPtr + 0xa00, DataType.int);
    if (tickFunctionPtr > 0xFFFFFF) {
      // If it is unfocused, delay patching until it's focused
      await callWithTimeout(() => this.patchWindowUnfocus(), 250);
      return;
    }
    
    // Find the function responsible for halting the game when unfocused
    const gfxFunctionPtrs = await this.readMemory(gameObjPtr + 0x934, DataType.int) as number;
    const gfxFlipPtr = await this.readMemory(gfxFunctionPtrs + 0x4, DataType.int) as number;

    // Add a RET instruction at the beginning of this function
    await this.writeMemory(gfxFlipPtr + 0x260, 0xC3, DataType.byte); 

    // Add Global Focus flag to sound buffer initialization so we don't lose sound while unfocued
    await this.writeMemory(0x74a561, 0x80, DataType.byte); 
  }

  async applyPatches() {
    // Remove code that sets the field FPS when field module initializes
    // because we will set this value ourselves
    let nops = Buffer.from(new Array(21).fill(0x90))
    await this.writeMemory(FF7Address.FieldFPSLimiterSet, nops, DataType.buffer)

    // Same for Battle FPS
    nops = Buffer.from(new Array(15).fill(0x90))
    await this.writeMemory(FF7Address.BattleFPSLimiterSet, nops, DataType.buffer)

    // Patch the MenuStartLoop function to call our 1st custom function
    let writer = new OpcodeWriter(FF7Address.MenuStartDrawBusterFn)
    writer.writeCall(FF7Address.CustomStartFunction)
    await this.writeMemory(FF7Address.MenuStartDrawBusterFn, writer.toBuffer(), DataType.buffer)

    // Store SpeedSquare text FF7-encoded in memory
    const encodedText = encodeText("SpeedSquare is active")
    const encodedTextAddress = FF7Address.SpeedSquareTextAddr
    await this.writeMemory(encodedTextAddress, encodedText, DataType.buffer)

    // First custom function - display SpeedSquare text on the new game screen
    const functionStart = FF7Address.CustomStartFunction + 3
    writer = new OpcodeWriter(functionStart) // skipping initial 2 opcodes
    writer.writeCall(FF7Address.DrawText, [10, 13, encodedTextAddress, 6, 0])
    writer.writeCall(FF7Address.MenuStartDrawBusterAddr)
    writer.writeReturn()

    // Second custom function - write battle RNG seed when new game starts
    this.battleRNGSeedSetFn = writer.offset
    writer.writeStart()
    writer.writeCall(FF7Address.StoreRngSeed, [2048]) // the argument here is a placeholder to be replaced at runtime
    this.battleRNGSeedAddr = writer.offset - 12
    writer.writeCall(FF7Address.MenuSetIsOpenFn, [0])
    writer.writeReturn()
    await this.writeMemory(functionStart, writer.toBuffer(), DataType.buffer)
  }

  // Patch the MenuStartLoop function to call our 2st custom function
  async applyRNGSeedPatch() {
    const writer = new OpcodeWriter(FF7Address.MenuStartNewGameAddr) 
    writer.writeCall(this.battleRNGSeedSetFn, [0])
    await this.writeMemory(FF7Address.MenuStartNewGameAddr, writer.toBuffer(), DataType.buffer)
  }
  
  // Revert the MenuStartLoop patch
  async revertRNGSeedPatch() {
    const writer = new OpcodeWriter(FF7Address.MenuStartNewGameAddr) 
    writer.writeCall(FF7Address.MenuSetIsOpenFn, [0])
    await this.writeMemory(FF7Address.MenuStartNewGameAddr, writer.toBuffer(), DataType.buffer)
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