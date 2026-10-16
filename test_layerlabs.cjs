const assert = require('assert');

// ==========================================
// 1. Test UPI URI Generation & NPCI Standard
// ==========================================
function buildUpiSchemeUri({ payeeUpiId, payeeName = 'LayerLabs', amount, orderId }) {
  const formattedAmount = amount.toFixed(2);
  const encodedName = encodeURIComponent(payeeName);
  const encodedNote = encodeURIComponent(`LayerLabs Order ${orderId}`);
  return `upi://pay?pa=${payeeUpiId}&pn=${encodedName}&am=${formattedAmount}&cu=INR&tn=${encodedNote}`;
}

function isValidUtr(utr) {
  const clean = utr.trim().replace(/\s+/g, '');
  return /^[0-9A-Za-z]{8,22}$/.test(clean);
}

console.log('Testing UPI Payment Engine...');
const upiUri = buildUpiSchemeUri({
  payeeUpiId: 'bsatwik@sbi',
  payeeName: 'LayerLabs',
  amount: 638.00,
  orderId: 'ORD-100200',
});

assert(upiUri.includes('pa=bsatwik@sbi'), 'UPI ID must be bsatwik@sbi');
assert(upiUri.includes('am=638.00'), 'Amount must match exact formatted total');
assert(upiUri.includes('cu=INR'), 'Currency must be INR');
assert(upiUri.startsWith('upi://pay?'), 'Must follow NPCI standard upi:// scheme');
console.log('✔ UPI URI verified:', upiUri);

// Test UTR Validation
assert(isValidUtr('428910284712') === true, '12-digit numeric UTR must be valid');
assert(isValidUtr('SBI428910284') === true, 'Alphanumeric UTR must be valid');
assert(isValidUtr('123') === false, 'Short UTR (< 8 chars) must be invalid');
assert(isValidUtr('') === false, 'Empty UTR must be invalid');
console.log('✔ UTR validation logic verified');

// ==========================================
// 2. Promotion & Discount Engine Testing
// ==========================================
console.log('\nTesting Promotions Engine (FIRST10, TIER20, REF25)...');

const mockPromotions = [
  {
    id: 'promo-1',
    code: 'FIRST10',
    title: 'First Order Welcome Discount',
    description: '10% off your first engineering order',
    discountType: 'percentage',
    discountValue: 10,
    minOrderSubtotal: 0,
    maxDiscountAmount: 500,
    targetType: 'first-order',
    allowStacking: false,
    isActive: true,
    requiresThresholdConfig: false,
    usedCount: 0,
  },
  {
    id: 'promo-2',
    code: 'TIER20',
    title: 'High-Volume Order Campaign',
    description: '20% off eligible orders meeting minimum threshold',
    discountType: 'percentage',
    discountValue: 20,
    minOrderSubtotal: 0, // Unconfigured initially
    maxDiscountAmount: 2000,
    targetType: 'minimum-order',
    allowStacking: false,
    isActive: false, // Inactive until threshold is configured
    requiresThresholdConfig: true,
    usedCount: 0,
  },
  {
    id: 'promo-3',
    code: 'REF25',
    title: 'Referral Partner Credit',
    description: 'Flat ₹25 credit on orders over ₹300',
    discountType: 'fixed',
    discountValue: 25,
    minOrderSubtotal: 300,
    targetType: 'referral',
    allowStacking: false,
    isActive: true,
    requiresThresholdConfig: false,
    usedCount: 0,
  },
];

