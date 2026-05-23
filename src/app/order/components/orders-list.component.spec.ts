// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, Injector, provideZoneChangeDetection, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { OrdersListComponent } from './orders-list.component';

function buildComponent() {
  const router = {
    navigate: vi.fn()
  };
  const route = {
    queryParamMap: of({ get: () => null })
  };
  const orderService = {
    listOrders: vi.fn(() => of({ data: [], pagination: { total: 0, totalPages: 1 } })),
    updateOrderStatus: vi.fn(() => of({}))
  };
  const storeService = {
    getStores: vi.fn(() => of([]))
  };
  const alertService = {
    show: vi.fn()
  };
  const injector = createEnvironmentInjector([provideZoneChangeDetection()], Injector.NULL as unknown as EnvironmentInjector);

  const component = runInInjectionContext(injector, () => new OrdersListComponent(
    new FormBuilder(),
    route as any,
    router as any,
    orderService as any,
    storeService as any,
    alertService as any
  ));

  component.initializeForm();

  return { component, orderService, injector };
}

describe.skip('OrdersListComponent filters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only pagination when filters are empty', () => {
    const { component, orderService, injector } = buildComponent();

    component.currentPage.set(3);
    component.loadOrders();

    expect(orderService.listOrders).toHaveBeenLastCalledWith({
      page: 3,
      limit: 10
    });
    injector.destroy();
  });

  it('normalizes store and date filters before calling the API', () => {
    const { component, orderService, injector } = buildComponent();

    component.filterForm.patchValue({
      status: 'READY',
      storeId: '4',
      startDate: '2026-05-16',
      endDate: '2026-05-17'
    });

    component.loadOrders();

    expect(orderService.listOrders).toHaveBeenLastCalledWith({
      page: 1,
      limit: 10,
      status: 'READY',
      storeId: 4,
      startDate: new Date(2026, 4, 16, 0, 0, 0, 0).toISOString(),
      endDate: new Date(2026, 4, 17, 23, 59, 59, 999).toISOString()
    });
    injector.destroy();
  });
});
