import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { addIcons } from 'ionicons';
import { powerOutline } from 'ionicons/icons';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonImg,
    IonSpinner,
  ],
})
export class HomePage {

  @ViewChild('fileInput', { static: false })
  fileInput?: ElementRef<HTMLInputElement>;

  photoDataUrl: string | null = null;
  photoFile: File | null = null;
  isCapturing = false;
  isSending = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  folioData: { Nombre: string; Departamento: string; PreEmpleo: string; Resultado: string } | null = null;
  isCheckingFolio = false;
  folioExists: boolean | null = null;
  folioEligible: boolean | null = null;
  private folioCheckTimer: ReturnType<typeof setTimeout> | null = null;

  folio = '';

  private readonly apiBaseUrl = String(environment.apiBaseUrl || '').replace(/\/$/, '');
  private readonly apiUrl = `${this.apiBaseUrl}/api/enviar-folio`;
  private readonly folioUrlBase = `${this.apiBaseUrl}/api/folio`;

  usuarioAlta = '';
  base = '';

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {
    addIcons({ powerOutline });
    this.usuarioAlta = String(localStorage.getItem('usuarioAlta') || '').trim();
    this.base = String(localStorage.getItem('base') || '').trim();
  }

  logout() {
    localStorage.removeItem('usuarioAlta');
    localStorage.removeItem('base');
    void this.router.navigateByUrl('/login');
  }

  clearPhoto() {
    this.photoDataUrl = null;
    this.photoFile = null;
    this.errorMessage = null;
    this.successMessage = null;
  }

  get isFolioValid(): boolean {
    return /^\d+$/.test(this.folio);
  }

  onFolioInput(value: string | number | null | undefined) {
    const raw = value == null ? '' : String(value);
    this.folio = raw.replace(/\D+/g, '');

    this.errorMessage = null;
    this.successMessage = null;
    this.folioData = null;
    this.folioExists = null;
    this.folioEligible = null;
    this.scheduleFolioCheck();
  }

  onFolioDomInput(event: Event) {
    const target = event.target as HTMLInputElement | null;
    this.onFolioInput(target?.value ?? '');

    if (target && target.value !== this.folio) {
      target.value = this.folio;
    }
  }

  onFolioKeyDown(event: KeyboardEvent) {
    const allowedKeys = new Set([
      'Backspace',
      'Delete',
      'Tab',
      'Enter',
      'Escape',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ]);

    if (allowedKeys.has(event.key)) return;
    if (event.ctrlKey || event.metaKey) return;

    // Permitir sólo dígitos 0-9
    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  async takePhoto() {
    this.errorMessage = null;
    this.successMessage = null;

    if (!this.isFolioValid) {
      this.errorMessage = 'Ingresa un número de folio válido para poder tomar la foto.';
      return;
    }

    this.isCapturing = true;

    try {
      // Web/PWA: el navegador se encarga de abrir cámara o galería según soporte.
      this.fileInput?.nativeElement?.click();
    } catch (err) {
      // Fallback por si el plugin no está instalado o falla
      this.errorMessage = 'No se pudo abrir la cámara. Intenta seleccionar una imagen.';
    } finally {
      this.isCapturing = false;
    }
  }

  async onFileSelected(event: Event) {
    this.errorMessage = null;
    this.successMessage = null;

    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    this.photoFile = file;
    const dataUrl = await this.readFileAsDataUrl(file);
    this.photoDataUrl = dataUrl;

    // Reset para permitir seleccionar el mismo archivo dos veces
    if (input) input.value = '';
  }

  get canSend(): boolean {
    return (
      this.isFolioValid &&
      this.folioExists === true &&
      this.folioEligible === true &&
      !!this.photoFile &&
      !this.isSending
    );
  }

  private scheduleFolioCheck() {
    if (this.folioCheckTimer) clearTimeout(this.folioCheckTimer);
    if (!this.isFolioValid) return;

    this.folioCheckTimer = setTimeout(() => {
      void this.checkFolio();
    }, 350);
  }

  async checkFolio() {
    if (!this.isFolioValid) return;
    this.isCheckingFolio = true;

    try {
      const resp = await firstValueFrom(
        this.http.get<{ ok: boolean; exists?: boolean; eligible?: boolean; data?: any; error?: string }>(
          `${this.folioUrlBase}/${encodeURIComponent(this.folio)}`
        )
      );

      if (!resp?.ok) {
        this.folioExists = null;
        return;
      }

      if (!resp.exists) {
        this.folioExists = false;
        this.folioEligible = null;
        this.folioData = null;
        return;
      }

      if (resp.eligible === false) {
        this.folioExists = true;
        this.folioEligible = false;
        this.folioData = null;
        this.errorMessage = 'Elige un folio correcto';
        return;
      }

      this.folioExists = true;
      this.folioEligible = true;
      this.folioData = resp.data ?? null;
    } catch (_err) {
      this.folioExists = null;
      this.folioEligible = null;
      this.folioData = null;
    } finally {
      this.isCheckingFolio = false;
    }
  }

  async sendEmail() {
    this.errorMessage = null;
    this.successMessage = null;

    if (!this.isFolioValid) {
      this.errorMessage = 'Ingresa un número de folio válido para poder enviar.';
      return;
    }

    if (!this.photoFile) {
      this.errorMessage = 'Selecciona una foto para poder enviar.';
      return;
    }

    if (!this.usuarioAlta) {
      this.errorMessage = 'No se encontró el usuario del login. Vuelve a iniciar sesión.';
      return;
    }

    if (!this.base) {
      this.errorMessage = 'No se encontró la base del login. Vuelve a iniciar sesión.';
      return;
    }

    this.isSending = true;

    try {
      const form = new FormData();
      form.append('folio', this.folio);
      form.append('foto', this.photoFile, this.photoFile.name);
      form.append('usuarioAlta', this.usuarioAlta);
      form.append('base', this.base);

      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; messageId?: string; insertedId?: number; error?: string }>(this.apiUrl, form)
      );

      if (!resp?.ok) {
        this.errorMessage = resp?.error || 'No se pudo enviar el correo.';
        return;
      }

      this.successMessage = resp?.insertedId
        ? `Enviado correctamente. Guardado con ID ${resp.insertedId}.`
        : 'Enviado correctamente.';
    } catch (_err) {
      this.errorMessage = 'Error al enviar. Revisa que el backend esté corriendo.';
    } finally {
      this.isSending = false;
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('file_read_error'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }
}
