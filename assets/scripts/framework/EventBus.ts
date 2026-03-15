export type EventHandler<T = any> = (payload: T) => void;

export class EventBus {
  private static _map: Map<string, Set<EventHandler>> = new Map();

  static on<T = any>(event: string, handler: EventHandler<T>) {
    if (!EventBus._map.has(event)) {
      EventBus._map.set(event, new Set());
    }
    EventBus._map.get(event)?.add(handler as EventHandler);
  }

  static off<T = any>(event: string, handler: EventHandler<T>) {
    EventBus._map.get(event)?.delete(handler as EventHandler);
    if (EventBus._map.get(event)?.size === 0) {
      EventBus._map.delete(event);
    }
  }

  static emit<T = any>(event: string, payload?: T) {
    const handlers = EventBus._map.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => handler(payload));
  }

  static clear() {
    EventBus._map.clear();
  }
}
