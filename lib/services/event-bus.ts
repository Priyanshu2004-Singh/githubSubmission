import { EventEmitter } from 'events';
import { ActivePresence } from '../types';

class OpsEventBus extends EventEmitter {
  // item_id -> Map of user_id -> ActivePresence
  private presenceMap = new Map<string, Map<string, ActivePresence>>();

  constructor() {
    super();
    this.setMaxListeners(100);

    // Periodically prune stale presence entries (> 25 seconds without heartbeat)
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => {
        this.pruneStalePresence();
      }, 10000);
      if (timer.unref) timer.unref();
    }
  }

  // Publish a domain event
  publish(eventType: string, data: any) {
    this.emit('ops_event', { eventType, data, timestamp: new Date().toISOString() });
  }

  // Record presence heartbeat
  setPresence(itemId: string, user: { id: string; name: string; avatar_url: string }, isEditing: boolean = false) {
    if (!this.presenceMap.has(itemId)) {
      this.presenceMap.set(itemId, new Map());
    }
    const itemUsers = this.presenceMap.get(itemId)!;
    itemUsers.set(user.id, {
      user_id: user.id,
      user_name: user.name,
      user_avatar: user.avatar_url,
      last_heartbeat: Date.now(),
      is_editing: isEditing,
    });

    this.publish('PRESENCE_UPDATED', {
      item_id: itemId,
      active_users: Array.from(itemUsers.values()),
    });
  }

  removePresence(itemId: string, userId: string) {
    const itemUsers = this.presenceMap.get(itemId);
    if (itemUsers && itemUsers.has(userId)) {
      itemUsers.delete(userId);
      this.publish('PRESENCE_UPDATED', {
        item_id: itemId,
        active_users: Array.from(itemUsers.values()),
      });
    }
  }

  getActivePresence(itemId: string): ActivePresence[] {
    const itemUsers = this.presenceMap.get(itemId);
    if (!itemUsers) return [];
    const now = Date.now();
    return Array.from(itemUsers.values()).filter(p => now - p.last_heartbeat < 25000);
  }

  private pruneStalePresence() {
    const now = Date.now();
    for (const [itemId, users] of this.presenceMap.entries()) {
      let changed = false;
      for (const [userId, presence] of users.entries()) {
        if (now - presence.last_heartbeat > 25000) {
          users.delete(userId);
          changed = true;
        }
      }
      if (changed) {
        this.publish('PRESENCE_UPDATED', {
          item_id: itemId,
          active_users: Array.from(users.values()),
        });
      }
      if (users.size === 0) {
        this.presenceMap.delete(itemId);
      }
    }
  }
}

// Global singleton across Next.js reloads
const globalForEvents = global as unknown as { opsEventBus?: OpsEventBus };
export const eventBus = globalForEvents.opsEventBus || new OpsEventBus();
if (process.env.NODE_ENV !== 'production') globalForEvents.opsEventBus = eventBus;
