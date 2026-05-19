import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private static readonly TOKEN_KEY = 'token';
  private static readonly USER_KEY = 'user';

  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    const token = localStorage.getItem(AuthService.TOKEN_KEY);
    const user = localStorage.getItem(AuthService.USER_KEY);

    if (token && !this.isTokenExpired(token) && user) {
      this.currentUserSubject.next(JSON.parse(user));
    } else {
      this.clearSession();
    }
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post('http://localhost:3000/api/auth/login', { email, password });
  }

  logout(): void {
    this.http.post('http://localhost:3000/api/auth/logout', {}).subscribe({
      error: () => {
        // Ignore logout errors, still clear session.
      }
    });
    this.clearSession();
    this.router.navigate(['/login']);
  }

  clearSession(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    this.currentUserSubject.next(null);
  }

  setSession(token: string, user: any): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  getToken(): string | null {
    const token = localStorage.getItem(AuthService.TOKEN_KEY);
    if (!token) {
      return null;
    }

    if (this.isTokenExpired(token)) {
      this.clearSession();
      return null;
    }

    return token;
  }

  getCurrentUser(): any {
    return this.currentUserSubject.value;
  }

  getCurrentUserRole(): string {
    const user = this.getCurrentUser();
    const rawRole = typeof user?.role === 'string' ? user.role : user?.role?.name;
    return String(rawRole || '').trim().toUpperCase();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  hasRole(role: string): boolean {
    const currentRole = this.getCurrentUserRole();
    return currentRole === String(role || '').trim().toUpperCase();
  }

  isAdmin(): boolean {
    return this.hasRole('ADMIN');
  }

  private parseToken(token: string): any | null {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.parseToken(token);
    if (!payload || !payload.exp) {
      return true;
    }
    return Date.now() >= payload.exp * 1000;
  }
}
