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

// Map variables
let addressMap = null;
let addressMarker = null;
let selectedAddress = null;
let selectedCoords = null;

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
    initializeAddressSearch();
    updateCartCount();

    // Request user's current location if no address is saved
    if (!customerData.defaultShippingAddress) {
        requestCurrentLocation();
    }
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
// Addresses Management with Map Integration
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
                    <button class="btn-address-action btn-address-edit" onclick="showAddressOnMap('${address.replace(/'/g, "\\'")}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        View on Map
                    </button>
                    <button class="btn-address-action btn-address-edit" onclick="editAddressWithMap()">Edit</button>
                </div>
            </div>
        `;

        // Also show this address on the map
        showAddressOnMap(address);
    } else {
        addressesGrid.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <h3>No Address Saved</h3>
                <p>Search for your address above to add it</p>
            </div>
        `;
    }
}

// Initialize the map
function initializeMap() {
    const mapContainer = document.getElementById('mapContainer');
    const mapElement = document.getElementById('addressMap');

    if (!mapElement || addressMap) return;

    mapContainer.style.display = 'block';

    // Default center (Amman, Jordan)
    addressMap = L.map('addressMap').setView([31.9454, 35.9284], 10);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(addressMap);

    // Add click event to map
    addressMap.on('click', function(e) {
        reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
}

// Search for address using Nominatim API
async function searchAddress() {
    const searchInput = document.getElementById('addressSearchInput');
    const suggestionsContainer = document.getElementById('addressSuggestions');
    const query = searchInput.value.trim();

    if (!query) {
        showNotification('Please enter an address to search');
        return;
    }

    suggestionsContainer.style.display = 'block';
    suggestionsContainer.innerHTML = '<div class="searching-state">Searching</div>';

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const results = await response.json();

        if (results.length === 0) {
            suggestionsContainer.innerHTML = '<div class="address-suggestion-item">No results found. Try a different search.</div>';
            return;
        }

        suggestionsContainer.innerHTML = results.map((result, index) => `
            <div class="address-suggestion-item" onclick="selectAddress(${index}, '${result.lat}', '${result.lon}', '${result.display_name.replace(/'/g, "\\'")}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e50914" stroke-width="2" style="margin-right: 10px; vertical-align: middle;">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                ${result.display_name}
            </div>
        `).join('');

    } catch (error) {
        console.error('Error searching address:', error);
        suggestionsContainer.innerHTML = '<div class="address-suggestion-item">Error searching. Please try again.</div>';
    }
}

// Select an address from suggestions
function selectAddress(index, lat, lon, displayName) {
    const suggestionsContainer = document.getElementById('addressSuggestions');
    suggestionsContainer.style.display = 'none';

    selectedAddress = displayName;
    selectedCoords = { lat: parseFloat(lat), lon: parseFloat(lon) };

    // Initialize and update map
    initializeMap();
    updateMapLocation(selectedCoords.lat, selectedCoords.lon, displayName);

    // Update the display
    const mapAddressDisplay = document.getElementById('mapAddressDisplay');
    mapAddressDisplay.innerHTML = `<strong>Selected Address:</strong><br>${displayName}`;
}

// Show existing address on map
async function showAddressOnMap(address) {
    if (!address) return;

    initializeMap();

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
        const results = await response.json();

        if (results.length > 0) {
            const result = results[0];
            selectedAddress = result.display_name;
            selectedCoords = { lat: parseFloat(result.lat), lon: parseFloat(result.lon) };

            updateMapLocation(selectedCoords.lat, selectedCoords.lon, result.display_name);

            const mapAddressDisplay = document.getElementById('mapAddressDisplay');
            mapAddressDisplay.innerHTML = `<strong>Current Address:</strong><br>${result.display_name}`;
        }
    } catch (error) {
        console.error('Error showing address on map:', error);
    }
}

// Update map location with marker
function updateMapLocation(lat, lon, displayName) {
    if (!addressMap) return;

    // Remove existing marker
    if (addressMarker) {
        addressMap.removeLayer(addressMarker);
    }

    // Set view and add marker
    addressMap.setView([lat, lon], 15);

    addressMarker = L.marker([lat, lon]).addTo(addressMap);
    addressMarker.bindPopup(`<strong>📍 Your Address</strong><br>${displayName}`).openPopup();
}

