// =======================
// API CONFIG
// =======================
const API_URL = '/api/manager/staff';

let searchTerm = '';

// DOM Elements
const addStaffBtn = document.getElementById("addStaffBtn");
const staffModal = document.getElementById("staffModal");
const closeModal = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");
const staffForm = document.getElementById("staffForm");
const staffTableBody = document.getElementById("staffTableBody");
const searchInput = document.getElementById("searchInput");
const modalTitle = document.getElementById("modalTitle");

const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const salaryInput = document.getElementById("salary");
const createdAtInput = document.getElementById("createdAt");

let editingId = null;

// =======================
// INIT
// =======================
document.addEventListener("DOMContentLoaded", () => {
  if (createdAtInput) createdAtInput.value = new Date().toISOString().split("T")[0];
  loadStaff();
});

// =======================
// MODAL
// =======================
function openModal() {
  staffModal.classList.add("active");
}

function closeModalFunc() {
  staffModal.classList.remove("active");
  staffForm.reset();
  editingId = null;
}

if (addStaffBtn) {
  addStaffBtn.addEventListener("click", () => {
    modalTitle.textContent = "Add New Staff";
    staffForm.reset();
    if (createdAtInput) createdAtInput.value = new Date().toISOString().split("T")[0];
    openModal();
  });
}

if (closeModal) closeModal.addEventListener("click", closeModalFunc);
if (cancelBtn) cancelBtn.addEventListener("click", closeModalFunc);

if (staffModal) {
  staffModal.addEventListener("click", (e) => {
    if (e.target === staffModal) closeModalFunc();
  });
}

// =======================
// LOAD STAFF
// =======================
async function loadStaff() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    renderTable(data);
  } catch (e) {
    console.error('Error loading staff:', e);
  }
}

// =======================
// RENDER TABLE
// =======================
function renderTable(data) {
  staffTableBody.innerHTML = "";

  // Simple client-side search
  if (searchTerm) {
    data = data.filter(s =>
      s.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  if (!data || data.length === 0) {
    staffTableBody.innerHTML = `
      <tr class="no-records">
        <td colspan="6">No records found</td>
      </tr>`;
    return;
  }

  data.forEach((staff) => {
    staffTableBody.innerHTML += `
      <tr>
        <td>${staff.staffId}</td>
        <td>${staff.username}</td>
        <td>${staff.email}</td>
        <td>$${staff.salary.toFixed(2)}</td>
        <td>${staff.createdAt || "-"}</td>
        <td>
          <button class="btn-delete" onclick="deleteStaff(${staff.staffId})">Delete</button>
        </td>
      </tr>
    `;
  });
}

// =======================
// ADD STAFF
// =======================
if (staffForm) {
  staffForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      username: usernameInput.value,
      email: emailInput.value,
      salary: parseFloat(salaryInput.value),
      password: passwordInput.value,
      role: 'WAREHOUSE_STAFF' // Default role
    };

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Operation failed");

      closeModalFunc();
      loadStaff();
    } catch (e) {
      alert(e.message);
    }
  });
}

// =======================
// EDIT STAFF
// =======================
async function editStaff(id) {
  const res = await fetch(`${API_URL}/${id}`);
  const staff = await res.json();

  editingId = id;
  modalTitle.textContent = "Edit Staff";

  usernameInput.value = staff.username;
  emailInput.value = staff.email;
  salaryInput.value = staff.salary;
  createdAtInput.value = staff.created_at || "";
  passwordInput.value = "";

  openModal();
}

// =======================
// DELETE STAFF
// =======================
async function deleteStaff(id) {
  if (!confirm("Are you sure you want to delete this staff member?")) return;

  const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    alert("Delete failed");
    return;
  }

  loadStaff();
}

// =======================
// SEARCH
// =======================
searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim();
  currentPage = 1;
  loadStaff();
});

// expose
window.editStaff = editStaff;
window.deleteStaff = deleteStaff;
