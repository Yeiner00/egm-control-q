type SchedulerLike = { yield?: () => Promise<void> };

export const yieldToMain = (): Promise<void> => {
  const candidate = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (candidate && typeof candidate.yield === "function") {
    return candidate.yield();
  }
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};