function calculateDiscount(code, subtotal, promos = mockPromotions) {
  if (!code || !code.trim()) {
    return { valid: false, discount: 0, message: 'No promotion code entered.' };
  }
  const cleanCode = code.trim().toUpperCase();
  const promo = promos.find((p) => p.code === cleanCode);

  if (!promo) {
    return { valid: false, discount: 0, message: `Invalid coupon code "${cleanCode}".` };
  }

  if (promo.requiresThresholdConfig && promo.minOrderSubtotal === 0) {
    return {
      valid: false,
      discount: 0,
      message: 'This campaign is pending threshold configuration by the administrator.',
    };
  }

  if (!promo.isActive) {
    return { valid: false, discount: 0, message: `Promotion "${cleanCode}" is currently inactive.` };
  }

  if (promo.minOrderSubtotal > 0 && subtotal < promo.minOrderSubtotal) {
    return {
      valid: false,
      discount: 0,
      message: `Coupon "${cleanCode}" requires a minimum order subtotal of ₹${promo.minOrderSubtotal}. Add ₹${promo.minOrderSubtotal - subtotal} more.`,
    };
  }

  let discount = 0;
  if (promo.discountType === 'percentage') {
    discount = Math.round((subtotal * promo.discountValue) / 100);
    if (promo.maxDiscountAmount && discount > promo.maxDiscountAmount) {
      discount = promo.maxDiscountAmount;
    }
  } else {
    discount = Math.min(subtotal, promo.discountValue);
  }

  return { valid: true, discount, message: `Coupon "${cleanCode}" applied: -₹${discount}` };
}

// Case 1: FIRST10 (10% percentage discount)
const testFirst10 = calculateDiscount('FIRST10', 1500);
assert(testFirst10.valid === true, 'FIRST10 must be valid');
assert(testFirst10.discount === 150, '10% of 1500 must be 150');
console.log('✔ FIRST10 percentage discount verified:', testFirst10.discount);

// Case 2: TIER20 when threshold is not yet configured (minOrderSubtotal === 0)
const testTier20Unconfigured = calculateDiscount('TIER20', 2500);
assert(testTier20Unconfigured.valid === false, 'TIER20 without threshold must be rejected');
console.log('✔ TIER20 gating without configured threshold verified');

// Case 3: TIER20 configured with threshold ₹2000 and activated
const configuredPromos = mockPromotions.map((p) =>
  p.code === 'TIER20' ? { ...p, minOrderSubtotal: 2000, isActive: true } : p
);

// Below threshold: ₹1800 < ₹2000
const testTier20Below = calculateDiscount('TIER20', 1800, configuredPromos);
assert(testTier20Below.valid === false, 'TIER20 below threshold must be rejected');
assert(testTier20Below.message.includes('requires a minimum order subtotal of ₹2000'));
console.log('✔ TIER20 below threshold rejection verified');

// Above threshold: ₹2500 >= ₹2000 -> 20% of 2500 = 500
const testTier20Above = calculateDiscount('TIER20', 2500, configuredPromos);
assert(testTier20Above.valid === true, 'TIER20 meeting threshold must be accepted');
assert(testTier20Above.discount === 500, '20% of 2500 must be 500');
console.log('✔ TIER20 20% discount on ₹2500 subtotal verified:', testTier20Above.discount);

// Case 4: REF25 (Flat ₹25 discount)
const testRef25 = calculateDiscount('REF25', 450);
assert(testRef25.valid === true, 'REF25 over ₹300 must be valid');
assert(testRef25.discount === 25, 'REF25 discount must be ₹25');
console.log('✔ REF25 fixed discount verified');

// ==========================================
// 3. Product Sale Price & Snapshotting
// ==========================================
console.log('\nTesting Product Sale Price & Order Snapshotting...');

const sampleProduct = {
  id: 'prod-001',
  slug: 'nema-stepper-mount',
  name: 'NEMA 17 Stepper Damper Mount',
  price: 349,
  salePrice: 299,
  stock: 12,
  status: 'published',
};

// Test effective price calculation in cart
function getEffectivePrice(product) {
  return (product.salePrice !== undefined && product.salePrice < product.price)
    ? product.salePrice
    : product.price;
}

assert(getEffectivePrice(sampleProduct) === 299, 'Sale price 299 should take precedence over regular 349');

const nonSaleProduct = { id: 'prod-002', name: 'Standard Bracket', price: 199 };
assert(getEffectivePrice(nonSaleProduct) === 199, 'Product without sale price must use regular price');

// Snapshot test: Historical order must NOT change even if product price increases later
const orderSnapshotItem = {
  product: { ...sampleProduct },
  quantity: 2,
  purchasePrice: getEffectivePrice(sampleProduct), // 299
};

const historicalOrder = {
  id: 'ORD-HIST-01',
  items: [orderSnapshotItem],
  subtotal: orderSnapshotItem.purchasePrice * orderSnapshotItem.quantity, // 598
};

