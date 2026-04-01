// Analytics JavaScript - Powered by Database
const API_ANALYTICS = '/api/manager/analytics';
const API_DASHBOARD = '/api/manager/dashboard'; // For category revenue reuse

document.addEventListener('DOMContentLoaded', function () {
    loadAnalytics();
});

async function loadAnalytics() {
    try {
        await Promise.all([
            fetchOverview(),
            fetchSalesTrends(),
            fetchCategoryRevenue(),
            fetchTopCustomers(),
            fetchProductPerformance()
        ]);
        showNotification('Analytics updated');
    } catch (e) { console.error('Error loading analytics:', e); }
}

async function fetchOverview() {
    try {
        const res = await fetch(`${API_ANALYTICS}/overview`);
        const data = await res.json();

        document.getElementById('totalRevenue').textContent = `$${data.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        document.getElementById('totalOrders').textContent = data.total_orders;
        document.getElementById('avgOrderValue').textContent = `$${data.avg_order_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        document.getElementById('totalProfit').textContent = `$${data.total_profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } catch (e) { console.error(e); }
}

async function fetchSalesTrends() {
    try {
        const res = await fetch(`${API_ANALYTICS}/sales-trends`);
        const trends = await res.json();

        const container = document.getElementById('salesTrendsChart');
        if (trends.length === 0) {
            container.innerHTML = '<div style="color:#aaa; text-align:center;">No sales data available</div>';
            return;
        }

        const maxSales = Math.max(...trends.map(d => d.sales));

        container.innerHTML = trends.map(data => {
            const height = maxSales > 0 ? (data.sales / maxSales) * 100 : 0;
            return `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    <div style="font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 600;">$${(data.sales / 1000).toFixed(1)}k</div>
                    <div style="width: 100%; height: 250px; display: flex; align-items: flex-end; justify-content: center;">
                        <div style="width: 70%; height: ${height}%; background: linear-gradient(180deg, #e50914, #c40812); border-radius: 8px 8px 0 0; transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='scaleY(1.05)'" onmouseout="this.style.transform='scaleY(1)'"></div>
                    </div>
                    <div style="font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 600;">${data.month_name}</div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.5);">${data.orders} orders</div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); }
}

// Reusing the endpoint from Dashboard for consistency
async function fetchCategoryRevenue() {
    try {
        const res = await fetch(`${API_DASHBOARD}/category-revenue`);
        const categories = await res.json();

        const container = document.getElementById('categoryRevenueChart');
        const total = categories.reduce((sum, cat) => sum + cat.amount, 0);

        container.innerHTML = categories.map(cat => {
            const percentage = total > 0 ? ((cat.amount / total) * 100).toFixed(1) : 0;
            return `
                <div class="category-revenue-item">
                    <div class="category-revenue-header">
                        <span class="category-name">${cat.name}</span>
                        <span class="category-revenue">$${cat.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div class="category-progress-bar">
                        <div class="category-progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="category-percentage">${percentage}% of total revenue</div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); }
}

async function fetchTopCustomers() {
    try {
        const res = await fetch(`${API_ANALYTICS}/top-customers`);
        const customers = await res.json();

        const tbody = document.getElementById('topCustomersTable');
        tbody.innerHTML = customers.map((c, index) => `
            <tr>
                <td><strong>#${index + 1}</strong></td>
                <td><strong>${c.name}</strong></td>
                <td>${c.orders} orders</td>
                <td><strong>$${c.revenue.toFixed(2)}</strong></td>
                <td><strong>$${(c.revenue / c.orders).toFixed(2)}</strong></td>
            </tr>
        `).join('');
    } catch (e) { console.error(e); }
}

async function fetchProductPerformance() {
    try {
        const res = await fetch(`${API_ANALYTICS}/product-performance`);
        const products = await res.json();

        const tbody = document.getElementById('productPerformanceTable');
        tbody.innerHTML = products.map((p, index) => {
            const profitMargin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0;
            return `
                <tr>
                    <td><strong>#${index + 1}</strong></td>
                    <td><strong>${p.product}</strong></td>
                    <td>${p.sold} units</td>
                    <td><strong>$${p.revenue.toFixed(2)}</strong></td>
                    <td style="color: #00ff87;"><strong>$${p.profit.toFixed(2)}</strong></td>
                    <td><strong>${profitMargin}%</strong></td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error(e); }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 100px; right: 30px; background: linear-gradient(135deg, #e50914, #c40812); color: white; padding: 18px 30px; border-radius: 15px; box-shadow: 0 10px 40px rgba(229, 9, 20, 0.5); z-index: 10000; font-weight: 600; font-size: 14px;';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

