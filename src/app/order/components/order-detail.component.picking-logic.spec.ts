// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { OrderDetailComponent } from './order-detail.component';
import { of } from 'rxjs';

function createPickingLogicHarness(input?: { order?: any; pickingData?: any }) {
  const proto = OrderDetailComponent.prototype as any;
  const harness: any = {
    order: input?.order ?? undefined,
    pickingData: input?.pickingData ?? null,
  };

  harness.getOrderItemId = proto.getOrderItemId;
  harness.getNormalizedVariantId = proto.getNormalizedVariantId;
  harness.getVariantKey = proto.getVariantKey;
  harness.findPickedItemMatch = proto.findPickedItemMatch;
  harness.getPickedEntryOrderItemId = proto.getPickedEntryOrderItemId;
  harness.getPickingItemLimit = proto.getPickingItemLimit;
  harness.getPickingGroupItems = proto.getPickingGroupItems;
  harness.resolveNextPickingUpdateQuantity = proto.resolveNextPickingUpdateQuantity;

  return {
    harness,
    getPickedQuantity: (item: any) => proto.getPickedQuantity.call(harness, item),
    resolveNextPickingUpdateQuantity: (item: any, action: 'inc' | 'dec' | 'complete') =>
      proto.resolveNextPickingUpdateQuantity.call(harness, item, action),
  };
}