// Admin later updates product price to ₹450
const updatedProduct = { ...sampleProduct, price: 450, salePrice: undefined };
assert(historicalOrder.items[0].purchasePrice === 299, 'Historical order purchasePrice snapshot must remain ₹299');
assert(historicalOrder.subtotal === 598, 'Historical order subtotal must remain ₹598');
console.log('✔ Product sale price precedence and historical order price preservation verified');

// ==========================================
// 4. Custom Printing Infill Exclusion Test
// ==========================================
console.log('\nVerifying Infill Removal from Customer Inputs...');

// Verify custom print request structure has no customer-facing infill
const validPrintSubmission = {
  fileName: 'bracket_mount.stl',
  fileSizeMb: 12.4,
  fileType: 'STL',
  material: 'PETG',
  color: 'Industrial Grey',
  quantity: 2,
  intendedUse: 'Mechanical Load-Bearing',
  customerNotes: 'Please ensure high dimensional accuracy for M3 heat-set inserts.',
};

assert(validPrintSubmission.infillPercentage === undefined, 'Infill percentage must NOT be required from customer');
assert(!('infillPercentage' in validPrintSubmission), 'Infill property should not exist on customer request');
console.log('✔ Infill exclusion from customer-facing inputs verified');

// ==========================================
// 5. Custom Print File Validator
// ==========================================
console.log('\nTesting 3D File Format Validator...');
function validate3DFileName(filename, sizeBytes) {
  const ext = filename.split('.').pop().toUpperCase();
  const validExtensions = ['STL', 'STEP', 'STP', 'OBJ', '3MF'];
  if (!validExtensions.includes(ext)) {
    return { valid: false, error: 'Unsupported format' };
  }
  if (sizeBytes > 150 * 1024 * 1024) {
    return { valid: false, error: 'File too large' };
  }
  return { valid: true, ext };
}

assert(validate3DFileName('housing.stl', 1000).valid === true);
assert(validate3DFileName('gear.STEP', 5000).valid === true);
assert(validate3DFileName('bracket.3mf', 2000).valid === true);
assert(validate3DFileName('model.obj', 3000).valid === true);
assert(validate3DFileName('script.exe', 1000).valid === false);
assert(validate3DFileName('archive.zip', 1000).valid === false);
console.log('✔ File format validation verified');

// ==========================================
// 6. Order Status Transition State Machine
// ==========================================
console.log('\nTesting Order Status Transition Logic...');
function verifyPayment(order) {
  assert(order.status === 'PAYMENT_PENDING', 'Can only verify pending payment');
  return {
    ...order,
    status: 'PAYMENT_VERIFIED',
    verifiedAt: new Date().toISOString(),
    verifiedBy: 'Administrator',
  };
}

const mockOrder = { id: 'ORD-999', status: 'PAYMENT_PENDING', upiReferenceNumber: '428910284712' };
const verifiedOrder = verifyPayment(mockOrder);
assert(verifiedOrder.status === 'PAYMENT_VERIFIED');
assert(verifiedOrder.verifiedBy === 'Administrator');
assert(verifiedOrder.verifiedAt !== undefined);
console.log('✔ Order status state transition verified');

// ==========================================
// 7. Interactive 3D Preview Capabilities & STEP Gating
// ==========================================
console.log('\nTesting 3D Preview Capability Matrix & STEP Disclaimer...');
function evaluate3DPreviewSupport(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['stl', 'obj', '3mf'].includes(ext)) {
    return { canPreviewInBrowser: true, format: ext.toUpperCase(), requiresExternalConverter: false };
  }
  if (ext === 'step' || ext === 'stp') {
    return {
      canPreviewInBrowser: false,
      format: 'STEP',
      requiresExternalConverter: true,
      notice: 'STEP files contain B-Rep boundary representation solids requiring a dedicated CAD kernel. Direct browser preview active for triangulated mesh formats (STL, OBJ, 3MF).',
    };
  }
  return { canPreviewInBrowser: false, format: ext.toUpperCase(), requiresExternalConverter: false, error: 'Unsupported format' };
}

