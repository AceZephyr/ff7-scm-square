export function callWithTimeout<T>(func: () => T, timeout: number): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => {
        resolve(func());
    }, timeout);
  });
}

export function hexToBytes(hex: string): number[] {
  return hex.split(" ").map(hexByte => parseInt(hexByte, 16));
}