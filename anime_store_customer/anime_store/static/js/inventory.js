// Inventory Management JavaScript - Fully Linked to Database
const API_INVENTORY = '/api/manager/inventory';
const API_STOCK_MOVE = '/api/manager/inventory/move';
const API_PRODUCTS = '/api/manager/products';
const API_CATEGORIES = '/api/manager/categories';
const API_WAREHOUSES = '/api/manager/warehouses';
const API_SUPPLIERS = '/api/manager/suppliers';

let inventoryData = [];
let categories = [];
let warehouses = [];
let suppliers = [];

let currentFilters = {
    categoryId: 'all',
    warehouseId: 'all',
    status: 'all',
    search: ''
};

let editingProductId = null;

// DOM
const stockModal = document.getElementById('stockModal');
const stockForm = document.getElementById('stockForm');
const productModal = document.getElementById('productModal');
const productForm = document.getElementById('productForm');

document.addEventListener('DOMContentLoaded', async function () {
    // Explicit Button Binding for Add Product
    const addProductBtn = document.getElementById('addProductBtn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', function () {
            console.log('Add Product Clicked via Listener');
            if (productModal) {
                productModal.classList.add('active');
                productForm.reset(); // Ensure clean form
            }
        });
    }

    // Manage Warehouses Button
    const manageWarehousesBtn = document.getElementById('manageWarehousesBtn');
    if (manageWarehousesBtn) {
        manageWarehousesBtn.addEventListener('click', openWarehouseListModal);
    }

    await Promise.all([
        loadCategories(),
        loadWarehouses(),
        loadSuppliers()
    ]);
    loadInventory();
    initializeFilters();
    initializeForms();
    initializeWarehouseForms();
});

// =======================
// FETCH DATA
// =======================
async function loadCategories() {
    try {
        const res = await fetch(API_CATEGORIES);
        categories = await res.json();
        populateDropdown('categoryFilter', categories, 'categoryId', 'name', 'All Categories');
        populateDropdown('productCategory', categories, 'categoryId', 'name', 'Select Category');
    } catch (e) { console.error('Error loading categories:', e); }
}

// Update loadWarehouses to populate the new dropdown
async function loadWarehouses() {
    try {
        const res = await fetch(API_WAREHOUSES);
        warehouses = await res.json();
        populateDropdown('warehouseFilter', warehouses, 'warehouseId', 'name', 'All Warehouses');
        populateDropdown('transferToWarehouse', warehouses, 'warehouseId', 'name', 'Select Destination');
        populateDropdown('productModalWarehouse', warehouses, 'warehouseId', 'name', 'Select Warehouse');
        document.getElementById('warehouseCount').textContent = warehouses.length;
    } catch (e) { console.error('Error loading warehouses:', e); }
}


async function loadSuppliers() {
    try {
        const res = await fetch(API_SUPPLIERS);
        suppliers = await res.json();
        populateDropdown('productSupplier', suppliers, 'supplierId', 'name', 'Select Supplier');
    } catch (e) { console.error('Error loading suppliers:', e); }
}

async function loadInventory() {
    try {
        const res = await fetch(API_INVENTORY);
        inventoryData = await res.json();
        renderTable(filterInventory());
        calculateStats();
    } catch (e) { console.error('Error loading inventory:', e); }
}