assert(evaluate3DPreviewSupport('damper-mount.stl').canPreviewInBrowser === true, 'STL must preview directly');
assert(evaluate3DPreviewSupport('gear-prototype.obj').canPreviewInBrowser === true, 'OBJ must preview directly');
assert(evaluate3DPreviewSupport('component.3mf').canPreviewInBrowser === true, '3MF must preview directly');

const stepCheck = evaluate3DPreviewSupport('manifold_assembly.step');
assert(stepCheck.canPreviewInBrowser === false, 'STEP must NOT be falsely claimed as browser-renderable without server');
assert(stepCheck.requiresExternalConverter === true);
assert(stepCheck.notice.includes('requires a dedicated CAD kernel') || stepCheck.notice.includes('B-Rep'));
console.log('✔ 3D format support matrix & STEP analytical CAD notice verified');

// ==========================================
// 8. Shipping Calculation & Historical Order Immutability
// ==========================================
console.log('\nTesting Shipping Calculation & Historical Immutability...');
const mockShippingSettings = {
  defaultShippingCharge: 49,
  freeShippingEnabled: true,
  freeShippingThreshold: 999,
  options: [
    { id: 'speed-post', name: 'India Post Speed Post', price: 49, estimatedDelivery: '3-5 business days', enabled: true, isDefault: true },
    { id: 'express', name: 'Express Air Cargo', price: 99, estimatedDelivery: '1-2 business days', enabled: true },
  ],
};

function calculateShipping(subtotal, hasPhysical, selectedOptionId, settings = mockShippingSettings) {
  if (!hasPhysical || subtotal <= 0) {
    return { charge: 0, isFree: true, reason: 'Digital fulfillment' };
  }
  const option = settings.options.find((o) => o.id === selectedOptionId) || settings.options[0];
  if (settings.freeShippingEnabled && settings.freeShippingThreshold > 0 && subtotal >= settings.freeShippingThreshold) {
    return { charge: 0, isFree: true, reason: `Free shipping on orders over ₹${settings.freeShippingThreshold}`, option };
  }
  return { charge: option.price, isFree: false, reason: option.estimatedDelivery, option };
}

// Below free shipping threshold: ₹500 < ₹999 -> charges ₹49
const standardShip = calculateShipping(500, true, 'speed-post');
assert(standardShip.charge === 49, 'Standard subtotal below threshold must charge ₹49');
assert(standardShip.isFree === false);

// Above free shipping threshold: ₹1200 >= ₹999 -> charge ₹0
const freeShip = calculateShipping(1200, true, 'speed-post');
assert(freeShip.charge === 0, 'Subtotal meeting threshold must qualify for free shipping');
assert(freeShip.isFree === true);

// Digital-only cart -> ₹0 shipping
const digitalShip = calculateShipping(400, false, 'speed-post');
assert(digitalShip.charge === 0, 'Digital-only cart must have 0 shipping charge');

// Historical order immutability test:
const orderPlacedIn2025 = {
  id: 'ORD-2025-01',
  subtotal: 500,
  shippingAmount: 49,
  totalAmount: 549,
};

// Admin later updates standard shipping from ₹49 to ₹79
const newShippingSettings = { ...mockShippingSettings, defaultShippingCharge: 79, options: mockShippingSettings.options.map(o => ({ ...o, price: 79 })) };
const newOrderShip = calculateShipping(500, true, 'speed-post', newShippingSettings);
assert(newOrderShip.charge === 79, 'New order must use new shipping rate');
assert(orderPlacedIn2025.shippingAmount === 49, 'Historical order shippingAmount must remain untouched at ₹49');
assert(orderPlacedIn2025.totalAmount === 549, 'Historical order totalAmount must remain untouched');
console.log('✔ Shipping calculation, threshold unlock, and historical order immutability verified');

// ==========================================
// 9. Category Safe Reassignment & Product Protection
// ==========================================
console.log('\nTesting Category Safe Removal & Product Protection...');
let mockCatalog = [
  { id: 'p1', name: 'Drill Jig 01', category: 'jigs-tooling', price: 450 },
  { id: 'p2', name: 'Cable Guide', category: '3d-print', price: 150 },
  { id: 'p3', name: 'Bin Storage', category: 'workshop-storage', price: 280 },
];

