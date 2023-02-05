const {memoryjs} = require('./memoryjs-mock');

const ff7Exe = "ff7_en.exe";
const ff7ExeObject = {"szExeFile": "ff7_en.exe", handle: 12345};
let memory = [];

describe("memoryjs", () => {
    beforeEach(() => {
        // test memory layout
        memory = [
            0, 0, 48, 69, 0, 100, 101, 102, 103, 104, 110, 111, 112, 113, 114, 115, // 0x0F
            1, 2, 3, 4, 0x40, 0x72, 0x50, 0x82, 0, 0, 0, 0
        ];
        memoryjs._setMemory(memory);
    });

    test('getProcesses - game not running', () => {
        memoryjs._stopff7();
        expect(memoryjs.getProcesses()).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining(ff7ExeObject)
            ])
        )    
    });

    test('getProcesses - game running', () => {
        memoryjs._runff7();
        expect(memoryjs.getProcesses()).toEqual(
            expect.arrayContaining([
                expect.objectContaining(ff7ExeObject)
            ])
        )
    });

    test('openProcess - game not running', () => {
        memoryjs._stopff7();
        expect(() => {
            memoryjs.openProcess(ff7Exe);
        }).toThrowError();
    });

    test('openProcess - game is running', () => {
        memoryjs._runff7();
        expect(memoryjs.openProcess(ff7Exe)).toMatchObject(ff7ExeObject);
    });

    test('readMemory - byte', () => {
        memoryjs.readMemory(null, 0x02, 'byte', (error, value) => {
            expect(value).toBe(48);
        });
    });

    test('readMemory - short', () => {
        memoryjs.readMemory(null, 0x10, 'short', (error, value) => {
            expect(value).toBe(0x0201);
        });
    });

    test('readMemory - int', () => {
        memoryjs.readMemory(null, 0x10, 'int', (error, value) => {
            expect(value).toBe(0x04030201);
        });
    });

    test('readMemory - double', () => {
        memoryjs.readMemory(null, 0x14, 'double', (error, value) => {
            expect(value).toBe(293.03173828125);
        });
    });

    test('writeMemory - byte', () => {
        memoryjs.writeMemory(null, 0x0A, 0x88, 'byte');

        memoryjs.readMemory(null, 0x0A, 'byte', (error, value) => {
            expect(value).toBe(0x88);
            expect(value).not.toBe(0x69);
        });
    });

    test('writeMemory - short', () => {
        memoryjs.writeMemory(null, 0x10, 0x1234, 'short');

        memoryjs.readMemory(null, 0x10, 'short', (error, value) => {
            expect(value).toBe(0x1234);
        });
    });

    test('writeMemory - int', () => {
        memoryjs.writeMemory(null, 0x12, 0x12345678, 'int');

        memoryjs.readMemory(null, 0x12, 'int', (error, value) => {
            expect(value).toBe(0x12345678);
        });
    });

    test('writeMemory - double', () => {
        memoryjs.writeMemory(null, 0x0A, 1.2345, 'double');

        memoryjs.readMemory(null, 0x0A, 'double', (error, value) => {
            expect(value).toBe(1.2345);
        });
    });

    test('writeBuffer', () => {
        const bytes = Buffer.from([0xC7, 5, 0xE8, 4, 0x9A, 0, 1, 0]);
        memoryjs.writeBuffer(null, 0x2, bytes);

        memoryjs.readMemory(null, 0x2, 'int', (error, value) => {
            expect(value).toBe(0x04E805C7);
        });

        memoryjs.readMemory(null, 0x6, 'int', (error, value) => {
            expect(value).toBe(0x0001009A);
        });
    })
});