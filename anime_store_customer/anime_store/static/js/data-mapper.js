/**
 * Data Mapper/Adapter - Translates between mock data and ERD field names
 * 
 * This ensures the front-end uses ERD field names while allowing existing
 * mock data to remain unchanged.
 */

/**
 * Normalize product from mock format to ERD format
 * @param {object} mockProduct - { id, name, category, price, ... }
 * @returns {object} - { productId, name, categoryId, price, ... }
 */
function normalizeProduct(mockProduct) {
  if (!mockProduct) return null;

  return {
    productId: mockProduct.id,
    name: mockProduct.name,
    sku: mockProduct.sku,
    description: mockProduct.description,
    categoryId: mockProduct.category,  // Map category string to categoryId
    categoryName: mockProduct.category,  // Keep for display
    supplierId: mockProduct.supplier,  // Map supplier string to supplierId
    supplierName: mockProduct.supplier,  // Keep for display
    price: mockProduct.price,
    currency: 'USD',
    rating: mockProduct.rating,
    reviewCount: mockProduct.reviews,
    status: mockProduct.availability,
    image: mockProduct.image,
    badge: mockProduct.badge,
    stock: mockProduct.stock,  // Temporary - should come from InventoryBalance
    availability: mockProduct.availability,
    warehouse: mockProduct.warehouse,  // Temporary - should come from InventoryBalance
    oldPrice: mockProduct.oldPrice,
    releaseDate: mockProduct.releaseDate
  };
}

/**
 * Normalize array of products
 * @param {array} mockProducts
 * @returns {array}
 */
function normalizeProducts(mockProducts) {
  if (!Array.isArray(mockProducts)) return [];
  return mockProducts.map(normalizeProduct);
}

/**
 * Normalize order from mock format to ERD format
 * @param {object} mockOrder
 * @returns {object}
 */
function normalizeOrder(mockOrder) {
  if (!mockOrder) return null;

  return {
    orderId: mockOrder.id,
    orderNumber: mockOrder.id,  // Format: ORD-YYYY-#####
    customerId: mockOrder.customerId,
    orderDate: mockOrder.date,
    status: mockOrder.status,
    totalAmount: mockOrder.total,
    subtotal: mockOrder.subtotal,
    shipping: mockOrder.shipping,
    shippingAddress: mockOrder.shippingAddress,
    trackingNumber: mockOrder.trackingNumber,
    deliveredAt: mockOrder.deliveredAt,
    cancelledAt: mockOrder.cancelledAt
  };
}

/**
 * Normalize order line from mock format to ERD format
 * @param {object} mockLine
 * @returns {object}
 */
function normalizeOrderLine(mockLine) {
  if (!mockLine) return null;

  return {
    orderLineId: mockLine.id,
    orderId: mockLine.orderId,
    productId: mockLine.productId,
    quantity: mockLine.quantity,
    unitPrice: mockLine.price,
    subtotal: mockLine.price * mockLine.quantity
  };
}

/**
 * Normalize staff from mock format to ERD format
 * @param {object} mockStaff
 * @returns {object}
 */
function normalizeStaff(mockStaff) {
  if (!mockStaff) return null;

  return {
    staffId: mockStaff.id,
    accountId: mockStaff.accountId,
    firstName: mockStaff.firstName || mockStaff.name?.split(' ')[0],
    lastName: mockStaff.lastName || mockStaff.name?.split(' ')[1] || '',
    role: mockStaff.role,  // MANAGER, WAREHOUSE_STAFF, SUPPORT_STAFF
    salary: mockStaff.salary,
    warehouseId: mockStaff.warehouseId,
    managerAccountId: mockStaff.managerAccountId,  // Self-FK
    status: mockStaff.status,
    email: mockStaff.email,
    phone: mockStaff.phone,
    store: mockStaff.store || mockStaff.warehouse
  };
}

/**
 * Normalize inventory balance from mock format to ERD format
 * @param {object} mockBalance
 * @returns {object}
 */
