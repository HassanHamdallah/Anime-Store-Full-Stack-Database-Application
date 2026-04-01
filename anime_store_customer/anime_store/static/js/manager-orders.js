// Manager Orders JavaScript - PAY FIRST MODEL
// Customer pays immediately → Order appears here
// Manager does NOT approve sale, only manages fulfillment
// 1. Get PAID orders only (Payment.status='Paid')
// 2. Accept for processing
// 3. Allocate warehouses (ShipsFrom)
// 4. Mark shipped/delivered
// 5. Cancel + refund

const API_URL = '/api/manager/orders';
let managerOrdersData = [];
let currentOrderId = null;
let fulfillmentData = null;
let availableInventoryData = [];

let currentFilters = { status: 'all', search: '' };

document.addEventListener('DOMContentLoaded', function () {
    loadOrders();
    initializeFilters();
    // Stats are calculated after load
});

async function loadOrders() {
    try {
        // Get filter parameter
        const statusParam = currentFilters.status !== 'all' ? `?status=${currentFilters.status}` : '';
        const res = await fetch(`${API_URL}${statusParam}`);
        managerOrdersData = await res.json();

        const filtered = filterOrders();
        renderOrders(filtered);
        calculateStats();
    } catch (e) {
        console.error('Error loading orders', e);
    }
}

function renderOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = orders.map(order => {
        // Determine status badge class
        let statusClass = 'pending';
        let statusDisplay = order.status;
        if (order.status === 'Paid') {
            statusClass = 'paid';
            statusDisplay = 'New Order (Paid)';
        } else if (order.status === 'Processing') {
            statusClass = 'processing';
        } else if (order.status === 'Shipped') {
            statusClass = 'shipped';
        } else if (order.status === 'Delivered') {
            statusClass = 'delivered';
        } else if (order.status === 'Cancelled') {
            statusClass = 'cancelled';
        } else if (order.status === 'Refund Requested') {
            statusClass = 'refund-requested';
            statusDisplay = 'Refund Requested';
        } else if (order.status === 'Refunded') {
            statusClass = 'refunded';
        }

        // Determine available actions based on status
        let actions = '';
        if (order.status === 'Paid') {
            actions = `
                <button class="btn-action btn-accept" onclick="acceptOrder(${order.orderId})">Accept</button>
                <button class="btn-action btn-view" onclick="viewOrderDetails(${order.orderId})">View</button>
                <button class="btn-action btn-cancel" onclick="cancelOrder(${order.orderId})">Cancel & Refund</button>
            `;
        } else if (order.status === 'Processing') {
            actions = `
                <button class="btn-action btn-fulfill" onclick="openFulfillmentModal(${order.orderId})">Allocate Stock</button>
                <button class="btn-action btn-ship" onclick="markShipped(${order.orderId})">Mark Shipped</button>
                <button class="btn-action btn-cancel" onclick="cancelOrder(${order.orderId})">Cancel & Refund</button>
            `;
        } else if (order.status === 'Shipped') {
            actions = `
                <button class="btn-action btn-deliver" onclick="markDelivered(${order.orderId})">Mark Delivered</button>
                <button class="btn-action btn-view" onclick="viewOrderDetails(${order.orderId})">View</button>
            `;
        } else if (order.status === 'Refund Requested') {
            actions = `
                <button class="btn-action btn-approve-refund" onclick="approveRefund(${order.orderId})">Approve Refund</button>
                <button class="btn-action btn-reject-refund" onclick="rejectRefund(${order.orderId})">Reject Refund</button>
                <button class="btn-action btn-view" onclick="viewOrderDetails(${order.orderId})">View</button>
            `;
        } else {
            actions = `<button class="btn-action btn-view" onclick="viewOrderDetails(${order.orderId})">View Details</button>`;
        }

        return `
        <tr>
            <td><strong>#${order.orderId}</strong></td>
            <td>
                <div>${order.customer_name}</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.5);">${order.customer_email}</div>
            </td>
            <td>${order.item_count} items</td>
            <td><strong>$${parseFloat(order.totalAmount).toFixed(2)}</strong></td>
            <td>
                <span class="status-badge ${statusClass}">${statusDisplay}</span>
                <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">
                    ${order.payment_method} - ${order.payment_status}
                </div>
            </td>
            <td>${order.orderDate}</td>
            <td>
                <div class="action-buttons">
                    ${actions}
                </div>
            </td>
        </tr>
    `;
    }).join('');
}


