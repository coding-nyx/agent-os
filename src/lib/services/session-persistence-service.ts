
import { Message } from '@/llm-engine/types';

export class SessionPersistenceService {
  private static PREFIX = 'agnes_session_chat_';

  static saveHistory(moduleId: string, history: Message[]) {
    // Only save last 50 messages to prevent storage bloat
    const snapshot = history.slice(-50);
    sessionStorage.setItem(this.PREFIX + moduleId, JSON.stringify(snapshot));
  }

  static getHistory(moduleId: string): Message[] | null {
    const data = sessionStorage.getItem(this.PREFIX + moduleId);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse persisted history:", e);
      return null;
    }
  }

  static clearHistory(moduleId: string) {
    sessionStorage.removeItem(this.PREFIX + moduleId);
  }

  static clearAll() {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(this.PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  }
}
