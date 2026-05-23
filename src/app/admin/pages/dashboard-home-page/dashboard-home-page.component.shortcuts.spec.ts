// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { DashboardHomePageComponent } from './dashboard-home-page.component';

describe('DashboardHomePageComponent shortcuts', () => {
  it('navigates to critical inventory scope from critical products card', () => {
    const proto = DashboardHomePageComponent.prototype as any;
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    const harness: any = { router };
    harness.goToInventoryStockScope = proto.goToInventoryStockScope;

    proto.goToCriticalProducts.call(harness);

    expect(router.navigate).toHaveBeenCalledWith(['/admin/inventory'], {
      queryParams: {
        stockScope: 'critical-total',
        showAdvanced: '1',
      },
    });
  });

  it('navigates to overdue pending orders with endDate filter', () => {
    const proto = DashboardHomePageComponent.prototype as any;
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    const harness: any = { router };

    proto.goToOverdueOrders.call(harness);

    expect(router.navigate).toHaveBeenCalledTimes(1);
    const [path, options] = router.navigate.mock.calls[0];
    expect(path).toEqual(['/admin/orders/list']);
    expect(options?.queryParams?.status).toBe('PENDING');

    const endDateValue = String(options?.queryParams?.endDate || '');
    expect(endDateValue).not.toBe('');
    const parsedCutoff = new Date(endDateValue);
    expect(Number.isNaN(parsedCutoff.getTime())).toBe(false);
  });
});

