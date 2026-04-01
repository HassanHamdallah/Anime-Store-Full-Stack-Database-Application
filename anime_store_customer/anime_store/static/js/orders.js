// Orders Page JavaScript - Connected to Database API

// ============================================
// API ENDPOINTS USED:
// ============================================
// 1. GET /api/customer/orders/:accountId - Get customer orders with pagination
// 2. GET /api/customer/order/:orderId - Get order details
// 3. GET /api/customer/order/:orderId/tracking - Get order tracking info
// 4. PUT /api/customer/order/:orderId/cancel - Cancel order
// 5. GET /api/customer/orders/:accountId/status-count - Get order status counts
// 6. GET /api/customer/orders/:accountId/recent - Get recent orders
// 7. POST /api/customer/order/:orderId/reorder - Reorder items
// ============================================

// API Base URL
const API_BASE = '';

// State Management
let ordersData = [];
let currentFilters = {
    status: 'all',
    dateRange: 'all',
    search: ''
};

let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    initializeFilters();
    await loadOrders();
    await calculateStats();
    updateCartCount();
});

// ============================================
// Load Orders from API
// ============================================
async function loadOrders() {
    const accountId = sessionStorage.getItem('accountId');
    
    if (!accountId) {
        showLoginPrompt();
        return;
    }

    const ordersList = document.getElementById('ordersList');
    const emptyOrders = document.getElementById('emptyOrders');
    const orderCount = document.getElementById('orderCount');

    // Show loading state
    ordersList.innerHTML = '<div class="loading">Loading orders...</div>';

    try {
        let url = `${API_BASE}/api/customer/orders/${accountId}?page=1&limit=50`;
        
        if (currentFilters.status !== 'all') {
            url += `&status=${currentFilters.status}`;
        }

        const response = await fetch(url);
        
        if (response.ok) {
            const data = await response.json();
            ordersData = data.orders || [];
            
            // Apply client-side filters
            const filtered = filterOrders();
            
            orderCount.textContent = filtered.length;

            if (filtered.length === 0) {
                ordersList.style.display = 'none';
                emptyOrders.style.display = 'block';
                return;
            }

            ordersList.style.display = 'flex';
            emptyOrders.style.display = 'none';
            ordersList.innerHTML = filtered.map(order => createOrderCard(order)).join('');
        } else {
            ordersList.innerHTML = '<div class="error">Failed to load orders</div>';
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        ordersList.innerHTML = '<div class="error">Error loading orders. Please try again.</div>';
    }
}

function filterOrders() {
    let filtered = [...ordersData];

    // Filter by date range (client-side)
    if (currentFilters.dateRange !== 'all') {
        const days = parseInt(currentFilters.dateRange);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        filtered = filtered.filter(order => new Date(order.orderDate) >= cutoffDate);
    }

    // Search filter (client-side) - search by order ID, product names, and status
    if (currentFilters.search) {
        const searchLower = currentFilters.search.toLowerCase().trim();
        filtered = filtered.filter(order =>
            order.orderId.toString().includes(searchLower) ||
            (order.productNames && order.productNames.toLowerCase().includes(searchLower)) ||
            (order.status && order.status.toLowerCase().includes(searchLower))
        );
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

    return filtered;
}

// ============================================
// Calculate Statistics from API
// ============================================
async function calculateStats() {
    const accountId = sessionStorage.getItem('accountId');
    if (!accountId) return;

    try {
        const response = await fetch(`${API_BASE}/api/customer/orders/${accountId}/status-count`);
        
        if (response.ok) {
            const statusCounts = await response.json();
            
            const totalOrders = Object.values(statusCounts).reduce((a, b) => a + b, 0);
            const pendingOrders = (statusCounts['Pending'] || 0) + (statusCounts['Processing'] || 0) + (statusCounts['Shipped'] || 0);
            const deliveredOrders = statusCounts['Delivered'] || statusCounts['Completed'] || 0;
            
            document.getElementById('totalOrders').textContent = totalOrders;
            document.getElementById('pendingOrders').textContent = pendingOrders;
            document.getElementById('deliveredOrders').textContent = deliveredOrders;
            
            // Calculate total spent from loaded orders (exclude Cancelled orders)
            const totalSpent = ordersData.reduce((sum, order) => {
                // Only count orders that are not cancelled
                if (order.status !== 'Cancelled') {
                    return sum + (order.totalAmount || 0);
                }
                return sum;
            }, 0);
            document.getElementById('totalSpent').textContent = `$${totalSpent.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Error calculating stats:', error);
    }
}

// ============================================
// Create Order Card
// ============================================
function createOrderCard(order) {
    const date = new Date(order.orderDate);
    const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const productNames = order.productNames || 'Items';
    const itemCount = order.itemCount || order.totalItems || 0;

    // Convert status to CSS class-friendly format
    const statusClass = order.status.toLowerCase().replace(/\s+/g, '-');

    // Map status to friendly display text (same as manager dashboard)
    const statusDisplayMap = {
        'Paid': 'NEW ORDER (PAID)',
        'Processing': 'PROCESSING',
        'Shipped': 'SHIPPED',
        'Delivered': 'DELIVERED',
        'Cancelled': 'CANCELLED'
    };

    const statusDisplay = statusDisplayMap[order.status] || order.status.toUpperCase();

    return `
        <div class="order-card" onclick="viewOrderDetails(${order.orderId})">
            <div class="order-header">
                <div class="order-info">
                    <h3>Order #${order.orderId}</h3>
                    <div class="order-date">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        ${formattedDate}
                    </div>
                </div>
                <div class="order-status ${statusClass}">${statusDisplay}</div>
            </div>
            <div class="order-items-preview">
                <p class="order-products">${productNames}</p>
                <p class="order-item-count">${itemCount} item(s)</p>
            </div>
            <div class="order-footer">
                <div class="order-total">
                    Total: <span>$${parseFloat(order.totalAmount).toFixed(2)}</span>
                </div>
                <button class="btn-view-details" onclick="event.stopPropagation(); viewOrderDetails(${order.orderId})">
                    View Details
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// Navigate to order details page
function viewOrderDetails(orderId) {
    window.location.href = `order-details.html?id=${orderId}`;
}

// Debounce helper function
let searchTimeout = null;

// ============================================
// Initialize Filters
// ============================================
function initializeFilters() {
    const statusFilter = document.getElementById('statusFilter');
    const dateFilter = document.getElementById('dateFilter');
    const searchInput = document.getElementById('searchOrders');
    const resetBtn = document.getElementById('resetFilters');

    // Status filter - requires API call for server-side filtering
    statusFilter.addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        loadOrders();
    });

    // Date filter - client-side filtering, just re-render
    dateFilter.addEventListener('change', (e) => {
        currentFilters.dateRange = e.target.value;
        renderFilteredOrders();
    });

    // Search filter - client-side filtering with debounce
    searchInput.addEventListener('input', (e) => {
        currentFilters.search = e.target.value;

        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Debounce: wait 300ms before filtering
        searchTimeout = setTimeout(() => {
            renderFilteredOrders();
        }, 300);
    });

    resetBtn.addEventListener('click', () => {
        currentFilters = { status: 'all', dateRange: 'all', search: '' };
        statusFilter.value = 'all';
        dateFilter.value = 'all';
        searchInput.value = '';
        loadOrders();
    });
}

// Re-render orders with current filters (client-side only)
function renderFilteredOrders() {
    const ordersList = document.getElementById('ordersList');
    const emptyOrders = document.getElementById('emptyOrders');
    const orderCount = document.getElementById('orderCount');

    const filtered = filterOrders();

    orderCount.textContent = filtered.length;

    if (filtered.length === 0) {
        ordersList.style.display = 'none';
        emptyOrders.style.display = 'block';
        return;
    }

    ordersList.style.display = 'flex';
    emptyOrders.style.display = 'none';
    ordersList.innerHTML = filtered.map(order => createOrderCard(order)).join('');
}

// ============================================
// Open Order Modal - Load from API
// ============================================
async function openOrderModal(orderId) {
    const accountId = sessionStorage.getItem('accountId');
    
    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderId}?accountId=${accountId}`);
        
        if (!response.ok) {
            showNotification('Failed to load order details');
            return;
        }

        const order = await response.json();
        const modal = document.getElementById('orderModal');
        
        document.getElementById('modalOrderId').textContent = `Order #${order.orderId}`;
        
        // Calculate totals
        const subtotal = order.items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
        const total = order.totalAmount || subtotal;

        document.getElementById('modalSubtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('modalShipping').textContent = 'FREE';
        document.getElementById('modalTotal').textContent = `$${total.toFixed(2)}`;
        document.getElementById('modalShippingAddress').innerHTML = (order.shippingAddress || 'No address provided').replace(/\n/g, '<br>');

        // Populate order items
        const modalOrderItems = document.getElementById('modalOrderItems');
        modalOrderItems.innerHTML = order.items.map(item => `
            <div class="order-item">
                <img src="${item.productImage || '/static/images/placeholder.jpg'}" alt="${item.productName}" onerror="this.src='/static/images/placeholder.jpg'">
                <div class="order-item-details">
                    <h4>${item.productName}</h4>
                    <p>${item.categoryName || ''}</p>
                </div>
                <div class="order-item-price">
                    <div class="quantity">Qty: ${item.quantity}</div>
                    <div class="price">$${parseFloat(item.lineTotal).toFixed(2)}</div>
                </div>
            </div>
        `).join('');

        // Update timeline based on status
        updateTimeline(order.status, order.orderDate);

        // Store current order ID and status for actions
        modal.dataset.orderId = orderId;
        modal.dataset.orderStatus = order.status;

        // Enable/disable buttons based on order status
        const btnCancel = document.getElementById('btnCancel');

        // Cancel is only allowed for Pending or Processing orders
        const canCancel = ['Pending', 'Processing', 'Paid'].includes(order.status);
        if (btnCancel) {
            btnCancel.disabled = !canCancel;
            btnCancel.title = canCancel ? 'Cancel this order' : 'Cannot cancel orders that have been shipped or delivered';
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (error) {
        console.error('Error loading order details:', error);
        showNotification('Error loading order details');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// Update Timeline
// ============================================
function updateTimeline(status, orderDate) {
    const timeline = document.getElementById('orderTimeline');
    const date = new Date(orderDate);

    // Map actual database statuses to timeline steps
    const statusMap = {
        'Pending': 0,
        'Paid': 0,
        'Processing': 1,
        'Shipped': 2,
        'Delivered': 3,
        'Cancelled': -1
    };

    const currentIndex = statusMap[status] !== undefined ? statusMap[status] : -1;
    const isCancelled = status === 'Cancelled';

    let timelineHTML;

    if (isCancelled) {
        timelineHTML = `
            <div class="timeline-item cancelled">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <h4>Order Cancelled</h4>
                    <p>This order has been cancelled</p>
                </div>
            </div>
        `;
    } else {
        timelineHTML = `
            <div class="timeline-item ${currentIndex >= 0 ? 'completed' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <h4>Order Placed & Paid</h4>
                    <p>${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
            </div>
            <div class="timeline-item ${currentIndex >= 1 ? 'completed' : ''} ${currentIndex === 0 ? 'active' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <h4>Processing</h4>
                    <p>${currentIndex >= 1 ? 'Order is being prepared' : 'Waiting for processing'}</p>
                </div>
            </div>
            <div class="timeline-item ${currentIndex >= 2 ? 'completed' : ''} ${currentIndex === 1 ? 'active' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <h4>Shipped</h4>
                    <p>${currentIndex >= 2 ? 'Your order is on the way' : 'Waiting to be shipped'}</p>
                </div>
            </div>
            <div class="timeline-item ${currentIndex >= 3 ? 'completed' : ''} ${currentIndex === 2 ? 'active' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <h4>Delivered</h4>
                    <p>${currentIndex >= 3 ? 'Order has been delivered' : 'Estimated delivery in 3-5 business days'}</p>
                </div>
            </div>
        `;
    }

    timeline.innerHTML = timelineHTML;
}

// ============================================
// QUERY 10-12:
// Order Actions
// ============================================
function trackOrder() {
    const modal = document.getElementById('orderModal');
    const orderId = modal.dataset.orderId;
    
    if (orderId) {
        loadOrderTracking(orderId);
    } else {
        showNotification('Order tracking not available');
    }
}

async function loadOrderTracking(orderId) {
    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderId}/tracking`);
        
        if (response.ok) {
            const tracking = await response.json();
            showNotification(`Order Status: ${tracking.status}`);
            // Could show detailed tracking modal here
        } else {
            showNotification('Tracking information not available');
        }
    } catch (error) {
        console.error('Error loading tracking:', error);
        showNotification('Error loading tracking information');
    }
}

function downloadInvoice() {
    showNotification('Downloading invoice...');
    // In real app, would generate and download PDF invoice
}

async function cancelOrder() {
    const modal = document.getElementById('orderModal');
    const orderId = modal.dataset.orderId;
    const accountId = sessionStorage.getItem('accountId');
    
    if (!orderId || !accountId) {
        showNotification('Unable to cancel order');
        return;
    }
    
    if (confirm('Are you sure you want to cancel this order?')) {
        try {
            const response = await fetch(`${API_BASE}/api/customer/order/${orderId}/cancel`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: parseInt(accountId) })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                showNotification('Order cancelled successfully');
                closeOrderModal();
                await loadOrders();
                await calculateStats();
            } else {
                showNotification(data.error || 'Failed to cancel order');
            }
        } catch (error) {
            console.error('Error cancelling order:', error);
            showNotification('Error cancelling order');
        }
    }
}


async function reorderItems() {
    const modal = document.getElementById('orderModal');
    const orderId = modal.dataset.orderId;
    const accountId = sessionStorage.getItem('accountId');
    
    if (!orderId || !accountId) {
        showNotification('Unable to reorder');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderId}/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: parseInt(accountId) })
        });
        
        const data = await response.json();
        
        if (response.ok && data.items) {
            // Add items to cart
            data.items.forEach(item => {
                const existingIndex = cart.findIndex(c => c.productId === item.productId);
                
                if (existingIndex > -1) {
                    cart[existingIndex].quantity = Math.min(
                        cart[existingIndex].quantity + item.quantity,
                        item.stock
                    );
                } else {
                    cart.push({
                        productId: item.productId,
                        name: item.name,
                        price: item.unitPrice,
                        image: item.productImage || '/static/images/placeholder.jpg',
                        stock: item.stock,
                        quantity: Math.min(item.quantity, item.stock)
                    });
                }
            });
            
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartCount();
            showNotification('Items added to cart!');
            closeOrderModal();
        } else {
            showNotification(data.error || 'Failed to reorder items');
        }
    } catch (error) {
        console.error('Error reordering:', error);
        showNotification('Error reordering items');
    }
}

function showLoginPrompt() {
    const ordersList = document.getElementById('ordersList');
    const emptyOrders = document.getElementById('emptyOrders');
    
    if (ordersList) ordersList.style.display = 'none';
    if (emptyOrders) {
        emptyOrders.style.display = 'block';
        emptyOrders.innerHTML = `
            <div class="login-prompt">
                <h3>Please Login</h3>
                <p>You need to login to view your orders.</p>
                <a href="login.html" class="btn-primary">Login</a>
            </div>
        `;
    }
}

// ============================================
// Utility Functions
// ============================================
function formatCategory(category) {
    const categories = {
        'figures': 'Figures & Statues',
        'clothing': 'Apparel & Fashion',
        'accessories': 'Accessories',
        'posters': 'Wall Art & Prints',
        'manga': 'Manga & Books',
        'collectibles': 'Collectibles'
    };
    return categories[category] || category;
}

function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) {
        cartCount.textContent = totalItems;
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 30px;
        background: linear-gradient(135deg, #e50914, #c40812);
        color: white;
        padding: 18px 30px;
        border-radius: 15px;
        box-shadow: 0 10px 40px rgba(229, 9, 20, 0.5);
        z-index: 10000;
        font-weight: 600;
        font-size: 14px;
        animation: slideInRight 0.3s ease, slideOutRight 0.3s ease 2.7s;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Navbar scroll effect
window.addEventListener('scroll', function () {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ============================================
// Profile Dropdown Functions
// ============================================
function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('profileDropdown');
    const profileBtn = document.querySelector('.profile-btn');

    if (dropdown && profileBtn && !profileBtn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

// Logout function
function logout(event) {
    if (event) event.preventDefault();

    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('accountId');
        sessionStorage.removeItem('userType');
        sessionStorage.removeItem('role');
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('username');

        showNotification('Logged out successfully!');

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

