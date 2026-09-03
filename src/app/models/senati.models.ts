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
  promedioPonderadoActual: number;
  porcentajeRestante: number;
  notaFinalNecesariaMinima: number | null; // Para aprobar con 10.5
  notaFinalNecesariaNotable: number | null; // Para sacar 14+
  estado: 'aprobado' | 'en_carrera' | 'en_riesgo' | 'desaprobado';
}
