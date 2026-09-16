import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { NotificationService } from '../services/notification.service';
import { BlackboardSyncService, SyncResult } from '../services/blackboard-sync.service';
import { Curso, Tarea, Evaluacion, PrioridadTarea, EstadoTarea, CalculoCurso, ProyectoEntregable, TipoEntregable, EstadoEntregable, ChecklistItem, ClaseHorario, DiaSemanaHorario } from '../models/senati.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  // Usuario
  userName = 'Estudiante';
  userLastName = '';
  userInitials = 'E';
  
  // Navegación
  activeTab: 'tareas' | 'calculadora' | 'proyectos' | 'horarios' = 'tareas';
  selectedSemestre: number = 4; // 4° Semestre por defecto

  // Horario de Clases
  diasSemana: DiaSemanaHorario[] = [];
  clasesTotal: ClaseHorario[] = [];
  claseEnVivo: ClaseHorario | null = null;
  proximaClaseHoy: ClaseHorario | null = null;
  clasesHoy: ClaseHorario[] = [];
  cursosSinHorario: Curso[] = [];
  filtroDiaHorario: 'todos' | 'hoy' | number = 'todos';
  progresoClaseActual: number = 0;
  tiempoRestanteClaseActual: string = '';
  tiempoParaProximaClase: string = '';
  private timerHorario: any = null;

  // Datos
  cursos: Curso[] = [];
  tareas: Tarea[] = [];
  evaluaciones: Evaluacion[] = [];
  proyectos: ProyectoEntregable[] = [];

  // Filtros de Tareas
  filtroEstado: 'todos' | EstadoTarea | 'vencidas' = 'pendiente';
  filtroCursoId: string = 'todos';
  filtroPrioridad: string = 'todas';

  // Modales y Menús
  modalTareaOpen = false;
  modalCursoOpen = false;
  modalEvaluacionOpen = false;
  modalGestionCursosOpen = false;
  modalProyectoOpen = false;
  modalBlackboardOpen = false;
  mobileMenuOpen = false;

  // Sincronización Blackboard
  blackboardFeedUrl = '';
  isSyncingBlackboard = false;
  blackboardSyncResult: SyncResult | null = null;
  lastBlackboardSync: string | null = null;

  // Formulario Proyecto / Entregable
  editingProyectoId?: string;
  formProyecto = {
    curso_id: '',
    titulo: '',
    tipo: 'TR1' as TipoEntregable,
    descripcion: '',
    fecha_limite: '',
    estado: 'en_desarrollo' as EstadoEntregable,
    link_github: '',
    link_drive: '',
    link_demo: '',
    checklistText: ''
  };
  errorProyecto = '';

  // Formulario Tarea
  editingTareaId?: string;
  formTarea = {
    curso_id: '',
    titulo: '',
    descripcion: '',
    fecha_limite: '',
    prioridad: 'media' as PrioridadTarea,
    estado: 'pendiente' as EstadoTarea,
    link_entrega: ''
  };
  errorTarea = '';

  // Formulario Curso
  editingCursoId?: string;
  formCurso = {
    nombre: '',
    semestre: 4,
    profesor: '',
    horario: '',
    color: '#003b7a',
    link_blackboard: '',
    link_teams: ''
  };
  errorCurso = '';

  // Formulario Evaluación
  editingEvaluacionId?: string;
  formEvaluacion = {
    curso_id: '',
    nombre_evaluacion: '',
    ponderacion: 20,
    nota_obtenida: null as number | null
  };
  errorEvaluacion = '';

  // Curso seleccionado en Calculadora
  selectedCursoCalculadoraId: string = '';

  // Colores predefinidos para cursos
  coloresCurso = [
    '#003b7a', '#0284c7', '#0d9488', '#16a34a',
    '#d97706', '#dc2626', '#7c3aed', '#db2777'
  ];

  // Feedback Toast Visual
  toast = {
    show: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'danger'
  };
  private toastTimeout?: ReturnType<typeof setTimeout>;

  showToast(message: string, type: 'success' | 'info' | 'danger' = 'success') {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toast = {
      show: true,
      message,
      type
    };
    this.cdr.detectChanges();
    this.toastTimeout = setTimeout(() => {
      this.toast.show = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  closeToast() {
    this.toast.show = false;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  // Tema Oscuro Predeterminado
  isDarkMode = true;

  constructor(
    private supabaseService: SupabaseService,
    public notificationService: NotificationService,
    public blackboardSyncService: BlackboardSyncService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.loadTheme();
    this.blackboardFeedUrl = this.blackboardSyncService.getSavedFeedUrl();
    this.lastBlackboardSync = this.blackboardSyncService.getLastSyncDate();
    await this.loadUserProfile();
    await this.loadAllData();
    this.checkNotifications();
    this.timerHorario = setInterval(() => {
      this.analizarHorarios();
    }, 60000);
  }

  ngOnDestroy() {
    if (this.timerHorario) {
      clearInterval(this.timerHorario);
    }
  }

  loadTheme() {
    this.isDarkMode = true;
    document.documentElement.classList.add('dark-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('senati_theme', 'dark');
  }

  toggleTheme() {
    // Modo oscuro predeterminado permanente
    this.isDarkMode = true;
    document.documentElement.classList.add('dark-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('senati_theme', 'dark');
    this.cdr.detectChanges();
  }

  async loadUserProfile() {
    const user = await this.supabaseService.getUser();
    if (user) {
      const profile = await this.supabaseService.getProfile(user.id);
      if (profile && profile.nombres) {
        this.userName = profile.nombres;
        this.userLastName = profile.apellidos || '';
        this.userInitials = (profile.nombres[0] + (profile.apellidos?.[0] || '')).toUpperCase();
      } else if (user.user_metadata?.['nombres']) {
        this.userName = user.user_metadata['nombres'];
        this.userLastName = user.user_metadata['apellidos'] || '';
        this.userInitials = (this.userName[0] + (this.userLastName[0] || '')).toUpperCase();
      } else if (user.email) {
        this.userName = user.email.split('@')[0];
        this.userInitials = this.userName[0].toUpperCase();
      }
    }
  }

  async loadAllData() {
    await this.loadCursos();
    await Promise.all([
      this.loadTareas(),
      this.loadEvaluaciones(),
      this.loadProyectos()
    ]);
  }

  async loadProyectos() {
    this.proyectos = await this.supabaseService.getProyectos();
    this.cdr.detectChanges();
  }

  async loadCursos() {
    this.cursos = await this.supabaseService.getCursos();
    if (this.cursos.length > 0 && !this.selectedCursoCalculadoraId) {
      this.selectedCursoCalculadoraId = this.cursos[0].id || '';
    }
    this.analizarHorarios();
    this.cdr.detectChanges();
  }

  async loadTareas() {
    const rawTareas = await this.supabaseService.getTareas();
    this.tareas = rawTareas.map(t => {
      let curso = t.curso;
      if (!curso && t.curso_id) {
        curso = this.cursos.find(c => c.id === t.curso_id);
      }
      // Enlace inteligente por nombre si el ID de curso no estaba asignado
      if (!curso && this.cursos.length > 0) {
        const tit = (t.titulo || '').toLowerCase();
        if (tit.includes('informe') || tit.includes('practica') || tit.includes('cuaderno')) {
          curso = this.cursos.find(c => {
            const n = c.nombre.toLowerCase();
            return n.includes('informe') || n.includes('practica') || n.includes('cuaderno');
          });
        }
        if (!curso) {
          curso = this.cursos.find(c => {
            const words = c.nombre.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
            return words.some(w => tit.includes(w));
          });
        }
        if (!curso) {
          curso = this.cursos[0];
        }
      }
      return {
        ...t,
        curso
      };
    });
    this.notificationService.checkDueTasks(this.tareas);
    this.cdr.detectChanges();
  }

  async loadEvaluaciones() {
    this.evaluaciones = await this.supabaseService.getEvaluaciones();
    this.cdr.detectChanges();
  }

  checkNotifications() {
    if (this.notificationService.isSupported && this.notificationService.permission === 'default') {
      // Dejamos disponible el botón para que el usuario active los permisos cuando lo desee
    } else if (this.notificationService.permission === 'granted') {
      this.notificationService.checkDueTasks(this.tareas);
    }
  }

  async enableNotifications() {
    const perm = await this.notificationService.requestPermission();
    if (perm === 'granted') {
      this.notificationService.notify('🔔 Notificaciones Activadas', {
        body: 'Te avisaremos cuando tengas tareas de SENATI próximas a vencer.'
      });
      this.notificationService.checkDueTasks(this.tareas);
    }
    this.cdr.detectChanges();
  }

  // --- STATS COMPUTED ---
  get totalTareas(): number {
    return this.tareas.length;
  }

  get tareasPendientes(): number {
    return this.tareas.filter(t => t.estado === 'pendiente').length;
  }

  get tareasEnProgreso(): number {
    return this.tareas.filter(t => t.estado === 'en_progreso').length;
  }

  get tareasEntregadas(): number {
    return this.tareas.filter(t => t.estado === 'entregado').length;
  }

  get tareasVencidas(): number {
    const now = new Date().getTime();
    return this.tareas.filter(t => t.estado !== 'entregado' && new Date(t.fecha_limite).getTime() < now).length;
  }

  get tareasUrgentes(): number {
    const now = new Date().getTime();
    const twoDaysMs = 48 * 60 * 60 * 1000;
    return this.tareas.filter(t => {
      if (t.estado === 'entregado') return false;
      const due = new Date(t.fecha_limite).getTime();
      return (due - now) <= twoDaysMs;
    }).length;
  }

  // --- FILTRO DE TAREAS ---
  getCursoDeTarea(tarea: Tarea): Curso | undefined {
    if (tarea.curso && tarea.curso.nombre) return tarea.curso;
    if (tarea.curso_id) {
      return this.cursos.find(c => c.id === tarea.curso_id);
    }
    return undefined;
  }

  get filteredTareas(): Tarea[] {
    return this.tareas.filter(t => {
      let matchEstado = false;
      if (this.filtroEstado === 'todos') {
        matchEstado = true;
      } else if (this.filtroEstado === 'vencidas') {
        matchEstado = t.estado !== 'entregado' && this.isTaskOverdue(t.fecha_limite);
      } else {
        matchEstado = t.estado === this.filtroEstado;
      }

      const cursoDeTarea = this.getCursoDeTarea(t);
      const matchCurso = this.filtroCursoId === 'todos' || 
                         t.curso_id === this.filtroCursoId || 
                         cursoDeTarea?.id === this.filtroCursoId;

      const matchPrioridad = this.filtroPrioridad === 'todas' || t.prioridad === this.filtroPrioridad;
      return matchEstado && matchCurso && matchPrioridad;
    });
  }

  // --- TAREAS ACTIONS ---
  openAddTareaModal(cursoIdDefault?: string) {
    this.editingTareaId = undefined;
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    defaultDate.setHours(23, 59, 0, 0);

    // Formatear para datetime-local
    const tzOffset = defaultDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(defaultDate.getTime() - tzOffset)).toISOString().slice(0, 16);

    this.formTarea = {
      curso_id: cursoIdDefault || (this.cursos.length > 0 ? this.cursos[0].id || '' : ''),
      titulo: '',
      descripcion: '',
      fecha_limite: localISOTime,
      prioridad: 'media',
      estado: 'pendiente',
      link_entrega: ''
    };
    this.errorTarea = '';
    this.modalTareaOpen = true;
  }

  openEditTareaModal(tarea: Tarea) {
    this.editingTareaId = tarea.id;
    const dateObj = new Date(tarea.fecha_limite);
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 16);

    this.formTarea = {
      curso_id: tarea.curso_id,
      titulo: tarea.titulo,
      descripcion: tarea.descripcion || '',
      fecha_limite: localISOTime,
      prioridad: tarea.prioridad,
      estado: tarea.estado,
      link_entrega: tarea.link_entrega || ''
    };
    this.errorTarea = '';
    this.modalTareaOpen = true;
  }

  async saveTarea() {
    if (!this.formTarea.titulo.trim() || !this.formTarea.curso_id || !this.formTarea.fecha_limite) {
      this.errorTarea = 'Título, Curso y Fecha Límite son requeridos.';
      return;
    }

    try {
      if (this.editingTareaId) {
        await this.supabaseService.updateTarea(this.editingTareaId, {
          curso_id: this.formTarea.curso_id,
          titulo: this.formTarea.titulo.trim(),
          descripcion: this.formTarea.descripcion.trim(),
          fecha_limite: new Date(this.formTarea.fecha_limite).toISOString(),
          prioridad: this.formTarea.prioridad,
          estado: this.formTarea.estado,
          link_entrega: this.formTarea.link_entrega.trim()
        });
        this.showToast('¡Tarea actualizada con éxito! ✏️', 'success');
      } else {
        await this.supabaseService.addTarea({
          curso_id: this.formTarea.curso_id,
          titulo: this.formTarea.titulo.trim(),
          descripcion: this.formTarea.descripcion.trim(),
          fecha_limite: new Date(this.formTarea.fecha_limite).toISOString(),
          prioridad: this.formTarea.prioridad,
          estado: this.formTarea.estado,
          link_entrega: this.formTarea.link_entrega.trim()
        });
        this.showToast('¡Tarea creada con éxito! 📝', 'success');
      }

      this.modalTareaOpen = false;
      await this.loadTareas();
    } catch (err: any) {
      console.error(err);
      this.errorTarea = err.message || 'Error al guardar la tarea.';
    }
  }

  async cambiarEstadoTarea(tarea: Tarea, nuevoEstado: EstadoTarea) {
    if (!tarea.id) return;
    try {
      await this.supabaseService.updateTareaEstado(tarea.id, nuevoEstado);
      tarea.estado = nuevoEstado;
      if (nuevoEstado === 'entregado') {
        this.showToast('¡Tarea completada y entregada! 🟢', 'success');
      } else if (nuevoEstado === 'en_progreso') {
        this.showToast('Tarea marcada en progreso 🔵', 'info');
      } else {
        this.showToast('Tarea marcada como pendiente 🟡', 'info');
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  }

  async deleteTarea(tarea: Tarea) {
    if (!tarea.id) return;
    if (!confirm(`¿Eliminar la tarea "${tarea.titulo}"?`)) return;

    try {
      await this.supabaseService.deleteTarea(tarea.id);
      this.showToast('Tarea eliminada correctamente 🗑️', 'info');
      await this.loadTareas();
    } catch (err) {
      console.error('Error al eliminar tarea:', err);
    }
  }

  getTareasCountByCurso(cursoId?: string): number {
    if (!cursoId) return 0;
    return this.tareas.filter(t => t.curso_id === cursoId).length;
  }

  // --- CURSOS ACTIONS ---
  openGestionCursosModal() {
    this.modalGestionCursosOpen = true;
  }
  openAddCursoModal() {
    this.editingCursoId = undefined;
    this.formCurso = {
      nombre: '',
      semestre: this.selectedSemestre,
      profesor: '',
      horario: '',
      color: this.coloresCurso[Math.floor(Math.random() * this.coloresCurso.length)],
      link_blackboard: '',
      link_teams: ''
    };
    this.errorCurso = '';
    this.modalCursoOpen = true;
  }

  openEditCursoModal(curso: Curso) {
    this.editingCursoId = curso.id;
    this.formCurso = {
      nombre: curso.nombre,
      semestre: curso.semestre,
      profesor: curso.profesor || '',
      horario: curso.horario || '',
      color: curso.color || '#003b7a',
      link_blackboard: curso.link_blackboard || '',
      link_teams: curso.link_teams || ''
    };
    this.errorCurso = '';
    this.modalCursoOpen = true;
  }

  async saveCurso() {
    if (!this.formCurso.nombre.trim()) {
      this.errorCurso = 'El nombre del curso es obligatorio.';
      return;
    }

    try {
      if (this.editingCursoId) {
        await this.supabaseService.updateCurso(this.editingCursoId, {
          nombre: this.formCurso.nombre.trim(),
          semestre: this.formCurso.semestre,
          profesor: this.formCurso.profesor.trim(),
          horario: this.formCurso.horario.trim(),
          color: this.formCurso.color,
          link_blackboard: this.formCurso.link_blackboard.trim(),
          link_teams: this.formCurso.link_teams.trim()
        });
        this.showToast('¡Curso actualizado con éxito! ✏️', 'success');
      } else {
        const nuevoCurso = await this.supabaseService.addCurso({
          nombre: this.formCurso.nombre.trim(),
          semestre: this.formCurso.semestre,
          profesor: this.formCurso.profesor.trim(),
          horario: this.formCurso.horario.trim(),
          color: this.formCurso.color,
          link_blackboard: this.formCurso.link_blackboard.trim(),
          link_teams: this.formCurso.link_teams.trim()
        });

        // Crear plantilla estándar de evaluaciones Blackboard por defecto para este curso
        if (nuevoCurso.id) {
          await this.crearPlantillaEvaluaciones(nuevoCurso.id);
        }
        this.showToast('¡Curso creado con éxito! 📚', 'success');
      }

      this.modalCursoOpen = false;
      await this.loadCursos();
      await this.loadEvaluaciones();
    } catch (err: any) {
      console.error(err);
      this.errorCurso = err.message || 'Error al guardar el curso.';
    }
  }

  async deleteCurso(curso: Curso) {
    if (!curso.id) return;
    if (!confirm(`¿Eliminar el curso "${curso.nombre}"? Esto eliminará también sus tareas y notas asociadas.`)) return;

    try {
      await this.supabaseService.deleteCurso(curso.id);
      this.showToast('Curso eliminado correctamente 🗑️', 'info');
      await this.loadAllData();
      if (this.selectedCursoCalculadoraId === curso.id) {
        this.selectedCursoCalculadoraId = this.cursos[0]?.id || '';
      }
    } catch (err) {
      console.error('Error al eliminar curso:', err);
    }
  }

  // --- CALCULADORA BLACKBOARD ---
  get cursoCalculadora(): Curso | undefined {
    return this.cursos.find(c => c.id === this.selectedCursoCalculadoraId);
  }

  get evaluacionesCursoSeleccionado(): Evaluacion[] {
    return this.evaluaciones.filter(e => e.curso_id === this.selectedCursoCalculadoraId);
  }

  get calculoCursoActual(): CalculoCurso | null {
    const curso = this.cursoCalculadora;
    if (!curso) return null;

    const evals = this.evaluacionesCursoSeleccionado;
    let ponderacionTotalRegistrada = 0;
    let sumaPonderadaNotas = 0;
    let pesoNotasConCalificacion = 0;

    for (const ev of evals) {
      ponderacionTotalRegistrada += Number(ev.ponderacion) || 0;
      if (ev.nota_obtenida !== null && ev.nota_obtenida !== undefined && !isNaN(Number(ev.nota_obtenida)) && (ev.nota_obtenida as any) !== '') {
        sumaPonderadaNotas += (Number(ev.nota_obtenida) * Number(ev.ponderacion)) / 100;
        pesoNotasConCalificacion += Number(ev.ponderacion);
      }
    }

    const pesoFaltante = Math.max(0, 100 - pesoNotasConCalificacion);
    const notaMinimaAprobatoria = 10.5;
    const notaNotable = 14;

    // Promedio Ponderado Actual Relativo (Exactamente como lo calcula Blackboard en "Calificación Actual"):
    // Divide los puntos ganados entre la fracción del curso evaluada a la fecha
    const promedioActualRelativo = pesoNotasConCalificacion > 0 
      ? Math.round((sumaPonderadaNotas / (pesoNotasConCalificacion / 100)) * 100) / 100
      : 0;

    let notaFinalNecesariaMinima: number | null = null;
    let notaFinalNecesariaNotable: number | null = null;

    if (pesoFaltante > 0) {
      const puntosFaltantes = Math.max(0, notaMinimaAprobatoria - sumaPonderadaNotas);
      notaFinalNecesariaMinima = Math.round(((puntosFaltantes * 100) / pesoFaltante) * 100) / 100;

      const puntosNotable = Math.max(0, notaNotable - sumaPonderadaNotas);
      notaFinalNecesariaNotable = Math.round(((puntosNotable * 100) / pesoFaltante) * 100) / 100;
    }

    let estado: 'aprobado' | 'en_carrera' | 'en_riesgo' | 'desaprobado' = 'en_carrera';

    if (sumaPonderadaNotas >= notaMinimaAprobatoria) {
      estado = 'aprobado';
    } else if (pesoFaltante === 0 && sumaPonderadaNotas < notaMinimaAprobatoria) {
      estado = 'desaprobado';
    } else if (notaFinalNecesariaMinima !== null && notaFinalNecesariaMinima > 20) {
      estado = 'desaprobado';
    } else if (notaFinalNecesariaMinima !== null && notaFinalNecesariaMinima > 14) {
      estado = 'en_riesgo';
    } else {
      estado = 'en_carrera';
    }

    return {
      curso,
      evaluaciones: evals,
      porcentajeRegistrado: ponderacionTotalRegistrada,
      promedioPonderadoActual: promedioActualRelativo, // ej: 10.32 como Blackboard
      puntosAcumulados: Math.round(sumaPonderadaNotas * 100) / 100, // ej: 5.16 / 20 pts
      pesoNotasConCalificacion: pesoNotasConCalificacion, // ej: 50%
      porcentajeRestante: pesoFaltante, // ej: 50%
      notaFinalNecesariaMinima: notaFinalNecesariaMinima !== null ? (sumaPonderadaNotas >= notaMinimaAprobatoria ? 0 : notaFinalNecesariaMinima) : null,
      notaFinalNecesariaNotable: notaFinalNecesariaNotable !== null ? (sumaPonderadaNotas >= notaNotable ? 0 : notaFinalNecesariaNotable) : null,
      estado
    };
  }

  getColorPromedio(promedio: number): string {
    if (promedio >= 14) return '#16a34a'; // Verde notable
    if (promedio >= 10.5) return '#0284c7'; // Azul / celeste aprobado
    if (promedio > 0) return '#dc2626'; // Rojo desaprobado
    return '#64748b'; // Gris sin notas
  }

  getColorNota(nota?: number | null | string): string {
    if (nota === null || nota === undefined || nota === '') return 'inherit';
    const n = Number(nota);
    if (isNaN(n)) return 'inherit';
    if (n >= 14) return '#16a34a';
    if (n >= 10.5) return '#0284c7';
    return '#dc2626';
  }

  getColorNotaBorder(nota?: number | null | string): string {
    if (nota === null || nota === undefined || nota === '') return 'var(--senati-border)';
    const n = Number(nota);
    if (isNaN(n)) return 'var(--senati-border)';
    if (n >= 14) return '#86efac';
    if (n >= 10.5) return '#bae6fd';
    return '#fca5a5';
  }

  getColorNotaBg(nota?: number | null | string): string {
    if (nota === null || nota === undefined || nota === '') return 'transparent';
    const n = Number(nota);
    if (isNaN(n)) return 'transparent';
    if (n >= 14) return 'rgba(22, 163, 74, 0.08)';
    if (n >= 10.5) return 'rgba(2, 132, 199, 0.08)';
    return 'rgba(220, 38, 38, 0.08)';
  }

  openAddEvaluacionModal() {
    this.editingEvaluacionId = undefined;
    this.formEvaluacion = {
      curso_id: this.selectedCursoCalculadoraId,
      nombre_evaluacion: '',
      ponderacion: 20,
      nota_obtenida: null
    };
    this.errorEvaluacion = '';
    this.modalEvaluacionOpen = true;
  }

  openEditEvaluacionModal(ev: Evaluacion) {
    this.editingEvaluacionId = ev.id;
    this.formEvaluacion = {
      curso_id: ev.curso_id,
      nombre_evaluacion: ev.nombre_evaluacion,
      ponderacion: ev.ponderacion,
      nota_obtenida: ev.nota_obtenida !== null && ev.nota_obtenida !== undefined ? ev.nota_obtenida : null
    };
    this.errorEvaluacion = '';
    this.modalEvaluacionOpen = true;
  }

  async saveEvaluacion() {
    if (!this.formEvaluacion.nombre_evaluacion.trim() || !this.formEvaluacion.curso_id) {
      this.errorEvaluacion = 'Nombre de la evaluación y curso son obligatorios.';
      return;
    }

    if (this.formEvaluacion.ponderacion <= 0 || this.formEvaluacion.ponderacion > 100) {
      this.errorEvaluacion = 'La ponderación debe ser entre 1% y 100%.';
      return;
    }

    const notaFinal = this.formEvaluacion.nota_obtenida !== null && 
                      this.formEvaluacion.nota_obtenida !== undefined && 
                      (this.formEvaluacion.nota_obtenida as any) !== '' 
                      ? Math.min(20, Math.max(0, Number(this.formEvaluacion.nota_obtenida))) 
                      : null;

    try {
      if (this.editingEvaluacionId) {
        await this.supabaseService.updateEvaluacion(this.editingEvaluacionId, {
          nombre_evaluacion: this.formEvaluacion.nombre_evaluacion.trim(),
          ponderacion: this.formEvaluacion.ponderacion,
          nota_obtenida: notaFinal
        });
        this.showToast('Evaluación actualizada correctamente ✏️', 'success');
      } else {
        await this.supabaseService.addEvaluacion({
          curso_id: this.formEvaluacion.curso_id,
          nombre_evaluacion: this.formEvaluacion.nombre_evaluacion.trim(),
          ponderacion: this.formEvaluacion.ponderacion,
          nota_obtenida: notaFinal
        });
        this.showToast('¡Nueva evaluación registrada! 📝', 'success');
      }

      this.modalEvaluacionOpen = false;
      await this.loadEvaluaciones();
    } catch (err: any) {
      console.error(err);
      this.errorEvaluacion = err.message || 'Error al guardar la evaluación.';
    }
  }

  async quickUpdateNota(ev: Evaluacion, nuevaNotaStr: string) {
    if (!ev.id) return;
    const valor = nuevaNotaStr.trim() === '' ? null : Math.min(20, Math.max(0, Number(nuevaNotaStr)));
    try {
      await this.supabaseService.updateEvaluacion(ev.id, { nota_obtenida: valor });
      ev.nota_obtenida = valor;
      this.showToast(`Nota guardada: ${valor !== null ? valor : 'Sin nota'} (${ev.nombre_evaluacion})`, 'success');
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error al actualizar nota:', err);
      this.showToast('Error al guardar nota', 'danger');
    }
  }

  async deleteEvaluacion(ev: Evaluacion) {
    if (!ev.id) return;
    if (!confirm(`¿Eliminar la evaluación "${ev.nombre_evaluacion}"?`)) return;

    try {
      await this.supabaseService.deleteEvaluacion(ev.id);
      this.showToast('Evaluación eliminada 🗑️', 'info');
      await this.loadEvaluaciones();
    } catch (err) {
      console.error('Error al eliminar evaluación:', err);
    }
  }

  async crearPlantillaEvaluaciones(cursoId: string) {
    const plantillaOficial = [
      { nombre: 'Evaluación Parcial T01', peso: 2 },
      { nombre: 'Evaluación Parcial T02', peso: 2 },
      { nombre: 'Evaluación Parcial T03', peso: 2 },
      { nombre: 'Evaluación Parcial T04', peso: 2 },
      { nombre: 'Evaluación Parcial T05', peso: 2 },
      { nombre: 'Actitudes', peso: 10 },
      { nombre: 'Participación', peso: 10 },
      { nombre: 'Nota IP_empresa', peso: 20 },
      { nombre: 'Entregable - E01', peso: 20 },
      { nombre: 'Examen Final', peso: 30 }
    ];

    for (const item of plantillaOficial) {
      await this.supabaseService.addEvaluacion({
        curso_id: cursoId,
        nombre_evaluacion: item.nombre,
        ponderacion: item.peso,
        nota_obtenida: null
      });
    }
  }

  async aplicarPlantillaOficialSenati() {
    if (!this.selectedCursoCalculadoraId) return;
    if (!confirm('¿Cargar la plantilla oficial de Blackboard SENATI (100%) para este curso?\n\n- Evaluaciones Parciales T01 a T05 (2% c/u = 10%)\n- Actitudes (10%)\n- Participación (10%)\n- Nota IP_Empresa (20%)\n- Entregable E01 (20%)\n- Examen Final (30%)\n\nSe limpiarán las filas anteriores y se creará el esquema oficial listo para ingresar notas.')) return;

    // Eliminar evaluaciones anteriores de este curso para evitar duplicados
    const evalsActuales = this.evaluacionesCursoSeleccionado;
    for (const ev of evalsActuales) {
      if (ev.id) await this.supabaseService.deleteEvaluacion(ev.id);
    }

    await this.crearPlantillaEvaluaciones(this.selectedCursoCalculadoraId);
    this.showToast('¡Plantilla oficial SENATI cargada (100%)! 🚀', 'success');
    await this.loadEvaluaciones();
  }

  async aplicarPlantillaATodosLosCursos() {
    if (this.cursos.length === 0) {
      this.showToast('No tienes cursos registrados aún.', 'info');
      return;
    }

    if (!confirm(`¿Aplicar la plantilla oficial de Blackboard SENATI (100%) a TODOS tus cursos (${this.cursos.length} materias)?\n\n- Evaluaciones Parciales T01 a T05 (2% c/u = 10%)\n- Actitudes (10%)\n- Participación (10%)\n- Nota IP_Empresa (20%)\n- Entregable E01 (20%)\n- Examen Final (30%)\n\nSe configurará la tabla de notas oficial en cada una de tus materias.`)) return;

    try {
      for (const curso of this.cursos) {
        if (!curso.id) continue;
        const evalsCurso = this.evaluaciones.filter(e => e.curso_id === curso.id);
        for (const ev of evalsCurso) {
          if (ev.id) await this.supabaseService.deleteEvaluacion(ev.id);
        }
        await this.crearPlantillaEvaluaciones(curso.id);
      }
      this.showToast('¡Esquema oficial de notas aplicado a todos tus cursos! 🚀', 'success');
      await this.loadEvaluaciones();
    } catch (err: any) {
      console.error(err);
      this.showToast('Error al aplicar plantilla a todos los cursos', 'danger');
    }
  }

  // --- HELPERS ---
  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isTaskDueSoon(dateStr: string): boolean {
    const now = new Date().getTime();
    const due = new Date(dateStr).getTime();
    const diff = due - now;
    return diff > 0 && diff <= (24 * 60 * 60 * 1000);
  }

  isTaskOverdue(dateStr: string): boolean {
    const now = new Date().getTime();
    const due = new Date(dateStr).getTime();
    return due < now;
  }

  // --- PROYECTOS & ENTREGABLES ACTIONS ---
  openAddProyectoModal(cursoIdDefault?: string) {
    this.editingProyectoId = undefined;
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    defaultDate.setHours(23, 59, 0, 0);

    const tzOffset = defaultDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(defaultDate.getTime() - tzOffset)).toISOString().slice(0, 16);

    this.formProyecto = {
      curso_id: cursoIdDefault || (this.cursos.length > 0 ? this.cursos[0].id || '' : ''),
      titulo: '',
      tipo: 'TR1',
      descripcion: '',
      fecha_limite: localISOTime,
      estado: 'en_desarrollo',
      link_github: '',
      link_drive: '',
      link_demo: '',
      checklistText: 'Carátula y objetivos del proyecto\nDiagrama de base de datos o arquitectura\nImplementación de vistas / controladores\nPruebas unitarias y validación\nManual de usuario o informe en PDF'
    };
    this.errorProyecto = '';
    this.modalProyectoOpen = true;
  }

  openEditProyectoModal(p: ProyectoEntregable) {
    this.editingProyectoId = p.id;
    const dateObj = new Date(p.fecha_limite);
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 16);

    const checklistString = p.checklist ? p.checklist.map(c => c.texto).join('\n') : '';

    this.formProyecto = {
      curso_id: p.curso_id,
      titulo: p.titulo,
      tipo: p.tipo,
      descripcion: p.descripcion || '',
      fecha_limite: localISOTime,
      estado: p.estado,
      link_github: p.link_github || '',
      link_drive: p.link_drive || '',
      link_demo: p.link_demo || '',
      checklistText: checklistString
    };
    this.errorProyecto = '';
    this.modalProyectoOpen = true;
  }

  closeProyectoModal() {
    this.modalProyectoOpen = false;
    this.editingProyectoId = undefined;
    this.errorProyecto = '';
  }

  async saveProyecto() {
    if (!this.formProyecto.titulo.trim()) {
      this.errorProyecto = 'El título del proyecto o entregable es obligatorio.';
      return;
    }
    if (!this.formProyecto.curso_id) {
      this.errorProyecto = 'Debes seleccionar un curso.';
      return;
    }
    if (!this.formProyecto.fecha_limite) {
      this.errorProyecto = 'La fecha de entrega es obligatoria.';
      return;
    }

    // Convertir líneas de checklist a objetos
    const lines = this.formProyecto.checklistText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const checklistItems: ChecklistItem[] = lines.map((txt, idx) => ({
      id: 'chk_' + idx + '_' + Date.now(),
      texto: txt,
      completado: false
    }));

    try {
      if (this.editingProyectoId) {
        // Mantener el estado completado si ya existía el item
        const existing = this.proyectos.find(p => p.id === this.editingProyectoId);
        if (existing && existing.checklist) {
          checklistItems.forEach(item => {
            const old = existing.checklist?.find(c => c.texto === item.texto);
            if (old) item.completado = old.completado;
          });
        }

        await this.supabaseService.updateProyecto(this.editingProyectoId, {
          curso_id: this.formProyecto.curso_id,
          titulo: this.formProyecto.titulo.trim(),
          tipo: this.formProyecto.tipo,
          descripcion: this.formProyecto.descripcion.trim(),
          fecha_limite: new Date(this.formProyecto.fecha_limite).toISOString(),
          estado: this.formProyecto.estado,
          link_github: this.formProyecto.link_github.trim(),
          link_drive: this.formProyecto.link_drive.trim(),
          link_demo: this.formProyecto.link_demo.trim(),
          checklist: checklistItems
        });
        this.showToast('Entregable actualizado correctamente');
      } else {
        await this.supabaseService.addProyecto({
          curso_id: this.formProyecto.curso_id,
          titulo: this.formProyecto.titulo.trim(),
          tipo: this.formProyecto.tipo,
          descripcion: this.formProyecto.descripcion.trim(),
          fecha_limite: new Date(this.formProyecto.fecha_limite).toISOString(),
          estado: this.formProyecto.estado,
          link_github: this.formProyecto.link_github.trim(),
          link_drive: this.formProyecto.link_drive.trim(),
          link_demo: this.formProyecto.link_demo.trim(),
          checklist: checklistItems
        });
        this.showToast('¡Entregable creado con éxito!');
      }

      this.closeProyectoModal();
      await this.loadProyectos();
    } catch (err: any) {
      this.errorProyecto = err.message || 'Error al guardar el entregable.';
    }
  }

  async deleteProyecto(id?: string) {
    if (!id) return;
    if (!confirm('¿Seguro que deseas eliminar este entregable?')) return;

    try {
      await this.supabaseService.deleteProyecto(id);
      this.showToast('Entregable eliminado', 'info');
      await this.loadProyectos();
    } catch (err) {
      this.showToast('Error al eliminar entregable', 'danger');
    }
  }

  async cambiarEstadoProyecto(p: ProyectoEntregable, nuevoEstado: EstadoEntregable) {
    if (!p.id) return;
    p.estado = nuevoEstado;
    await this.supabaseService.updateProyecto(p.id, { estado: nuevoEstado });
    this.showToast('Estado actualizado: ' + nuevoEstado);
  }

  async toggleChecklistItem(p: ProyectoEntregable, itemIndex: number) {
    if (!p.id || !p.checklist) return;
    p.checklist[itemIndex].completado = !p.checklist[itemIndex].completado;
    await this.supabaseService.updateProyecto(p.id, { checklist: p.checklist });
    this.cdr.detectChanges();
  }

  // --- EXPORTACIÓN DE CALENDARIO (.ICS & GOOGLE CALENDAR) ---
  exportarCalendarioICS() {
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SENATI Portal//Agenda y Entregas//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:SENATI Académico',
      'X-WR-TIMEZONE:America/Lima'
    ];

    const formatIcsDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    // 1. Agregar Tareas
    this.tareas.forEach(t => {
      if (t.estado === 'entregado') return;
      const dueDate = new Date(t.fecha_limite);
      const startDate = new Date(dueDate.getTime() - (60 * 60 * 1000)); // 1 hora antes
      const uid = `tarea-${t.id || Date.now()}@senati-portal`;
      const desc = `Curso: ${t.curso?.nombre || 'General'}\\nPrioridad: ${t.prioridad}\\nEstado: ${t.estado}\\nLink: ${t.link_entrega || 'N/A'}`;

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${uid}`);
      icsContent.push(`DTSTAMP:${formatIcsDate(new Date())}`);
      icsContent.push(`DTSTART:${formatIcsDate(startDate)}`);
      icsContent.push(`DTEND:${formatIcsDate(dueDate)}`);
      icsContent.push(`SUMMARY:[SENATI] ${t.titulo}`);
      icsContent.push(`DESCRIPTION:${desc}`);
      icsContent.push('STATUS:CONFIRMED');
      icsContent.push('END:VEVENT');
    });

    // 2. Agregar Entregables y Proyectos
    this.proyectos.forEach(p => {
      if (p.estado === 'entregado') return;
      const dueDate = new Date(p.fecha_limite);
      const startDate = new Date(dueDate.getTime() - (2 * 60 * 60 * 1000));
      const uid = `proyecto-${p.id || Date.now()}@senati-portal`;
      const desc = `Entregable: ${p.tipo}\\nCurso: ${p.curso?.nombre || 'General'}\\nGitHub: ${p.link_github || 'N/A'}\\nDrive: ${p.link_drive || 'N/A'}`;

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${uid}`);
      icsContent.push(`DTSTAMP:${formatIcsDate(new Date())}`);
      icsContent.push(`DTSTART:${formatIcsDate(startDate)}`);
      icsContent.push(`DTEND:${formatIcsDate(dueDate)}`);
      icsContent.push(`SUMMARY:[ENTREGABLE] ${p.titulo} (${p.tipo})`);
      icsContent.push(`DESCRIPTION:${desc}`);
      icsContent.push('STATUS:CONFIRMED');
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `agenda_senati_${new Date().toISOString().slice(0, 10)}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    this.showToast('📅 Archivo de calendario descargado (.ics)');
  }

  // --- HORARIO DE CLASES SENATI ---
  parsearHorarioCurso(curso: Curso): ClaseHorario[] {
    const raw = (curso.horario || '').trim();
    if (!raw) return [];

    const resultado: ClaseHorario[] = [];
    const diasConfig = [
      { num: 1, nombre: 'Lunes', abrev: 'LUN', keys: ['lunes', 'lun'] },
      { num: 2, nombre: 'Martes', abrev: 'MAR', keys: ['martes', 'mar'] },
      { num: 3, nombre: 'Miércoles', abrev: 'MIÉ', keys: ['miercoles', 'miércoles', 'mie'] },
      { num: 4, nombre: 'Jueves', abrev: 'JUE', keys: ['jueves', 'jue'] },
      { num: 5, nombre: 'Viernes', abrev: 'VIE', keys: ['viernes', 'vie'] },
      { num: 6, nombre: 'Sábado', abrev: 'SÁB', keys: ['sabado', 'sábado', 'sab'] },
      { num: 0, nombre: 'Domingo', abrev: 'DOM', keys: ['domingo', 'dom'] }
    ];

    // Separar segmentos si hay delimitadores como coma, punto y coma o salto de línea
    const segmentos = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

    for (const seg of segmentos) {
      const segNorm = seg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Detectar días mencionados
      const diasEncontrados = diasConfig.filter(d =>
        d.keys.some(k => new RegExp(`\\b${k}\\b`, 'i').test(segNorm))
      );

      // Extraer horas HH:MM
      const timeMatches = seg.match(/\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/g);

      let horaInicio = '08:00';
      let horaFin = '11:00';
      let iniMin = 8 * 60;
      let finMin = 11 * 60;

      if (timeMatches && timeMatches.length >= 1) {
        horaInicio = timeMatches[0].padStart(5, '0');
        const [h1, m1] = horaInicio.split(':').map(Number);
        iniMin = h1 * 60 + m1;

        if (timeMatches.length >= 2) {
          horaFin = timeMatches[1].padStart(5, '0');
          const [h2, m2] = horaFin.split(':').map(Number);
          finMin = h2 * 60 + m2;
        } else {
          // Si solo hay hora de inicio, asumir bloque de 3 horas
          finMin = Math.min(23 * 60 + 59, iniMin + 180);
          const hF = Math.floor(finMin / 60);
          const mF = finMin % 60;
          horaFin = `${hF.toString().padStart(2, '0')}:${mF.toString().padStart(2, '0')}`;
        }
      }

      const horaFormateada = `${horaInicio} - ${horaFin}`;
      const duracion = Math.max(0, finMin - iniMin);

      if (diasEncontrados.length > 0) {
        for (const dia of diasEncontrados) {
          resultado.push({
            id: `${curso.id}_${dia.num}_${horaInicio}`,
            curso,
            diaNombre: dia.nombre,
            diaAbrev: dia.abrev,
            diaNumero: dia.num,
            horaInicio,
            horaFin,
            horaFormateada,
            inicioMinutos: iniMin,
            finMinutos: finMin,
            duracionMinutos: duracion,
            esHoy: false,
            enVivo: false,
            proximaHoy: false,
            finalizadaHoy: false
          });
        }
      } else if (timeMatches && timeMatches.length > 0) {
        resultado.push({
          id: `${curso.id}_flex_${horaInicio}`,
          curso,
          diaNombre: 'Horario Asignado',
          diaAbrev: 'HOR',
          diaNumero: 1,
          horaInicio,
          horaFin,
          horaFormateada,
          inicioMinutos: iniMin,
          finMinutos: finMin,
          duracionMinutos: duracion,
          esHoy: false,
          enVivo: false,
          proximaHoy: false,
          finalizadaHoy: false
        });
      }
    }

    return resultado;
  }

  analizarHorarios() {
    const ahora = new Date();
    const hoyDiaNum = ahora.getDay();
    const ahoraMinutos = ahora.getHours() * 60 + ahora.getMinutes();

    const diasDefs = [
      { numero: 1, nombre: 'Lunes', abreviacion: 'LUN' },
      { numero: 2, nombre: 'Martes', abreviacion: 'MAR' },
      { numero: 3, nombre: 'Miércoles', abreviacion: 'MIÉ' },
      { numero: 4, nombre: 'Jueves', abreviacion: 'JUE' },
      { numero: 5, nombre: 'Viernes', abreviacion: 'VIE' },
      { numero: 6, nombre: 'Sábado', abreviacion: 'SÁB' }
    ];

    const todasClases: ClaseHorario[] = [];
    this.cursosSinHorario = [];

    for (const c of this.cursos) {
      const parsed = this.parsearHorarioCurso(c);
      if (parsed.length === 0) {
        this.cursosSinHorario.push(c);
      } else {
        todasClases.push(...parsed);
      }
    }

    // Agregar domingo solo si hay alguna clase ese día
    if (todasClases.some(c => c.diaNumero === 0)) {
      diasDefs.push({ numero: 0, nombre: 'Domingo', abreviacion: 'DOM' });
    }

    // Actualizar estados temporales
    for (const cl of todasClases) {
      cl.esHoy = (cl.diaNumero === hoyDiaNum);
      cl.enVivo = cl.esHoy && (ahoraMinutos >= cl.inicioMinutos && ahoraMinutos <= cl.finMinutos);
      cl.proximaHoy = cl.esHoy && (ahoraMinutos < cl.inicioMinutos);
      cl.finalizadaHoy = cl.esHoy && (ahoraMinutos > cl.finMinutos);
    }

    this.diasSemana = diasDefs
      .map(def => {
        const clasesDelDia = todasClases
          .filter(c => c.diaNumero === def.numero)
          .sort((a, b) => a.inicioMinutos - b.inicioMinutos);

        return {
          nombre: def.nombre,
          abreviacion: def.abreviacion,
          numero: def.numero,
          esHoy: (def.numero === hoyDiaNum),
          clases: clasesDelDia
        };
      })
      .filter(dia => dia.clases.length > 0);


    this.clasesTotal = todasClases;
    this.clasesHoy = todasClases.filter(c => c.esHoy).sort((a, b) => a.inicioMinutos - b.inicioMinutos);
    this.claseEnVivo = todasClases.find(c => c.enVivo) || null;
    this.proximaClaseHoy = this.clasesHoy.find(c => c.proximaHoy) || null;

    if (this.claseEnVivo) {
      const transcurrido = ahoraMinutos - this.claseEnVivo.inicioMinutos;
      const dur = this.claseEnVivo.duracionMinutos || 1;
      this.progresoClaseActual = Math.min(100, Math.max(0, Math.round((transcurrido / dur) * 100)));

      const minRestantes = this.claseEnVivo.finMinutos - ahoraMinutos;
      const hRest = Math.floor(minRestantes / 60);
      const mRest = minRestantes % 60;
      this.tiempoRestanteClaseActual = hRest > 0 ? `${hRest}h ${mRest}m` : `${mRest} min`;
    } else {
      this.progresoClaseActual = 0;
      this.tiempoRestanteClaseActual = '';
    }

    if (this.proximaClaseHoy) {
      const minFaltan = this.proximaClaseHoy.inicioMinutos - ahoraMinutos;
      const hFaltan = Math.floor(minFaltan / 60);
      const mFaltan = minFaltan % 60;
      this.tiempoParaProximaClase = hFaltan > 0 ? `en ${hFaltan}h ${mFaltan}m` : `en ${mFaltan} min`;
    } else {
      this.tiempoParaProximaClase = '';
    }

    this.cdr.detectChanges();
  }

  get hoyTextoLargo(): string {
    const d = new Date();
    const str = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  get diasSemanaFiltrados(): DiaSemanaHorario[] {
    if (this.filtroDiaHorario === 'todos') {
      return this.diasSemana;
    }
    if (this.filtroDiaHorario === 'hoy') {
      const hoyNum = new Date().getDay();
      return this.diasSemana.filter(d => d.numero === hoyNum);
    }
    const num = Number(this.filtroDiaHorario);
    return this.diasSemana.filter(d => d.numero === num);
  }

  get totalClasesSemana(): number {
    return this.clasesTotal.length;
  }

  getTareasPendientesCurso(cursoId?: string): number {
    if (!cursoId) return 0;
    return this.tareas.filter(t => t.curso_id === cursoId && t.estado !== 'entregado').length;
  }

  getProyectosActivosCurso(cursoId?: string): number {
    if (!cursoId) return 0;
    return this.proyectos.filter(p => p.curso_id === cursoId && p.estado !== 'entregado').length;
  }

  getGoogleCalendarLinkParaClase(clase: ClaseHorario): string {
    const title = `[SENATI] ${clase.curso.nombre}`;
    const desc = `Curso: ${clase.curso.nombre}\nSemestre: ${clase.curso.semestre}°\nProfesor: ${clase.curso.profesor || 'Docente SENATI'}\nBlackboard: ${clase.curso.link_blackboard || 'https://senati.blackboard.com/'}\nTeams: ${clase.curso.link_teams || 'N/A'}`.trim();

    const now = new Date();
    const currentDay = now.getDay();
    let daysToAdd = (clase.diaNumero - currentDay + 7) % 7;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (daysToAdd === 0 && currentMinutes > clase.finMinutos) {
      daysToAdd = 7;
    }

    const targetDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    const [hIni, mIni] = clase.horaInicio.split(':').map(Number);
    const [hFin, mFin] = clase.horaFin.split(':').map(Number);

    targetDate.setHours(hIni, mIni, 0, 0);
    const startStr = targetDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    targetDate.setHours(hFin, mFin, 0, 0);
    const endStr = targetDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(desc)}&dates=${startStr}/${endStr}&recur=RRULE:FREQ=WEEKLY`;
  }

  exportarHorariosICS(): void {
    if (this.clasesTotal.length === 0) {
      this.showToast('No hay clases con horario registrado en la base de datos.', 'info');
      return;
    }

    const icsContent: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SENATI Portal//Horario Semanal//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Horario de Clases SENATI'
    ];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const byDayMap: Record<number, string> = {
      0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA'
    };

    this.clasesTotal.forEach(c => {
      const [hIni, mIni] = c.horaInicio.split(':').map(Number);
      const [hFin, mFin] = c.horaFin.split(':').map(Number);

      const currentDay = now.getDay();
      let diffDays = (c.diaNumero - currentDay + 7) % 7;
      const eventDate = new Date(now.getTime() + diffDays * 24 * 60 * 60 * 1000);

      const yyyy = eventDate.getFullYear();
      const mm = pad(eventDate.getMonth() + 1);
      const dd = pad(eventDate.getDate());

      const dtStart = `${yyyy}${mm}${dd}T${pad(hIni)}${pad(mIni)}00`;
      const dtEnd = `${yyyy}${mm}${dd}T${pad(hFin)}${pad(mFin)}00`;
      const uid = `clase-${c.curso.id || Date.now()}-${c.diaNumero}@senati-portal`;
      const desc = `Curso: ${c.curso.nombre}\\nProfesor: ${c.curso.profesor || 'Docente SENATI'}\\nBlackboard: ${c.curso.link_blackboard || ''}\\nTeams: ${c.curso.link_teams || ''}`;

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${uid}`);
      icsContent.push(`DTSTAMP:${stamp}`);
      icsContent.push(`DTSTART:${dtStart}`);
      icsContent.push(`DTEND:${dtEnd}`);
      icsContent.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDayMap[c.diaNumero]}`);
      icsContent.push(`SUMMARY:[SENATI] ${c.curso.nombre}`);
      icsContent.push(`DESCRIPTION:${desc}`);
      icsContent.push('STATUS:CONFIRMED');
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `horario_senati_${new Date().toISOString().slice(0, 10)}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    this.showToast('📅 Horario de clases descargado (.ics)');
  }

  aplicarPresetHorario(preset: string): void {
    this.formCurso.horario = preset;
  }

  getGoogleCalendarLink(titulo: string, descripcion: string, fechaLimite: string, linkWeb?: string): string {
    const d = new Date(fechaLimite);
    const startStr = d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endStr = new Date(d.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const fullDesc = `${descripcion || ''}\n\nEnlace: ${linkWeb || ''}`.trim();

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('[SENATI] ' + titulo)}&details=${encodeURIComponent(fullDesc)}&dates=${startStr}/${endStr}`;
  }

  // --- MOBILE DRAWER ACTIONS ---
  selectTabMobile(tab: 'tareas' | 'horarios' | 'proyectos' | 'calculadora') {
    this.activeTab = tab;
    this.mobileMenuOpen = false;
    this.cdr.detectChanges();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openGestionCursosMobile() {
    this.mobileMenuOpen = false;
    this.openGestionCursosModal();
    this.cdr.detectChanges();
  }

  openBlackboardModalMobile() {
    this.mobileMenuOpen = false;
    this.openBlackboardModal();
    this.cdr.detectChanges();
  }

  openExternalLink(url: string, newTab: boolean = true) {
    this.mobileMenuOpen = false;
    this.cdr.detectChanges();
    if (newTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  }

  async enableNotificationsMobile() {
    this.mobileMenuOpen = false;
    this.cdr.detectChanges();
    await this.enableNotifications();
  }

  async onLogoutMobile() {
    this.mobileMenuOpen = false;
    this.cdr.detectChanges();
    await this.onLogout();
  }

  // --- SINCRONIZACIÓN BLACKBOARD SENATI ---
  openBlackboardModal() {
    this.modalBlackboardOpen = true;
    this.blackboardSyncResult = null;
    this.blackboardFeedUrl = this.blackboardSyncService.getSavedFeedUrl();
    this.lastBlackboardSync = this.blackboardSyncService.getLastSyncDate();
    this.cdr.detectChanges();
  }

  closeBlackboardModal() {
    this.modalBlackboardOpen = false;
    this.blackboardSyncResult = null;
    this.cdr.detectChanges();
  }

  async syncBlackboardFromUrl() {
    if (!this.blackboardFeedUrl.trim()) {
      this.showToast('Ingresa la URL del feed iCal de Blackboard', 'danger');
      return;
    }

    this.isSyncingBlackboard = true;
    this.blackboardSyncResult = null;
    this.blackboardSyncService.saveFeedUrl(this.blackboardFeedUrl);
    this.cdr.detectChanges();

    try {
      const icsText = await this.blackboardSyncService.fetchIcs(this.blackboardFeedUrl);
      await this.processIcsContent(icsText);
    } catch (err: any) {
      console.error(err);
      this.showToast(err.message || 'Error al conectar con Blackboard', 'danger');
    } finally {
      this.isSyncingBlackboard = false;
      this.cdr.detectChanges();
    }
  }

  async handleIcsFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isSyncingBlackboard = true;
    this.blackboardSyncResult = null;
    this.cdr.detectChanges();

    try {
      const text = await file.text();
      await this.processIcsContent(text);
      input.value = '';
    } catch (err: any) {
      this.showToast('Error al procesar el archivo .ics', 'danger');
    } finally {
      this.isSyncingBlackboard = false;
      this.cdr.detectChanges();
    }
  }

  private async processIcsContent(icsText: string) {
    const events = this.blackboardSyncService.parseIcs(icsText);
    if (events.length === 0) {
      this.showToast('No se encontraron tareas o fechas en el archivo de Blackboard', 'info');
      return;
    }

    const result = await this.blackboardSyncService.syncToDatabase(events);
    this.blackboardSyncResult = result;
    this.lastBlackboardSync = new Date().toISOString();

    await this.loadAllData();
    this.showToast(`¡Sincronizado! +${result.added} nuevas, ${result.updated} actualizadas`);
  }

  async onLogout() {
    this.mobileMenuOpen = false;
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
