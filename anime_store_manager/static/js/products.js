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
    rating: 'all',
    status: 'all',
    sort: 'featured',
    search: ''
};

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
    initializeViewToggle();
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
async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<div class="loading">Loading products...</div>';
    
    try {
        let url = `${API_BASE}/api/customer/products?page=1&limit=50`;
        
        // Add filters to URL
        if (currentFilters.categoryId !== 'all') {
            url = `${API_BASE}/api/customer/products/category/${currentFilters.categoryId}`;
        }
        
        if (currentFilters.search) {
            url = `${API_BASE}/api/customer/products/search?q=${encodeURIComponent(currentFilters.search)}`;
        }
        
        if (currentFilters.price !== 'all') {
            const [min, max] = currentFilters.price.split('-');
            url = `${API_BASE}/api/customer/products/price-range?min=${min}&max=${max === '+' ? '99999' : max}`;
        }
        
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
    const ratingFilter = document.getElementById('ratingFilter');
    const availabilityFilter = document.getElementById('availabilityFilter');
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

    if (ratingFilter) {
        ratingFilter.addEventListener('change', (e) => {
            currentFilters.rating = e.target.value;
            renderProducts(); // Client-side filter
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

    // Filter by rating (client-side)
    if (currentFilters.rating !== 'all') {
        const minRating = parseFloat(currentFilters.rating);
        filtered = filtered.filter(p => (p.rating || 0) >= minRating);
    }

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
        case 'rating': filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
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

    if (productCount) productCount.textContent = filtered.length;
    if (!grid) return;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <h3 style="color: rgba(255,255,255,0.7);">No products found</h3>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(product => createProductCard(product)).join('');
    initializeWishlistButtons();
}

// Create Card
function createProductCard(product) {
    const isInWishlist = wishlist.some(item => item.productId === product.productId);
    const price = product.unitPrice || product.price || 0;
    const stock = product.totalStock || product.stock || product.quantityOnHand || 0;

    // Determine stock class for UI
    let stockClass = '';
    let stockText = '';
    if (stock > 10) { stockClass = 'in-stock'; stockText = 'In Stock'; }
    else if (stock > 0) { stockClass = 'low-stock'; stockText = `Low Stock (${stock})`; }
    else { stockClass = 'out-of-stock'; stockText = 'Out of Stock'; }

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
                    <button class="quick-view-btn" onclick="openProductModal(${product.productId})">Quick View</button>
                </div>
            </div>
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-category">${product.categoryName || formatCategory(product.categoryId)}</p>
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

function openProductModal(productId) {
    // Basic modal logic
}

function closeProductModal() {
    // Basic modal logic
}

// Utilities
function updateActiveFilters() {
    // Logic to show active filters
}

function removeFilter(type) {
    // Remove filter logic
}

function resetFilters() {
    currentFilters = { categoryId: 'all', price: 'all', rating: 'all', status: 'all', sort: 'featured', search: '' };
    
    // Reset UI elements
    const categoryFilter = document.getElementById('categoryFilter');
    const priceFilter = document.getElementById('priceFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const availabilityFilter = document.getElementById('availabilityFilter');
    const sortFilter = document.getElementById('sortFilter');
    const searchInput = document.getElementById('globalSearch');
    
    if (categoryFilter) categoryFilter.value = 'all';
    if (priceFilter) priceFilter.value = 'all';
    if (ratingFilter) ratingFilter.value = 'all';
    if (availabilityFilter) availabilityFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'featured';
    if (searchInput) searchInput.value = '';
    
    loadProducts();
}

function initializeViewToggle() {
    // View toggle logic
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
