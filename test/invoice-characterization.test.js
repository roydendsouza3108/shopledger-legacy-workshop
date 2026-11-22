const assert = require('node:assert/strict');
const test = require('node:test');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');

// Mirrors the line-item shape stored by routes/orders.js; all data stays in memory.
function makeOrder({ items, coupon = '' }) {
  const totals = pricing.computeTotals(items, coupon);
  return {
    id: 42,
    date: '22/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice uses the order HSN slab and matches the billed total without a coupon', () => {
  const order = makeOrder({
    items: [{ id: 1, sku: 'GRN-001', name: 'Rice', hsn: '1006', price: 100, qty: 1 }]
  });

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(printed.subtotal, order.subtotal);
  assert.equal(printed.discount, order.discount);
  assert.equal(printed.tax, order.tax);
  assert.equal(printed.total, order.total);
  assert.deepEqual(
    { tax: billed.tax, total: billed.total, gstPercent: billed.lines[0].gstPercent },
    { tax: 5, total: 105, gstPercent: 5 }
  );
  assert.deepEqual(
    { tax: printed.tax, cgst: printed.cgst, sgst: printed.sgst, total: printed.total, gstPercent: printed.rows[0].gstPercent },
    { tax: 5, cgst: 2.5, sgst: 2.5, total: 105, gstPercent: 5 }
  );

  const html = invoice.render(order);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice:/);
});

test('invoice applies SAVE10 before tax, as order pricing does', () => {
  const order = makeOrder({
    items: [{ id: 2, sku: 'GRN-002', name: 'Dal', hsn: '0713', price: 600, qty: 1 }],
    coupon: 'SAVE10'
  });

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 60, tax: 27, total: 567 }
  );
  assert.deepEqual(
    { discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: 60, tax: 27, total: 567 }
  );
});

test('invoice applies the SAVE10 maximum discount used by order pricing', () => {
  const order = makeOrder({
    items: [{ id: 3, sku: 'GRN-003', name: 'Poha', hsn: '1104', price: 2000, qty: 1 }],
    coupon: 'SAVE10'
  });

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 150, tax: 92.5, total: 1942.5 }
  );
  assert.deepEqual(
    { discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: 150, tax: 92.5, total: 1942.5 }
  );
});

test('invoice figures match the GST breakdown and total billed by order pricing', () => {
  const order = makeOrder({
    items: [{ id: 4, sku: 'OIL-001', name: 'Sunflower oil', hsn: '1512', price: 190, qty: 4 }],
    coupon: 'SAVE10'
  });

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(printed.subtotal, order.subtotal);
  assert.equal(printed.discount, order.discount);
  assert.equal(printed.tax, order.tax);
  assert.equal(printed.total, order.total);
  assert.deepEqual(
    {
      subtotal: printed.subtotal,
      discount: printed.discount,
      tax: printed.tax,
      cgst: printed.cgst,
      sgst: printed.sgst,
      total: printed.total,
      gstPercent: printed.rows[0].gstPercent,
      lineTax: printed.rows[0].lineTax
    },
    {
      subtotal: billed.subtotal,
      discount: billed.discount,
      tax: billed.tax,
      cgst: billed.cgst,
      sgst: billed.sgst,
      total: billed.total,
      gstPercent: billed.lines[0].gstPercent,
      lineTax: billed.lines[0].tax
    }
  );
});
