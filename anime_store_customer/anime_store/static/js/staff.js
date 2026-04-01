// Staff Management JavaScript - Linked to Database
const API_STAFF = '/api/manager/staff';
const API_WAREHOUSES = '/api/manager/warehouses';

let staffData = [];
let warehouses = [];
let currentFilters = { role: 'all', warehouseId: 'all', search: '' };
let editingStaffId = null;

document.addEventListener('DOMContentLoaded', async function () {
    // Explicit Button Binding
    const addStaffBtn = document.getElementById('addStaffBtn');
    if (addStaffBtn) {
        addStaffBtn.addEventListener('click', function () {
            const modal = document.getElementById('staffModal');
            if (modal) {
                modal.classList.add('active');
                document.getElementById('staffForm').reset();
                editingStaffId = null;
                populateManagerDropdown();
            }
        });
    }

    await loadWarehouses(); // Load warehouses first for mapping
    loadStaff();
    initializeFilters();
    initializeForm();
});

async function loadWarehouses() {
    try {
        const res = await fetch(API_WAREHOUSES);
        if (res.ok) {
            warehouses = await res.json();
            populateWarehouseDropdowns();
        }
    } catch (e) {
        console.error('Error loading warehouses:', e);
    }
}

async function loadStaff() {
    try {
        const res = await fetch(API_STAFF);
        if (res.ok) {
            staffData = await res.json();
            renderTable(filterStaff());
            calculateStats();
            populateManagerDropdown();
        }
    } catch (e) {
        console.error('Error loading staff:', e);
    }
}

function filterStaff() {
    let filtered = [...staffData];
    if (currentFilters.role !== 'all') filtered = filtered.filter(s => s.role === currentFilters.role);
    if (currentFilters.warehouseId !== 'all') filtered = filtered.filter(s => s.warehouseId == currentFilters.warehouseId);
    if (currentFilters.search) {
        const search = currentFilters.search.toLowerCase();
        filtered = filtered.filter(s =>
            s.username.toLowerCase().includes(search) || // API returns username
            s.email.toLowerCase().includes(search)
        );
    }
    return filtered;
}

function renderTable(data) {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No staff found</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(staff => `
        <tr>
            <td><strong>${staff.username}</strong></td> <!-- Using username as First Name for now -->
            <td><strong>-</strong></td> <!-- LastName not in simple schema -->
            <td>${staff.role}</td>
            <td>${getWarehouseName(staff.warehouseId)}</td>
            <td>${getManagerName(staff.managerId)}</td>
            <td><strong>$${(staff.salary || 0).toLocaleString()}</strong></td>
            <td><span class="status-badge active">ACTIVE</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editStaff(${staff.accountId})">Edit</button>
                    <button class="btn-action btn-delete" onclick="deleteStaff(${staff.accountId})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getWarehouseName(id) {
    if (!id) return 'None';
    const w = warehouses.find(wh => wh.warehouseId === id);
    return w ? w.name : `Warehouse #${id}`;
}

function getManagerName(id) {
    if (!id) return 'None';
    const m = staffData.find(s => s.accountId === id);
    return m ? m.username : 'Unknown';
}

function populateWarehouseDropdowns() {
    // Filter
    const filterSelect = document.getElementById('storeFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">All Locations</option>' +
            warehouses.map(w => `<option value="${w.warehouseId}">${w.name}</option>`).join('');
    }

    // Modal
    const modalSelect = document.getElementById('staffWarehouseId');
    if (modalSelect) {
        modalSelect.innerHTML = '<option value="">None</option>' +
            warehouses.map(w => `<option value="${w.warehouseId}">${w.name}</option>`).join('');
    }
}

function populateManagerDropdown() {
    const dropdown = document.getElementById('staffManager'); // Updated ID
    if (!dropdown) return;
    const managers = staffData.filter(s => s.role && s.role.toLowerCase().includes('manager'));
    dropdown.innerHTML = '<option value="">None</option>' +
        managers.map(m => `<option value="${m.accountId}">${m.username}</option>`).join('');
}

function initializeFilters() {
    const roleF = document.getElementById('roleFilter');
    if (roleF) roleF.addEventListener('change', (e) => { currentFilters.role = e.target.value; renderTable(filterStaff()); });

    const storeF = document.getElementById('storeFilter');
    if (storeF) storeF.addEventListener('change', (e) => { currentFilters.warehouseId = e.target.value; renderTable(filterStaff()); });

    const searchI = document.getElementById('searchInput');
    if (searchI) searchI.addEventListener('input', (e) => { currentFilters.search = e.target.value; renderTable(filterStaff()); });
}

function calculateStats() {
    const total = document.getElementById('totalStaff');
    if (total) total.textContent = staffData.length;

    const managers = document.getElementById('totalManagers');
    if (managers) managers.textContent = staffData.filter(s => s.role && s.role.toLowerCase().includes('manager')).length;

    const active = document.getElementById('activeStaff');
    if (active) active.textContent = staffData.length; // Assuming all active
}

function initializeForm() {
    const form = document.getElementById('staffForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get the logged-in manager's accountId from session
        const loggedInManagerId = sessionStorage.getItem('accountId');

        // Exact Schema Mapping
        const payload = {
            username: document.getElementById('staffUsername').value.trim(),
            email: document.getElementById('staffEmail').value.trim(),
            password: document.getElementById('staffPassword').value,
            role: document.getElementById('staffRole').value,
            salary: parseFloat(document.getElementById('staffSalary').value),
            managerId: loggedInManagerId  // Automatically set to the logged-in manager
        };

        const url = editingStaffId ? `${API_STAFF}/${editingStaffId}` : API_STAFF;
        const method = editingStaffId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                document.getElementById('staffModal').classList.remove('active');
                form.reset();
                loadStaff();
                waitAndShowAlert('Staff Member Saved Successfully!', 'success');
            } else {
                const err = await res.json();
                alert('Error: ' + (err.error || 'Failed to save staff member'));
            }
        } catch (error) {
            console.error(error);
            alert('Network error occurred.');
        }
    });
}

function editStaff(id) {
    const s = staffData.find(x => x.accountId === id);
    if (s) {
        document.getElementById('staffUsername').value = s.username || '';
        document.getElementById('staffEmail').value = s.email || '';
        document.getElementById('staffPassword').value = ''; // Don't prefill password
        document.getElementById('staffRole').value = s.role || '';
        document.getElementById('staffSalary').value = s.salary || 0;
        editingStaffId = id;
        openStaffModal();
    } else {
        alert('Staff member not found');
    }
}

async function deleteStaff(id) {
    if (!confirm('Delete staff?')) return;
    try {
        const res = await fetch(`${API_STAFF}/${id}`, { method: 'DELETE' });
        if (res.ok) loadStaff();
    } catch (e) { console.error(e); }
}

// Global exposure
window.openStaffModal = function () {
    document.getElementById('staffModal').classList.add('active');
    document.getElementById('staffForm').reset();
    editingStaffId = null;
    populateManagerDropdown();
};
window.closeStaffModal = function () {
    document.getElementById('staffModal').classList.remove('active');
};
window.toggleManagerField = function () { }; // Stub
window.editStaff = editStaff;
window.deleteStaff = deleteStaff;

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 100px; right: 30px; background: linear-gradient(135deg, #e50914, #c40812); color: white; padding: 18px 30px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); z-index: 10000; font-weight: 600; font-size: 14px;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
