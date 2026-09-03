import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Curso, Tarea, Evaluacion, EstadoTarea } from '../models/senati.models';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // --- AUTH METHODS ---
  async signUp(email: string, password: string, nombres: string, apellidos: string) {
    return await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombres,
          apellidos
        }
      }
    });
  }

  async signIn(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  async getSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }

  async getUser(): Promise<User | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user;
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('nombres, apellidos')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  }

  // --- CURSOS CRUD ---
  async getCursos(semestre?: number): Promise<Curso[]> {
    const user = await this.getUser();
    if (!user) return [];

    let query = this.supabase
      .from('senati_cursos')
      .select('*')
      .eq('usuario_id', user.id)
      .order('semestre', { ascending: true })
      .order('nombre', { ascending: true });

    if (semestre) {
      query = query.eq('semestre', semestre);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching cursos:', error);
      return [];
    }
    return data || [];
  }

  async addCurso(curso: Omit<Curso, 'id' | 'usuario_id' | 'created_at'>): Promise<Curso> {
    const user = await this.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { data, error } = await this.supabase
      .from('senati_cursos')
      .insert([
        {
          ...curso,
          usuario_id: user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateCurso(id: string, curso: Partial<Curso>): Promise<Curso> {
    const { data, error } = await this.supabase
      .from('senati_cursos')
      .update(curso)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteCurso(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('senati_cursos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // --- TAREAS CRUD ---
  async getTareas(cursoId?: string): Promise<Tarea[]> {
    const user = await this.getUser();
    if (!user) return [];

    let query = this.supabase
      .from('senati_tareas')
      .select(`
        *,
        curso:senati_cursos (
          id,
          nombre,
          color,
          semestre,
          profesor
        )
      `)
      .eq('usuario_id', user.id)
      .order('fecha_limite', { ascending: true });

    if (cursoId) {
      query = query.eq('curso_id', cursoId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tareas:', error);
      return [];
    }
    return data || [];
  }

  async addTarea(tarea: Omit<Tarea, 'id' | 'usuario_id' | 'created_at' | 'curso'>): Promise<Tarea> {
    const user = await this.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { data, error } = await this.supabase
      .from('senati_tareas')
      .insert([
        {
          ...tarea,
          usuario_id: user.id
        }
      ])
      .select(`
        *,
        curso:senati_cursos (
          id,
          nombre,
          color,
          semestre,
          profesor
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  async updateTarea(id: string, tarea: Partial<Tarea>): Promise<Tarea> {
    const { data, error } = await this.supabase
      .from('senati_tareas')
      .update(tarea)
      .eq('id', id)
      .select(`
        *,
        curso:senati_cursos (
          id,
          nombre,
          color,
          semestre,
          profesor
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  async updateTareaEstado(id: string, estado: EstadoTarea): Promise<void> {
    const { error } = await this.supabase
      .from('senati_tareas')
      .update({ estado })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteTarea(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('senati_tareas')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // --- EVALUACIONES CRUD ---
  async getEvaluaciones(cursoId?: string): Promise<Evaluacion[]> {
    const user = await this.getUser();
    if (!user) return [];

    let query = this.supabase
      .from('senati_evaluaciones')
      .select('*')
      .eq('usuario_id', user.id)
      .order('created_at', { ascending: true });

    if (cursoId) {
      query = query.eq('curso_id', cursoId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching evaluaciones:', error);
      return [];
    }
    return data || [];
  }

  async addEvaluacion(evaluacion: Omit<Evaluacion, 'id' | 'usuario_id' | 'created_at'>): Promise<Evaluacion> {
    const user = await this.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { data, error } = await this.supabase
      .from('senati_evaluaciones')
      .insert([
        {
          ...evaluacion,
          usuario_id: user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateEvaluacion(id: string, evaluacion: Partial<Evaluacion>): Promise<Evaluacion> {
    const { data, error } = await this.supabase
      .from('senati_evaluaciones')
      .update(evaluacion)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteEvaluacion(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('senati_evaluaciones')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