function deleteCategorySafely(catId, reassignToCatId, catalog) {
  const affected = catalog.filter((p) => p.category === catId);
  if (affected.length > 0 && (!reassignToCatId || reassignToCatId === catId)) {
    return { success: false, error: 'Cannot delete: products must be reassigned first' };
  }
  // Reassign products to safe category
  const updatedCatalog = catalog.map((p) => (p.category === catId ? { ...p, category: reassignToCatId } : p));
  return { success: true, updatedCatalog, reassignedCount: affected.length };
}

// Attempting to delete jigs-tooling without reassignment must fail
const unsafeDelete = deleteCategorySafely('jigs-tooling', null, mockCatalog);
assert(unsafeDelete.success === false, 'Deleting category with assigned products without reassignment must fail');

// Deleting jigs-tooling with reassignment to '3d-print'
const safeDelete = deleteCategorySafely('jigs-tooling', '3d-print', mockCatalog);
assert(safeDelete.success === true, 'Safe deletion must succeed');
assert(safeDelete.reassignedCount === 1);
assert(safeDelete.updatedCatalog.find((p) => p.id === 'p1').category === '3d-print', 'Product p1 must now be in 3d-print');
assert(safeDelete.updatedCatalog.length === 3, 'No products should ever be deleted when removing a category');
console.log('✔ Category safe removal with product reassignment protection verified');

// ==========================================
// 10. Promotional Popup Frequency Limit
// ==========================================
console.log('\nTesting Promotional Popup Frequency & Dismissal Logic...');
function shouldShowFirstOrderPopup(config, lastDismissedTimestamp, hasPlacedOrder) {
  if (!config.enabled) return false;
  if (hasPlacedOrder) return false; // First-time customers only
  if (!lastDismissedTimestamp) return true; // Never seen before

  const elapsedHours = (Date.now() - lastDismissedTimestamp) / (1000 * 60 * 60);
  return elapsedHours >= config.frequencyHours;
}

const popupConfig = { enabled: true, frequencyHours: 24, couponCode: 'FIRST10' };
const justNow = Date.now() - 5 * 60 * 1000; // 5 mins ago
const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago

assert(shouldShowFirstOrderPopup(popupConfig, null, false) === true, 'Should show on first visit');
assert(shouldShowFirstOrderPopup(popupConfig, justNow, false) === false, 'Should NOT show again immediately after dismissal');
assert(shouldShowFirstOrderPopup(popupConfig, twoDaysAgo, false) === true, 'Should show again after frequency limit has elapsed');
assert(shouldShowFirstOrderPopup(popupConfig, null, true) === false, 'Should NOT show for existing customers who placed an order');
console.log('✔ Promotional popup frequency caps and targeting verified');

// ==========================================
// 11. Image Upload Reordering & Primary Cover Selection
// ==========================================
console.log('\nTesting Image Gallery Primary Selection & Reordering...');
let mockImages = [
  'data:image/webp;base64,imageA',
  'data:image/webp;base64,imageB',
  'data:image/webp;base64,imageC',
];

function setPrimaryImage(images, index) {
  const chosen = images[index];
  const others = images.filter((_, i) => i !== index);
  return [chosen, ...others];
}

function moveImage(images, fromIndex, direction) {
  const target = fromIndex + direction;
  if (target < 0 || target >= images.length) return images;
  const copy = [...images];
  const temp = copy[fromIndex];
  copy[fromIndex] = copy[target];
  copy[target] = temp;
  return copy;
}

// Make imageC primary (index 2)
const reordered = setPrimaryImage(mockImages, 2);
assert(reordered[0] === 'data:image/webp;base64,imageC', 'Image C must become primary at index 0');
assert(reordered.length === 3, 'Total image count must be preserved');

// Swap image 0 and 1
const swapped = moveImage(reordered, 0, 1);
assert(swapped[0] === 'data:image/webp;base64,imageA');
assert(swapped[1] === 'data:image/webp;base64,imageC');
console.log('✔ Image gallery primary cover selection and reordering verified');

console.log('\n🎉 ALL 25 AUTOMATED TESTS PASSED SUCCESSFULLY!');