// Reverse geocode (click on map to get address)
async function reverseGeocode(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
        const result = await response.json();

        if (result && result.display_name) {
            selectedAddress = result.display_name;
            selectedCoords = { lat, lon };

            updateMapLocation(lat, lon, result.display_name);

            const mapAddressDisplay = document.getElementById('mapAddressDisplay');
            mapAddressDisplay.innerHTML = `<strong>Selected Address:</strong><br>${result.display_name}`;

            const searchInput = document.getElementById('addressSearchInput');
            searchInput.value = result.display_name;
        }
    } catch (error) {
        console.error('Error reverse geocoding:', error);
    }
}

// Save selected address
async function saveSelectedAddress() {
    if (!selectedAddress) {
        showNotification('Please select an address first');
        return;
    }

    await updateAddress(selectedAddress);
}

// Edit address with map
function editAddressWithMap() {
    const searchInput = document.getElementById('addressSearchInput');
    searchInput.value = customerData.defaultShippingAddress || '';
    searchInput.focus();

    // Show map if exists
    initializeMap();

    showNotification('Search for a new address or click on the map');
}

async function addAddress() {
    const searchInput = document.getElementById('addressSearchInput');
    searchInput.focus();
    showNotification('Search for your address above');
}

async function editAddress() {
    editAddressWithMap();
}

// Initialize address search input
function initializeAddressSearch() {
    const searchInput = document.getElementById('addressSearchInput');
    if (searchInput) {
        // Search on Enter key
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAddress();
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', function(e) {
            const suggestionsContainer = document.getElementById('addressSuggestions');
            const searchContainer = document.querySelector('.address-search-container');

            if (suggestionsContainer && !searchContainer.contains(e.target)) {
                suggestionsContainer.style.display = 'none';
            }
        });
    }
}

// ============================================
// Geolocation - Detect User's Current Location
// ============================================
function requestCurrentLocation() {
    if (!navigator.geolocation) {
        console.log('Geolocation is not supported by this browser.');
        return;
    }

    // Show a prompt to user
    const addressesGrid = document.getElementById('addressesGrid');
    if (addressesGrid && !customerData.defaultShippingAddress) {
        addressesGrid.innerHTML = `
            <div class="location-prompt" style="text-align: center; padding: 30px;">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#e50914" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <h4 style="margin: 15px 0; color: #fff;">Detect Your Location</h4>
                <p style="color: rgba(255,255,255,0.6); margin-bottom: 20px;">Allow us to detect your current location for easier checkout</p>
                <button onclick="getCurrentLocation()" class="btn-search-address" style="margin: 5px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    Use My Current Location
                </button>
                <button onclick="loadAddresses()" class="btn-search-address" style="margin: 5px; background: rgba(255,255,255,0.1);">
                    Skip for now
                </button>
            </div>
        `;
    }
}

