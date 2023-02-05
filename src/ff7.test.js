const {FF7} = require('./ff7'); 
const { DataType } = require('./memoryjs-mock');

jest.useFakeTimers();

describe("FF7", () => {
  let ff7 = new FF7();

  beforeEach(() => {
    ff7 = new FF7();
  });
  
  test("game is not running", () => {
    expect(ff7.isRunning()).toBeFalsy();
  });

  test("game is not running when monitoring started", () => {
    ff7.start();
    expect(ff7.isRunning()).toBeFalsy();

    jest.advanceTimersByTime(ff7.LOOP_INTERVAL_MS * 2);
    expect(ff7.isRunning()).toBeFalsy();
  });

  test("game is running and detected", () => {
    ff7.start();
    ff7._runff7();
    expect(ff7.isRunning()).toBeFalsy();

    jest.advanceTimersByTime(ff7.LOOP_INTERVAL_MS * 2);
    expect(ff7.isRunning()).toBeTruthy();
  });

  test("game is running and then stopped", () => {
    ff7.start();
    ff7._runff7();
    jest.advanceTimersByTime(ff7.LOOP_INTERVAL_MS * 2);
    expect(ff7.isRunning()).toBeTruthy();

    ff7._stopff7();
    jest.advanceTimersByTime(ff7.LOOP_INTERVAL_MS * 2);
    expect(ff7.isRunning()).toBeFalsy();
  });

  test("reading and writing memory", () => {
    ff7.start();
    ff7._runff7();
    jest.advanceTimersByTime(ff7.LOOP_INTERVAL_MS * 2);

    ff7.writeMemory(0, 123, DataType.byte);
    return expect(ff7.readMemory(0, DataType.byte)).resolves.toBe(123);
  })

  test("reading and writing a buffer", () => {
    ff7.start();
    ff7._runff7();
    jest.advanceTimersByTime(ff7.LOOP_INTERVAL_MS * 2);

    const buffer = Buffer.from([0x01, 0x02]);
    ff7.writeMemory(1, buffer, DataType.buffer);
    return expect(ff7.readMemory(1, DataType.short)).resolves.toBe(0x201);
  })
});