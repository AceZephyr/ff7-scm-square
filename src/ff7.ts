import { DataType } from './memoryjs-mock';
import EventEmitter from 'events';
import { encodeText } from './lib/fftext';
import { OpcodeWriter } from './opcodewriter';
import { RngMode, state } from './state';
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
  public currentFileMode: 'none' | 'new' | 'continue' = 'none';
  public currentFileIdxInject = 0;
  public currentSlotIdxinject = 0;
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

  async resetLoadPatch() {
    await this.writeMemory(0x722376, 0x72225a, DataType.uint);
  }

  async writeAutoNewGamePatch() {
    await this.writeMemory(0x722376, 0x722283, DataType.uint);
  }

  async writeAutoLoadPatch() {
    let writer = new OpcodeWriter(0x60b6f3);

    writer.write([0x6a, this.currentFileIdxInject]); // PUSH FILE_INDEX
    writer.write([0x6a, 0]); // PUSH 0
    writer.write([0xb8, 0xbc, 0x10, 0x72, 0x00]); // MOV EAX, StartMenuFileLoad
    writer.write([0xff, 0xd0]); // CALL EAX
    writer.write([0x83, 0xc4, 0x08]); // ADD ESP, 0x8

    writer.write([0x83, 0xf8, 0]); // CMP EAX, 0
    writer.write([0x75, 0x11]); // JNZ afterErr

    writer.write([0xc7, 0x05, 0x04, 0x77, 0xdd, 0x00, 0, 0, 0, 0]); // MOV dword ptr [StartMenuMode], 0
    writer.write([0xb8, 0xc0, 0x22, 0x72, 0x00]); // MOV EAX, 0x7222c0
    writer.write([0xff, 0xe0]); // JMP EAX

    // afterErr
    writer.write([0xc7, 0x05, 0xd4, 0x6d, 0xdd, 0x00, this.currentSlotIdxinject, 0, 0, 0]) // MOV dword ptr [SelFileIdx], SLOT_INDEX
    writer.write([0xb8, 0x68, 0x21, 0x72, 0x00]); // MOV EAX, 0x722168
    writer.write([0xff, 0xe0]); // JMP EAX

    await this.writeMemory(0x60b6f3, writer.toBuffer(), DataType.buffer);
    await this.writeMemory(0x722376, 0x60b6f3, DataType.uint);
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

  async updateInject() {
    this.currentFileMode = 'none';
    if (state.rng.fileAuto && state.rng.fileNum?.match(/\d{1,2}/g)) {
      const fileNum = parseInt(state.rng.fileNum);
      if (fileNum === 0) {
        this.currentFileMode = 'new';
      } else if (1 <= fileNum && fileNum <= 10) {
        this.currentFileIdxInject = fileNum - 1;
        if (state.rng.slotNum?.match(/\d{1,2}/g)) {
          const slotNum = parseInt(state.rng.slotNum);
          if (1 <= slotNum && slotNum <= 15) {
            this.currentSlotIdxinject = slotNum - 1;
            this.currentFileMode = 'continue';
          }
        } else {
          this.currentSlotIdxinject = -1;
        }
      }
    }

    // load patch
    if (this.currentFileMode === 'new')
      await this.writeAutoNewGamePatch();
    else if (this.currentFileMode === 'continue')
      await this.writeAutoLoadPatch();
    else
      await this.resetLoadPatch();
  }

  async startupInject() {
    const check = Number(await this.readMemory(FF7Address.CustomStartFunction, DataType.uint));
    if (check !== 0x83EC8B55) {
      // Write check in hex, unsigned
      console.log("Patches already applied", check.toString(16));
      return;
    }

    console.log("Applying patches...");

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

    await this.writeMemory(functionStart, writer.toBuffer(), DataType.buffer)

    function seedIsValid() {
      return (state.rng.isHex && state.rng.seed?.match(/[0-9A-Fa-f]+/g) || !state.rng.isHex && state.rng.seed?.match(/\d+/g))
    }

    function parseSeed() {
      return parseInt(state.rng.seed, state.rng.isHex ? 16 : 10);
    }

    if (state.rng.inject) {
      if (state.rng.mode === RngMode.set && seedIsValid()) {
        this.currentRNGSeed = parseSeed();
        this.currentRNGMode = RngMode.set;
        this.currentJokerInject = state.rng.joker?.match(/\d+/g) ? parseInt(state.rng.joker) : 0;
        this.currentAnimInject = state.rng.anim?.match(/\d+/g) ? parseInt(state.rng.anim) : 0;
        // inject sysRNG state
        const sp1 = await this.readMemory(0x7BCFE0, DataType.uint);
        if (typeof (sp1) === 'number') {
          await this.writeMemory(sp1 + 0x114, this.currentRNGSeed, DataType.uint);
          console.log(`Seed Addr: ${(sp1 + 0x114).toString(16)}`)
        }

        // inject joker
        await this.writeMemory(0xC06748, this.currentJokerInject & 7, DataType.uint);
        // inject anim
        await this.writeMemory(0xC05F80, this.currentAnimInject & 15, DataType.uint);
        console.log(`Seed: ${this.currentRNGSeed}, Joker: ${this.currentJokerInject}, Anim: ${this.currentAnimInject}`);

      }
    } else {
      this.currentRNGMode = RngMode.none;
      console.log("No RNG seed injected")
    }

    // intro skip
    await this.writeMemory(0xF4F448, 1, DataType.byte);

    // write start screen text
    await this.writeStartScreenText();
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
            await this.startupInject()
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
      } catch (e) {
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