function normalizeInventoryBalance(mockBalance) {
  if (!mockBalance) return null;

  return {
    warehouseId: mockBalance.warehouseId,
    productId: mockBalance.productId,
    quantityOnHand: mockBalance.quantity,
    quantityReserved: mockBalance.reserved || 0,
    reorderPoint: mockBalance.reorderPoint || 10,
    lastMovementAt: mockBalance.lastMovementAt,
    updatedAt: mockBalance.updatedAt
  };
}

/**
 * Normalize inventory movement from mock format to ERD format
 * @param {object} mockMovement
 * @returns {object}
 */
function normalizeInventoryMovement(mockMovement) {
  if (!mockMovement) return null;

  return {
    movementId: mockMovement.id,
    warehouseId: mockMovement.warehouseId,
    productId: mockMovement.productId,
    movementType: mockMovement.type,  // INBOUND, OUTBOUND, ADJUSTMENT, TRANSFER
    quantityChange: mockMovement.quantity,
    reference: mockMovement.reference,  // PO/Order ID
    reason: mockMovement.reason,
    movementAt: mockMovement.movementAt,
    createdAt: mockMovement.createdAt
  };
}

/**
 * Denormalize product from ERD format back to form/API format
 * @param {object} product - ERD format
 * @returns {object} - API format for submission
 */
function denormalizeProductForAPI(product) {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    price: product.price,
    currency: product.currency,
    image: product.image,
    badge: product.badge,
    status: product.status
  };
}

/**
 * Denormalize order from form format to API format
 * @param {object} orderData
 * @returns {object}
 */
function denormalizeOrderForAPI(orderData) {
  return {
    customerId: orderData.customerId,
    shippingAddress: orderData.shippingAddress,
    orderLines: (orderData.orderLines || []).map(line => ({
      productId: line.productId,
      quantity: line.quantity
    }))
  };
}

/**
 * Denormalize inventory movement for API submission
 * @param {object} movementData
 * @returns {object}
 */
function denormalizeMovementForAPI(movementData) {
  return {
    warehouseId: movementData.warehouseId,
    productId: movementData.productId,
    movementType: movementData.movementType,
    quantityChange: movementData.quantityChange,
    reason: movementData.reason,
    reference: movementData.reference,
    movementAt: movementData.movementAt || new Date().toISOString()
  };
}

/**
 * Denormalize staff for API submission
 * @param {object} staffData
 * @returns {object}
 */
function denormalizeStaffForAPI(staffData) {
  return {
    firstName: staffData.firstName,
    lastName: staffData.lastName,
    role: staffData.role,
    salary: staffData.salary,
    warehouseId: staffData.warehouseId || null,
    managerAccountId: staffData.managerAccountId || null,
    status: staffData.status
  };
}

/**
 * Helper: Map category name to categoryId
 * @param {string} categoryName
 * @returns {integer}
 */
function getCategoryIdByName(categoryName) {
  const categoryMap = {
    'figures': 1,
    'clothing': 2,
    'accessories': 3,
    'posters': 4,
    'manga': 5,
    'collectibles': 6
  };
  return categoryMap[categoryName?.toLowerCase()] || null;
}

/**
 * Helper: Map categoryId to name
 * @param {integer} categoryId
 * @returns {string}
 */
function getCategoryNameById(categoryId) {
  const categoryNames = {
    1: 'figures',
    2: 'clothing',
    3: 'accessories',
    4: 'posters',
    5: 'manga',
    6: 'collectibles'
  };
  return categoryNames[categoryId] || '';
}

/**
 * Helper: Get supplier ID by name (in real app, fetch from API)
 * @param {string} supplierName
 * @returns {integer}
 */
function getSupplierIdByName(supplierName) {
  const supplierMap = {
    'Premium Collectibles Co.': 1,
    'Anime Fashion Ltd.': 2,
    'Collectibles Plus': 3,
    'Art Prints Co.': 4,
    'Manga Distributors Inc.': 5
  };
  return supplierMap[supplierName] || null;
}

/**
 * Helper: Get warehouse ID by name
 * @param {string} warehouseName
 * @returns {integer}
 */
function getWarehouseIdByName(warehouseName) {
  const warehouseMap = {
    'Warehouse A': 1,
    'Warehouse B': 2,
    'Warehouse C': 3,
    'Main Store': 4
  };
  return warehouseMap[warehouseName] || null;
}