function filterOrders() {
    // Client-side filter
    let filtered = [...managerOrdersData];
    if (currentFilters.status !== 'all') {
        filtered = filtered.filter(o => o.status.toLowerCase() === currentFilters.status.toLowerCase());
    }
    if (currentFilters.search) {
        const search = currentFilters.search.toLowerCase();
        filtered = filtered.filter(o =>
            String(o.orderId).includes(search) ||
            o.customer_name.toLowerCase().includes(search)
        );
    }
    return filtered;
}

function initializeFilters() {
    document.getElementById('statusFilter').addEventListener('change', (e) => { currentFilters.status = e.target.value; loadOrders(); }); // Reloads full list then filters again? actually loadOrders fetches again. Optimization: just re-render
    document.getElementById('searchInput').addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        const filtered = filterOrders();
        renderOrders(filtered);
    });
}

function calculateStats() {
    const totalOrders = managerOrdersData.length;
    const totalRevenue = managerOrdersData.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
    const pendingOrders = managerOrdersData.filter(o => o.status === 'Paid' || o.status === 'Processing').length;

    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
    document.getElementById('pendingOrders').textContent = pendingOrders;
}

// ========================================
// PAY-FIRST ACTIONS
// ========================================

async function acceptOrder(orderId) {
    if (!confirm(`Accept order #${orderId} for processing?`)) return;

    try {
        const res = await fetch(`/api/manager/orders/${orderId}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showNotification(`Order #${orderId} accepted for processing`);
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to accept order', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error accepting order', 'error');
    }
}

async function markShipped(orderId) {
    if (!confirm(`Mark order #${orderId} as shipped?`)) return;

    try {
        const res = await fetch(`/api/manager/orders/${orderId}/ship`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showNotification(`Order #${orderId} marked as shipped`);
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to mark as shipped', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error marking order as shipped', 'error');
    }
}

async function markDelivered(orderId) {
    if (!confirm(`Mark order #${orderId} as delivered?`)) return;

    try {
        const res = await fetch(`/api/manager/orders/${orderId}/deliver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showNotification(`Order #${orderId} marked as delivered`);
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to mark as delivered', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error marking order as delivered', 'error');
    }
}

async function cancelOrder(orderId) {
    if (!confirm(`Cancel order #${orderId} and process refund? This will restore inventory if allocated.`)) return;

    try {
        const res = await fetch(`/api/manager/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showNotification(`Order #${orderId} cancelled and refunded`);
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to cancel order', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error cancelling order', 'error');
    }
}

async function approveRefund(orderId) {
    if (!confirm(`Approve refund for order #${orderId}? This will cancel the order and restore inventory.`)) return;

    try {
        const res = await fetch(`/api/manager/orders/${orderId}/approve-refund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showNotification(`Refund approved for order #${orderId}`);
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to approve refund', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error approving refund', 'error');
    }
}

async function rejectRefund(orderId) {
    if (!confirm(`Reject refund request for order #${orderId}? The order status will be restored.`)) return;

    try {
        const res = await fetch(`/api/manager/orders/${orderId}/reject-refund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showNotification(`Refund rejected for order #${orderId}`);
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to reject refund', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error rejecting refund', 'error');
    }
}

