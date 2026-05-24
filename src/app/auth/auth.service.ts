import { computed, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export type AuthUser = {
  id?: number | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string | { name?: string | null } | null;
  permissions?: string[];
  [key: string]: unknown;
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private static readonly TOKEN_KEY = 'token';
  private static readonly USER_KEY = 'user';
  private static readonly AUTH_BASE_URL = `${environment.apiUrl}/auth`;

  private readonly tokenState = signal<string | null>(null);
  private readonly currentUserState = signal<AuthUser | null>(null);

  readonly token = this.tokenState.asReadonly();
  readonly currentUser = this.currentUserState.asReadonly();
  readonly currentUser$ = toObservable(this.currentUser);
  readonly currentUserRole = computed(() => {
    const user = this.currentUser();
    const rawRole = typeof user?.role === 'string' ? user.role : user?.role?.name;
    return String(rawRole || '').trim().toUpperCase();
  });
  readonly authenticated = computed(() => !!this.token());

  constructor(private http: HttpClient, private router: Router) {
    const token = localStorage.getItem(AuthService.TOKEN_KEY);
    const user = this.parseStoredUser(localStorage.getItem(AuthService.USER_KEY));

    if (token && !this.isTokenExpired(token) && user) {
      this.tokenState.set(token);
      this.currentUserState.set(user);
    } else {
      this.clearSession();
    }
  }

  login(email: string, password: string): Observable<{ token: string; user: AuthUser }> {
    return this.http.post<{ token: string; user: AuthUser }>(`${AuthService.AUTH_BASE_URL}/login`, { email, password });
  }

  logout(): void {
    this.http
      .post(`${AuthService.AUTH_BASE_URL}/logout`, {})
      .pipe(catchError(() => of(null)))
      .subscribe();

    this.clearSession();
    void this.router.navigate(['/login']);
  }

  clearSession(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    this.tokenState.set(null);
    this.currentUserState.set(null);
  }

  setSession(token: string, user: AuthUser): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
    this.tokenState.set(token);
    this.currentUserState.set(user);
  }

  updateToken(token: string): void {
    if (!token || this.isTokenExpired(token)) {
      return;
    }
    localStorage.setItem(AuthService.TOKEN_KEY, token);
    this.tokenState.set(token);
  }

  getToken(): string | null {
    const token = this.tokenState() ?? localStorage.getItem(AuthService.TOKEN_KEY);
    if (!token) {
      return null;
    }

    if (this.isTokenExpired(token)) {
      this.clearSession();
      return null;
    }

    if (!this.tokenState()) {
      this.tokenState.set(token);
    }

    return token;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser();
  }

  getCurrentUserRole(): string {
    return this.currentUserRole();
  }

  isAuthenticated(): boolean {
    return this.authenticated() && !!this.getToken();
  }

  hasRole(role: string): boolean {
    const currentRole = this.currentUserRole();
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

  private parseStoredUser(rawUser: string | null): AuthUser | null {
    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as AuthUser;
    } catch {
      return null;
    }
  }
}
