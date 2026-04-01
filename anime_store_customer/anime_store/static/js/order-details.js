// Order Details Page JavaScript

const API_BASE = '';
let orderData = null;
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    const orderId = getOrderIdFromUrl();
    if (!orderId) {
        showNotification('Invalid order ID');
        setTimeout(() => window.location.href = 'orders.html', 2000);
        return;
    }

    await loadOrderDetails(orderId);
    updateCartCount();
});

// Get order ID from URL
function getOrderIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// Load order details from API
async function loadOrderDetails(orderId) {
    const accountId = sessionStorage.getItem('accountId');

    if (!accountId) {
        showNotification('Please login to view order details');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderId}?accountId=${accountId}`);

        if (!response.ok) {
            if (response.status === 403) {
                showNotification('You do not have permission to view this order');
            } else if (response.status === 404) {
                showNotification('Order not found');
            } else {
                showNotification('Failed to load order details');
            }
            setTimeout(() => window.location.href = 'orders.html', 2000);
            return;
        }

        orderData = await response.json();
        renderOrderDetails(orderData);
        updateButtonStates(orderData.status);

    } catch (error) {
        console.error('Error loading order:', error);
        showNotification('Error loading order details');
    }
}

// Render order details
function renderOrderDetails(order) {
    // Order header
    document.getElementById('orderNumber').textContent = `#${order.orderId}`;
    document.title = `Order #${order.orderId} - Anime Store`;

    // Status - display friendly name like manager dashboard
    const statusEl = document.getElementById('orderStatus');
    const statusClass = order.status.toLowerCase().replace(/\s+/g, '-');

    // Map status to friendly display text
    const statusDisplayMap = {
        'Paid': 'NEW ORDER (PAID)',
        'Processing': 'PROCESSING',
        'Shipped': 'SHIPPED',
        'Delivered': 'DELIVERED',
        'Cancelled': 'CANCELLED'
    };

    statusEl.textContent = statusDisplayMap[order.status] || order.status.toUpperCase();
    statusEl.className = `order-status ${statusClass}`;

    // Date
    const date = new Date(order.orderDate);
    document.getElementById('orderDate').textContent = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });


    // Items
    renderOrderItems(order.items);

    // Summary
    const subtotal = order.items.reduce((sum, item) => sum + (item.lineTotal || item.quantity * item.unitPrice), 0);
    const total = order.totalAmount || subtotal;

    document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('total').textContent = `$${total.toFixed(2)}`;

    // Shipping address
    document.getElementById('shippingAddress').innerHTML = (order.shippingAddress || 'No address provided').replace(/\n/g, '<br>');

    // Edit address field
    const editAddress = document.getElementById('editAddress');
    if (editAddress) {
        editAddress.value = order.shippingAddress || '';
    }
}


// Render order items
function renderOrderItems(items) {
    const container = document.getElementById('orderItems');
    const canEdit = orderData && ['Paid', 'Processing'].includes(orderData.status);

    container.innerHTML = items.map(item => `
        <div class="order-item" data-item-id="${item.orderLineId}">
            ${canEdit ? `<input type="checkbox" class="item-checkbox" data-line-id="${item.orderLineId}">` : ''}
            <img src="${item.productImage || '/static/images/placeholder.jpg'}" 
                 alt="${item.productName}" 
                 onerror="this.src='/static/images/placeholder.jpg'">
            <div class="item-details">
                <h4>${item.productName}</h4>
                <p>${item.categoryName || ''}</p>
            </div>
            <div class="item-price">
                <div class="quantity">Qty: ${item.quantity}</div>
                <div class="price">$${(item.lineTotal || item.quantity * item.unitPrice).toFixed(2)}</div>
            </div>
        </div>
    `).join('');

    // Update delete button state based on item count
    updateDeleteButtonState();
}

// Update delete button state based on number of items
function updateDeleteButtonState() {
    const btnDeleteSelected = document.getElementById('btnDeleteSelected');
    if (!btnDeleteSelected || !orderData) return;

    const itemCount = orderData.items ? orderData.items.length : 0;

    if (itemCount <= 1) {
        // Disable delete button when only 1 item
        btnDeleteSelected.disabled = true;
        btnDeleteSelected.style.opacity = '0.5';
        btnDeleteSelected.style.cursor = 'not-allowed';
        btnDeleteSelected.title = 'Cannot delete the last item. Use Request Refund to cancel the order.';
    } else {
        // Enable delete button when more than 1 item
        btnDeleteSelected.disabled = false;
        btnDeleteSelected.style.opacity = '1';
        btnDeleteSelected.style.cursor = 'pointer';
        btnDeleteSelected.title = 'Delete selected items from order';
    }
}

// Update button states based on order status
function updateButtonStates(status) {
    const btnRefund = document.getElementById('btnRefund');
    const editControls = document.getElementById('editControls');

    // Show refund and edit buttons only for Paid or Processing orders
    const canEditOrRefund = ['Paid', 'Processing'].includes(status);

    if (btnRefund) {
        btnRefund.style.display = canEditOrRefund ? 'inline-flex' : 'none';
    }

    if (editControls) {
        editControls.style.display = canEditOrRefund ? 'flex' : 'none';
    }
}