function viewOrderDetails(orderId) {
    // Open fulfillment modal to view order details
    openFulfillmentModal(orderId);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    const bgColor = type === 'error' ? '#dc3545' : (type === 'warning' ? '#ffc107' : '#00c853');
    notification.style.cssText = `position: fixed; top: 100px; right: 30px; background: linear-gradient(135deg, ${bgColor}, ${bgColor}cc); color: white; padding: 18px 30px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); z-index: 10000; font-weight: 600; font-size: 14px;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ========================================
// FULFILLMENT MODAL FUNCTIONS - PAY FIRST MODEL
// ========================================

async function openFulfillmentModal(orderId) {
    currentOrderId = orderId;
    document.getElementById('fulfillmentOrderId').textContent = orderId;

    try {
        // Load fulfillment data
        const [fulfillRes, inventoryRes] = await Promise.all([
            fetch(`/api/manager/orders/${orderId}/fulfillment`),
            fetch(`/api/manager/orders/${orderId}/available-inventory`)
        ]);

        fulfillmentData = await fulfillRes.json();
        availableInventoryData = await inventoryRes.json();

        renderFulfillmentItems();
        renderAllocations();
        populateProductDropdown();

    } catch (e) {
        console.error('Error loading fulfillment data:', e);
        showNotification('Error loading fulfillment data', 'error');
    }

    document.getElementById('fulfillmentModal').style.display = 'flex';
}

function closeFulfillmentModal() {
    document.getElementById('fulfillmentModal').style.display = 'none';
    currentOrderId = null;
    fulfillmentData = null;
    availableInventoryData = [];
}

function renderFulfillmentItems() {
    const container = document.getElementById('fulfillmentItems');
    if (!fulfillmentData || !fulfillmentData.items) {
        container.innerHTML = '<p>No items in this order</p>';
        return;
    }

    container.innerHTML = `
        <h3>Order Items</h3>
        <table class="items-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Ordered</th>
                    <th>Allocated</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${fulfillmentData.items.map(item => {
                    const isComplete = item.allocatedQty >= item.orderedQty;
                    return `
                        <tr>
                            <td>${item.productName}</td>
                            <td>${item.orderedQty}</td>
                            <td>${item.allocatedQty}</td>
                            <td>
                                <span class="status-badge ${isComplete ? 'complete' : 'pending'}">
                                    ${isComplete ? 'Complete' : 'Pending'}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    // Check if all items are fulfilled
    const allComplete = fulfillmentData.items.every(item => item.allocatedQty >= item.orderedQty);
    const shipBtn = document.getElementById('completeShipBtn');
    if (shipBtn) {
        shipBtn.disabled = !allComplete;
        shipBtn.style.opacity = allComplete ? '1' : '0.5';
    }
}

function renderAllocations() {
    const tbody = document.getElementById('allocationsTableBody');
    if (!fulfillmentData || !fulfillmentData.allocations || fulfillmentData.allocations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.6;">No allocations yet</td></tr>';
        return;
    }

    // Need product names - find from items
    const productNames = {};
    if (fulfillmentData.items) {
        fulfillmentData.items.forEach(item => {
            productNames[item.productId] = item.productName;
        });
    }

    tbody.innerHTML = fulfillmentData.allocations.map(alloc => `
        <tr>
            <td>${productNames[alloc.productId] || `Product #${alloc.productId}`}</td>
            <td>${alloc.warehouseName}</td>
            <td>${alloc.quantityAllocated}</td>
            <td>${alloc.fulfilledAt || '-'}</td>
        </tr>
    `).join('');
}

function populateProductDropdown() {
    const select = document.getElementById('allocateProduct');
    select.innerHTML = '<option value="">Select product...</option>';

    if (!fulfillmentData || !fulfillmentData.items) return;

    // Only show products that still need allocation
    fulfillmentData.items.forEach(item => {
        if (item.allocatedQty < item.orderedQty) {
            const remaining = item.orderedQty - item.allocatedQty;
            select.innerHTML += `<option value="${item.productId}" data-remaining="${remaining}">${item.productName} (need ${remaining} more)</option>`;
        }
    });
}

function loadWarehousesForProduct() {
    const productId = document.getElementById('allocateProduct').value;
    const warehouseSelect = document.getElementById('allocateWarehouse');
    warehouseSelect.innerHTML = '<option value="">Select warehouse...</option>';

    if (!productId) return;

    // Find warehouses with this product in stock
    const productData = availableInventoryData.find(p => p.productId == productId);
    if (productData && productData.warehouses) {
        productData.warehouses.forEach(wh => {
            warehouseSelect.innerHTML += `<option value="${wh.warehouseId}">${wh.warehouseName} (${wh.quantityOnHand} available)</option>`;
        });
    }
}

async function allocateInventory() {
    const productId = document.getElementById('allocateProduct').value;
    const warehouseId = document.getElementById('allocateWarehouse').value;
    const quantity = parseInt(document.getElementById('allocateQty').value);

    if (!productId || !warehouseId || !quantity || quantity < 1) {
        showNotification('Please select product, warehouse, and quantity', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/manager/orders/${currentOrderId}/fulfillment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, warehouseId, quantity })
        });

        if (res.ok) {
            showNotification('Inventory allocated successfully');
            // Reload fulfillment data
            openFulfillmentModal(currentOrderId);
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to allocate', 'error');
        }
    } catch (e) {
        console.error('Error allocating:', e);
        showNotification('Error allocating inventory', 'error');
    }
}

async function completeShipment() {
    if (!confirm('Mark this order as shipped? Ensure all items are allocated.')) return;

    try {
        const res = await fetch(`/api/manager/orders/${currentOrderId}/ship`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (res.ok) {
            showNotification('Order marked as shipped!');
            closeFulfillmentModal();
            loadOrders();
        } else {
            const error = await res.json();
            showNotification(error.error || 'Failed to complete shipment', 'error');
        }
    } catch (e) {
        console.error('Error completing shipment:', e);
        showNotification('Error completing shipment', 'error');
    }
}
