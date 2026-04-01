// Profile Page JavaScript - Connected to Database API

// ============================================
// API ENDPOINTS USED:
// ============================================
// 1. GET /api/customer/profile/:accountId - Get customer profile
// 2. PUT /api/customer/profile/:accountId - Update profile
// 3. PUT /api/customer/profile/:accountId/address - Update address
// 4. PUT /api/customer/profile/:accountId/password - Change password
// 5. GET /api/customer/profile/:accountId/stats - Get order statistics
// 6. GET /api/customer/profile/:accountId/favorite-categories - Get top categories
// 7. GET /api/customer/profile/:accountId/frequent-products - Get frequent purchases
// 8. GET /api/customer/profile/:accountId/spending-trend - Get spending trends
// ============================================

// API Base URL
const API_BASE = '';

// State
let customerData = {};
let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    const accountId = sessionStorage.getItem('accountId');
    
    if (!accountId) {
        showLoginRequired();
        return;
    }
    
    initializeNavigation();
    await loadAccountInfo();
    loadAddresses();
    loadWishlist();
    await loadAnalytics();
    initializeForms();
    updateCartCount();
});

function showLoginRequired() {
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; background: #0a0a0a; color: white;">
            <h2>Please Login</h2>
            <p style="margin: 20px 0; color: #888;">You need to login to view your profile.</p>
            <a href="login.html" style="background: #e50914; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">Login</a>
        </div>
    `;
}

// ============================================
// Navigation
// ============================================
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;

            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            document.querySelectorAll('.content-section').forEach(sec => {
                sec.classList.remove('active');
            });
            document.getElementById(section).classList.add('active');
        });
    });
}

// ============================================
// Load Account Info from API
// ============================================
async function loadAccountInfo() {
    const accountId = sessionStorage.getItem('accountId');
    
    try {
        const response = await fetch(`${API_BASE}/api/customer/profile/${accountId}`);
        
        if (response.ok) {
            customerData = await response.json();
            
            const profileName = document.getElementById('profileName');
            const profileEmail = document.getElementById('profileEmail');
            const usernameField = document.getElementById('username');
            const email = document.getElementById('email');
            const phone = document.getElementById('phone');
            
            // Use username from database
            if (profileName) profileName.textContent = customerData.username || 'User';
            if (profileEmail) profileEmail.textContent = customerData.email || '';
            if (usernameField) usernameField.value = customerData.username || '';
            if (email) email.value = customerData.email || '';
            if (phone) phone.value = customerData.phone || '';
        } else {
            showNotification('Failed to load profile data');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showNotification('Error loading profile data');
    }
}

// ============================================
// Update Account Info via API
// ============================================
function initializeForms() {
    const editBtn = document.getElementById('editAccountBtn');
    const accountForm = document.getElementById('accountForm');
    const accountActions = document.getElementById('accountActions');

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            const inputs = accountForm.querySelectorAll('input:not([type="email"])');
            inputs.forEach(input => input.disabled = false);
            accountActions.style.display = 'flex';
            editBtn.style.display = 'none';
        });
    }

    if (accountForm) {
        accountForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const accountId = sessionStorage.getItem('accountId');

            const updateData = {
                username: document.getElementById('username').value,
                phone: document.getElementById('phone').value
            };

            try {
                const response = await fetch(`${API_BASE}/api/customer/profile/${accountId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    customerData = { ...customerData, ...updateData };
                    
                    const inputs = accountForm.querySelectorAll('input');
                    inputs.forEach(input => input.disabled = true);
                    accountActions.style.display = 'none';
                    editBtn.style.display = 'flex';

                    await loadAccountInfo();
                    showNotification('Account information updated successfully!');
                } else {
                    showNotification(data.error || 'Failed to update profile');
                }
            } catch (error) {
                console.error('Error updating profile:', error);
                showNotification('Error updating profile');
            }
        });
    }

    // Password form
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const accountId = sessionStorage.getItem('accountId');
            
            const currentPassword = document.getElementById('currentPassword')?.value;
            const newPassword = document.getElementById('newPassword')?.value;
            const confirmPassword = document.getElementById('confirmPassword')?.value;

            if (newPassword !== confirmPassword) {
                showNotification('New passwords do not match');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/api/customer/profile/${accountId}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword, newPassword })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showNotification('Password updated successfully!');
                    passwordForm.reset();
                } else {
                    showNotification(data.error || 'Failed to update password');
                }
            } catch (error) {
                console.error('Error updating password:', error);
                showNotification('Error updating password');
            }
        });
    }
}

function cancelEdit(section) {
    if (section === 'account') {
        const accountForm = document.getElementById('accountForm');
        const accountActions = document.getElementById('accountActions');
        const editBtn = document.getElementById('editAccountBtn');

        loadAccountInfo();

        const inputs = accountForm.querySelectorAll('input');
        inputs.forEach(input => input.disabled = true);
        accountActions.style.display = 'none';
        editBtn.style.display = 'flex';
    }
}

// ============================================
// Addresses Management (using default shipping address from profile)
// ============================================
function loadAddresses() {
    const addressesGrid = document.getElementById('addressesGrid');
    if (!addressesGrid) return;

    const address = customerData.defaultShippingAddress || '';

    if (address) {
        addressesGrid.innerHTML = `
            <div class="address-card default">
                <div class="address-badge">Default</div>
                <h4>Shipping Address</h4>
                <p>${address}</p>
                <div class="address-actions">
                    <button class="btn-address-action btn-address-edit" onclick="editAddress()">Edit</button>
                </div>
            </div>
        `;
    } else {
        addressesGrid.innerHTML = `
            <div class="add-address-card" onclick="addAddress()">
                <div class="add-icon">+</div>
                <p>Add Shipping Address</p>
            </div>
        `;
    }
}

