import { computed, Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MarketplaceAuthUser } from '../interfaces/marketplace.interface';

type MarketplaceAuthResponse = {
  token: string;
  user: MarketplaceAuthUser;
};

@Injectable({
  providedIn: 'root',
})
export class MarketplaceAuthService {
  private static readonly TOKEN_KEY = 'marketplace_customer_token';
  private static readonly USER_KEY = 'marketplace_customer_user';

  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/public/auth`;
  private readonly tokenState = signal<string | null>(this.loadTokenFromStorage());
  private readonly currentUserState = signal<MarketplaceAuthUser | null>(this.loadUserFromStorage());
  readonly token = this.tokenState.asReadonly();
  readonly currentUser = this.currentUserState.asReadonly();
  readonly currentUser$ = toObservable(this.currentUser);
  readonly authenticated = computed(() => {
    const token = this.token();
    return !!token && !this.isTokenExpired(token);
  });

  register(payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address?: string;
    password: string;
  }): Observable<MarketplaceAuthResponse> {
    return this.http.post<MarketplaceAuthResponse>(`${this.baseUrl}/register`, payload).pipe(
      tap((response) => this.setSession(response?.token, response?.user)),
    );
  }

  login(email: string, password: string): Observable<MarketplaceAuthResponse> {
    return this.http.post<MarketplaceAuthResponse>(`${this.baseUrl}/login`, { email, password }).pipe(
      tap((response) => this.setSession(response?.token, response?.user)),
    );
  }

  me(): Observable<MarketplaceAuthUser> {
    return this.http.get<{ user: MarketplaceAuthUser }>(`${this.baseUrl}/me`, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => response?.user),
      tap((user) => {
        if (user) {
          this.persistUser(user);
          this.currentUserState.set(user);
        }
      }),
    );
  }

  updateProfile(payload: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string | null;
  }): Observable<MarketplaceAuthUser> {
    return this.http.patch<{ user: MarketplaceAuthUser }>(`${this.baseUrl}/profile`, payload, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => response?.user),
      tap((user) => {
        if (user) {
          this.persistUser(user);
          this.currentUserState.set(user);
        }
      }),
    );
  }

  logout() {
    this.clearSession();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getCurrentUser(): MarketplaceAuthUser | null {
    return this.isAuthenticated() ? this.currentUser() : null;
  }

  getToken(): string | null {
    const token = this.readTokenSnapshot();
    if (!token || this.isTokenExpired(token)) {
      return null;
    }
    return token;
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private setSession(token?: string, user?: MarketplaceAuthUser) {
    if (!token || !user) {
      return;
    }
    localStorage.setItem(MarketplaceAuthService.TOKEN_KEY, token);
    this.persistUser(user);
    this.tokenState.set(token);
    this.currentUserState.set(user);
  }

  private persistUser(user: MarketplaceAuthUser) {
    localStorage.setItem(MarketplaceAuthService.USER_KEY, JSON.stringify(user));
  }

  private clearSession() {
    this.removeStoredSession();
    this.tokenState.set(null);
    this.currentUserState.set(null);
  }

  private loadUserFromStorage(): MarketplaceAuthUser | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const token = localStorage.getItem(MarketplaceAuthService.TOKEN_KEY);
    const rawUser = localStorage.getItem(MarketplaceAuthService.USER_KEY);
    if (!token || !rawUser || this.isTokenExpired(token)) {
      this.removeStoredSession();
      return null;
    }

    try {
      const parsed = JSON.parse(rawUser) as MarketplaceAuthUser;
      if (!parsed?.id || !parsed?.email) {
        this.removeStoredSession();
        return null;
      }
      return parsed;
    } catch {
      this.removeStoredSession();
      return null;
    }
  }

  private removeStoredSession() {
    localStorage.removeItem(MarketplaceAuthService.TOKEN_KEY);
    localStorage.removeItem(MarketplaceAuthService.USER_KEY);
  }

  private readTokenSnapshot(): string | null {
    if (this.tokenState()) {
      return this.tokenState();
    }
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem(MarketplaceAuthService.TOKEN_KEY);
  }

  private loadTokenFromStorage(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const token = localStorage.getItem(MarketplaceAuthService.TOKEN_KEY);
    if (!token || this.isTokenExpired(token)) {
      this.removeStoredSession();
      return null;
    }

    return token;
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
