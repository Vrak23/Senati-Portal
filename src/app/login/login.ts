import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnInit {
  email = '';
  password = '';
  nombres = '';
  apellidos = '';
  isRegisterMode = false;
  errorMessage = '';
  successMessage = '';
  isLoading = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    const session = await this.supabaseService.getSession();
    if (session) {
      this.router.navigate(['/dashboard']);
    }
  }

  toggleMode() {
    this.isRegisterMode = !this.isRegisterMode;
    this.errorMessage = '';
    this.successMessage = '';
    this.email = '';
    this.password = '';
    this.nombres = '';
    this.apellidos = '';
  }

  async onSubmit() {
    if (this.isRegisterMode) {
      if (!this.email || !this.password || !this.nombres) {
        this.errorMessage = 'Por favor, complete todos los campos obligatorios.';
        return;
      }
    } else {
      if (!this.email || !this.password) {
        this.errorMessage = 'Por favor, ingrese email y contraseña.';
        return;
      }
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      if (this.isRegisterMode) {
        const { data, error } = await this.supabaseService.signUp(
          this.email,
          this.password,
          this.nombres,
          this.apellidos
        );

        if (error) {
          this.errorMessage = this.translateError(error.message);
        } else if (data.user) {
          if (data.session) {
            this.router.navigate(['/dashboard']);
          } else {
            this.successMessage = '¡Registro exitoso! Por favor verifica tu correo electrónico antes de iniciar sesión.';
            this.isRegisterMode = false;
            this.password = '';
          }
        } else {
          this.errorMessage = 'No se pudo completar el registro. Intenta nuevamente.';
        }
      } else {
        const { data, error } = await this.supabaseService.signIn(this.email, this.password);
        if (error) {
          this.errorMessage = this.translateError(error.message);
        } else if (data.user) {
          this.router.navigate(['/dashboard']);
        } else {
          this.errorMessage = 'No se pudo iniciar sesión. Intenta nuevamente.';
        }
      }
    } catch (err: any) {
      console.error(err);
      this.errorMessage = 'Ocurrió un error. Por favor, intente nuevamente.';
    } finally {
      this.isLoading = false;
    }
  }

  private translateError(msg: string): string {
    const errors: { [key: string]: string } = {
      'Invalid login credentials': 'Email o contraseña incorrectos.',
      'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
      'User already registered': 'Este correo ya tiene una cuenta registrada. Inicia sesión.',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
      'Unable to validate email address: invalid format': 'El formato del correo es inválido.',
      'Signup is disabled': 'El registro de nuevos usuarios está deshabilitado.',
      'Email rate limit exceeded': 'Demasiados intentos. Espera unos minutos antes de intentar nuevamente.',
      'Invalid email or password': 'Email o contraseña incorrectos.'
    };

    for (const key of Object.keys(errors)) {
      if (msg.toLowerCase().includes(key.toLowerCase())) {
        return errors[key];
      }
    }

    return msg || 'Ocurrió un error inesperado.';
  }
}
