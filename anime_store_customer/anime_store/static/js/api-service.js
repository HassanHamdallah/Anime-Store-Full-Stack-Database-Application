/**
 * API Service Layer - Standardized API calls matching ERD field names
 * 
 * MANDATORY: Use these functions instead of direct fetch() calls
 * 
 * All functions use exact ERD field names:
 * accountId, productId, categoryId, warehouseId, supplierId, 
 * customerId, staffId, orderId, orderLineId, movementId, etc.
 */

const API_BASE_URL = 'http://localhost:5000/api'; // Update with your backend URL

// ============================================
// AUTHENTICATION API
// ============================================

/**
 * Login user
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{userType, role, accountId, authToken}>}
 */
async function apiLoginUser(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) throw new Error('Login failed');
    return await response.json();
  } catch (error) {
    console.error('[API] Login error:', error);
    throw error;
  }
}

/**
 * Register new user
/**
 * Register a new user
 * @param {string} email
 * @param {string} password
 * @param {string} name
 * @param {string} phone
 * @param {string} address
 * @returns {Promise}
 */
async function apiRegisterUser(email, password, name, phone = '', address = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, phone, address, userType: 'CUSTOMER' })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  } catch (error) {
    console.error('[API] Registration error:', error);
    throw error;
  }
}

// ============================================
// PRODUCT API
// ============================================

/**
 * Get all products (with optional filters)
 * @param {object} filters - { categoryId, priceMin, priceMax, rating, status }
 * @returns {Promise<Product[]>}
 */
async function apiGetProducts(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${API_BASE_URL}/products?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch products');
    return await response.json();
  } catch (error) {
    console.error('[API] Get products error:', error);
    throw error;
  }
}

/**
 * Get product by ID
 * @param {integer} productId
 * @returns {Promise<Product>}
 */
async function apiGetProduct(productId) {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Product not found');
    return await response.json();
  } catch (error) {
    console.error('[API] Get product error:', error);
    throw error;
  }
}

/**
 * Create product (MANAGER only)
 * @param {object} productData - { name, sku, description, categoryId, supplierId, price, image, badge }
 * @returns {Promise<Product>}
 */
async function apiCreateProduct(productData) {
  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(productData)
    });

    if (!response.ok) throw new Error('Failed to create product');
    return await response.json();
  } catch (error) {
    console.error('[API] Create product error:', error);
    throw error;
  }
}

/**
 * Update product (MANAGER only)
 * @param {integer} productId
 * @param {object} productData - partial product object
 * @returns {Promise<Product>}
 */
async function apiUpdateProduct(productId, productData) {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(productData)
    });

    if (!response.ok) throw new Error('Failed to update product');
    return await response.json();
  } catch (error) {
    console.error('[API] Update product error:', error);
    throw error;
  }
}

/**
 * Delete product (MANAGER only)
 * @param {integer} productId
 * @returns {Promise}
 */
async function apiDeleteProduct(productId) {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to delete product');
    return await response.json();
  } catch (error) {
    console.error('[API] Delete product error:', error);
    throw error;
  }
}

// ============================================
// CATEGORY API
// ============================================

/**
 * Get all categories
 * @returns {Promise<Category[]>}
 */
async function apiGetCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch categories');
    return await response.json();
  } catch (error) {
    console.error('[API] Get categories error:', error);
    throw error;
  }
}

// ============================================
// INVENTORY API
// ============================================

/**
 * Get inventory balance for a warehouse + product
 * @param {integer} warehouseId
 * @param {integer} productId
 * @returns {Promise<InventoryBalance>}
 */
async function apiGetInventoryBalance(warehouseId, productId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/inventory/balance/${warehouseId}/${productId}`,
      { headers: getAuthHeaders() }
    );

    if (!response.ok) throw new Error('Failed to fetch inventory balance');
    return await response.json();
  } catch (error) {
    console.error('[API] Get inventory balance error:', error);
    throw error;
  }
}

/**
 * Get all inventory balances by warehouse
 * @param {integer} warehouseId
 * @returns {Promise<InventoryBalance[]>}
 */
async function apiGetInventoryByWarehouse(warehouseId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/inventory/warehouse/${warehouseId}`,
      { headers: getAuthHeaders() }
    );

    if (!response.ok) throw new Error('Failed to fetch warehouse inventory');
    return await response.json();
  } catch (error) {
    console.error('[API] Get warehouse inventory error:', error);
    throw error;
  }
}

/**
 * Create inventory movement (MANAGER only)
 * @param {object} movementData - { warehouseId, productId, movementType, quantityChange, reason, reference }
 * @returns {Promise<InventoryMovement>}
 */
async function apiCreateInventoryMovement(movementData) {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/movements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(movementData)
    });

    if (!response.ok) throw new Error('Failed to create inventory movement');
    return await response.json();
  } catch (error) {
    console.error('[API] Create inventory movement error:', error);
    throw error;
  }
}