// =======================
// RENDER & FILTER
// =======================
function renderTable(data) {
    const tbody = document.getElementById('inventoryTableBody');
    const productCount = document.getElementById('productCount');

    if (productCount) productCount.textContent = data.length;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No products found</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(p => `
        <tr>
            <td class="product-name-cell">${p.product_name}</td>
            <td>${getCategoryName(p.categoryId)}</td>
            <td><strong>$${(Number(p.unitPrice) || 0).toFixed(2)}</strong></td>
            <td><strong>${p.quantityOnHand}</strong></td>
            <td>${p.warehouse_name}</td>
            <td><span class="stock-badge ${p.status === 'Low Stock' || p.status === 'Out of Stock' ? 'low' : 'active'}">${p.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="openStockModal(${p.productId}, ${p.warehouseId}, '${p.product_name}')">Edit Stock</button>
                    <button class="btn-action btn-delete" onclick="deleteProduct(${p.productId})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterInventory() {
    let filtered = [...inventoryData];

    if (currentFilters.categoryId !== 'all') {
        filtered = filtered.filter(p => p.categoryId == currentFilters.categoryId);
    }
    if (currentFilters.warehouseId !== 'all') {
        filtered = filtered.filter(p => p.warehouseId == currentFilters.warehouseId);
    }
    if (currentFilters.status !== 'all') {
        filtered = filtered.filter(p => p.status === currentFilters.status);
    }
    if (currentFilters.search) {
        const search = currentFilters.search.toLowerCase();
        filtered = filtered.filter(p =>
            p.product_name.toLowerCase().includes(search) ||
            (p.sku && p.sku.toLowerCase().includes(search))
        );
    }
    return filtered;
}

// =======================
// ACTIONS
// =======================
function initializeForms() {
    // Product Form (Create)
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                name: document.getElementById('productName').value.trim(),
                categoryId: parseInt(document.getElementById('productCategory').value),
                unitPrice: parseFloat(document.getElementById('productPrice').value),
                description: document.getElementById('productDescription').value.trim(),
                productImage: document.getElementById('productImage').value.trim(),
                // Helper Fields for Initial Inventory (handled by backend transaction)
                quantity: parseInt(document.getElementById('productStock').value) || 0,
                warehouseId: parseInt(document.getElementById('productModalWarehouse').value) || null
            };

            try {
                const res = await fetch(API_PRODUCTS, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    if (window.closeProductModal) window.closeProductModal(); // Fallback if defined
                    if (productModal) productModal.classList.remove('active');
                    loadInventory();
                    waitAndShowAlert('Product created successfully!', 'success');
                } else {
                    const error = await res.json();
                    alert('Failed to create product: ' + (error.error || 'Unknown error'));
                }
            } catch (e) {
                console.error(e);
                alert('Error: ' + e.message);
            }
        });
    }

    // Stock Form
    if (stockForm) {
        stockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                productId: document.getElementById('stockProductId').value,
                warehouseId: document.getElementById('stockWarehouseId').value,
                qtyChange: document.getElementById('stockType').value === 'OUTBOUND' ?
                    -parseInt(document.getElementById('stockQuantity').value) :
                    parseInt(document.getElementById('stockQuantity').value),
                movementType: document.getElementById('stockType').value,
                staffId: 1,
                reason: document.getElementById('stockReason').value
            };

            try {
                const res = await fetch(API_STOCK_MOVE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    if (window.closeStockModal) window.closeStockModal();
                    if (stockModal) stockModal.classList.remove('active');
                    loadInventory();
                    waitAndShowAlert('Stock updated successfully', 'success');
                } else {
                    alert('Failed to update stock');
                }
            } catch (e) { console.error(e); }
        });
    }

    // Transfer Form
    const transferForm = document.getElementById('transferForm');
    if (transferForm) {
        transferForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                productId: document.getElementById('transferProductId').value,
                warehouseId: document.getElementById('transferFromWarehouse').value,
                toWarehouseId: document.getElementById('transferToWarehouse').value,
                qtyChange: parseInt(document.getElementById('transferQuantity').value),
                movementType: 'TRANSFER',
                staffId: 1,
                reason: 'Stock Transfer'
            };

            try {
                const res = await fetch(API_STOCK_MOVE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    if (window.closeTransferModal) window.closeTransferModal();
                    loadInventory();
                    waitAndShowAlert('Transfer successful', 'success');
                } else {
                    const err = await res.json();
                    alert('Transfer failed: ' + (err.error || 'Unknown error'));
                }
            } catch (e) { console.error(e); }
        });
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure? This will delete the product and all its inventory history permanently.')) return;
    try {
        const res = await fetch(`${API_PRODUCTS}/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            loadInventory();
            showNotification('Product deleted successfully');
        } else {
            alert('Delete failed: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Network error while deleting product');
    }
}

