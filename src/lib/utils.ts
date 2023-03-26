export function callWithTimeout<T>(func: () => T, timeout: number): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => {
        resolve(func());
    }, timeout);
  });
}