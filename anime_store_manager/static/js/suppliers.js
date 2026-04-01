const API_URL = '/api/manager/suppliers';
const API_PO = '/api/manager/purchase-orders';
const API_WAREHOUSES = '/api/manager/warehouses';

let suppliersData = [];
let purchaseOrdersData = [];
let catalogData = [];
let warehousesData = [];
let selectedSupplierId = null;
let poItems = []; // Items to add to purchase order

document.addEventListener('DOMContentLoaded', function () {
    // Explicit Button Binding
    const addSupplierBtn = document.getElementById('addSupplierBtn');
    if (addSupplierBtn) {
        addSupplierBtn.addEventListener('click', function () {
            const modal = document.getElementById('supplierModal');
            if (modal) {
                modal.classList.add('active');
                document.getElementById('supplierForm').reset();
            }
        });
    }

    // Add Catalog Item Button
    const addCatalogItemBtn = document.getElementById('addCatalogItemBtn');
    if (addCatalogItemBtn) {
        addCatalogItemBtn.addEventListener('click', openCatalogModal);
    }

    // Create PO Button
    const createPOBtn = document.getElementById('createPOBtn');
    if (createPOBtn) {
        createPOBtn.addEventListener('click', openPOModal);
    }

    // PO Supplier change handler
    const poSupplier = document.getElementById('poSupplier');
    if (poSupplier) {
        poSupplier.addEventListener('change', handlePOSupplierChange);
    }

    // PO Product select change handler (to prefill price)
    const poProductSelect = document.getElementById('poProductSelect');
    if (poProductSelect) {
        poProductSelect.addEventListener('change', handlePOProductChange);
    }

    loadSuppliers();
    loadPurchaseOrders();
    loadWarehouses();
    initializeForm();
    initializeCatalogForm();
    initializePOForm();
    initializeReceivePOForm();
});

async function loadSuppliers() {
    try {
        const res = await fetch(API_URL);
        suppliersData = await res.json();
        
        // Load catalog counts for each supplier
        for (let supplier of suppliersData) {
            try {
                const catalogRes = await fetch(`${API_URL}/${supplier.supplierId}/catalog`);
                const catalog = await catalogRes.json();
                supplier.catalogCount = catalog.length;
            } catch (e) {
                supplier.catalogCount = 0;
            }
        }
        
        renderSuppliers(suppliersData);
        populateSupplierDropdowns();
        calculateStats();
    } catch (e) { console.error(e); }
}

async function loadPurchaseOrders() {
    try {
        const res = await fetch(API_PO);
        purchaseOrdersData = await res.json();
        renderPurchaseOrders(purchaseOrdersData);
        document.getElementById('totalPurchaseOrders').textContent = purchaseOrdersData.length;
    } catch (e) { console.error(e); }
}

async function loadWarehouses() {
    try {
        const res = await fetch(API_WAREHOUSES);
        warehousesData = await res.json();
        populateWarehouseDropdown();
    } catch (e) { console.error(e); }
}

function populateSupplierDropdowns() {
    const poSupplier = document.getElementById('poSupplier');
    if (poSupplier) {
        poSupplier.innerHTML = '<option value="">Select Supplier</option>' +
            suppliersData.map(s => `<option value="${s.supplierId}">${s.name}</option>`).join('');
    }
}

// Get current user role and accountId from sessionStorage
function getUserRole() {
    return sessionStorage.getItem('role') || 'Employee';
}

function getUserAccountId() {
    const id = sessionStorage.getItem('accountId');
    return id ? parseInt(id) : null;
}

function populateWarehouseDropdown() {
    const receiveWarehouse = document.getElementById('receiveWarehouse');
    if (receiveWarehouse) {
        const userRole = getUserRole();
        const userId = getUserAccountId();
        
        // Filter warehouses: Manager sees all, Employee only sees assigned warehouses
        let filteredWarehouses = warehousesData;
        if (userRole !== 'Manager' && userId) {
            filteredWarehouses = warehousesData.filter(w => w.managerStaffId === userId);
        }
        
        receiveWarehouse.innerHTML = '<option value="">Select Warehouse</option>' +
            filteredWarehouses.map(w => `<option value="${w.warehouseId}">${w.name}</option>`).join('');
    }
}