// =======================
// HELPERS
// =======================
function populateDropdown(id, data, valKey, textKey, defaultText) {
    const el = document.getElementById(id);
    if (!el) return;
    let html = `<option value="all">${defaultText}</option>`;
    if (id !== 'categoryFilter' && id !== 'warehouseFilter') {
        html = `<option value="">${defaultText}</option>`;
    }
    html += data.map(item => `<option value="${item[valKey]}">${item[textKey]}</option>`).join('');
    el.innerHTML = html;
}

function getCategoryName(id) {
    const cat = categories.find(c => c.categoryId == id);
    return cat ? cat.name : `Category ${id}`;
}

function calculateStats() {
    const totalProducts = inventoryData.length;
    const totalValue = inventoryData.reduce((sum, p) => sum + (p.unitPrice * p.quantityOnHand), 0);
    const lowStockCount = inventoryData.filter(p => p.status === 'Low Stock').length;

    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('totalValue').textContent = `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('lowStockCount').textContent = lowStockCount;
}

function initializeFilters() {
    document.getElementById('categoryFilter').addEventListener('change', (e) => { currentFilters.categoryId = e.target.value; renderTable(filterInventory()); });
    document.getElementById('warehouseFilter').addEventListener('change', (e) => { currentFilters.warehouseId = e.target.value; renderTable(filterInventory()); });
    document.getElementById('stockFilter').addEventListener('change', (e) => { currentFilters.status = e.target.value; renderTable(filterInventory()); });
    document.getElementById('searchInput').addEventListener('input', (e) => { currentFilters.search = e.target.value; renderTable(filterInventory()); });
    document.getElementById('resetFilters').addEventListener('click', () => {
        currentFilters = { categoryId: 'all', warehouseId: 'all', status: 'all', search: '' };
        document.getElementById('categoryFilter').value = 'all';
        document.getElementById('warehouseFilter').value = 'all';
        document.getElementById('stockFilter').value = 'all';
        document.getElementById('searchInput').value = '';
        renderTable(filterInventory());
    });
}

// Modal Handlers
window.openProductModal = function () { productModal.classList.add('active'); };
window.closeProductModal = function () { productModal.classList.remove('active'); productForm.reset(); };
window.openStockModal = function (productId, warehouseId, productName) {
    document.getElementById('stockProductId').value = productId;
    document.getElementById('stockWarehouseId').value = warehouseId;
    document.getElementById('stockProductName').value = productName;
    stockModal.classList.add('active');
};

window.openTransferModal = function () {
    const productId = document.getElementById('stockProductId').value;
    const fromWarehouse = document.getElementById('stockWarehouseId').value;
    const productName = document.getElementById('stockProductName').value;

    document.getElementById('transferProductId').value = productId;
    document.getElementById('transferFromWarehouse').value = fromWarehouse;
    document.getElementById('transferProductName').value = productName;

    stockModal.classList.remove('active');
    document.getElementById('transferModal').classList.add('active');
};

window.closeTransferModal = function () {
    document.getElementById('transferModal').classList.remove('active');
    document.getElementById('transferForm').reset();
};
window.closeStockModal = function () { stockModal.classList.remove('active'); stockForm.reset(); };
window.deleteProduct = deleteProduct;

// Category Modal Handlers
window.openCategoryModal = function () {
    const categoryModal = document.getElementById('categoryModal');
    if (categoryModal) {
        categoryModal.classList.add('active');
        document.getElementById('categoryForm').reset();
    }
};

window.closeCategoryModal = function () {
    const categoryModal = document.getElementById('categoryModal');
    if (categoryModal) {
        categoryModal.classList.remove('active');
        document.getElementById('categoryForm').reset();
    }
};

// Initialize Add Category Button
(function initCategoryButton() {
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', function () {
            console.log('Add Category Clicked');
            window.openCategoryModal();
        });
    }
    
    // Category Form Submit
    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            
            const name = document.getElementById('categoryName').value.trim();
            const description = document.getElementById('categoryDescription').value.trim();
            
            if (!name) {
                alert('Category name is required');
                return;
            }
            
            try {
                const response = await fetch('/api/manager/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showNotification('Category added successfully!');
                    window.closeCategoryModal();
                    await loadCategories(); // Reload categories dropdown
                } else {
                    alert(data.error || 'Failed to add category');
                }
            } catch (error) {
                console.error('Error adding category:', error);
                alert('Error adding category');
            }
        });
    }
})();

// ============================
// WAREHOUSE MANAGEMENT
// ============================

async function openWarehouseListModal() {
    document.getElementById('warehouseListModal').classList.add('active');
    await loadWarehousesList();
}

function closeWarehouseListModal() {
    document.getElementById('warehouseListModal').classList.remove('active');
}

function openWarehouseModal(warehouseId = null) {
    const modal = document.getElementById('warehouseModal');
    const form = document.getElementById('warehouseForm');
    
    if (warehouseId) {
        // Edit mode
        const warehouse = warehouses.find(w => w.warehouseId === warehouseId);
        if (warehouse) {
            document.getElementById('warehouseModalTitle').textContent = 'Edit Warehouse';
            document.getElementById('warehouseId').value = warehouseId;
            document.getElementById('warehouseName').value = warehouse.name;
            document.getElementById('warehouseLocation').value = warehouse.location;
        }
    } else {
        // Add mode
        document.getElementById('warehouseModalTitle').textContent = 'Add New Warehouse';
        form.reset();
    }
    
    modal.classList.add('active');
}

function closeWarehouseModal() {
    document.getElementById('warehouseModal').classList.remove('active');
    document.getElementById('warehouseForm').reset();
}

async function loadWarehousesList() {
    try {
        const res = await fetch(API_WAREHOUSES);
        const warehousesData = await res.json();
        
        const tbody = document.getElementById('warehouseListTableBody');
        
        if (warehousesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No warehouses found. Create one to get started.</td></tr>';
            return;
        }
        
        tbody.innerHTML = warehousesData.map(w => `
            <tr>
                <td><strong>${w.name}</strong></td>
                <td>${w.location}</td>
                <td>${w.productCount || 0} products</td>
                <td>${w.totalStock || 0} units</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-edit" onclick="openWarehouseModal(${w.warehouseId})">Edit</button>
                        <button class="btn-action btn-delete" onclick="deleteWarehouse(${w.warehouseId})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Error loading warehouses:', e);
    }
}

