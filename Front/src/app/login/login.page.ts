import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonAlert,
  IonCheckbox,
  IonContent,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonCheckbox,
    IonItem,
    IonLabel,
    IonRadio,
    IonRadioGroup,
    IonAlert,
    CommonModule,
    FormsModule,
  ]
})
export class LoginPage implements OnInit {

  userName = '';
  base: 'base7' | 'clouthier' | '' = '';
  rememberMe = false;

  isAlertOpen = false;
  alertMessage = '';

  private readonly apiBaseUrl = String(environment.apiBaseUrl || '').replace(/\/$/, '');
  private readonly loginUrl = `${this.apiBaseUrl}/api/login`;

  constructor(
    private readonly router: Router,
    private readonly http: HttpClient
  ) { }

  ngOnInit() {
  }

  async onLogin() {
    if (!this.userName?.trim() || !this.base) {
      this.alertMessage = 'Completa nombre y selecciona una base.';
      this.isAlertOpen = true;
      return;
    }

    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; exists?: boolean; error?: string }>(this.loginUrl, {
          nombre: this.userName.trim(),
        })
      );

      if (!resp?.ok) {
        this.alertMessage = resp?.error || 'No se pudo validar el usuario.';
        this.isAlertOpen = true;
        return;
      }

      if (!resp.exists) {
        this.alertMessage = 'Usuario no encontrado.';
        this.isAlertOpen = true;
        return;
      }

      localStorage.setItem('usuarioAlta', this.userName.trim());
      localStorage.setItem('base', this.base);

      await this.router.navigateByUrl('/home');
    } catch (_err) {
      this.alertMessage = 'No se pudo conectar al backend para validar el usuario.';
      this.isAlertOpen = true;
    }
  }

}
