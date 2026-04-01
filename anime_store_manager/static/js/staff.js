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
                populateWarehouseDropdowns();
                updateWarehouseVisibility(''); // Hide by default
            }
        });
    }
    
    // Role dropdown change listener to show/hide warehouse field
    const roleDropdown = document.getElementById('staffRole');
    if (roleDropdown) {
        roleDropdown.addEventListener('change', function() {
            updateWarehouseVisibility(this.value);
            // If switching to Employee role, populate checkboxes (empty for new staff)
            if (this.value === 'Employee') {
                if (editingStaffId) {
                    // Editing existing staff - get their assigned warehouses
                    const assignedWarehouseIds = getStaffAssignedWarehouses(editingStaffId);
                    populateWarehouseCheckboxes(assignedWarehouseIds);
                } else {
                    // Adding new staff - empty checkboxes
                    populateWarehouseCheckboxes([]);
                }
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No staff found</td></tr>';
        return;
    }

    const userRole = getUserRole();
    const isManager = userRole === 'Manager';
    const currentUserId = getCurrentUserId();

    tbody.innerHTML = data.map(staff => {
        const isOwnAccount = staff.accountId === currentUserId;
        let actionButtons = '';
        
        if (isManager) {
            // Managers can edit/delete any staff
            actionButtons = `
                <button class="btn-action btn-edit" onclick="editStaff(${staff.accountId})">Edit</button>
                <button class="btn-action btn-delete" onclick="deleteStaff(${staff.accountId})">Delete</button>
            `;
        } else if (isOwnAccount) {
            // Employees can only edit their own account
            actionButtons = `
                <button class="btn-action btn-edit" onclick="editStaff(${staff.accountId})">Edit</button>
            `;
        } else {
            // Employees can't access other accounts
            actionButtons = '<span style="color: rgba(255,255,255,0.4); font-size: 12px;">No Access</span>';
        }
        
        return `
            <tr>
                <td><strong>${staff.username}</strong></td>
                <td><strong>-</strong></td>
                <td>${staff.role}</td>
                <td>${getStaffWarehouses(staff.accountId)}</td>
                <td>${getManagerName(staff.managerId)}</td>
                <td><strong>$${(staff.salary || 0).toLocaleString()}</strong></td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Get warehouses assigned to a staff member (where managerStaffId matches)
function getStaffWarehouses(staffId) {
    const assignedWarehouses = warehouses.filter(w => w.managerStaffId === staffId);
    if (assignedWarehouses.length === 0) return 'None';
    return assignedWarehouses.map(w => w.name).join(', ');
}

function getWarehouseAccessNames(warehouseAccess) {
    if (!warehouseAccess) return 'None';
    const ids = warehouseAccess.split(',').map(id => parseInt(id));
    const names = ids.map(id => {
        const w = warehouses.find(wh => wh.warehouseId === id);
        return w ? w.name : `#${id}`;
    });
    return names.length > 0 ? names.join(', ') : 'None';
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
}

// Populate warehouse checkboxes for employee assignment
function populateWarehouseCheckboxes(selectedWarehouseIds = []) {
    const container = document.getElementById('warehouseCheckboxes');
    if (!container || warehouses.length === 0) return;
    
    container.innerHTML = warehouses.map(w => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 10px 15px; background: rgba(229, 9, 20, 0.1); border-radius: 8px; border: 1px solid rgba(229, 9, 20, 0.3); min-width: 150px;">
            <input type="checkbox" name="warehouseAccess" value="${w.warehouseId}" 
                ${selectedWarehouseIds.includes(w.warehouseId) ? 'checked' : ''} 
                style="width: 18px; height: 18px; accent-color: #e50914;">
            <span style="color: white;">${w.name}</span>
        </label>
    `).join('');
}

// Get selected warehouse IDs from checkboxes
function getSelectedWarehouseIds() {
    const checkboxes = document.querySelectorAll('input[name="warehouseAccess"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

// Get warehouse IDs assigned to a staff member
function getStaffAssignedWarehouses(staffId) {
    return warehouses.filter(w => w.managerStaffId === staffId).map(w => w.warehouseId);
}

// Show warehouse dropdown only for Employees (Managers have full access)
function updateWarehouseVisibility(role) {
    const warehouseGroup = document.getElementById('warehouseAssignGroup');
    if (warehouseGroup) {
        if (role === 'Employee') {
            warehouseGroup.style.display = 'block';
        } else {
            warehouseGroup.style.display = 'none';
        }
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
                const result = await res.json();
                const staffId = editingStaffId || result.accountId;
                
                // Update warehouse assignments if an employee
                if (payload.role === 'Employee' && staffId) {
                    const selectedWarehouses = getSelectedWarehouseIds();
                    await updateWarehouseAssignments(staffId, selectedWarehouses);
                }
                
                document.getElementById('staffModal').classList.remove('active');
                form.reset();
                await loadWarehouses(); // Reload to get updated assignments
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

// Update multiple warehouse assignments for an employee
async function updateWarehouseAssignments(staffId, selectedWarehouseIds) {
    try {
        // First, clear this staff from any warehouse NOT in the selected list
        for (const w of warehouses) {
            if (w.managerStaffId === staffId && !selectedWarehouseIds.includes(w.warehouseId)) {
                await fetch(`/api/manager/warehouses/${w.warehouseId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: w.name, location: w.location, managerStaffId: null })
                });
            }
        }
        
        // Then assign to all selected warehouses
        for (const warehouseId of selectedWarehouseIds) {
            const warehouse = warehouses.find(w => w.warehouseId === warehouseId);
            if (warehouse && warehouse.managerStaffId !== staffId) {
                await fetch(`/api/manager/warehouses/${warehouseId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: warehouse.name, location: warehouse.location, managerStaffId: staffId })
                });
            }
        }
    } catch (e) {
        console.error('Error updating warehouse assignments:', e);
    }
}

function editStaff(id) {
    const s = staffData.find(x => x.accountId === id);
    if (s) {
        // Change modal title to Edit
        const modalTitle = document.getElementById('staffModalTitle');
        if (modalTitle) modalTitle.textContent = 'Edit Staff Member';
        
        // Pre-fill form with current data
        document.getElementById('staffUsername').value = s.username || '';
        document.getElementById('staffEmail').value = s.email || '';
        document.getElementById('staffPassword').value = ''; // Don't prefill password for security
        document.getElementById('staffPassword').required = false; // Password not required for edit
        document.getElementById('staffRole').value = s.role || '';
        document.getElementById('staffSalary').value = s.salary || 0;
        
        // Pre-select the assigned warehouses for this staff (checkboxes)
        const assignedWarehouseIds = getStaffAssignedWarehouses(id);
        populateWarehouseCheckboxes(assignedWarehouseIds);
        
        // Show/hide warehouse checkboxes based on role
        updateWarehouseVisibility(s.role);
        
        // If user is Employee, disable role field (can't change own role)
        const userRole = getUserRole();
        const roleField = document.getElementById('staffRole');
        if (userRole !== 'Manager') {
            roleField.disabled = true;
            roleField.style.opacity = '0.5';
            roleField.style.cursor = 'not-allowed';
            // Also hide warehouse assignment for employees editing their own profile
            const warehouseGroup = document.getElementById('warehouseAssignGroup');
            if (warehouseGroup) warehouseGroup.style.display = 'none';
        } else {
            roleField.disabled = false;
            roleField.style.opacity = '1';
            roleField.style.cursor = 'pointer';
        }
        
        editingStaffId = id;
        // Open modal directly without reset
        document.getElementById('staffModal').classList.add('active');
        populateManagerDropdown();
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
    // Reset title to Add
    const modalTitle = document.getElementById('staffModalTitle');
    if (modalTitle) modalTitle.textContent = 'Add Staff Member';
    
    // Reset form and enable all fields
    document.getElementById('staffForm').reset();
    document.getElementById('staffPassword').required = true;
    const roleField = document.getElementById('staffRole');
    roleField.disabled = false;
    roleField.style.opacity = '1';
    roleField.style.cursor = 'pointer';
    
    // Reset warehouse checkboxes and hide the group
    populateWarehouseCheckboxes([]);
    const warehouseGroup = document.getElementById('warehouseAssignGroup');
    if (warehouseGroup) warehouseGroup.style.display = 'none';
    
    document.getElementById('staffModal').classList.add('active');
    editingStaffId = null;
    populateManagerDropdown();
};
window.closeStaffModal = function () {
    document.getElementById('staffModal').classList.remove('active');
    // Reset form state when closing
    document.getElementById('staffPassword').required = true;
    const roleField = document.getElementById('staffRole');
    roleField.disabled = false;
    roleField.style.opacity = '1';
    roleField.style.cursor = 'pointer';
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

// Get current user role from sessionStorage (set during login)
function getUserRole() {
    return sessionStorage.getItem('role') || 'Employee';
}

// Get current user's account ID from sessionStorage
function getCurrentUserId() {
    return parseInt(sessionStorage.getItem('accountId')) || 0;
}

// Apply role-based restrictions
function applyRoleRestrictions() {
    const userRole = getUserRole();
    console.log('User Role:', userRole, 'User ID:', getCurrentUserId()); // Debug
    if (userRole !== 'Manager') {
        // Hide add staff button for employees
        const addStaffBtn = document.getElementById('addStaffBtn');
        if (addStaffBtn) {
            addStaffBtn.style.display = 'none';
        }
    }
}

// Apply restrictions on page load
document.addEventListener('DOMContentLoaded', applyRoleRestrictions);

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
