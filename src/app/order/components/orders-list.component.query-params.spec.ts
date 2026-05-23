// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { FormBuilder } from '@angular/forms';
import { signal } from '@angular/core';
import { convertToParamMap } from '@angular/router';
import { OrdersListComponent } from './orders-list.component';

function buildHarness() {
  const proto = OrdersListComponent.prototype as any;
  const filterForm = new FormBuilder().group({
    search: [''],
    channel: [''],
    status: [''],
    storeId: [''],
    startDate: [''],
    endDate: [''],
  });

  const harness: any = {
    filterForm,
    statusOptions: [
      { value: '', label: 'Todos los estados' },
      { value: 'PENDING', label: 'Pendiente' },
      { value: 'CONFIRMED', label: 'Confirmado' },
      { value: 'WAITING_TRANSFER', label: 'Esperando transferencia' },
      { value: 'PREPARING', label: 'Preparando' },
      { value: 'READY', label: 'Listo' },
      { value: 'DELIVERED', label: 'Entregado' },
      { value: 'RETURN_PENDING', label: 'Pendiente devolucion' },
      { value: 'CANCELLED', label: 'Cancelado' },
      { value: 'WAITING_STOCK', label: 'Sin stock' },
    ],
    currentPage: signal(1),
    loadOrders: vi.fn(),
  };

  harness.normalizeChannel = proto.normalizeChannel;
  harness.normalizeSearch = proto.normalizeSearch;
  harness.normalizeStatusFromQuery = proto.normalizeStatusFromQuery;
  harness.normalizeStoreIdFromQuery = proto.normalizeStoreIdFromQuery;
  harness.normalizeDateFromQuery = proto.normalizeDateFromQuery;
  harness.normalizePageFromQuery = proto.normalizePageFromQuery;
  harness.applyFiltersFromQueryParams = proto.applyFiltersFromQueryParams;

  return harness;
}

describe('OrdersListComponent query params', () => {
  it('maps status/store/date/search query params to form filters', () => {
    const harness = buildHarness();
    const params = convertToParamMap({
      status: 'READY',
      storeId: '4',
      search: '  DIEGO  ',
      startDate: '2026-05-10T08:00:00.000Z',
      endDate: '2026-05-11T08:00:00.000Z',
      page: '3',
    });

    harness.applyFiltersFromQueryParams(params);

    expect(harness.filterForm.get('status')?.value).toBe('READY');
    expect(harness.filterForm.get('storeId')?.value).toBe('4');
    expect(harness.filterForm.get('search')?.value).toBe('DIEGO');
    expect(harness.filterForm.get('startDate')?.value).toBe('2026-05-10');
    expect(harness.filterForm.get('endDate')?.value).toBe('2026-05-11');
    expect(harness.currentPage()).toBe(3);
    expect(harness.loadOrders).toHaveBeenCalledTimes(1);
  });

  it('resets to defaults when query params are empty', () => {
    const harness = buildHarness();
    harness.filterForm.patchValue({
      status: 'READY',
      search: 'abc',
      storeId: '5',
      startDate: '2026-05-10',
      endDate: '2026-05-11',
    });
    harness.currentPage.set(7);

    harness.applyFiltersFromQueryParams(convertToParamMap({}));

    expect(harness.filterForm.get('status')?.value).toBe('');
    expect(harness.filterForm.get('search')?.value).toBe('');
    expect(harness.filterForm.get('storeId')?.value).toBe('');
    expect(harness.filterForm.get('startDate')?.value).toBe('');
    expect(harness.filterForm.get('endDate')?.value).toBe('');
    expect(harness.currentPage()).toBe(1);
    expect(harness.loadOrders).toHaveBeenCalledTimes(1);
  });
});

