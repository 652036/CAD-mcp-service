/** Simple undo stack: JSON snapshots (stub for future restore). */
export class HistoryManager {
  private readonly stack: string[] = [];

  push(snapshot: unknown): void {
    this.stack.push(JSON.stringify(snapshot));
  }

  pop(): unknown | undefined {
    const raw = this.stack.pop();
    return raw === undefined ? undefined : JSON.parse(raw) as unknown;
  }
}
