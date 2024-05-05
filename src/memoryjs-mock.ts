let isFF7Running = false;
const FF7_PROCESS_NAME = "ff7_en.exe";
let ff7Memory: unknown[] = [];

export enum DataType {
    byte = 'byte',
    short = 'short',
    ushort = 'ushort',
    int = 'int',
    uint = 'uint',
    double = 'double',
    buffer = 'buffer',
};

export const memoryjs = {
    _runff7() {
        isFF7Running = true;
    },

    _stopff7() {
        isFF7Running = false;
    },

    _setMemory(memory: unknown[]) {
        ff7Memory = memory;
    },

    getProcesses() {
        const processList = ['explorer.exe']
        if (isFF7Running) {
            processList.push(FF7_PROCESS_NAME);
        }

        return processList.map(processName => ({szExeFile: processName, handle: 12345}))
    },

    openProcess(name: string) {
        if (name !== FF7_PROCESS_NAME || !isFF7Running) {
            throw Error('FF7 Is not running');
        }
        return {
            szExeFile: FF7_PROCESS_NAME,
            handle: 12345,
        }
    },

    readMemory(handle: number, address: number, dataType: DataType, callback: Function) {
        const error = null;

        if (dataType === DataType.byte) {
            const value = ff7Memory[address] as number;
            callback(error, value);
        } else if (dataType === DataType.short) {
            const v1 = ff7Memory[address] as number;
            const v2 = ff7Memory[address + 1] as number;
            const value = v2 << 8 | v1;
            callback(error, value);
        } else if (dataType === DataType.int) {
            const v1 = ff7Memory[address] as number;
            const v2 = ff7Memory[address + 1] as number;
            const v3 = ff7Memory[address + 2] as number;
            const v4 = ff7Memory[address + 3] as number;
            const value = v4 << 24 | v3 << 16 | v2 << 8 | v1;
            callback(error, value);
        } else if (dataType === DataType.double) {
            const arrayBuffer = new ArrayBuffer(8);    
            const arrayBytes = new Uint8Array(arrayBuffer);
            const doubles = new Float64Array(arrayBuffer); 
            for (let i = 7; i >= 0; i--) {
                arrayBytes[i] = ff7Memory[address + (7 - i)] as number;
            }
            callback(error, doubles[0])
        }
    },

    writeMemory(handle: number, address: number, value: number, dataType: DataType) {
        console.log(`Writing memory at ${address} value: ${value}`)
        if (dataType === DataType.byte) {
            ff7Memory[address] = value;
        } else if (dataType === DataType.short) {   // FF 02   -- 0x02FF
            ff7Memory[address] = value & 0xFF;
            ff7Memory[address + 1] = value >> 8;
        } else if (dataType === DataType.int) {     // FF 02 01 10  -- 0x100102FF
            ff7Memory[address] = value & 0xFF;
            ff7Memory[address + 1] = (value >> 8) & 0xFF;
            ff7Memory[address + 2] = (value >> 16) & 0xFF;
            ff7Memory[address + 3] = value >> 24;
        } else if (dataType === DataType.double) {   // 1.23402741
            const buffer = new ArrayBuffer(8);
            const doubles = new Float64Array(buffer); 
            doubles[0] = value;
            const values = Array.from(new Int8Array(buffer));
            for (let i = 7; i >= 0; i--) {
                ff7Memory[address + (7 - i)] = values[i];
            }
        }
    },

    writeBuffer(handle: number, address: number, buffer: Buffer) {
        for (let i = 0; i < buffer.length; i++) {
            ff7Memory[address + i] = buffer[i];
        }
    },
}
