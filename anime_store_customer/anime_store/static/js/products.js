// Products Page JavaScript - Connected to Database API
// API ENDPOINTS USED:
// 1. GET /api/customer/products - Get all products with pagination
// 2. GET /api/customer/products/search - Search products
// 3. GET /api/customer/products/:id - Get product details
// 4. GET /api/customer/products/category/:id - Get products by category
// 5. GET /api/customer/products/price-range - Get products in price range
// 6. GET /api/customer/categories - Get all categories

// API Base URL
const API_BASE = '';

// State Management
let productsData = [];
let categoriesData = [];
let currentFilters = {
    categoryId: 'all',
    price: 'all',
    status: 'all',
    rating: 'all',
    sort: 'featured',
    search: ''
};

// Pagination state
let currentPage = 1;
const itemsPerPage = 9; // Products per page
let totalProducts = 0;

let cart = JSON.parse(localStorage.getItem('cart')) || [];
let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    // Check URL params for category filter
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (categoryParam) {
        currentFilters.categoryId = categoryParam;
    }
    
    initializeFilters();
    initializeSearch();
    updateCartCount();
    await loadCategories();
    await loadProducts();
    initializeWishlistButtons();
});

// ============================================
// Load Categories from API
// ============================================
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/api/customer/categories`);
        if (response.ok) {
            const data = await response.json();
            // API returns array directly
            categoriesData = Array.isArray(data) ? data : (data.categories || []);
            populateCategoryFilter();
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function populateCategoryFilter() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return;
    
    // Build options with All Categories first
    let optionsHtml = '<option value="all">All Categories</option>';
    
    categoriesData.forEach(cat => {
        // Check if this category should be selected (compare as strings)
        const isSelected = String(currentFilters.categoryId) === String(cat.categoryId);
        optionsHtml += `<option value="${cat.categoryId}" ${isSelected ? 'selected' : ''}>${cat.name}</option>`;
    });
    
    categoryFilter.innerHTML = optionsHtml;
    
    // If a category was selected via URL, make sure filter dropdown shows it
    if (currentFilters.categoryId !== 'all') {
        categoryFilter.value = currentFilters.categoryId;
    }
}

// ============================================
// Load Products from API
// ============================================
async function loadProducts(resetPage = true) {
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<div class="loading">Loading products...</div>';
    
    // Reset to page 1 when filters change
    if (resetPage) {
        currentPage = 1;
    }

    try {
        // Build URL with all filters using search endpoint
        let params = new URLSearchParams();

        if (currentFilters.search) {
            params.append('q', currentFilters.search);
        }

        if (currentFilters.categoryId !== 'all') {
            params.append('categoryId', currentFilters.categoryId);
        }
        
        if (currentFilters.price !== 'all') {
            const [min, max] = currentFilters.price.split('-');
            params.append('minPrice', min);
            if (max && max !== '+') {
                params.append('maxPrice', max);
            }
        }

        if (currentFilters.rating !== 'all') {
            params.append('minRating', currentFilters.rating);
        }

        // Add sort parameter
        let sortBy = 'name';
        if (currentFilters.sort === 'price-low') sortBy = 'price_asc';
        else if (currentFilters.sort === 'price-high') sortBy = 'price_desc';
        else if (currentFilters.sort === 'newest') sortBy = 'newest';
        else if (currentFilters.sort === 'popular') sortBy = 'rating';
        params.append('sortBy', sortBy);

        const url = `${API_BASE}/api/customer/products/search?${params.toString()}`;

        const response = await fetch(url);
        
        if (response.ok) {
            const data = await response.json();
            // Handle both array and object response formats
            productsData = Array.isArray(data) ? data : (data.products || []);
            renderProducts();
        } else {
            if (grid) grid.innerHTML = '<div class="error">Failed to load products</div>';
        }
    } catch (error) {
        console.error('Error loading products:', error);
        if (grid) grid.innerHTML = '<div class="error">Error loading products</div>';
    }
}

// Filter Functions
function initializeFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const priceFilter = document.getElementById('priceFilter');
    const availabilityFilter = document.getElementById('availabilityFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const sortFilter = document.getElementById('sortFilter');
    const resetBtn = document.getElementById('resetFilters');

    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            currentFilters.categoryId = e.target.value;
            loadProducts();
            updateActiveFilters();
        });
    }

    if (priceFilter) {
        priceFilter.addEventListener('change', (e) => {
            currentFilters.price = e.target.value;
            loadProducts();
            updateActiveFilters();
        });
    }

    if (availabilityFilter) {
        availabilityFilter.addEventListener('change', (e) => {
            currentFilters.status = e.target.value;
            renderProducts(); // Client-side filter
            updateActiveFilters();
        });
    }

    if (ratingFilter) {
        ratingFilter.addEventListener('change', (e) => {
            currentFilters.rating = e.target.value;
            loadProducts(); // Server-side filter
            updateActiveFilters();
        });
    }

    if (sortFilter) {
        sortFilter.addEventListener('change', (e) => {
            currentFilters.sort = e.target.value;
            renderProducts(); // Client-side sort
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
    }
}

// Search
function initializeSearch() {
    const searchToggle = document.getElementById('searchToggle');
    const searchOverlay = document.getElementById('searchOverlay');
    const searchClose = document.getElementById('searchClose');
    const searchInput = document.getElementById('globalSearch');

    if (searchToggle) {
        searchToggle.addEventListener('click', () => {
            if (searchOverlay) searchOverlay.classList.add('active');
            setTimeout(() => searchInput?.focus(), 300);
        });
    }

    if (searchClose) {
        searchClose.addEventListener('click', () => {
            if (searchOverlay) searchOverlay.classList.remove('active');
        });
    }

    if (searchOverlay) {
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) {
                searchOverlay.classList.remove('active');
            }
        });
    }

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentFilters.search = e.target.value.toLowerCase();
                loadProducts(); // Fetch from API with search
            }, 300);
        });
    }
}

// Filtering Logic (client-side for loaded data)
function filterProducts() {
    let filtered = [...productsData];

    // Filter by status/availability (client-side)
    if (currentFilters.status !== 'all') {
        if (currentFilters.status === 'in-stock') {
            filtered = filtered.filter(p => (p.totalStock || p.stock || p.quantityOnHand || 0) > 0);
        } else if (currentFilters.status === 'low-stock') {
            filtered = filtered.filter(p => {
                const stock = p.totalStock || p.stock || p.quantityOnHand || 0;
                return stock < 10 && stock > 0;
            });
        }
    }

    // Sort products
    switch (currentFilters.sort) {
        case 'price-low': filtered.sort((a, b) => (a.unitPrice || a.price || 0) - (b.unitPrice || b.price || 0)); break;
        case 'price-high': filtered.sort((a, b) => (b.unitPrice || b.price || 0) - (a.unitPrice || a.price || 0)); break;
        case 'newest': filtered.sort((a, b) => b.productId - a.productId); break;
        case 'popular': filtered.sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0)); break;
        default: break;
    }

    return filtered;
}

// Render
function renderProducts() {
    const filtered = filterProducts();
    const grid = document.getElementById('productsGrid');
    const productCount = document.getElementById('productCount');

    totalProducts = filtered.length;
    if (productCount) productCount.textContent = totalProducts;
    if (!grid) return;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <h3 style="color: rgba(255,255,255,0.7);">No products found</h3>
            </div>
        `;
        renderPagination(0, 0);
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    // Ensure current page is valid
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // Get products for current page
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedProducts = filtered.slice(startIndex, endIndex);

    grid.innerHTML = paginatedProducts.map(product => createProductCard(product)).join('');
    initializeWishlistButtons();

    // Render pagination
    renderPagination(totalPages, currentPage);
}

