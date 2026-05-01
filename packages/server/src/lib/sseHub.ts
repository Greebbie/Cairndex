type Listener = (chunk: string) => void;

export interface SseEvent {
  type: string;
  [k: string]: unknown;
}

export class SseHub {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(projectAlias: string, listener: Listener): () => void {
    const set = this.listeners.get(projectAlias) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(projectAlias, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(projectAlias);
    };
  }

  broadcast(projectAlias: string, event: SseEvent): void {
    const subs = this.listeners.get(projectAlias);
    if (!subs) return;
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const l of subs) {
      try {
        l(payload);
      } catch {
        /* drop on error */
      }
    }
  }

  size(projectAlias: string): number {
    return this.listeners.get(projectAlias)?.size ?? 0;
  }
}
