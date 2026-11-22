const splitterPortLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes concurrent operations targeting the same ODP splitter and port number
 * within the process to eliminate TOCTOU race conditions during port occupancy checks.
 *
 * @param splitterKey - Splitter ID or splitter code (e.g., `ODP-PLB-001`)
 * @param portNumber - 1-based port index on the splitter
 * @param task - Async operation to execute exclusively for this splitter+port
 * @returns Promise resolving to the task's result
 * @example
 * await withSplitterPortMutex('ODP-PLB-001', 3, async () => { ... });
 */
export async function withSplitterPortMutex<T>(
  splitterKey: string,
  portNumber: number,
  task: () => Promise<T>,
): Promise<T> {
  const normalizedKey = `${splitterKey.trim().toUpperCase()}:${portNumber}`;
  const previous = splitterPortLocks.get(normalizedKey) ?? Promise.resolve();
  const { promise: current, resolve: release } = Promise.withResolvers<void>();
  const chained = previous.then(
    () => current,
    () => current,
  );
  splitterPortLocks.set(normalizedKey, chained);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (splitterPortLocks.get(normalizedKey) === chained) {
      splitterPortLocks.delete(normalizedKey);
    }
  }
}