function getCurrentLocation() {
    const addressesGrid = document.getElementById('addressesGrid');

    // Show loading state
    if (addressesGrid) {
        addressesGrid.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="searching-state">Detecting your location</div>
            </div>
        `;
    }

    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            // Reverse geocode to get address
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
                const result = await response.json();

                if (result && result.display_name) {
                    selectedAddress = result.display_name;
                    selectedCoords = { lat, lon };

                    // Initialize map and show location
                    initializeMap();
                    updateMapLocation(lat, lon, result.display_name);

                    const mapAddressDisplay = document.getElementById('mapAddressDisplay');
                    if (mapAddressDisplay) {
                        mapAddressDisplay.innerHTML = `<strong>Your Current Location:</strong><br>${result.display_name}`;
                    }

                    const searchInput = document.getElementById('addressSearchInput');
                    if (searchInput) {
                        searchInput.value = result.display_name;
                    }

                    showNotification('Location detected! Click "Save This Address" to save it.');

                    // Reload addresses section
                    loadAddresses();
                }
            } catch (error) {
                console.error('Error reverse geocoding:', error);
                showNotification('Could not determine your address. Please search manually.');
                loadAddresses();
            }
        },
        function(error) {
            console.error('Geolocation error:', error);
            let errorMessage = 'Could not detect your location.';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location access denied. Please search for your address manually.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable. Please search manually.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out. Please try again.';
                    break;
            }

            showNotification(errorMessage);
            loadAddresses();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
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
        // Load all analytics data in parallel
        const [
            statsRes,
            categoriesRes,
            trendsRes,
            lifetimeRes,
            orderStatusRes,
            paymentMethodsRes,
            weeklyRes,
            activityRes,
            topProductsRes
        ] = await Promise.all([
            fetch(`${API_BASE}/api/customer/profile/${accountId}/stats`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/favorite-categories`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/spending-trend`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/lifetime-metrics`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/order-status-distribution`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/payment-methods`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/weekly-spending`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/activity-by-day`),
            fetch(`${API_BASE}/api/customer/profile/${accountId}/top-products`)
        ]);

        // Update lifetime metrics
        if (lifetimeRes.ok) {
            const metrics = await lifetimeRes.json();
            updateElementText('totalSpent', `$${parseFloat(metrics.lifetimeSpent || 0).toFixed(2)}`);
            updateElementText('totalOrders', metrics.totalOrders || 0);
            updateElementText('memberDays', metrics.daysAsMember || 0);
            updateElementText('uniqueProducts', metrics.uniqueProducts || 0);
        } else if (statsRes.ok) {
            // Fallback to stats
            const stats = await statsRes.json();
            updateElementText('totalSpent', `$${parseFloat(stats.totalSpent || 0).toFixed(2)}`);
            updateElementText('totalOrders', stats.totalOrders || 0);
        }

        // Update category bars
        if (categoriesRes.ok) {
            const data = await categoriesRes.json();
            renderCategoryBars(data.categories || []);
        }

        // Update order status pie chart
        if (orderStatusRes.ok) {
            const data = await orderStatusRes.json();
            renderOrderStatusChart(data.distribution || []);
        }

        // Update weekly spending chart
        if (weeklyRes.ok) {
            const data = await weeklyRes.json();
            renderWeeklySpendingChart(data.weeks || []);
        }

        // Update activity by day chart
        if (activityRes.ok) {
            const data = await activityRes.json();
            renderActivityByDayChart(data.days || []);
        }

        // Update payment methods chart
        if (paymentMethodsRes.ok) {
            const data = await paymentMethodsRes.json();
            renderPaymentMethodsChart(data.methods || []);
        }

        // Update top products
        if (topProductsRes.ok) {
            const data = await topProductsRes.json();
            renderTopProducts(data.products || []);
        }

        // Update trend chart
        if (trendsRes.ok) {
            const data = await trendsRes.json();
            renderTrendChart(data.trends || []);
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// Helper function to update text content
function updateElementText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Render category bars
function renderCategoryBars(categories) {
    const categoryBars = document.getElementById('categoryBars');
    if (!categoryBars) return;

    if (categories.length === 0) {
        categoryBars.innerHTML = '<p class="no-data">No purchase history yet</p>';
        return;
    }

    const maxSpending = Math.max(...categories.map(c => c.totalSpentInCategory));
    const colors = ['#e50914', '#00d9ff', '#00c853', '#ffa500', '#8a2be2'];

    categoryBars.innerHTML = categories.map((cat, i) => {
        const percentage = maxSpending > 0 ? (cat.totalSpentInCategory / maxSpending) * 100 : 0;
        const color = colors[i % colors.length];
        return `
            <div class="category-bar">
                <div class="category-bar-label">
                    <span>${cat.categoryName}</span>
                    <span>$${parseFloat(cat.totalSpentInCategory).toFixed(2)}</span>
                </div>
                <div class="category-bar-fill">
                    <div class="category-bar-progress" style="width: ${percentage}%; background: ${color}"></div>
                </div>
            </div>
        `;
    }).join('');
}

// Render order status pie chart
function renderOrderStatusChart(distribution) {
    const container = document.getElementById('orderStatusChart');
    if (!container) return;

    if (distribution.length === 0) {
        container.innerHTML = '<p class="no-data">No orders yet</p>';
        return;
    }

    const total = distribution.reduce((sum, d) => sum + d.count, 0);
    const colors = {
        'Paid': '#00c853',
        'Processing': '#00d9ff',
        'Shipped': '#8a2be2',
        'Delivered': '#00ff87',
        'Cancelled': '#ff6b35',
        'Refund Requested': '#3b82f6',
        'Refunded': '#10b981'
    };

    // Create pie chart segments
    let cumulativePercentage = 0;
    const segments = distribution.map(d => {
        const percentage = (d.count / total) * 100;
        const startAngle = cumulativePercentage * 3.6;
        cumulativePercentage += percentage;
        const endAngle = cumulativePercentage * 3.6;
        return {
            status: d.status,
            count: d.count,
            percentage,
            color: colors[d.status] || '#666'
        };
    });

    // Create gradient for conic-gradient pie chart
    let gradientParts = [];
    let currentAngle = 0;
    segments.forEach(seg => {
        const endAngle = currentAngle + (seg.percentage * 3.6);
        gradientParts.push(`${seg.color} ${currentAngle}deg ${endAngle}deg`);
        currentAngle = endAngle;
    });

    container.innerHTML = `
        <div class="pie-chart-wrapper">
            <div class="pie-chart" style="background: conic-gradient(${gradientParts.join(', ')})"></div>
            <div class="pie-chart-legend">
                ${segments.map(seg => `
                    <div class="legend-item">
                        <span class="legend-color" style="background: ${seg.color}"></span>
                        <span class="legend-label">${seg.status}</span>
                        <span class="legend-value">${seg.count} (${seg.percentage.toFixed(1)}%)</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Render weekly spending chart
function renderWeeklySpendingChart(weeks) {
    const container = document.getElementById('weeklySpendingChart');
    if (!container) return;

    if (weeks.length === 0) {
        container.innerHTML = '<p class="no-data">No spending data available</p>';
        return;
    }

    const maxSpending = Math.max(...weeks.map(w => w.totalSpent), 1);

    container.innerHTML = `
        <div class="bar-chart">
            ${weeks.map(w => {
                const height = (w.totalSpent / maxSpending) * 100;
                const weekLabel = w.weekStart ? new Date(w.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Week ${w.weekNum}`;
                return `
                    <div class="bar-item">
                        <div class="bar-container">
                            <div class="bar" style="height: ${height}%">
                                <span class="bar-value">$${w.totalSpent.toFixed(0)}</span>
                            </div>
                        </div>
                        <span class="bar-label">${weekLabel}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Render activity by day chart
function renderActivityByDayChart(days) {
    const container = document.getElementById('activityByDayChart');
    if (!container) return;

    if (days.length === 0) {
        container.innerHTML = '<p class="no-data">No activity data available</p>';
        return;
    }

    // Fill in missing days
    const allDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayMap = {};
    days.forEach(d => dayMap[d.dayName] = d);

    const maxOrders = Math.max(...days.map(d => d.orderCount), 1);

    container.innerHTML = `
        <div class="activity-grid">
            ${allDays.map(day => {
                const data = dayMap[day] || { orderCount: 0, totalSpent: 0 };
                const intensity = data.orderCount / maxOrders;
                const bgOpacity = 0.1 + (intensity * 0.5);
                return `
                    <div class="activity-day" style="background: rgba(229, 9, 20, ${bgOpacity})">
                        <span class="day-name">${day.substring(0, 3)}</span>
                        <span class="day-count">${data.orderCount}</span>
                        <span class="day-label">orders</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Render payment methods chart
function renderPaymentMethodsChart(methods) {
    const container = document.getElementById('paymentMethodsChart');
    if (!container) return;

    if (methods.length === 0) {
        container.innerHTML = '<p class="no-data">No payment data available</p>';
        return;
    }

    const total = methods.reduce((sum, m) => sum + m.count, 0);
    const colors = {
        'Credit Card': '#e50914',
        'PayPal': '#0070ba',
        'Debit Card': '#00c853',
        'Cash': '#ffa500'
    };

    container.innerHTML = `
        <div class="payment-methods-list">
            ${methods.map(m => {
                const percentage = (m.count / total) * 100;
                const color = colors[m.method] || '#666';
                return `
                    <div class="payment-method-item">
                        <div class="method-info">
                            <span class="method-icon" style="background: ${color}"></span>
                            <span class="method-name">${m.method}</span>
                        </div>
                        <div class="method-stats">
                            <span class="method-count">${m.count} orders</span>
                            <span class="method-amount">$${m.totalAmount.toFixed(2)}</span>
                        </div>
                        <div class="method-bar">
                            <div class="method-bar-fill" style="width: ${percentage}%; background: ${color}"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Render top products
function renderTopProducts(products) {
    const container = document.getElementById('topProductsGrid');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = '<p class="no-data">No products purchased yet</p>';
        return;
    }

    container.innerHTML = products.map((p, index) => `
        <div class="top-product-card">
            <span class="product-rank">#${index + 1}</span>
            <img src="${p.productImage || '/static/images/placeholder.jpg'}" alt="${p.name}" onerror="this.src='/static/images/placeholder.jpg'">
            <div class="product-info">
                <h4>${p.name}</h4>
                <p class="product-category">${p.categoryName || ''}</p>
                <div class="product-stats">
                    <span class="qty-bought">${p.totalQuantity} bought</span>
                    <span class="total-spent">$${p.totalSpent.toFixed(2)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Render monthly trend chart
function renderTrendChart(trends) {
    const trendChart = document.getElementById('trendChart');
    if (!trendChart) return;

    if (trends.length === 0) {
        trendChart.innerHTML = '<p class="no-data">No spending trends available</p>';
        return;
    }

    const maxSpent = Math.max(...trends.map(t => t.totalSpent), 1);

    trendChart.innerHTML = `
        <div class="trend-chart-visual">
            <div class="trend-bars">
                ${trends.map(t => {
                    const height = (t.totalSpent / maxSpent) * 100;
                    const monthLabel = new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                    return `
                        <div class="trend-bar-item">
                            <div class="trend-bar-container">
                                <div class="trend-bar" style="height: ${height}%">
                                    <span class="trend-bar-value">$${t.totalSpent.toFixed(0)}</span>
                                </div>
                            </div>
                            <span class="trend-bar-label">${monthLabel}</span>
                            <span class="trend-bar-orders">${t.orderCount} orders</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
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

// ============================================
// Logout Function
// ============================================
function logout(event) {
    if (event) event.preventDefault();

    if (confirm('Are you sure you want to logout?')) {
        // Clear session storage
        sessionStorage.removeItem('accountId');
        sessionStorage.removeItem('userType');
        sessionStorage.removeItem('role');
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('username');

        // Clear local storage cart (optional - keep or clear based on preference)
        // localStorage.removeItem('cart');
        // localStorage.removeItem('wishlist');

        showNotification('Logged out successfully!');

        // Redirect to login page
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

// ============================================
// Profile Dropdown Toggle
// ============================================
function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('profileDropdown');
    const profileBtn = document.querySelector('.profile-btn');

    if (dropdown && profileBtn && !profileBtn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

// ============================================
// Password Visibility Toggle
// ============================================
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentElement.querySelector('.toggle-password');

    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    } else {
        input.type = 'password';
        button.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;
    }
}

// ============================================
// Password Strength Checker
// ============================================
function checkPasswordStrength(password) {
    let strength = 0;

    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;

    return strength;
}

function updatePasswordStrength() {
    const password = document.getElementById('newPassword')?.value || '';
    const strengthContainer = document.getElementById('passwordStrength');

    if (!strengthContainer) return;

    if (password.length === 0) {
        strengthContainer.innerHTML = '';
        return;
    }

    const strength = checkPasswordStrength(password);
    let strengthClass = 'weak';
    let strengthText = 'Weak';

    if (strength >= 4) {
        strengthClass = 'strong';
        strengthText = 'Strong';
    } else if (strength >= 2) {
        strengthClass = 'medium';
        strengthText = 'Medium';
    }

    strengthContainer.innerHTML = `<div class="password-strength-bar ${strengthClass}"></div>`;
}

function checkPasswordMatch() {
    const password = document.getElementById('newPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    const matchContainer = document.getElementById('passwordMatch');

    if (!matchContainer) return;

    if (confirmPassword.length === 0) {
        matchContainer.innerHTML = '';
        matchContainer.className = 'password-match';
        return;
    }

    if (password === confirmPassword) {
        matchContainer.textContent = '✓ Passwords match';
        matchContainer.className = 'password-match match';
    } else {
        matchContainer.textContent = '✗ Passwords do not match';
        matchContainer.className = 'password-match no-match';
    }
}

// Initialize password strength and match checkers
document.addEventListener('DOMContentLoaded', function() {
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', () => {
            updatePasswordStrength();
            checkPasswordMatch();
        });
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', checkPasswordMatch);
    }
});

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