function renderSuppliers(data) {
    const tbody = document.getElementById('suppliersTableBody');
    tbody.innerHTML = data.map(supplier => `
        <tr>
            <td><strong>${supplier.name}</strong></td>
            <td>${supplier.email}</td>
            <td>${supplier.address}</td>
            <td>
                <span class="stock-badge active">${supplier.catalogCount || 0} products</span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="openSupplierCatalog(${supplier.supplierId}, '${supplier.name.replace(/'/g, "\\'")}')">Manage Catalog</button>
                    <button class="btn-action btn-delete" onclick="deleteSupplier(${supplier.supplierId})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPurchaseOrders(data) {
    const tbody = document.getElementById('purchaseOrdersTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">No purchase orders found</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(po => {
        const statusClass = po.status === 'Received' ? 'active' : (po.status === 'Pending' ? 'low' : '');
        return `
        <tr>
            <td><strong>#${po.poId}</strong></td>
            <td>${po.supplierName}</td>
            <td>${po.orderDate || '-'}</td>
            <td>${po.expectedArrival || '-'}</td>
            <td>${po.itemCount} items</td>
            <td><strong>$${(Number(po.totalCost) || 0).toFixed(2)}</strong></td>
            <td><span class="stock-badge ${statusClass}">${po.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="viewPODetails(${po.poId})">View</button>
                    ${po.status !== 'Received' ? `<button class="btn-action btn-save" onclick="openReceivePOModal(${po.poId})">Receive</button>` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
}

function calculateStats() {
    if (document.getElementById('totalSuppliers'))
        document.getElementById('totalSuppliers').textContent = suppliersData.length;
}

function initializeForm() {
    const form = document.getElementById('supplierForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            name: document.getElementById('supplierName').value.trim(),
            email: document.getElementById('supplierEmail').value.trim(),
            address: document.getElementById('supplierAddress').value.trim()
        };

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                document.getElementById('supplierModal').classList.remove('active');
                form.reset();
                loadSuppliers();
                showNotification('Supplier added successfully!');
            } else {
                const error = await res.json();
                alert('Failed to add supplier: ' + (error.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
        }
    });
}

async function deleteSupplier(id) {
    if (!confirm('Delete supplier? This will also remove all catalog entries.')) return;
    try {
        const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadSuppliers();
            showNotification('Supplier deleted');
        } else {
            const err = await res.json();
            alert('Failed to delete: ' + (err.error || 'Unknown error'));
        }
    } catch (e) { console.error(e); }
}


// ============================
// SUPPLIER CATALOG FUNCTIONS
// ============================

async function openSupplierCatalog(supplierId, supplierName) {
    selectedSupplierId = supplierId;
    document.getElementById('selectedSupplierName').textContent = supplierName;
    document.getElementById('catalogSection').style.display = 'block';
    await loadCatalog(supplierId);
}

function closeCatalogSection() {
    document.getElementById('catalogSection').style.display = 'none';
    selectedSupplierId = null;
}

async function loadCatalog(supplierId) {
    try {
        const res = await fetch(`${API_URL}/${supplierId}/catalog`);
        catalogData = await res.json();
        renderCatalog(catalogData);
    } catch (e) { console.error(e); }
}

function renderCatalog(data) {
    const tbody = document.getElementById('catalogTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No products in catalog. Click "Add Product to Catalog" to add.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(item => `
        <tr>
            <td><strong>${item.productName}</strong></td>
            <td>${item.supplierSKU || '-'}</td>
            <td><strong>$${(Number(item.supplyPrice) || 0).toFixed(2)}</strong></td>
            <td>$${(Number(item.retailPrice) || 0).toFixed(2)}</td>
            <td>${item.leadTimeDays || '-'} days</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editCatalogItem(${item.productId}, '${(item.supplierSKU || '').replace(/'/g, "\\'")}', ${item.supplyPrice || 0}, ${item.leadTimeDays || 7})">Edit</button>
                    <button class="btn-action btn-delete" onclick="removeCatalogItem(${item.productId})">Remove</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function openCatalogModal() {
    if (!selectedSupplierId) {
        alert('Please select a supplier first');
        return;
    }
    
    // Load available products (not already in catalog)
    try {
        const res = await fetch(`${API_URL}/${selectedSupplierId}/available-products`);
        const products = await res.json();
        
        const select = document.getElementById('catalogProduct');
        select.innerHTML = '<option value="">Select Product</option>' +
            products.map(p => `<option value="${p.productId}">${p.name} ($${p.unitPrice})</option>`).join('');
        select.disabled = false;
        
        document.getElementById('catalogModalTitle').textContent = 'Add Product to Catalog';
        document.getElementById('catalogEditProductId').value = '';
        document.getElementById('catalogForm').reset();
        document.getElementById('catalogModal').classList.add('active');
    } catch (e) {
        console.error(e);
        alert('Error loading products');
    }
}

function editCatalogItem(productId, sku, price, leadTime) {
    document.getElementById('catalogModalTitle').textContent = 'Edit Catalog Entry';
    document.getElementById('catalogEditProductId').value = productId;
    
    // Disable product select and show current product
    const select = document.getElementById('catalogProduct');
    const currentItem = catalogData.find(c => c.productId === productId);
    select.innerHTML = `<option value="${productId}">${currentItem ? currentItem.productName : 'Product'}</option>`;
    select.disabled = true;
    
    document.getElementById('catalogSKU').value = sku;
    document.getElementById('catalogPrice').value = price;
    document.getElementById('catalogLeadTime').value = leadTime;
    document.getElementById('catalogModal').classList.add('active');
}

function initializeCatalogForm() {
    const form = document.getElementById('catalogForm');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const editProductId = document.getElementById('catalogEditProductId').value;
        const productId = editProductId || document.getElementById('catalogProduct').value;
        const payload = {
            productId: parseInt(productId),
            supplierSKU: document.getElementById('catalogSKU').value.trim(),
            supplyPrice: parseFloat(document.getElementById('catalogPrice').value),
            leadTimeDays: parseInt(document.getElementById('catalogLeadTime').value) || 7
        };
        
        try {
            const isEdit = !!editProductId;
            const url = isEdit 
                ? `${API_URL}/${selectedSupplierId}/catalog/${productId}`
                : `${API_URL}/${selectedSupplierId}/catalog`;
            
            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                closeCatalogModal();
                await loadCatalog(selectedSupplierId);
                loadSuppliers(); // Refresh catalog count
                showNotification(isEdit ? 'Catalog entry updated!' : 'Product added to catalog!');
            } else {
                const err = await res.json();
                alert('Failed: ' + (err.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
        }
    });
}

async function removeCatalogItem(productId) {
    if (!confirm('Remove this product from supplier catalog?')) return;
    
    try {
        const res = await fetch(`${API_URL}/${selectedSupplierId}/catalog/${productId}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            await loadCatalog(selectedSupplierId);
            loadSuppliers();
            showNotification('Product removed from catalog');
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.error || 'Unknown error'));
        }
    } catch (e) { console.error(e); }
}

function closeCatalogModal() {
    document.getElementById('catalogModal').classList.remove('active');
    document.getElementById('catalogForm').reset();
}


// ============================
// PURCHASE ORDER FUNCTIONS
// ============================

function openPOModal() {
    poItems = [];
    document.getElementById('poForm').reset();
    document.getElementById('poCatalogSection').style.display = 'none';
    document.getElementById('poItemsTableBody').innerHTML = '<tr id="noItemsRow"><td colspan="6" style="text-align: center;">No items added yet</td></tr>';
    document.getElementById('poTotalCost').textContent = '$0.00';
    document.getElementById('poModal').classList.add('active');
}

function closePOModal() {
    document.getElementById('poModal').classList.remove('active');
    poItems = [];
}

async function handlePOSupplierChange(e) {
    const supplierId = e.target.value;
    const catalogSection = document.getElementById('poCatalogSection');
    const productSelect = document.getElementById('poProductSelect');
    
    if (!supplierId) {
        catalogSection.style.display = 'none';
        return;
    }
    
    // Load supplier catalog
    try {
        const res = await fetch(`${API_URL}/${supplierId}/catalog`);
        const catalog = await res.json();
        
        if (catalog.length === 0) {
            alert('This supplier has no products in their catalog. Add products to the catalog first.');
            catalogSection.style.display = 'none';
            return;
        }
        
        productSelect.innerHTML = '<option value="">Select Product</option>' +
            catalog.map(p => `<option value="${p.productId}" data-sku="${p.supplierSKU || ''}" data-price="${p.supplyPrice}">${p.productName} (SKU: ${p.supplierSKU || 'N/A'})</option>`).join('');
        
        catalogSection.style.display = 'block';
        
        // Clear previous items when changing supplier
        poItems = [];
        renderPOItems();
    } catch (e) {
        console.error(e);
        alert('Error loading catalog');
    }
}

function handlePOProductChange(e) {
    const option = e.target.options[e.target.selectedIndex];
    if (option && option.dataset.price) {
        document.getElementById('poUnitCost').value = option.dataset.price;
    }
}

function addPOItem() {
    const select = document.getElementById('poProductSelect');
    const productId = select.value;
    const quantity = parseInt(document.getElementById('poQuantity').value) || 1;
    const unitCost = parseFloat(document.getElementById('poUnitCost').value) || 0;
    
    if (!productId) {
        alert('Please select a product');
        return;
    }
    
    // Check if already added
    if (poItems.find(item => item.productId == productId)) {
        alert('Product already added to order');
        return;
    }
    
    const option = select.options[select.selectedIndex];
    poItems.push({
        productId: parseInt(productId),
        productName: option.text.split(' (SKU:')[0],
        sku: option.dataset.sku,
        quantity: quantity,
        unitCost: unitCost
    });
    
    renderPOItems();
    
    // Reset selection
    select.value = '';
    document.getElementById('poQuantity').value = 1;
    document.getElementById('poUnitCost').value = '';
}

function removePOItem(productId) {
    poItems = poItems.filter(item => item.productId !== productId);
    renderPOItems();
}

function renderPOItems() {
    const tbody = document.getElementById('poItemsTableBody');
    
    if (poItems.length === 0) {
        tbody.innerHTML = '<tr id="noItemsRow"><td colspan="6" style="text-align: center;">No items added yet</td></tr>';
        document.getElementById('poTotalCost').textContent = '$0.00';
        return;
    }
    
    let total = 0;
    tbody.innerHTML = poItems.map(item => {
        const lineTotal = item.quantity * item.unitCost;
        total += lineTotal;
        return `
        <tr>
            <td>${item.productName}</td>
            <td>${item.sku || '-'}</td>
            <td>${item.quantity}</td>
            <td>$${item.unitCost.toFixed(2)}</td>
            <td>$${lineTotal.toFixed(2)}</td>
            <td><button class="btn-action btn-delete" onclick="removePOItem(${item.productId})">Remove</button></td>
        </tr>
    `}).join('');
    
    document.getElementById('poTotalCost').textContent = `$${total.toFixed(2)}`;
}

function initializePOForm() {
    const form = document.getElementById('poForm');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (poItems.length === 0) {
            alert('Please add at least one item to the order');
            return;
        }
        
        const payload = {
            supplierId: parseInt(document.getElementById('poSupplier').value),
            expectedArrival: document.getElementById('poExpectedArrival').value || null,
            items: poItems.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                unitCost: item.unitCost
            }))
        };
        
        try {
            const res = await fetch(API_PO, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                closePOModal();
                loadPurchaseOrders();
                showNotification('Purchase order created!');
            } else {
                const err = await res.json();
                alert('Failed: ' + (err.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
        }
    });
}


// ============================
// RECEIVE PO FUNCTIONS
// ============================

function openReceivePOModal(poId) {
    document.getElementById('receivePOId').value = poId;
    document.getElementById('receivePOForm').reset();
    populateWarehouseDropdown();
    document.getElementById('receivePOModal').classList.add('active');
}

function closeReceivePOModal() {
    document.getElementById('receivePOModal').classList.remove('active');
}

function initializeReceivePOForm() {
    const form = document.getElementById('receivePOForm');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const poId = document.getElementById('receivePOId').value;
        const warehouseId = document.getElementById('receiveWarehouse').value;
        
        if (!warehouseId) {
            alert('Please select a warehouse');
            return;
        }
        
        try {
            const res = await fetch(`${API_PO}/${poId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Received',
                    warehouseId: parseInt(warehouseId)
                })
            });
            
            if (res.ok) {
                closeReceivePOModal();
                loadPurchaseOrders();
                showNotification('Inventory received successfully!');
            } else {
                const err = await res.json();
                alert('Failed: ' + (err.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
        }
    });
}


// ============================
// PO DETAILS
// ============================

async function viewPODetails(poId) {
    try {
        const res = await fetch(`${API_PO}/${poId}`);
        const po = await res.json();
        
        let itemsHtml = po.items.map(item => `
            <tr>
                <td>${item.productName}</td>
                <td>${item.supplierSKU || '-'}</td>
                <td>${item.quantityOrdered}</td>
                <td>$${(Number(item.unitCost) || 0).toFixed(2)}</td>
                <td>$${(Number(item.lineTotal) || 0).toFixed(2)}</td>
            </tr>
        `).join('');
        
        const total = po.items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0);
        
        document.getElementById('poDetailsContent').innerHTML = `
            <div style="margin-bottom: 20px;">
                <p><strong>PO #:</strong> ${po.poId}</p>
                <p><strong>Supplier:</strong> ${po.supplierName}</p>
                <p><strong>Order Date:</strong> ${po.orderDate || '-'}</p>
                <p><strong>Expected Arrival:</strong> ${po.expectedArrival || '-'}</p>
                <p><strong>Status:</strong> <span class="stock-badge ${po.status === 'Received' ? 'active' : 'low'}">${po.status}</span></p>
            </div>
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Unit Cost</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;"><strong>Total:</strong></td>
                        <td><strong>$${total.toFixed(2)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
        
        document.getElementById('poDetailsModal').classList.add('active');
    } catch (e) {
        console.error(e);
        alert('Error loading PO details');
    }
}

function closePODetailsModal() {
    document.getElementById('poDetailsModal').classList.remove('active');
}


// ============================
// GLOBAL EXPORTS
// ============================

window.openSupplierModal = function () {
    document.getElementById('supplierModal').classList.add('active');
};

window.closeSupplierModal = function () {
    document.getElementById('supplierModal').classList.remove('active');
    document.getElementById('supplierForm').reset();
};

window.deleteSupplier = deleteSupplier;
window.openSupplierCatalog = openSupplierCatalog;
window.closeCatalogSection = closeCatalogSection;
window.closeCatalogModal = closeCatalogModal;
window.editCatalogItem = editCatalogItem;
window.removeCatalogItem = removeCatalogItem;
window.closePOModal = closePOModal;
window.addPOItem = addPOItem;
window.removePOItem = removePOItem;
window.openReceivePOModal = openReceivePOModal;
window.closeReceivePOModal = closeReceivePOModal;
window.viewPODetails = viewPODetails;
window.closePODetailsModal = closePODetailsModal;

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 100px; right: 30px; background: linear-gradient(135deg, #e50914, #c40812); color: white; padding: 18px 30px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); z-index: 10000; font-weight: 600; font-size: 14px;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Profile Dropdown Toggle
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');

if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
        if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
            profileDropdown.classList.remove('active');
        }
    });
}
