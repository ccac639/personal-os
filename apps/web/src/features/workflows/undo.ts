/**
 * 撤销 / 重做栈（纯函数，泛型）
 *
 * 快照入栈时要求调用方传入不可变副本（store 负责序列化/深拷贝），
 * 栈本身只做存储与指针移动，不感知业务结构。
 */

export interface UndoStack<T> {
  push(state: T): void;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  size(): { past: number; future: number };
}

export function createUndoStack<T>(limit = 50): UndoStack<T> {
  let past: T[] = [];
  let future: T[] = [];

  return {
    push(state) {
      // 与最近一次快照相同则忽略（避免无意义的历史条目）
      if (past.length > 0 && past[past.length - 1] === state) return;
      past.push(state);
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
    },
    undo() {
      if (past.length === 0) return null;
      const current = past.pop()!;
      future.push(current);
      if (past.length === 0) return null;
      return past[past.length - 1]!;
    },
    redo() {
      if (future.length === 0) return null;
      const next = future.pop()!;
      past.push(next);
      return next;
    },
    canUndo() {
      return past.length > 1;
    },
    canRedo() {
      return future.length > 0;
    },
    clear() {
      past = [];
      future = [];
    },
    size() {
      return { past: past.length, future: future.length };
    },
  };
}