// Render Pagination
function renderPagination(totalPages, current) {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;

    // Don't show pagination if only 1 page or no pages
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    // Previous button
    paginationHTML += `
        <button class="pagination-btn" ${current === 1 ? 'disabled' : ''} onclick="goToPage(${current - 1})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        </button>
    `;

    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, current - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust start if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // First page + dots if needed
    if (startPage > 1) {
        paginationHTML += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="pagination-dots">...</span>`;
        }
    }

    // Page number buttons
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>
        `;
    }

    // Last page + dots if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="pagination-dots">...</span>`;
        }
        paginationHTML += `<button class="pagination-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // Next button
    paginationHTML += `
        <button class="pagination-btn" ${current === totalPages ? 'disabled' : ''} onclick="goToPage(${current + 1})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        </button>
    `;

    paginationContainer.innerHTML = paginationHTML;
}

// Go to specific page
function goToPage(page) {
    const totalPages = Math.ceil(totalProducts / itemsPerPage);
    if (page < 1 || page > totalPages) return;

    currentPage = page;
    renderProducts();

    // Scroll to top of products grid
    const grid = document.getElementById('productsGrid');
    if (grid) {
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Create Card
function createProductCard(product) {
    const isInWishlist = wishlist.some(item => item.productId === product.productId);
    const price = product.unitPrice || product.price || 0;
    const stock = product.totalStock || product.stock || product.quantityOnHand || 0;
    const avgRating = product.averageRating || 0;
    const totalRatings = product.totalRatings || 0;

    // Determine stock class for UI
    let stockClass = '';
    let stockText = '';
    if (stock > 10) { stockClass = 'in-stock'; stockText = 'In Stock'; }
    else if (stock > 0) { stockClass = 'low-stock'; stockText = `Low Stock (${stock})`; }
    else { stockClass = 'out-of-stock'; stockText = 'Out of Stock'; }

    // Generate star rating HTML
    const starRating = generateStarRating(avgRating);

    return `
        <div class="product-card" data-product-id="${product.productId}">
            <button class="wishlist-btn ${isInWishlist ? 'active' : ''}" onclick="toggleWishlist(${product.productId})">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="${isInWishlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </button>
            <div class="product-image-wrapper">
                <img src="${product.productImage || '/static/images/placeholder.jpg'}" alt="${product.name}" class="product-image" onerror="this.src='/static/images/placeholder.jpg'">
                <div class="product-quick-view">
                    <button class="quick-view-btn" onclick="viewProductDetails(${product.productId})">View Details</button>
                </div>
            </div>
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-category">${product.categoryName || formatCategory(product.categoryId)}</p>
                <div class="product-rating">
                    ${starRating}
                    <span class="rating-count">(${totalRatings})</span>
                </div>
                <div class="product-stock ${stockClass}">
                    ${stockText}
                </div>
                <div class="product-footer">
                    <span class="product-price">$${parseFloat(price).toFixed(2)}</span>
                    <button class="add-to-cart-btn" onclick="addToCart(${product.productId})" ${stock === 0 ? 'disabled' : ''}>
                        ${stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Generate star rating HTML
function generateStarRating(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += '<span class="star filled">★</span>';
        } else if (i - 0.5 <= rating) {
            stars += '<span class="star half">★</span>';
        } else {
            stars += '<span class="star empty">☆</span>';
        }
    }
    return `<span class="stars">${stars}</span><span class="rating-value">${rating > 0 ? rating.toFixed(1) : '0.0'}</span>`;
}