/**
 * Get inventory movements history (MANAGER only)
 * @param {object} filters - { warehouseId, productId, movementType }
 * @returns {Promise<InventoryMovement[]>}
 */
async function apiGetInventoryMovements(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${API_BASE_URL}/inventory/movements?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch movements');
    return await response.json();
  } catch (error) {
    console.error('[API] Get movements error:', error);
    throw error;
  }
}

// ============================================
// ORDER API
// ============================================

/**
 * Create order (CUSTOMER)
 * @param {object} orderData - { customerId, shippingAddress, orderLines: [{productId, quantity}] }
 * @returns {Promise<Order>}
 */
async function apiCreateOrder(orderData) {
  try {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) throw new Error('Failed to create order');
    return await response.json();
  } catch (error) {
    console.error('[API] Create order error:', error);
    throw error;
  }
}

/**
 * Get customer orders
 * @param {integer} customerId
 * @param {object} filters - { status, dateFrom, dateTo }
 * @returns {Promise<Order[]>}
 */
async function apiGetCustomerOrders(customerId, filters = {}) {
  try {
    const params = new URLSearchParams({ customerId, ...filters });
    const response = await fetch(`${API_BASE_URL}/orders?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch orders');
    return await response.json();
  } catch (error) {
    console.error('[API] Get orders error:', error);
    throw error;
  }
}

/**
 * Get order details with lines
 * @param {integer} orderId
 * @returns {Promise<Order>}
 */
async function apiGetOrderDetails(orderId) {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Order not found');
    return await response.json();
  } catch (error) {
    console.error('[API] Get order details error:', error);
    throw error;
  }
}

// ============================================
// STAFF API
// ============================================

/**
 * Get all staff (MANAGER only)
 * @param {object} filters - { role, warehouseId, status }
 * @returns {Promise<Staff[]>}
 */
async function apiGetStaff(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${API_BASE_URL}/staff?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch staff');
    return await response.json();
  } catch (error) {
    console.error('[API] Get staff error:', error);
    throw error;
  }
}

/**
 * Create staff (MANAGER only)
 * @param {object} staffData - { accountId, firstName, lastName, role, warehouseId, managerAccountId, salary }
 * @returns {Promise<Staff>}
 */
async function apiCreateStaff(staffData) {
  try {
    const response = await fetch(`${API_BASE_URL}/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(staffData)
    });

    if (!response.ok) throw new Error('Failed to create staff');
    return await response.json();
  } catch (error) {
    console.error('[API] Create staff error:', error);
    throw error;
  }
}

/**
 * Update staff (MANAGER only)
 * @param {integer} staffId
 * @param {object} staffData
 * @returns {Promise<Staff>}
 */
async function apiUpdateStaff(staffId, staffData) {
  try {
    const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(staffData)
    });

    if (!response.ok) throw new Error('Failed to update staff');
    return await response.json();
  } catch (error) {
    console.error('[API] Update staff error:', error);
    throw error;
  }
}

/**
 * Delete staff (MANAGER only)
 * @param {integer} staffId
 * @returns {Promise}
 */
async function apiDeleteStaff(staffId) {
  try {
    const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to delete staff');
    return await response.json();
  } catch (error) {
    console.error('[API] Delete staff error:', error);
    throw error;
  }
}

// ============================================
// WAREHOUSE API
// ============================================

/**
 * Get all warehouses
 * @returns {Promise<Warehouse[]>}
 */
async function apiGetWarehouses() {
  try {
    const response = await fetch(`${API_BASE_URL}/warehouses`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch warehouses');
    return await response.json();
  } catch (error) {
    console.error('[API] Get warehouses error:', error);
    throw error;
  }
}

// ============================================
// SUPPLIER API
// ============================================

/**
 * Get all suppliers
 * @returns {Promise<Supplier[]>}
 */
async function apiGetSuppliers() {
  try {
    const response = await fetch(`${API_BASE_URL}/suppliers`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch suppliers');
    return await response.json();
  } catch (error) {
    console.error('[API] Get suppliers error:', error);
    throw error;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get authorization headers for API calls
 * @returns {object}
 */
function getAuthHeaders() {
  const authToken = sessionStorage.getItem('authToken');

  if (!authToken) {
    return {};
  }

  return {
    'Authorization': `Bearer ${authToken}`
  };
}

/**
 * Check if response has auth error (401)
 * If so, redirect to login
 * @param {Response} response
 * @returns {boolean} true if auth error detected
 */
function checkAuthError(response) {
  if (response.status === 401) {
    sessionStorage.removeItem('authToken');
    window.location.href = 'login.html';
    return true;
  }
  return false;
}

// Helper Functions added to fix undefined errors
function showNotification(message, type = 'success') {
  // Simple alert for now, or console log
  console.log(`[${type.toUpperCase()}] ${message}`);
  alert(message);
}

function waitAndShowAlert(message, type = 'success') {
  // Intended to persist across reloads, but for now just alert
  showNotification(message, type);
}
