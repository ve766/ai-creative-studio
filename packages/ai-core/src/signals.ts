export function combineSignals(signals: readonly AbortSignal[]): AbortSignal {
  const active = signals.filter((signal) => signal !== undefined);
  const alreadyAborted = active.find((signal) => signal.aborted);
  if (alreadyAborted) return alreadyAborted;

  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  for (const signal of active) {
    const listener = () => {
      controller.abort(signal.reason);
    };
    signal.addEventListener("abort", listener, { once: true });
    listeners.push(() => signal.removeEventListener("abort", listener));
  }
  controller.signal.addEventListener(
    "abort",
    () => {
      for (const remove of listeners) remove();
    },
    { once: true }
  );
  return controller.signal;
}
