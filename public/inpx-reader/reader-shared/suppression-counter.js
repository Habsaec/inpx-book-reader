export function createSuppressionCounter() {
  let depth = 0;
  return {
    begin() {
      depth += 1;
    },
    end() {
      depth = Math.max(0, depth - 1);
    },
    isSuppressed() {
      return depth > 0;
    },
    async run(task) {
      depth += 1;
      try {
        return await task();
      } finally {
        depth = Math.max(0, depth - 1);
      }
    },
  };
}
