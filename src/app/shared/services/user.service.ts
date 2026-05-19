import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  role: {
    id: number;
    name: string;
  };
}

export interface Role {
  id: number;
  name: string;
  description?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  users: User[];
}

export interface PermissionCatalogItem {
  code: string;
  name: string;
  module: string;
  description?: string | null;
  isActive: boolean;
}

export interface RolePermissionsResponse {
  roleId: number;
  permissions: string[];
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) { }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }

  getUserById(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${id}`);
  }

  createUser(user: Partial<User> & { password: string }): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users`, user);
  }

  updateUser(id: number, user: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/${id}`, user);
  }

  deleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${id}`);
  }

  changePassword(id: number, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/users/${id}/change-password`, { newPassword });
  }

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.apiUrl}/roles`);
  }

  createRole(role: { name: string; description?: string; isActive?: boolean }): Observable<Role> {
    return this.http.post<Role>(`${this.apiUrl}/roles`, role);
  }

  updateRole(id: number, role: { name: string; description?: string; isActive?: boolean }): Observable<Role> {
    return this.http.put<Role>(`${this.apiUrl}/roles/${id}`, role);
  }

  updateRoleStatus(id: number, isActive: boolean): Observable<Role> {
    return this.http.patch<Role>(`${this.apiUrl}/roles/${id}/status`, { isActive });
  }

  deleteRole(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/roles/${id}`);
  }

  getPermissionsCatalog(): Observable<PermissionCatalogItem[]> {
    return this.http.get<PermissionCatalogItem[]>(`${this.apiUrl}/permissions`);
  }

  getRolePermissions(roleId: number): Observable<RolePermissionsResponse> {
    return this.http.get<RolePermissionsResponse>(`${this.apiUrl}/roles/${roleId}/permissions`);
  }

  updateRolePermissions(roleId: number, permissions: string[]): Observable<RolePermissionsResponse> {
    return this.http.put<RolePermissionsResponse>(`${this.apiUrl}/roles/${roleId}/permissions`, { permissions });
  }
}