describe('OrderDetailComponent picking logic', () => {
  it('keeps picked quantities isolated by orderItemId across rows', () => {
    const orderItems = [
      { id: 1, variantId: 101, quantity: 4, variant: { id: 101, color: { id: 1 }, size: { id: 1 } } },
      { id: 2, variantId: 102, quantity: 4, variant: { id: 102, color: { id: 1 }, size: { id: 2 } } },
    ];
    const pickingData = {
      items: [
        { pickingItemId: 10, orderItemId: 1, variantId: 101, pickedQuantity: 4, variant: orderItems[0].variant },
        { pickingItemId: 11, orderItemId: 2, variantId: 102, pickedQuantity: 1, variant: orderItems[1].variant },
      ],
    };

    const { getPickedQuantity } = createPickingLogicHarness({
      order: { items: orderItems, pickingSession: { items: [] } },
      pickingData,
    });

    expect(getPickedQuantity(orderItems[0])).toBe(4);
    expect(getPickedQuantity(orderItems[1])).toBe(1);
  });

  it('preserves first row as completed when incrementing second row', () => {
    const firstRow = { id: 1, variantId: 201, quantity: 4, variant: { id: 201, color: { id: 1 }, size: { id: 1 } } };
    const secondRow = { id: 2, variantId: 202, quantity: 4, variant: { id: 202, color: { id: 1 }, size: { id: 2 } } };
    const { harness, getPickedQuantity } = createPickingLogicHarness({
      order: { items: [firstRow, secondRow], pickingSession: { items: [] } },
      pickingData: {
        items: [
          { pickingItemId: 20, orderItemId: 1, variantId: 201, pickedQuantity: 4, variant: firstRow.variant },
          { pickingItemId: 21, orderItemId: 2, variantId: 202, pickedQuantity: 0, variant: secondRow.variant },
        ],
      },
    });

    expect(getPickedQuantity(firstRow)).toBe(4);
    expect(getPickedQuantity(secondRow)).toBe(0);

    harness.pickingData = {
      items: [
        { pickingItemId: 20, orderItemId: 1, variantId: 201, pickedQuantity: 4, variant: firstRow.variant },
        { pickingItemId: 21, orderItemId: 2, variantId: 202, pickedQuantity: 1, variant: secondRow.variant },
      ],
    };

    expect(getPickedQuantity(firstRow)).toBe(4);
    expect(getPickedQuantity(secondRow)).toBe(1);
  });

  it('falls back to variant.id matching when variantId is missing', () => {
    const row = {
      id: 9,
      quantity: 4,
      variant: { id: 900, color: { id: 7 }, size: { id: 3 } },
    };
    const { getPickedQuantity } = createPickingLogicHarness({
      order: { items: [row], pickingSession: { items: [] } },
      pickingData: {
        items: [{ pickingItemId: 90, pickedQuantity: 2, variant: { id: 900, color: { id: 7 }, size: { id: 3 } } }],
      },
    });

    expect(getPickedQuantity(row)).toBe(2);
  });

  it('increments second row without resetting first row when pickingItemId is shared', () => {
    const firstRow = {
      pickingItemId: 50,
      orderItemId: 1,
      variantId: 401,
      requestedQuantity: 4,
      reservedQuantity: 4,
      pickedQuantity: 4,
      variant: { id: 401, color: { id: 1 }, size: { id: 1 } },
    };
    const secondRow = {
      pickingItemId: 50,
      orderItemId: 2,
      variantId: 401,
      requestedQuantity: 4,
      reservedQuantity: 4,
      pickedQuantity: 0,
      variant: { id: 401, color: { id: 2 }, size: { id: 1 } },
    };

    const { resolveNextPickingUpdateQuantity } = createPickingLogicHarness({
      order: { items: [] },
      pickingData: { items: [firstRow, secondRow] },
    });

    // Row-level update should affect only second row: 0 -> 1
    expect(resolveNextPickingUpdateQuantity(secondRow, 'inc')).toBe(1);
  });

  it('when first row is complete, clicking + on second row updates only that row', () => {
    const proto = OrderDetailComponent.prototype as any;
    const firstRow = {
      pickingItemId: 90,
      orderItemId: 1,
      variantId: 7001,
      requestedQuantity: 4,
      reservedQuantity: 4,
      maxPickableQuantity: 4,
      pickedQuantity: 4,
      variant: { id: 7001, color: { id: 1 }, size: { id: 1 } },
    };
    const secondRow = {
      pickingItemId: 90,
      orderItemId: 2,
      variantId: 7001,
      requestedQuantity: 4,
      reservedQuantity: 4,
      maxPickableQuantity: 4,
      pickedQuantity: 0,
      variant: { id: 7001, color: { id: 2 }, size: { id: 1 } },
    };
    const apiPickingResponse = {
      orderId: 77,
      items: [
        { ...firstRow, pickedQuantity: 4, missingQuantity: 0, status: 'COMPLETED' },
        { ...secondRow, pickedQuantity: 1, missingQuantity: 3, status: 'PARTIAL' },
      ],
    };

    const updatePickingItem = vi.fn();
    const updatePickingOrderItem = vi.fn(() => of({ data: apiPickingResponse }));
    const harness: any = {
      order: { id: 77 },
      _pickingData: { items: [firstRow, secondRow] },
      cachedPickingData: null,
      updatingPickingItemIds: new Set<string>(),
      orderService: { updatePickingItem, updatePickingOrderItem },
      orderResource: { reload: vi.fn() },
      pickingResource: { reload: vi.fn() },
      alertService: { show: vi.fn() },
      orderId: () => 77,
    };
    Object.defineProperty(harness, 'pickingData', {
      get() {
        return this.cachedPickingData || this._pickingData;
      },
      set(value: any) {
        this._pickingData = value;
      },
    });

    harness.getNormalizedVariantId = proto.getNormalizedVariantId;
    harness.getPickingItemLimit = proto.getPickingItemLimit;
    harness.getPickingGroupItems = proto.getPickingGroupItems;
    harness.resolveNextPickingUpdateQuantity = proto.resolveNextPickingUpdateQuantity;
    harness.getOrderItemId = proto.getOrderItemId;
    harness.getVariantKey = proto.getVariantKey;
    harness.getPickedEntryOrderItemId = proto.getPickedEntryOrderItemId;
    harness.findPickedItemMatch = proto.findPickedItemMatch;
    harness.getPickedQuantity = proto.getPickedQuantity;
    harness.getPickingUpdateKey = proto.getPickingUpdateKey;

    proto.markPickingItemFromDetail.call(harness, secondRow, 'inc');

    expect(updatePickingOrderItem).toHaveBeenCalledTimes(1);
    expect(updatePickingOrderItem).toHaveBeenCalledWith(77, 2, 1);
    expect(updatePickingItem).not.toHaveBeenCalled();
    expect(harness.cachedPickingData).toEqual(apiPickingResponse);
    expect(harness.orderResource.reload).toHaveBeenCalledTimes(1);
    expect(harness.pickingResource.reload).toHaveBeenCalledTimes(1);
    expect(harness.getPickedQuantity.call(harness, firstRow)).toBe(4);
    expect(harness.getPickedQuantity.call(harness, secondRow)).toBe(1);
  });
});