async function addAddress() {
    const address = prompt('Enter your shipping address:');
    if (address) {
        await updateAddress(address);
    }
}

async function editAddress() {
    const currentAddress = customerData.defaultShippingAddress || '';
    const address = prompt('Update your shipping address:', currentAddress);
    if (address !== null) {
        await updateAddress(address);
    }
}

async function updateAddress(address) {
    const accountId = sessionStorage.getItem('accountId');
    
    try {
        const response = await fetch(`${API_BASE}/api/customer/profile/${accountId}/address`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            customerData.defaultShippingAddress = address;
            loadAddresses();
            showNotification('Address updated successfully');
        } else {
            showNotification(data.error || 'Failed to update address');
        }
    } catch (error) {
        console.error('Error updating address:', error);
        showNotification('Error updating address');
    }
}

// ============================================
// QUERY 5-6: Wishlist Management
// ============================================
function loadWishlist() {
    const wishlistGrid = document.getElementById('wishlistGrid');
    const emptyWishlist = document.getElementById('emptyWishlist');
    const wishlistCount = document.getElementById('wishlistCount');

    wishlistCount.textContent = `${wishlist.length} items`;

    if (wishlist.length === 0) {
        wishlistGrid.style.display = 'none';
        emptyWishlist.style.display = 'block';
        return;
    }

    wishlistGrid.style.display = 'grid';
    emptyWishlist.style.display = 'none';

    wishlistGrid.innerHTML = wishlist.map(item => `
        <div class="wishlist-item">
            <img src="${item.image}" alt="${item.name}">
            <div class="wishlist-item-info">
                <h4>${item.name}</h4>
                <div class="price">$${item.price.toFixed(2)}</div>
                <div class="wishlist-item-actions">
                    <button onclick="addWishlistToCart(${item.id})" style="background: linear-gradient(135deg, #e50914, #c40812); color: #ffffff; border: none;">
                        Add to Cart
                    </button>
                    <button onclick="removeFromWishlist(${item.id})" style="background: rgba(255, 107, 53, 0.1); border: 1px solid rgba(255, 107, 53, 0.3); color: #ff6b35;">
                        Remove
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function addWishlistToCart(productId) {
    const item = wishlist.find(w => w.id === productId);
    if (!item) return;

    const existingItem = cart.find(c => c.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...item, quantity: 1, addedAt: new Date().toISOString() });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    showNotification(`${item.name} added to cart!`);
}

function removeFromWishlist(productId) {
    const index = wishlist.findIndex(w => w.id === productId);
    if (index > -1) {
        const item = wishlist[index];
        wishlist.splice(index, 1);
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
        loadWishlist();
        showNotification(`${item.name} removed from wishlist`);
    }
}

// ============================================
// Load Analytics from API
// ============================================
async function loadAnalytics() {
    const accountId = sessionStorage.getItem('accountId');
    
    try {
        // Load stats and favorite categories in parallel
        const [statsRes, categoriesRes, trendsRes] = await Promise.all([
            fetch(`${API_BASE}/api/customer/profile/${accountId}/stats`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/favorite-categories`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/spending-trend`)
        ]);

        // Update stats
        if (statsRes.ok) {
            const stats = await statsRes.json();
            const totalSpentEl = document.getElementById('totalSpent');
            const totalOrdersEl = document.getElementById('totalOrders');
            const avgRatingEl = document.getElementById('avgRating');
            
            if (totalSpentEl) totalSpentEl.textContent = `$${parseFloat(stats.totalSpent || 0).toFixed(2)}`;
            if (totalOrdersEl) totalOrdersEl.textContent = stats.totalOrders || 0;
            if (avgRatingEl) avgRatingEl.textContent = '4.8'; // Static for now
        }

        // Update category bars
        if (categoriesRes.ok) {
            const data = await categoriesRes.json();
            const categories = data.categories || [];
            const categoryBars = document.getElementById('categoryBars');
            
            if (categoryBars && categories.length > 0) {
                const maxSpending = Math.max(...categories.map(c => c.totalSpentInCategory));

                categoryBars.innerHTML = categories.map(cat => {
                    const percentage = maxSpending > 0 ? (cat.totalSpentInCategory / maxSpending) * 100 : 0;
                    return `
                        <div class="category-bar">
                            <div class="category-bar-label">
                                <span>${cat.categoryName}</span>
                                <span>$${parseFloat(cat.totalSpentInCategory).toFixed(2)}</span>
                            </div>
                            <div class="category-bar-fill">
                                <div class="category-bar-progress" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else if (categoryBars) {
                categoryBars.innerHTML = '<p style="color: #888; text-align: center;">No purchase history yet</p>';
            }
        }

        // Update trend chart
        if (trendsRes.ok) {
            const data = await trendsRes.json();
            const trends = data.trends || [];
            const trendChart = document.getElementById('trendChart');
            
            if (trendChart && trends.length > 0) {
                trendChart.innerHTML = `
                    <div class="trend-list">
                        ${trends.map(t => `
                            <div class="trend-item">
                                <span class="trend-month">${t.month}</span>
                                <span class="trend-orders">${t.orderCount} orders</span>
                                <span class="trend-amount">$${parseFloat(t.totalSpent).toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else if (trendChart) {
                trendChart.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.5);">
                        <p>No spending trends available</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
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
        animation: slideInRight 0.3s ease, slideOutRight 0.3s ease 2.7s;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Avatar upload
document.getElementById('avatarInput')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('avatarImage').src = e.target.result;
            customerData.avatar = e.target.result;
            showNotification('Profile picture updated!');
        };
        reader.readAsDataURL(file);
    }
});

// Navbar scroll effect
window.addEventListener('scroll', function () {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});
