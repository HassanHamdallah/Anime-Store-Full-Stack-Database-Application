/**
 * Route Guard Utility - Enforce role-based access control
 * 
 * MANDATORY: Include this on every page with:
 * <script src="../static/js/route-guard.js"></script>
 * 
 * Then call: enforceRouteGuard('customer') or enforceRouteGuard('manager')
 */

/**
 * Get current route type from URL
 * @returns {string} 'customer', 'manager', or 'login'
 */
function getCurrentRouteType() {
  const pathname = window.location.pathname;

  // Customer pages
  if (pathname.includes('home.html') || pathname.includes('profile.html') || pathname.includes('cart.html') || pathname.includes('orders.html') || pathname.includes('order-details.html') || pathname.includes('products.html') || pathname.includes('product-detail.html')) return 'customer';

  // Manager pages
  if (pathname.includes('manager-dashboard.html') ||
    pathname.includes('inventory.html') ||
    pathname.includes('staff.html') ||
    pathname.includes('manager-orders.html') ||
    pathname.includes('suppliers.html') ||
    pathname.includes('analytics.html')) return 'manager';

  // Login page
  if (pathname.includes('login.html') || pathname === '/' || pathname.endsWith('/')) return 'login';

  return 'unknown';
}

/**
 * Get authentication info from sessionStorage
 * @returns {object} { userType, role, accountId, isAuthenticated }
 */
function getAuthInfo() {
  const userType = sessionStorage.getItem('userType');
  const role = sessionStorage.getItem('role');
  const accountId = sessionStorage.getItem('accountId');
  const authToken = sessionStorage.getItem('authToken');

  return {
    userType: userType,
    role: role,
    accountId: accountId,
    isAuthenticated: !!authToken
  };
}

/**
 * Check if user has permission for the current route
 * @param {string} requiredRouteType - 'customer' or 'manager'
 * @returns {boolean}
 */
function hasRoutePermission(requiredRouteType) {
  const auth = getAuthInfo();

  if (!auth.isAuthenticated) {
    return false;
  }

  if (requiredRouteType === 'customer') {
    return auth.userType === 'CUSTOMER';
  }

  if (requiredRouteType === 'manager') {
    // Allow any STAFF member to access manager pages
    // Check for manager-related roles (case-insensitive)
    const role = (auth.role || '').toLowerCase();
    const isManager = role.includes('manager') || role === 'admin' || role === 'head manager';
    return auth.userType === 'STAFF';  // All staff can access manager pages
  }

  return false;
}

/**
 * Enforce route guard - redirect if unauthorized
 * CALL THIS at the top of every protected page
 * @param {string} requiredRouteType - 'customer' or 'manager'
 */
function enforceRouteGuard(requiredRouteType) {
  const auth = getAuthInfo();
  const currentRoute = getCurrentRouteType();

  // Allow login page for everyone
  if (currentRoute === 'login') {
    // If already authenticated, redirect to respective home
    if (auth.isAuthenticated) {
      if (auth.userType === 'CUSTOMER') window.location.href = 'home.html';
      else if (auth.userType === 'STAFF') window.location.href = 'manager-dashboard.html';
    }
    return;
  }

  // If not authenticated, redirect to login
  if (!auth.isAuthenticated) {
    console.warn('[Route Guard] User not authenticated. Redirecting to login...');
    window.location.href = 'login.html';
    return;
  }

  // Check permission
  if (!hasRoutePermission(requiredRouteType)) {
    console.warn(`[Route Guard] User lacks permission for ${requiredRouteType} route. Redirecting to login...`);

    // If user is CUSTOMER trying to access manager route, redirect to customer home
    if (auth.userType === 'CUSTOMER') {
      window.location.href = 'home.html';
    }
    // If user is STAFF but not MANAGER, deny
    else if (auth.userType === 'STAFF') {
      window.location.href = 'login.html';
    }
    // Otherwise redirect to login
    else {
      window.location.href = 'login.html';
    }
  }
}

/**
 * Logout - Clear all session data and redirect to login
 */
function logout() {
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('userType');
  sessionStorage.removeItem('role');
  sessionStorage.removeItem('accountId');

  window.location.href = 'login.html';
}

/**
 * Add logout button functionality to a button element
 * @param {string} buttonSelector - CSS selector for logout button
 */
function initializeLogoutButton(buttonSelector) {
  const logoutBtn = document.querySelector(buttonSelector);
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
  const auth = getAuthInfo();
  console.log('[Route Guard] Current auth:', {
    userType: auth.userType,
    role: auth.role,
    isAuthenticated: auth.isAuthenticated
  });
});
