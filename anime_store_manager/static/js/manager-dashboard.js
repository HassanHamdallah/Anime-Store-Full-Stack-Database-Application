// Manager Dashboard JavaScript - Powered by Real Database Queries

// ============================================
// API ENDPOINTS
// ============================================
const API_BASE = '/api/manager/dashboard';
const API_ANALYTICS = '/api/manager/analytics';

// Get selected period from pie chart dropdown
function getChartPeriod() {
    const selector = document.getElementById('chartPeriodSelector');
    return selector ? selector.value : 'month';
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    loadDashboard();
    initializeChartPeriodSelector();
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
            fetchLowStock(),
            fetchSalesChart(getChartPeriod()),
            fetchTotalProfit(),
            fetchTopCustomers(),
            fetchProductPerformance(),
            fetchYearlySalesChart()
        ]);
        showNotification('Dashboard updated');
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading data', 'error');
    }
}

// 1. Fetch Key Stats (no period filter)
async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();

        updateMetric('totalRevenue', data.total_revenue, true);
        updateMetric('totalOrders', data.total_orders);
        updateMetric('inventoryValue', data.inventory_value, true);
        updateMetric('pendingOrders', data.pending_orders);

        // Use inventory count for the subtitle
        document.getElementById('inventoryChange').textContent = `${data.inventory_count} items`;

    } catch (e) { console.error('Stats error:', e); }
}