function initializeWarehouseForms() {
    const warehouseForm = document.getElementById('warehouseForm');
    if (!warehouseForm) return;
    
    warehouseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const warehouseId = document.getElementById('warehouseId').value;
        const name = document.getElementById('warehouseName').value.trim();
        const location = document.getElementById('warehouseLocation').value.trim();
        
        if (!name || !location) {
            alert('Name and location are required');
            return;
        }
        
        try {
            const isEdit = !!warehouseId;
            const url = isEdit ? `${API_WAREHOUSES}/${warehouseId}` : API_WAREHOUSES;
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, location })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showNotification(isEdit ? 'Warehouse updated!' : 'Warehouse created!');
                closeWarehouseModal();
                await loadWarehouses(); // Reload dropdowns
                await loadWarehousesList(); // Reload list
            } else {
                alert(data.error || 'Failed to save warehouse');
            }
        } catch (error) {
            console.error('Error saving warehouse:', error);
            alert('Error saving warehouse');
        }
    });
}

async function deleteWarehouse(warehouseId) {
    if (!confirm('Delete this warehouse? This will fail if it has existing inventory.')) return;
    
    try {
        const response = await fetch(`${API_WAREHOUSES}/${warehouseId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Warehouse deleted');
            await loadWarehouses();
            await loadWarehousesList();
        } else {
            alert(data.error || 'Failed to delete warehouse');
        }
    } catch (error) {
        console.error('Error deleting warehouse:', error);
        alert('Error deleting warehouse');
    }
}

// Global exports for warehouse management
window.openWarehouseListModal = openWarehouseListModal;
window.closeWarehouseListModal = closeWarehouseListModal;
window.openWarehouseModal = openWarehouseModal;
window.closeWarehouseModal = closeWarehouseModal;
window.deleteWarehouse = deleteWarehouse;

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 100px; right: 30px; background: linear-gradient(135deg, #e50914, #c40812); color: white; padding: 18px 30px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); z-index: 10000; font-weight: 600; font-size: 14px; animation: slideInRight 0.3s ease, slideOutRight 0.3s ease 2.7s;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
