// Manager Dashboard JavaScript - Powered by Real Database Queries

// ============================================
// API ENDPOINTS
// ============================================
const API_BASE = '/api/manager/dashboard';

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    loadDashboard();
    initializePeriodSelector();
});

// ============================================
// Main Load Function
// ============================================
async function loadDashboard() {
    try {
        await Promise.all([
            fetchStats(),
            fetchTopProducts(),
            fetchRecentOrders(),
            fetchCategoryRevenue(),
            fetchLowStock()
        ]);
        showNotification('Dashboard updated');
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading data', 'error');
    }
}

// 1. Fetch Key Stats
async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();

        updateMetric('totalRevenue', data.total_revenue, true);
        updateMetric('totalOrders', data.total_orders);
        updateMetric('inventoryValue', data.inventory_value, true);
        updateMetric('activeCustomers', data.active_customers);

        // Use inventory count for the subtitle
        document.getElementById('inventoryChange').textContent = `${data.inventory_count} items`;

    } catch (e) { console.error('Stats error:', e); }
}

// 2. Fetch Top Products
async function fetchTopProducts() {
    try {
        const response = await fetch(`${API_BASE}/top-products`);
        const products = await response.json();

        const container = document.getElementById('topProducts');
        container.innerHTML = products.map((p, index) => `
            <div class="product-item">
                <img src="${p.image || '/static/images/placeholder.png'}" 
                     onerror="this.src='/static/images/placeholder.png'" 
                     alt="${p.name}" class="product-image">
                <div class="product-info">
                    <div class="product-name">${index + 1}. ${p.name}</div>
                    <div class="product-sales">${p.sales} units sold</div>
                </div>
                <div class="product-revenue">$${p.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
        `).join('');
    } catch (e) { console.error('Top products error:', e); }
}

// 3. Fetch Recent Orders
async function fetchRecentOrders() {
    try {
        const response = await fetch(`${API_BASE}/recent-orders`);
        const orders = await response.json();

        const tbody = document.getElementById('recentOrdersTable');
        tbody.innerHTML = orders.map(order => `
            <tr>
                <td><strong>#${order.orderId}</strong></td>
                <td>${order.customer}</td>
                <td><strong>$${order.amount.toFixed(2)}</strong></td>
                <td><span class="order-status ${order.status.toLowerCase()}">${order.status}</span></td>
                <td>${order.date}</td>
            </tr>
        `).join('');
    } catch (e) { console.error('Recent orders error:', e); }
}

// 4. Fetch Category Revenue
async function fetchCategoryRevenue() {
    try {
        const response = await fetch(`${API_BASE}/category-revenue`);
        const categories = await response.json();
        const container = document.getElementById('categoryRevenue');

        const total = categories.reduce((sum, cat) => sum + cat.amount, 0);

        container.innerHTML = categories.map(cat => {
            const percentage = total > 0 ? ((cat.amount / total) * 100).toFixed(1) : 0;
            return `
                <div class="category-item">
                    <div>
                        <div class="category-name">${cat.name}</div>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px;">${percentage}% of total</div>
                    </div>
                    <div class="category-amount">$${cat.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error('Category revenue error:', e); }
}

// 5. Fetch Low Stock
async function fetchLowStock() {
    try {
        const response = await fetch(`${API_BASE}/low-stock`);
        const alerts = await response.json();

        const container = document.getElementById('lowStockAlerts');
        const alertCount = document.getElementById('alertCount');

        alertCount.textContent = alerts.length;

        if (alerts.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#666">No low stock alerts</div>';
            return;
        }

        container.innerHTML = alerts.map(alert => `
            <div class="alert-item">
                <div class="alert-info">
                    <h4>${alert.product}</h4>
                    <p>${alert.warehouse}</p>
                </div>
                <div class="alert-stock">${alert.stock} left</div>
            </div>
        `).join('');
    } catch (e) { console.error('Low stock error:', e); }
}

// Helper: Update Metric Card
function updateMetric(id, value, isCurrency = false) {
    const el = document.getElementById(id);
    if (!el) return;

    if (isCurrency) {
        el.textContent = `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else {
        el.textContent = value || 0;
    }
}

// Unchanged Helper Functions
function initializePeriodSelector() {
    const selector = document.getElementById('periodSelector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            loadDashboard(); // Reload data
        });
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 30px;
        background: ${type === 'error' ? '#e50914' : 'linear-gradient(135deg, #e50914, #c40812)'};
        color: white;
        padding: 18px 30px;
        border-radius: 15px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
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