// 2. Fetch Top Products (no period filter)
async function fetchTopProducts() {
    try {
        const response = await fetch(`${API_BASE}/top-products`);
        const products = await response.json();

        const container = document.getElementById('topProducts');
        container.innerHTML = products.map((p, index) => `
            <div class="product-item">
                <img src="${p.image || '/static/images/placeholder.jpg'}" 
                     onerror="this.src='/static/images/placeholder.jpg'" 
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

// 3. Fetch Recent Orders (no period filter)
async function fetchRecentOrders() {
    try {
        const response = await fetch(`${API_BASE}/recent-orders`);
        const orders = await response.json();

        const tbody = document.getElementById('recentOrdersTable');
        tbody.innerHTML = orders.map(order => {
            // Determine status badge class (same as orders page)
            let statusClass = 'pending';
            let statusDisplay = order.status;
            if (order.status === 'Paid' || order.status === 'New Order (Paid)') {
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
            }
            
            return `
                <tr>
                    <td><strong>#${order.orderId}</strong></td>
                    <td>${order.customer}</td>
                    <td><strong>$${order.amount ? order.amount.toFixed(2) : '0.00'}</strong></td>
                    <td>
                        <span class="status-badge ${statusClass}">${statusDisplay}</span>
                    </td>
                    <td>${order.date}</td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error('Recent orders error:', e); }
}

// 4. Fetch Category Revenue (no period filter)
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
                    <div class="category-info">
                        <div class="category-header">
                            <div class="category-name">${cat.name}</div>
                            <div class="category-amount">$${cat.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div class="category-progress-bar">
                            <div class="category-progress-fill" style="width: ${percentage}%"></div>
                        </div>
                        <div class="category-percentage">${percentage}% of total revenue</div>
                    </div>
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

// 6. Fetch and Render Order Status Chart (Pie Chart)
let salesChartInstance = null;

// Status color and style mapping to match UI badge colors
const STATUS_STYLES = {
    'Delivered': { bg: 'rgba(0, 255, 135, 0.15)', color: '#00ff87', border: 'rgba(0, 255, 135, 0.3)' },
    'Shipped': { bg: 'rgba(138, 43, 226, 0.15)', color: '#8a2be2', border: 'rgba(138, 43, 226, 0.3)' },
    'Processing': { bg: 'rgba(0, 217, 255, 0.15)', color: '#00d9ff', border: 'rgba(0, 217, 255, 0.3)' },
    'New Order (Paid)': { bg: 'rgba(0, 200, 83, 0.15)', color: '#00c853', border: 'rgba(0, 200, 83, 0.3)' },
    'Cancelled': { bg: 'rgba(229, 9, 20, 0.15)', color: '#e50914', border: 'rgba(229, 9, 20, 0.3)' }
};

// Solid colors for pie chart slices
const STATUS_COLORS = {
    'Delivered': 'rgba(0, 255, 135, 0.9)',
    'Shipped': 'rgba(138, 43, 226, 0.9)',
    'Processing': 'rgba(0, 217, 255, 0.9)',
    'New Order (Paid)': 'rgba(0, 200, 83, 0.9)',
    'Cancelled': 'rgba(229, 9, 20, 0.9)'
};

// Map period dropdown value to API range parameter
function mapPeriodToRange(period) {
    switch(period) {
        case 'today': return 'today';
        case 'week': return 'last7';
        case 'month': return 'last30';
        case 'year': return 'last365';
        default: return 'last30';
    }
}

// Generate custom HTML legend with badge styling
function generateStatusLegend(data, total) {
    const legendContainer = document.getElementById('statusChartLegend');
    if (!legendContainer) return;
    
    legendContainer.innerHTML = data.map(item => {
        const style = STATUS_STYLES[item.label] || { bg: 'rgba(128,128,128,0.15)', color: '#888', border: 'rgba(128,128,128,0.3)' };
        const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
        return `
            <div class="legend-badge" style="
                background: ${style.bg};
                color: ${style.color};
                border: 1px solid ${style.border};
                padding: 8px 14px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
                display: inline-block;
                text-align: center;
            ">${item.label} (${percentage}%)</div>
        `;
    }).join('');
}

async function fetchSalesChart(period) {
    try {
        const range = mapPeriodToRange(period);
        const response = await fetch(`/api/manager/analytics/order-status?range=${range}`);
        const statusData = await response.json();

        const canvas = document.getElementById('salesChartCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Destroy previous chart if exists
        if (salesChartInstance) {
            salesChartInstance.destroy();
        }

        // Filter out statuses with 0 count for cleaner chart
        const filteredData = statusData.filter(s => s.value > 0);
        const total = filteredData.reduce((sum, s) => sum + s.value, 0);
        
        // Generate custom HTML legend
        generateStatusLegend(filteredData, total);
        
        // Get colors in order of the data
        const backgroundColors = filteredData.map(s => STATUS_COLORS[s.label] || 'rgba(128, 128, 128, 0.9)');

        // Create new chart (without built-in legend)
        salesChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: filteredData.map(s => s.label),
                datasets: [{
                    label: 'Orders',
                    data: filteredData.map(s => s.value),
                    backgroundColor: backgroundColors,
                    borderColor: 'rgba(0, 0, 0, 0.8)',
                    borderWidth: 2,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false  // Disable default legend, using custom HTML
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        padding: 12,
                        borderColor: 'rgba(229, 9, 20, 0.5)',
                        borderWidth: 1,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} orders (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

    } catch (e) {
        console.error('Order status chart error:', e);
    }
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

// Initialize chart period selector only
function initializeChartPeriodSelector() {
    const selector = document.getElementById('chartPeriodSelector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            fetchSalesChart(e.target.value); // Only reload the pie chart
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

// Refresh Dashboard Function (called by refresh button)
function refreshDashboard() {
    showNotification('Refreshing dashboard...');
    loadDashboard();
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

// Profile Dropdown Toggle
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');

if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
            profileDropdown.classList.remove('active');
        }
    });
}

// ============================================
// ANALYTICS FUNCTIONS (merged from analytics.js)
// ============================================

// Fetch Total Profit
async function fetchTotalProfit() {
    try {
        const res = await fetch(`${API_ANALYTICS}/overview`);
        const data = await res.json();
        const profitEl = document.getElementById('totalProfit');
        if (profitEl) {
            profitEl.textContent = `$${data.total_profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }
    } catch (e) { console.error('Total profit error:', e); }
}

// Fetch Top Customers
async function fetchTopCustomers() {
    try {
        const res = await fetch(`${API_ANALYTICS}/top-customers`);
        const customers = await res.json();

        const tbody = document.getElementById('topCustomersTable');
        if (!tbody) return;
        
        tbody.innerHTML = customers.map((c, index) => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 12px; color: #e50914;"><strong>#${index + 1}</strong></td>
                <td style="padding: 12px;"><strong>${c.name}</strong></td>
                <td style="padding: 12px;">${c.orders} orders</td>
                <td style="padding: 12px; color: #00ff87;"><strong>$${c.revenue.toFixed(2)}</strong></td>
            </tr>
        `).join('');
    } catch (e) { console.error('Top customers error:', e); }
}

// Fetch Product Performance
async function fetchProductPerformance() {
    try {
        const res = await fetch(`${API_ANALYTICS}/product-performance`);
        const products = await res.json();

        const tbody = document.getElementById('productPerformanceTable');
        if (!tbody) return;
        
        tbody.innerHTML = products.map((p, index) => {
            const profitMargin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0;
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px; color: #e50914;"><strong>#${index + 1}</strong></td>
                    <td style="padding: 12px;"><strong>${p.product}</strong></td>
                    <td style="padding: 12px;">${p.sold} units</td>
                    <td style="padding: 12px;"><strong>$${p.revenue.toFixed(2)}</strong></td>
                    <td style="padding: 12px; color: #00ff87;"><strong>$${p.profit.toFixed(2)}</strong></td>
                    <td style="padding: 12px;"><strong>${profitMargin}%</strong></td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error('Product performance error:', e); }
}

// ============================================
// Yearly Sales Chart (Last 12 Months - Static)
// ============================================
let yearlySalesChart = null;

async function fetchYearlySalesChart() {
    try {
        const res = await fetch(`${API_ANALYTICS}/yearly-sales`);
        const data = await res.json();

        const canvas = document.getElementById('yearlySalesCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if any
        if (yearlySalesChart) {
            yearlySalesChart.destroy();
        }

        yearlySalesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Monthly Sales ($)',
                    data: data.values || [],
                    backgroundColor: 'rgba(229, 9, 20, 0.8)',
                    borderColor: '#e50914',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: '#e50914'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#00ff87',
                        borderColor: '#e50914',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Sales: $${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#888'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#888',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    } catch (e) { 
        console.error('Yearly sales chart error:', e); 
    }
}
