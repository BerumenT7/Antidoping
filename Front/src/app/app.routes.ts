import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

const requireSession = () => {
  const usuarioAlta = String(localStorage.getItem('usuarioAlta') || '').trim();
  const base = String(localStorage.getItem('base') || '').trim();
  if (usuarioAlta && base) return true;

  return inject(Router).createUrlTree(['/login']);
};

export const routes: Routes = [
  {
    path: 'home',
    canActivate: [requireSession],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then( m => m.LoginPage)
  },
];
