import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Curso, Tarea } from '../models/senati.models';

export interface ParsedBlackboardEvent {
  uid: string;
  titulo: string;
  fecha_limite: string;
  curso_nombre?: string;
  descripcion?: string;
  link_entrega?: string;
}

export interface SyncResult {
  added: number;
  updated: number;
  skipped: number;
  totalParsed: number;
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BlackboardSyncService {
  private readonly STORAGE_FEED_KEY = 'senati_blackboard_feed_url';
  private readonly STORAGE_LAST_SYNC = 'senati_blackboard_last_sync';

  constructor(private supabaseService: SupabaseService) {}

  getSavedFeedUrl(): string {
    return localStorage.getItem(this.STORAGE_FEED_KEY) || '';
  }

  saveFeedUrl(url: string): void {
    localStorage.setItem(this.STORAGE_FEED_KEY, url.trim());
  }

  getLastSyncDate(): string | null {
    return localStorage.getItem(this.STORAGE_LAST_SYNC);
  }

  /**
   * Obtiene el contenido iCal desde una URL de Blackboard.
   * Maneja protocolos webcal:// y proxys en caso de restricciones CORS en el navegador.
   */
  async fetchIcs(url: string): Promise<string> {
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('webcal://')) {
      cleanUrl = 'https://' + cleanUrl.slice(9);
    } else if (cleanUrl.startsWith('http://')) {
      cleanUrl = 'https://' + cleanUrl.slice(7);
    }

    // 1. Intento principal mediante proxy de alta velocidad con soporte CORS y bypass WAF (Jina Reader)
    try {
      const resp = await fetch(`https://r.jina.ai/${cleanUrl}`, {
        headers: { 'X-Return-Format': 'text' }
      });
      if (resp.ok) {
        const text = await resp.text();
        const extracted = this.extractVCalendar(text);
        if (extracted) {
          return extracted;
        }
      }
    } catch (jinaErr) {
      console.warn('Proxy principal (Jina) no disponible, intentando conexiones alternativas...', jinaErr);
    }

    // 2. Intento directo en caso de entorno con CORS permitido o extensión
    try {
      const resp = await fetch(cleanUrl, { mode: 'cors' });
      if (resp.ok) {
        const text = await resp.text();
        const extracted = this.extractVCalendar(text);
        if (extracted) {
          return extracted;
        }
      }
    } catch (directErr) {
      console.warn('Conexión directa bloqueada por CORS, usando proxys de respaldo...', directErr);
    }

    // 3. Proxys de respaldo adicionales
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`
    ];

    for (const pUrl of proxyUrls) {
      try {
        const resp = await fetch(pUrl);
        if (resp.ok) {
          const text = await resp.text();
          const extracted = this.extractVCalendar(text);
          if (extracted) {
            return extracted;
          }
        }
      } catch (err) {
        console.warn('Proxy de respaldo fallido:', err);
      }
    }

    throw new Error('No se pudo descargar el feed de Blackboard. Verifica que el enlace sea correcto o descarga el archivo .ics y súbelo directamente.');
  }

  /**
   * Extrae limpiamente el bloque VCALENDAR del contenido recibido
   */
  private extractVCalendar(text: string): string | null {
    if (!text || !text.includes('BEGIN:VCALENDAR')) return null;
    const startIdx = text.indexOf('BEGIN:VCALENDAR');
    const endIdx = text.lastIndexOf('END:VCALENDAR');
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
    return text.substring(startIdx, endIdx + 'END:VCALENDAR'.length);
  }

  /**
   * Parser RFC 5545 para extraer tareas de Blackboard Learn
   */
  parseIcs(icsContent: string): ParsedBlackboardEvent[] {
    const events: ParsedBlackboardEvent[] = [];

    // Desenvolver líneas plegadas (RFC 5545: una línea que comienza con espacio o tab continúa la anterior)
    const cleanContent = this.extractVCalendar(icsContent) || icsContent;
    const unfolded = cleanContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);

    let inEvent = false;
    let currentEvent: any = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {};
        continue;
      }

      if (trimmed === 'END:VEVENT') {
        inEvent = false;
        if (currentEvent.summary && (currentEvent.dtend || currentEvent.dtstart)) {
          const deadline = currentEvent.dtend || currentEvent.dtstart;
          events.push({
            uid: currentEvent.uid || 'bb_' + Math.random().toString(36).substring(2, 10),
            titulo: this.cleanSummary(currentEvent.summary),
            fecha_limite: deadline,
            curso_nombre: this.extractCourseName(currentEvent),
            descripcion: currentEvent.description || '',
            link_entrega: currentEvent.url || 'https://senati.blackboard.com/'
          });
        }
        continue;
      }

      if (!inEvent) continue;

      // Procesar claves y valores
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const keyPart = trimmed.substring(0, colonIdx);
      const valPart = trimmed.substring(colonIdx + 1);
      const propName = keyPart.split(';')[0].toUpperCase();

      switch (propName) {
        case 'UID':
          currentEvent.uid = valPart;
          break;
        case 'SUMMARY':
          currentEvent.summary = this.unescapeText(valPart);
          break;
        case 'DESCRIPTION':
          currentEvent.description = this.unescapeText(valPart);
          break;
        case 'DTEND':
          currentEvent.dtend = this.parseIcsDate(valPart);
          break;
        case 'DTSTART':
          currentEvent.dtstart = this.parseIcsDate(valPart);
          break;
        case 'URL':
          currentEvent.url = valPart;
          break;
        case 'CATEGORIES':
          currentEvent.category = valPart;
          break;
      }
    }

    return events;
  }

  /**
   * Sincroniza los eventos extraídos hacia la base de datos Supabase
   */
  async syncToDatabase(events: ParsedBlackboardEvent[]): Promise<SyncResult> {
    const result: SyncResult = {
      added: 0,
      updated: 0,
      skipped: 0,
      totalParsed: events.length,
      errors: []
    };

    if (events.length === 0) return result;

    const [cursosExistentes, tareasExistentes] = await Promise.all([
      this.supabaseService.getCursos(),
      this.supabaseService.getTareas()
    ]);

    const cursosMap = new Map<string, Curso>();
    cursosExistentes.forEach(c => {
      if (c.nombre) cursosMap.set(this.normalizeString(c.nombre), c);
    });

    for (const ev of events) {
      try {
        // 1. Determinar el curso correspondiente inteligentemente
        let matchedCurso: Curso | undefined;
        const tituloNorm = this.normalizeString(ev.titulo);

        // A. Si se detectó el curso en los metadatos del evento
        if (ev.curso_nombre) {
          const courseKey = this.normalizeString(ev.curso_nombre);
          matchedCurso = cursosMap.get(courseKey);
          if (!matchedCurso) {
            matchedCurso = cursosExistentes.find(c => {
              const cNorm = this.normalizeString(c.nombre);
              return cNorm.includes(courseKey) || courseKey.includes(cNorm);
            });
          }
        }

        // B. Si no se encontró por metadatos, asociar por palabras clave del título
        if (!matchedCurso && cursosExistentes.length > 0) {
          // B1. Tareas de Informe / Práctica / Cuaderno de informes
          if (tituloNorm.includes('informe') || tituloNorm.includes('practica') || tituloNorm.includes('cuaderno')) {
            matchedCurso = cursosExistentes.find(c => {
              const cNorm = this.normalizeString(c.nombre);
              return cNorm.includes('informe') || cNorm.includes('practica') || cNorm.includes('cuaderno');
            });
          }

          // B2. Buscar si las palabras distintivas de algún curso aparecen en el título
          if (!matchedCurso) {
            matchedCurso = cursosExistentes.find(c => {
              const words = this.normalizeString(c.nombre).split(/\s+/).filter(w => w.length >= 4);
              return words.some(w => tituloNorm.includes(w));
            });
          }
        }

        // C. Fallback: asociar a curso único, curso "Blackboard SENATI" o primer curso disponible
        let curso = matchedCurso;
        if (!curso) {
          if (cursosExistentes.length === 1) {
            curso = cursosExistentes[0];
          } else {
            const defaultName = ev.curso_nombre || 'Blackboard SENATI';
            const defaultKey = this.normalizeString(defaultName);
            curso = cursosMap.get(defaultKey);

            if (!curso) {
              try {
                curso = await this.supabaseService.addCurso({
                  nombre: defaultName,
                  semestre: 4,
                  color: this.getRandomColor(),
                  link_blackboard: 'https://senati.blackboard.com/'
                });
                if (curso && curso.nombre) {
                  cursosMap.set(this.normalizeString(curso.nombre), curso);
                  cursosExistentes.push(curso);
                }
              } catch (cErr: any) {
                console.warn('No se pudo crear curso contenedor:', cErr);
                curso = cursosExistentes[0]; // fallback
              }
            }
          }
        }

        const cursoId = curso?.id || (cursosExistentes.length > 0 ? cursosExistentes[0].id || '' : '');
        if (!cursoId) {
          result.skipped++;
          continue;
        }

        // 2. Verificar si la tarea ya existe para evitar duplicados
        const tareaExistente = tareasExistentes.find(t => 
          (t.curso_id === cursoId || cursosExistentes.some(c => c.id === t.curso_id)) && 
          this.normalizeString(t.titulo) === tituloNorm
        );

        if (tareaExistente && tareaExistente.id) {
          // Si existe, actualizar fecha límite si el docente la postergó
          const fechaActual = new Date(tareaExistente.fecha_limite).getTime();
          const nuevaFecha = new Date(ev.fecha_limite).getTime();

          if (Math.abs(fechaActual - nuevaFecha) > 60000) { // diferencia > 1 minuto
            await this.supabaseService.updateTarea(tareaExistente.id, {
              fecha_limite: ev.fecha_limite,
              link_entrega: ev.link_entrega || tareaExistente.link_entrega
            });
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          // 3. Crear nueva tarea importada desde Blackboard
          const nueva = await this.supabaseService.addTarea({
            curso_id: cursoId,
            titulo: ev.titulo,
            descripcion: ev.descripcion ? ev.descripcion.slice(0, 300) : 'Importada automáticamente desde Blackboard SENATI.',
            fecha_limite: ev.fecha_limite,
            prioridad: this.determinarPrioridad(ev.fecha_limite),
            estado: 'pendiente',
            link_entrega: ev.link_entrega || 'https://senati.blackboard.com/'
          });
          tareasExistentes.push(nueva);
          result.added++;
        }
      } catch (err: any) {
        console.error('Error importando tarea de Blackboard:', err);
        result.errors.push(`Error en "${ev.titulo}": ${err.message || 'Error desconocido'}`);
      }
    }

    localStorage.setItem(this.STORAGE_LAST_SYNC, new Date().toISOString());
    return result;
  }

  // --- HELPERS PRIVADOS ---

  private parseIcsDate(val: string): string {
    // Casos: 20260915T235900Z o 20260915T235900 o 20260915
    const clean = val.trim();
    if (clean.length >= 8) {
      const year = clean.substring(0, 4);
      const month = clean.substring(4, 6);
      const day = clean.substring(6, 8);

      let hour = '23';
      let minute = '59';
      let second = '00';

      if (clean.includes('T')) {
        const timePart = clean.split('T')[1].replace('Z', '');
        if (timePart.length >= 4) {
          hour = timePart.substring(0, 2);
          minute = timePart.substring(2, 4);
          if (timePart.length >= 6) second = timePart.substring(4, 6);
        }
      }

      // Si termina en Z es UTC
      if (clean.endsWith('Z')) {
        const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
        return d.toISOString();
      } else {
        // En Perú (SENATI) la zona horaria oficial de Blackboard es America/Lima (UTC-5)
        const d = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-05:00`);
        if (!isNaN(d.getTime())) {
          return d.toISOString();
        }
        const fallback = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
        return fallback.toISOString();
      }
    }
    return new Date().toISOString();
  }

  private cleanSummary(summary: string): string {
    return summary
      .replace(/^Tarea:\s*/i, '')
      .replace(/^Entrega:\s*/i, '')
      .replace(/^Evaluación:\s*/i, '')
      .trim();
  }

  private extractCourseName(event: any): string | undefined {
    const text = (event.description || '') + ' ' + (event.summary || '');

    // Formato común Blackboard: "Curso: Desarrollo de Aplicaciones Web"
    const matchCurso = text.match(/(?:Curso|Materia|Asignatura):\s*([^\r\n,]+)/i);
    if (matchCurso && matchCurso[1]) {
      return matchCurso[1].trim();
    }

    // Formato con corchetes: "[Desarrollo Web] Entregable 1"
    const matchBracket = event.summary?.match(/\[(.*?)\]/);
    if (matchBracket && matchBracket[1]) {
      return matchBracket[1].trim();
    }

    return undefined;
  }

  private unescapeText(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  private normalizeString(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  private determinarPrioridad(fechaStr: string): 'alta' | 'media' | 'baja' {
    const diffHours = (new Date(fechaStr).getTime() - Date.now()) / (1000 * 60 * 60);
    if (diffHours <= 48) return 'alta';
    if (diffHours <= 120) return 'media';
    return 'baja';
  }

  private getRandomColor(): string {
    const colors = ['#003b7a', '#0284c7', '#0d9488', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
