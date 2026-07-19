export interface SuppressionCounter {
  begin(): void;
  end(): void;
  isSuppressed(): boolean;
  run<T>(task: () => T | Promise<T>): Promise<T>;
}

export function createSuppressionCounter(): SuppressionCounter;
