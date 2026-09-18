import { Injectable } from '@angular/core';
import { Tarea } from '../models/senati.models';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifiedTaskIds = new Set<string>();

  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  get permission(): NotificationPermission {
    if (!this.isSupported) return 'denied';
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) return 'denied';
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch (err) {
      console.error('Error solicitando permisos de notificación:', err);
      return 'denied';
    }
  }

  notify(title: string, options?: NotificationOptions): Notification | null {
    if (!this.isSupported || Notification.permission !== 'granted') {
      return null;
    }

    try {
      return new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
    } catch (err) {
      console.error('Error disparando notificación:', err);
      return null;
    }
  }

  checkDueTasks(tareas: Tarea[]): void {
    if (this.permission !== 'granted') return;

    const now = new Date().getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const pendientes = tareas.filter(t => t.estado !== 'entregado');

    for (const tarea of pendientes) {
      if (!tarea.id || this.notifiedTaskIds.has(tarea.id)) continue;

      const due = new Date(tarea.fecha_limite).getTime();
      const diff = due - now;

      if (diff > 0 && diff <= oneDayMs) {
        const hoursLeft = Math.max(1, Math.round(diff / (1000 * 60 * 60)));
        this.notify(`Tarea Próxima a Vencer: ${tarea.titulo}`, {
          body: `Curso: ${tarea.curso?.nombre || 'General'}\nVence en aproximadamente ${hoursLeft} hora(s).`,
          tag: `task-${tarea.id}`
        });
        this.notifiedTaskIds.add(tarea.id);
      } else if (diff <= 0 && diff >= -oneDayMs) {
        this.notify(`Tarea Vencida: ${tarea.titulo}`, {
          body: `Curso: ${tarea.curso?.nombre || 'General'}\nFecha límite superada. ¡Revisa tu entrega!`,
          tag: `task-${tarea.id}`
        });
        this.notifiedTaskIds.add(tarea.id);
      }
    }
  }
}
