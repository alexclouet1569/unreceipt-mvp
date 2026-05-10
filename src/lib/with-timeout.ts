export class TimeoutError extends Error {
  constructor(public readonly label: string, public readonly ms: number) {
    super(`Timed out at ${label} after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  label: string,
  ms: number,
  p: PromiseLike<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