// Format date helper
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }) + ' at ' + date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================
// Order Actions
// ============================================

// Reorder items
async function reorderItems() {
    if (!orderData) return;

    const accountId = sessionStorage.getItem('accountId');

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderData.orderId}/reorder`, {
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

            setTimeout(() => window.location.href = 'cart.html', 1500);
        } else {
            showNotification(data.error || 'Failed to reorder items');
        }
    } catch (error) {
        console.error('Error reordering:', error);
        showNotification('Error reordering items');
    }
}

// Cancel order
async function cancelOrder() {
    if (!orderData) return;

    const accountId = sessionStorage.getItem('accountId');

    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderData.orderId}/cancel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: parseInt(accountId) })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification('Order cancelled successfully');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification(data.error || 'Failed to cancel order');
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        showNotification('Error cancelling order');
    }
}

// Track shipment
function trackShipment() {
    if (!orderData) return;

    // In a real app, this would open tracking info
    showNotification(`Order Status: ${orderData.status}`);
}

// Save order changes
async function saveOrderChanges() {
    if (!orderData) return;

    const accountId = sessionStorage.getItem('accountId');
    const newAddress = document.getElementById('editAddress').value.trim();

    if (!newAddress) {
        showNotification('Please enter a shipping address');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderData.orderId}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                shippingAddress: newAddress
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification('Order updated successfully');
            document.getElementById('shippingAddress').innerHTML = newAddress.replace(/\n/g, '<br>');
            orderData.shippingAddress = newAddress;
        } else {
            showNotification(data.error || 'Failed to update order');
        }
    } catch (error) {
        console.error('Error updating order:', error);
        showNotification('Error updating order');
    }
}


// ============================================
// Cancel Modal
// ============================================

let itemsToCancel = []; // Array of orderLineIds to cancel

function openCancelModal(itemIds = null) {
    if (!orderData) return;

    const modal = document.getElementById('cancelModal');
    const items = orderData.items || [];

    // Determine which items to cancel
    if (itemIds && itemIds.length > 0) {
        itemsToCancel = itemIds;
        document.getElementById('cancelModalTitle').textContent = 'Cancel Selected Items';
    } else {
        // Cancel all items
        itemsToCancel = items.map(item => item.orderLineId);
        document.getElementById('cancelModalTitle').textContent = 'Cancel Order';
    }

    document.getElementById('cancelOrderNumber').textContent = `#${orderData.orderId}`;

    // Render items to cancel
    const itemsList = document.getElementById('cancelItemsList');

    itemsList.innerHTML = items
        .filter(item => itemsToCancel.includes(item.orderLineId))
        .map(item => {
            const itemTotal = item.lineTotal || (item.quantity * item.unitPrice);
            return `
                <div class="cancel-item">
                    <img src="${item.productImage || '/static/images/placeholder.jpg'}" alt="${item.productName}">
                    <div class="cancel-item-info">
                        <span class="cancel-item-name">${item.productName}</span>
                        <span class="cancel-item-qty">Qty: ${item.quantity}</span>
                    </div>
                    <span class="cancel-item-price">$${itemTotal.toFixed(2)}</span>
                </div>
            `;
        }).join('');

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCancelModal() {
    const modal = document.getElementById('cancelModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    itemsToCancel = [];
}

// Confirm cancel items
async function confirmCancelItems() {
    if (!orderData || itemsToCancel.length === 0) return;

    const accountId = sessionStorage.getItem('accountId');
    const isFullCancel = itemsToCancel.length === orderData.items.length;

    const confirmBtn = document.getElementById('confirmCancelBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';

    try {
        const endpoint = isFullCancel
            ? `${API_BASE}/api/customer/order/${orderData.orderId}/cancel`
            : `${API_BASE}/api/customer/order/${orderData.orderId}/cancel-items`;

        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                orderLineIds: itemsToCancel
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification(isFullCancel ? 'Order cancelled successfully' : 'Items cancelled successfully');
            closeCancelModal();
            selectedItems.clear();
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification(data.error || 'Failed to cancel items');
        }
    } catch (error) {
        console.error('Error cancelling items:', error);
        showNotification('Error cancelling items');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Cancel Items';
    }
}


// ============================================
// Utility Functions
// ============================================

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
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Profile dropdown
function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('profileDropdown');
    const profileBtn = document.querySelector('.profile-btn');

    if (dropdown && profileBtn && !profileBtn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

// Logout
function logout(event) {
    if (event) event.preventDefault();

    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.clear();
        showNotification('Logged out successfully!');
        setTimeout(() => window.location.href = 'login.html', 1000);
    }
}

// Navbar scroll effect
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ============================================
// Refund Functionality
// ============================================
async function requestRefund() {
    if (!orderData) return;

    const accountId = sessionStorage.getItem('accountId');

    if (!confirm('Are you sure you want to request a refund for this order? This will cancel the entire order.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderData.orderId}/refund`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                reason: 'Customer requested refund'
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification('Refund request submitted successfully. Order has been cancelled.');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification(data.error || 'Failed to request refund');
        }
    } catch (error) {
        console.error('Error requesting refund:', error);
        showNotification('Error requesting refund');
    }
}

// ============================================
// Delete Selected Items
// ============================================
async function deleteSelectedItems() {
    if (!orderData) return;

    // Check if order has only one item
    const totalItems = orderData.items ? orderData.items.length : 0;
    if (totalItems <= 1) {
        showNotification('Cannot delete the last item. Use "Request Refund" to cancel the entire order.');
        return;
    }

    const checkboxes = document.querySelectorAll('.item-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('Please select items to delete');
        return;
    }

    const orderLineIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.lineId));

    // Check if trying to delete all items
    if (orderLineIds.length === totalItems) {
        if (!confirm('You are about to delete all items. This will cancel the entire order. Continue?')) {
            return;
        }
    } else {
        if (!confirm(`Are you sure you want to delete ${orderLineIds.length} item(s) from this order?`)) {
            return;
        }
    }

    const accountId = sessionStorage.getItem('accountId');

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderData.orderId}/remove-items`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                orderLineIds: orderLineIds
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification('Items removed successfully');
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.error || 'Failed to remove items');
        }
    } catch (error) {
        console.error('Error removing items:', error);
        showNotification('Error removing items');
    }
}

// ============================================
// Add Product Modal
// ============================================
let allProducts = [];
let selectedProduct = null;

async function openAddProductModal() {
    if (!orderData) return;

    const modal = document.getElementById('addProductModal');
    document.getElementById('addProductOrderNumber').textContent = `#${orderData.orderId}`;

    // Load all products
    await loadAllProducts();

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAddProductModal() {
    const modal = document.getElementById('addProductModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';

    // Reset
    document.getElementById('productSearch').value = '';
    document.getElementById('selectedProductSection').style.display = 'none';
    document.getElementById('confirmAddProductBtn').disabled = true;
    selectedProduct = null;
}

async function loadAllProducts() {
    try {
        const response = await fetch(`${API_BASE}/api/products/all`);

        if (response.ok) {
            allProducts = await response.json();
            displayProducts(allProducts);
        } else {
            showNotification('Failed to load products');
        }
    } catch (error) {
        console.error('Error loading products:', error);
        showNotification('Error loading products');
    }
}

function searchProducts(query) {
    const filtered = allProducts.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase())
    );
    displayProducts(filtered);
}

