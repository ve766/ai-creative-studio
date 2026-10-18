import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history";

describe("history", () => {
  it("starts empty", () => {
    const history = createHistory("a");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("undoes and redoes committed states", () => {
    let history = createHistory("a");
    history = commit(history, "b");
    history = commit(history, "c");
    expect(history.present).toBe("c");

    history = undo(history);
    expect(history.present).toBe("b");
    history = undo(history);
    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    expect(history.present).toBe("b");
    history = redo(history);
    expect(history.present).toBe("c");
    expect(canRedo(history)).toBe(false);
  });

  it("clears the redo stack after a new commit", () => {
    let history = createHistory("a");
    history = commit(history, "b");
    history = undo(history);
    expect(canRedo(history)).toBe(true);
    history = commit(history, "c");
    expect(canRedo(history)).toBe(false);
    expect(history.present).toBe("c");
  });

  it("ignores identical commits", () => {
    const history = createHistory("a");
    expect(commit(history, "a")).toBe(history);
  });

  it("respects the history limit", () => {
    let history = createHistory(0);
    for (let i = 1; i <= 10; i += 1) {
      history = commit(history, i, 3);
    }
    expect(history.past.length).toBe(3);
  });
});
