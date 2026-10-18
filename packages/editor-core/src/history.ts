export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const DEFAULT_HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

function withLimit<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  return items.slice(items.length - limit);
}

export function commit<T>(
  history: HistoryState<T>,
  next: T,
  limit: number = DEFAULT_HISTORY_LIMIT
): HistoryState<T> {
  if (Object.is(next, history.present)) return history;
  return {
    past: withLimit([...history.past, history.present], limit),
    present: next,
    future: []
  };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function replacePresent<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (Object.is(next, history.present)) return history;
  return { past: history.past, present: next, future: [] };
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1] as T;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  if (!canRedo(history)) return history;
  const [next, ...rest] = history.future as [T, ...T[]];
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest
  };
}

export function resetHistory<T>(present: T): HistoryState<T> {
  return createHistory(present);
}