function displayProducts(products) {
    const container = document.getElementById('productsList');

    if (products.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No products found</p>';
        return;
    }

    container.innerHTML = products.map(product => `
        <div class="product-item" onclick="selectProduct(${product.productId})">
            <img src="${product.productImage || '/static/images/placeholder.jpg'}" alt="${product.name}">
            <div class="product-info">
                <h4>${product.name}</h4>
                <p>$${parseFloat(product.unitPrice).toFixed(2)}</p>
            </div>
        </div>
    `).join('');
}

async function selectProduct(productId) {
    selectedProduct = allProducts.find(p => p.productId === productId);

    if (!selectedProduct) return;

    // Get available stock
    try {
        const response = await fetch(`${API_BASE}/api/products/${productId}/stock`);
        if (response.ok) {
            const data = await response.json();
            selectedProduct.stock = data.stock || 0;
        }
    } catch (error) {
        console.error('Error getting stock:', error);
        selectedProduct.stock = 0;
    }

    // Update UI
    document.getElementById('selectedProductInfo').innerHTML = `
        <img src="${selectedProduct.productImage || '/static/images/placeholder.jpg'}" alt="${selectedProduct.name}">
        <div>
            <h4>${selectedProduct.name}</h4>
            <p>$${parseFloat(selectedProduct.unitPrice).toFixed(2)}</p>
        </div>
    `;

    document.getElementById('availableStock').textContent = selectedProduct.stock;
    document.getElementById('productQuantity').max = selectedProduct.stock;
    document.getElementById('productQuantity').value = 1;
    document.getElementById('selectedProductSection').style.display = 'block';
    document.getElementById('confirmAddProductBtn').disabled = false;
}

function adjustQuantity(delta) {
    const input = document.getElementById('productQuantity');
    const newValue = parseInt(input.value) + delta;
    const max = parseInt(input.max);

    if (newValue >= 1 && newValue <= max) {
        input.value = newValue;
    }
}

async function confirmAddProduct() {
    if (!selectedProduct || !orderData) return;

    const accountId = sessionStorage.getItem('accountId');
    const quantity = parseInt(document.getElementById('productQuantity').value);

    try {
        const response = await fetch(`${API_BASE}/api/customer/order/${orderData.orderId}/add-item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                productId: selectedProduct.productId,
                quantity: quantity
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showNotification('Product added successfully');
            closeAddProductModal();
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.error || 'Failed to add product');
        }
    } catch (error) {
        console.error('Error adding product:', error);
        showNotification('Error adding product');
    }
}
