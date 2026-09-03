import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { NotificationService } from '../services/notification.service';
import { Curso, Tarea, Evaluacion, PrioridadTarea, EstadoTarea, CalculoCurso } from '../models/senati.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  // Usuario
  userName = 'Estudiante';
  userLastName = '';
  userInitials = 'E';
  
  // Navegación
  activeTab: 'tareas' | 'calculadora' = 'tareas';
  selectedSemestre: number = 4; // 4° Semestre por defecto

  // Datos
  cursos: Curso[] = [];
  tareas: Tarea[] = [];
  evaluaciones: Evaluacion[] = [];

  // Filtros de Tareas
  filtroEstado: 'todos' | EstadoTarea = 'todos';
  filtroCursoId: string = 'todos';
  filtroPrioridad: string = 'todas';

  // Modales y Menús
  modalTareaOpen = false;
  modalCursoOpen = false;
  modalEvaluacionOpen = false;
  modalGestionCursosOpen = false;
  mobileMenuOpen = false;

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

  // Tema Oscuro
  isDarkMode = false;

  constructor(
    private supabaseService: SupabaseService,
    public notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.loadTheme();
    await this.loadUserProfile();
    await this.loadAllData();
    this.checkNotifications();
  }

  loadTheme() {
    const savedTheme = localStorage.getItem('senati_theme');
    if (savedTheme === 'dark') {
      this.isDarkMode = true;
      document.documentElement.classList.add('dark-theme');
      document.body.classList.add('dark-theme');
    } else {
      this.isDarkMode = false;
      document.documentElement.classList.remove('dark-theme');
      document.body.classList.remove('dark-theme');
    }
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.body.classList.add('dark-theme');
      localStorage.setItem('senati_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-theme');
      document.body.classList.remove('dark-theme');
      localStorage.setItem('senati_theme', 'light');
    }
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
    await Promise.all([
      this.loadCursos(),
      this.loadTareas(),
      this.loadEvaluaciones()
    ]);
  }

  async loadCursos() {
    this.cursos = await this.supabaseService.getCursos();
    if (this.cursos.length > 0 && !this.selectedCursoCalculadoraId) {
      this.selectedCursoCalculadoraId = this.cursos[0].id || '';
    }
    this.cdr.detectChanges();
  }

  async loadTareas() {
    this.tareas = await this.supabaseService.getTareas();
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
  get filteredTareas(): Tarea[] {
    return this.tareas.filter(t => {
      const matchEstado = this.filtroEstado === 'todos' || t.estado === this.filtroEstado;
      const matchCurso = this.filtroCursoId === 'todos' || t.curso_id === this.filtroCursoId;
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
      if (ev.nota_obtenida !== null && ev.nota_obtenida !== undefined && !isNaN(Number(ev.nota_obtenida))) {
        sumaPonderadaNotas += (Number(ev.nota_obtenida) * Number(ev.ponderacion)) / 100;
        pesoNotasConCalificacion += Number(ev.ponderacion);
      }
    }

    const pesoFaltante = 100 - pesoNotasConCalificacion;
    const notaMinimaAprobatoria = 10.5;
    const notaNotable = 14;

    let notaFinalNecesariaMinima: number | null = null;
    let notaFinalNecesariaNotable: number | null = null;

    if (pesoFaltante > 0) {
      const puntosFaltantes = notaMinimaAprobatoria - sumaPonderadaNotas;
      notaFinalNecesariaMinima = (puntosFaltantes * 100) / pesoFaltante;

      const puntosNotable = notaNotable - sumaPonderadaNotas;
      notaFinalNecesariaNotable = (puntosNotable * 100) / pesoFaltante;
    }

    let estado: 'aprobado' | 'en_carrera' | 'en_riesgo' | 'desaprobado' = 'en_carrera';

    if (sumaPonderadaNotas >= notaMinimaAprobatoria) {
      estado = 'aprobado';
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
      promedioPonderadoActual: Math.round(sumaPonderadaNotas * 100) / 100,
      porcentajeRestante: pesoFaltante,
      notaFinalNecesariaMinima: notaFinalNecesariaMinima !== null ? Math.round(notaFinalNecesariaMinima * 100) / 100 : null,
      notaFinalNecesariaNotable: notaFinalNecesariaNotable !== null ? Math.round(notaFinalNecesariaNotable * 100) / 100 : null,
      estado
    };
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

  async saveEvaluacion() {
    if (!this.formEvaluacion.nombre_evaluacion.trim() || !this.formEvaluacion.curso_id) {
      this.errorEvaluacion = 'Nombre de la evaluación y curso son obligatorios.';
      return;
    }

    if (this.formEvaluacion.ponderacion <= 0 || this.formEvaluacion.ponderacion > 100) {
      this.errorEvaluacion = 'La ponderación debe ser entre 1% y 100%.';
      return;
    }

    try {
      if (this.editingEvaluacionId) {
        await this.supabaseService.updateEvaluacion(this.editingEvaluacionId, {
          nombre_evaluacion: this.formEvaluacion.nombre_evaluacion.trim(),
          ponderacion: this.formEvaluacion.ponderacion,
          nota_obtenida: this.formEvaluacion.nota_obtenida !== null && this.formEvaluacion.nota_obtenida !== undefined ? Number(this.formEvaluacion.nota_obtenida) : null
        });
      } else {
        await this.supabaseService.addEvaluacion({
          curso_id: this.formEvaluacion.curso_id,
          nombre_evaluacion: this.formEvaluacion.nombre_evaluacion.trim(),
          ponderacion: this.formEvaluacion.ponderacion,
          nota_obtenida: this.formEvaluacion.nota_obtenida !== null && this.formEvaluacion.nota_obtenida !== undefined ? Number(this.formEvaluacion.nota_obtenida) : null
        });
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
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error al actualizar nota:', err);
    }
  }

  async deleteEvaluacion(ev: Evaluacion) {
    if (!ev.id) return;
    if (!confirm(`¿Eliminar la evaluación "${ev.nombre_evaluacion}"?`)) return;

    try {
      await this.supabaseService.deleteEvaluacion(ev.id);
      await this.loadEvaluaciones();
    } catch (err) {
      console.error('Error al eliminar evaluación:', err);
    }
  }

  async crearPlantillaEvaluaciones(cursoId: string) {
    const plantilla = [
      { nombre: 'Foro Temático / Participación', peso: 10 },
      { nombre: 'Entregable 01 (TR1)', peso: 20 },
      { nombre: 'Entregable 02 (TR2)', peso: 20 },
      { nombre: 'Evaluación Final / Proyecto', peso: 50 }
    ];

    for (const item of plantilla) {
      await this.supabaseService.addEvaluacion({
        curso_id: cursoId,
        nombre_evaluacion: item.nombre,
        ponderacion: item.peso,
        nota_obtenida: null
      });
    }
  }

  async aplicarPlantillaBlackboardActual() {
    if (!this.selectedCursoCalculadoraId) return;
    if (!confirm('¿Cargar la plantilla estándar de Blackboard SENATI para este curso (TR1, TR2, Foro, Examen Final)?')) return;

    await this.crearPlantillaEvaluaciones(this.selectedCursoCalculadoraId);
    await this.loadEvaluaciones();
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

  async onLogout() {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