function addToCart(productId) {
    const product = productsData.find(p => p.productId === productId);
    if (!product) return;

    const price = product.unitPrice || product.price || 0;
    const stock = product.totalStock || product.stock || product.quantityOnHand || 0;
    const existingItem = cart.find(item => item.productId === productId);

    if (existingItem) {
        if (existingItem.quantity < stock) {
            existingItem.quantity += 1;
        } else {
            showNotification('Maximum stock reached');
            return;
        }
    } else {
        cart.push({
            productId: product.productId,
            name: product.name,
            price: parseFloat(price),
            image: product.productImage || '/static/images/placeholder.jpg',
            stock: stock,
            quantity: 1
        });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    showNotification(`${product.name} added to cart!`);
}

function toggleWishlist(productId) {
    const product = productsData.find(p => p.productId === productId);
    if (!product) return;

    const index = wishlist.findIndex(item => item.productId === productId);

    if (index > -1) {
        wishlist.splice(index, 1);
        showNotification(`${product.name} removed from wishlist`);
    } else {
        wishlist.push({
            productId: product.productId,
            name: product.name,
            price: product.unitPrice || product.price || 0,
            image: product.productImage || '/static/images/placeholder.jpg'
        });
        showNotification(`${product.name} added to wishlist!`);
    }

    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    renderProducts();
}

function initializeWishlistButtons() {
    // Already handled
}

function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = totalItems;
    }
}

// Utilities
function updateActiveFilters() {
    // Logic to show active filters
}

function removeFilter(type) {
    // Remove filter logic
}

function resetFilters() {
    currentFilters = { categoryId: 'all', price: 'all', status: 'all', rating: 'all', sort: 'featured', search: '' };
    currentPage = 1; // Reset to first page

    // Reset UI elements
    const categoryFilter = document.getElementById('categoryFilter');
    const priceFilter = document.getElementById('priceFilter');
    const availabilityFilter = document.getElementById('availabilityFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const sortFilter = document.getElementById('sortFilter');
    const searchInput = document.getElementById('globalSearch');

    if (categoryFilter) categoryFilter.value = 'all';
    if (priceFilter) priceFilter.value = 'all';
    if (availabilityFilter) availabilityFilter.value = 'all';
    if (ratingFilter) ratingFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'featured';
    if (searchInput) searchInput.value = '';

    updateActiveFilters();
    loadProducts();
}


function formatCategory(id) {
    const categories = {
        1: 'Figures & Statues',
        2: 'Apparel & Fashion',
        3: 'Accessories',
        4: 'Wall Art & Prints',
        5: 'Manga & Books', 6: 'Collectibles'
    };
    return categories[id] || 'Unknown';
}

/**
 * Navigate to product detail page
 */
function viewProductDetails(productId) {
    window.location.href = `product-detail.html?id=${productId}`;
}

/**
 * Open product modal (legacy - now redirects to detail page)
 */
function openProductModal(productId) {
    viewProductDetails(productId);
}

function showNotification(message) {
    // Notif logic (same as inventory.js)
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 100px; right: 30px; background: linear-gradient(135deg, #e50914, #c40812); color: white; padding: 18px 30px; border-radius: 15px; z-index: 10000;';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Navbar scroll
window.addEventListener('scroll', function () {
    const navbar = document.querySelector('.navbar');
    if (navbar && window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else if (navbar) {
        navbar.classList.remove('scrolled');
    }
});

// ============================================
// Profile Dropdown Functions
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

// Logout function
function logout(event) {
    if (event) event.preventDefault();

    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('accountId');
        sessionStorage.removeItem('userType');
        sessionStorage.removeItem('role');
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('username');

        showNotification('Logged out successfully!');

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

