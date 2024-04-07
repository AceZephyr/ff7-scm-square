import { hexToBytes } from "./utils";

describe("utils", () => {
  test("hexToBytes", () => {
    expect(hexToBytes("00 1A 55 CB FF")).toEqual([0, 0x1A, 0x55, 0xCB, 0xFF]);
  })
})