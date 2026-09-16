export interface Curso {
  id?: string;
  usuario_id?: string;
  nombre: string;
  semestre: number;
  profesor?: string;
  horario?: string;
  color?: string;
  link_blackboard?: string;
  link_teams?: string;
  created_at?: string;
}

export type PrioridadTarea = 'alta' | 'media' | 'baja';
export type EstadoTarea = 'pendiente' | 'en_progreso' | 'entregado';

export interface Tarea {
  id?: string;
  usuario_id?: string;
  curso_id: string;
  titulo: string;
  descripcion?: string;
  fecha_limite: string;
  prioridad: PrioridadTarea;
  estado: EstadoTarea;
  link_entrega?: string;
  created_at?: string;
  curso?: Curso;
}

export interface Evaluacion {
  id?: string;
  usuario_id?: string;
  curso_id: string;
  nombre_evaluacion: string;
  ponderacion: number; // Porcentaje, ej: 20 para 20%
  nota_obtenida?: number | null; // 0 - 20
  created_at?: string;
}

export interface CalculoCurso {
  curso: Curso;
  evaluaciones: Evaluacion[];
  porcentajeRegistrado: number;
  promedioPonderadoActual: number; // Nota actual relativa a lo calificado (ej. 10.3)
  puntosAcumulados: number; // Puntos acumulados de 20 (ej. 5.16)
  pesoNotasConCalificacion: number; // % que ya tiene nota (ej. 50%)
  porcentajeRestante: number;
  notaFinalNecesariaMinima: number | null; // Para aprobar con 10.5
  notaFinalNecesariaNotable: number | null; // Para sacar 14+
  estado: 'aprobado' | 'en_carrera' | 'en_riesgo' | 'desaprobado';
}

export type TipoEntregable = 'TR1' | 'TR2' | 'Proyecto_Final' | 'Laboratorio' | 'Otro';
export type EstadoEntregable = 'planificacion' | 'en_desarrollo' | 'listo_entrega' | 'entregado';

export interface ChecklistItem {
  id: string;
  texto: string;
  completado: boolean;
}

export interface ProyectoEntregable {
  id?: string;
  usuario_id?: string;
  curso_id: string;
  titulo: string;
  tipo: TipoEntregable;
  descripcion?: string;
  fecha_limite: string;
  estado: EstadoEntregable;
  link_github?: string;
  link_drive?: string;
  link_demo?: string;
  checklist?: ChecklistItem[];
  created_at?: string;
  curso?: Curso;
}

export interface ClaseHorario {
  id: string;
  curso: Curso;
  diaNombre: string; // 'Lunes', 'Martes', etc.
  diaAbrev: string; // 'LUN', 'MAR', etc.
  diaNumero: number; // 0: Domingo, 1: Lunes, 2: Martes, 3: Miércoles, 4: Jueves, 5: Viernes, 6: Sábado
  horaInicio: string; // '12:45'
  horaFin: string; // '17:30'
  horaFormateada: string; // '12:45 - 17:30'
  inicioMinutos: number;
  finMinutos: number;
  duracionMinutos: number;
  esHoy: boolean;
  enVivo: boolean;
  proximaHoy: boolean;
  finalizadaHoy: boolean;
}

export interface DiaSemanaHorario {
  nombre: string;
  abreviacion: string;
  numero: number;
  esHoy: boolean;
  clases: ClaseHorario[];
}

