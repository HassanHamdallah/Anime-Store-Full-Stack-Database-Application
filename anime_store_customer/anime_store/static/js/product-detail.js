/**
 * Product Detail Page JavaScript
 * Handles product details, quantity selection based on stock, and cart functionality
 */

// API Base URL
const API_BASE = '';

// Current product data
let currentProduct = null;
let maxStock = 0;

// Cart from localStorage
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    // Get product ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        showNotification('No product specified', 'error');
        setTimeout(() => {
            window.location.href = 'products.html';
        }, 2000);
        return;
    }

    // Load product details
    await loadProductDetails(productId);

    // Initialize quantity controls
    initializeQuantityControls();

    // Initialize action buttons
    initializeActionButtons();

    // Update cart count
    updateCartCount();

    // Load related products
    await loadRelatedProducts(productId);
});

/**
 * Load product details from API
 */
async function loadProductDetails(productId) {
    try {
        const response = await fetch(`${API_BASE}/api/customer/products/${productId}`);

        if (!response.ok) {
            throw new Error('Product not found');
        }

        currentProduct = await response.json();

        // Update page with product data
        renderProductDetails();

    } catch (error) {
        console.error('Error loading product:', error);
        showNotification('Failed to load product details', 'error');

        // Show error state
        document.getElementById('productName').textContent = 'Product Not Found';
        document.getElementById('productDescription').textContent = 'The product you are looking for does not exist or has been removed.';
    }
}

/**
 * Render product details on the page
 */
function renderProductDetails() {
    if (!currentProduct) return;

    // Update page title
    document.title = `${currentProduct.name} - Anime Store`;

    // Update breadcrumb
    document.getElementById('breadcrumbProduct').textContent = currentProduct.name;

    // Update product image
    const mainImage = document.getElementById('mainProductImage');
    mainImage.src = currentProduct.productImage || '/placeholder.svg?height=500&width=500';
    mainImage.alt = currentProduct.name;
    mainImage.onerror = function() {
        this.src = '/placeholder.svg?height=500&width=500';
    };

    // Update category
    document.getElementById('productCategory').textContent = currentProduct.categoryName || 'Uncategorized';

    // Update product name
    document.getElementById('productName').textContent = currentProduct.name;

    // Update description
    document.getElementById('productDescription').textContent = currentProduct.description || 'No description available.';

    // Update price
    document.getElementById('productPrice').textContent = `$${currentProduct.unitPrice.toFixed(2)}`;

    // Update stock information
    maxStock = currentProduct.totalStock || 0;
    updateStockDisplay();

    // Update meta information
    document.getElementById('productIdMeta').textContent = currentProduct.productId;
    document.getElementById('productCategoryMeta').textContent = currentProduct.categoryName || 'Uncategorized';

    // Enable/disable buttons based on stock
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');

    if (maxStock > 0) {
        addToCartBtn.disabled = false;
        buyNowBtn.disabled = false;
    } else {
        addToCartBtn.disabled = true;
        buyNowBtn.disabled = true;
    }
}

/**
 * Update stock display based on available quantity
 */
function updateStockDisplay() {
    const stockBadge = document.getElementById('stockBadge');
    const stockInfo = document.getElementById('stockInfo');
    const stockText = document.getElementById('stockText');
    const maxQuantityText = document.getElementById('maxQuantity');
    const quantityInput = document.getElementById('quantityInput');

    // Update max quantity input
    quantityInput.max = maxStock;
    quantityInput.value = Math.min(1, maxStock);
    maxQuantityText.textContent = `Max: ${maxStock} available`;

    // Update stock badge and info
    if (maxStock > 10) {
        // In Stock
        stockBadge.textContent = 'In Stock';
        stockBadge.className = 'badge stock-badge';
        stockInfo.className = 'stock-info';
        stockText.textContent = `${maxStock} units available`;

        // Update icon to checkmark
        stockInfo.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span id="stockText">${maxStock} units available</span>
        `;
    } else if (maxStock > 0) {
        // Low Stock
        stockBadge.textContent = 'Low Stock';
        stockBadge.className = 'badge stock-badge low-stock';
        stockInfo.className = 'stock-info low-stock';
        stockText.textContent = `Only ${maxStock} left - Order soon!`;

        stockInfo.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span id="stockText">Only ${maxStock} left - Order soon!</span>
        `;
    } else {
        // Out of Stock
        stockBadge.textContent = 'Out of Stock';
        stockBadge.className = 'badge stock-badge out-of-stock';
        stockInfo.className = 'stock-info out-of-stock';
        stockText.textContent = 'Currently unavailable';

        stockInfo.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span id="stockText">Currently unavailable</span>
        `;

        quantityInput.value = 0;
    }
}

/**
 * Initialize quantity controls
 */
function initializeQuantityControls() {
    const qtyMinus = document.getElementById('qtyMinus');
    const qtyPlus = document.getElementById('qtyPlus');
    const qtyInput = document.getElementById('quantityInput');

    // Minus button
    qtyMinus.addEventListener('click', function() {
        let currentValue = parseInt(qtyInput.value) || 1;
        if (currentValue > 1) {
            qtyInput.value = currentValue - 1;
            updateQuantityButtonStates();
        }
    });

    // Plus button
    qtyPlus.addEventListener('click', function() {
        let currentValue = parseInt(qtyInput.value) || 1;
        if (currentValue < maxStock) {
            qtyInput.value = currentValue + 1;
            updateQuantityButtonStates();
        }
    });

    // Input change
    qtyInput.addEventListener('change', function() {
        let value = parseInt(this.value) || 1;

        // Enforce min/max
        if (value < 1) value = 1;
        if (value > maxStock) value = maxStock;

        this.value = value;
        updateQuantityButtonStates();
    });

    // Initial button states
    updateQuantityButtonStates();
}

/**
 * Update quantity button states based on current value
 */
function updateQuantityButtonStates() {
    const qtyMinus = document.getElementById('qtyMinus');
    const qtyPlus = document.getElementById('qtyPlus');
    const qtyInput = document.getElementById('quantityInput');

    const currentValue = parseInt(qtyInput.value) || 1;

    qtyMinus.disabled = currentValue <= 1;
    qtyPlus.disabled = currentValue >= maxStock;
}

/**
 * Initialize action buttons
 */
function initializeActionButtons() {
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');

    // Add to Cart
    addToCartBtn.addEventListener('click', function() {
        if (!currentProduct || maxStock === 0) return;

        const quantity = parseInt(document.getElementById('quantityInput').value) || 1;
        addToCart(currentProduct, quantity);
    });

    // Buy Now
    buyNowBtn.addEventListener('click', function() {
        if (!currentProduct || maxStock === 0) return;

        const quantity = parseInt(document.getElementById('quantityInput').value) || 1;
        addToCart(currentProduct, quantity);

        // Redirect to cart
        window.location.href = 'cart.html';
    });
}

/**
 * Add product to cart
 */
function addToCart(product, quantity) {
    // Check if product already in cart
    const existingIndex = cart.findIndex(item => item.productId === product.productId);

    if (existingIndex !== -1) {
        // Update quantity, but don't exceed stock
        const newQty = cart[existingIndex].quantity + quantity;
        cart[existingIndex].quantity = Math.min(newQty, maxStock);
    } else {
        // Add new item
        cart.push({
            productId: product.productId,
            name: product.name,
            price: product.unitPrice,
            image: product.productImage,
            quantity: Math.min(quantity, maxStock),
            maxStock: maxStock
        });
    }

    // Save to localStorage
    localStorage.setItem('cart', JSON.stringify(cart));

    // Update cart count
    updateCartCount();

    // Show notification
    showNotification(`Added ${quantity} ${product.name} to cart!`, 'success');
}

/**
 * Update cart count in navbar
 */
function updateCartCount() {
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountEl.textContent = totalItems;
        cartCountEl.style.display = totalItems > 0 ? 'flex' : 'none';
    }
}

/**
 * Load related products (same category)
 */
async function loadRelatedProducts(productId) {
    const container = document.getElementById('relatedProducts');

    try {
        const response = await fetch(`${API_BASE}/api/customer/products/${productId}/related`);

        if (!response.ok) {
            throw new Error('Failed to load related products');
        }

        const products = await response.json();

        if (products.length === 0) {
            container.innerHTML = '<p class="no-products">No related products found.</p>';
            return;
        }

        // Render related products
        container.innerHTML = products.map(product => createRelatedProductCard(product)).join('');

        // Add click handlers
        container.querySelectorAll('.related-product-card').forEach(card => {
            card.addEventListener('click', function() {
                const productId = this.dataset.productId;
                window.location.href = `product-detail.html?id=${productId}`;
            });
        });

    } catch (error) {
        console.error('Error loading related products:', error);
        container.innerHTML = '<p class="error">Failed to load related products.</p>';
    }
}

/**
 * Create related product card HTML
 */
function createRelatedProductCard(product) {
    const stockClass = product.totalStock > 10 ? 'in-stock' :
                       product.totalStock > 0 ? 'low-stock' : 'out-of-stock';
    const stockText = product.totalStock > 10 ? 'In Stock' :
                      product.totalStock > 0 ? `Only ${product.totalStock} left` : 'Out of Stock';

    return `
        <div class="related-product-card" data-product-id="${product.productId}">
            <div class="related-product-image-wrapper" style="overflow: hidden;">
                <img src="${product.productImage || '/placeholder.svg?height=220&width=280'}" 
                     alt="${product.name}" 
                     class="related-product-image"
                     onerror="this.src='/placeholder.svg?height=220&width=280'">
            </div>
            <div class="related-product-info">
                <h3 class="related-product-name">${product.name}</h3>
                <span class="related-product-price">$${product.unitPrice.toFixed(2)}</span>
                <span class="related-product-stock ${stockClass}">${stockText}</span>
            </div>
        </div>
    `;
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${type === 'success' 
                ? '<polyline points="20 6 9 17 4 12"></polyline>' 
                : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
            }
        </svg>
        ${message}
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

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

// ============================================
// Rating Functions
// ============================================
let selectedRating = 0;
let userCurrentRating = 0;

// Initialize rating functionality
async function initializeRatings(productId) {
    // Load product rating summary
    await loadProductRating(productId);

    // Check if user is logged in
    const accountId = sessionStorage.getItem('accountId');

    if (accountId) {
        // Check if user can rate (has purchased)
        await checkCanRate(productId, accountId);

        // Load user's existing rating
        await loadUserRating(productId, accountId);

        // Initialize star rating interactions
        initializeStarRating();
    } else {
        document.getElementById('rateMessage').textContent = 'Login to rate this product';
        document.getElementById('userRatingSection').style.display = 'none';
    }
}

// Load product rating summary
async function loadProductRating(productId) {
    try {
        const response = await fetch(`${API_BASE}/api/products/${productId}/rating`);

        if (response.ok) {
            const data = await response.json();

            // Update average rating display
            document.getElementById('averageRating').textContent = data.averageRating.toFixed(1);
            document.getElementById('totalRatings').textContent = `${data.totalRatings} rating${data.totalRatings !== 1 ? 's' : ''}`;

            // Update star display
            updateStarDisplay('averageRatingStars', data.averageRating);

            // Update distribution bars
            const total = data.totalRatings || 1; // Avoid division by zero
            for (let i = 5; i >= 1; i--) {
                const count = data.distribution[i] || 0;
                const percentage = (count / total) * 100;
                document.getElementById(`dist${i}`).style.width = `${percentage}%`;
                document.getElementById(`count${i}`).textContent = count;
            }
        }
    } catch (error) {
        console.error('Error loading product rating:', error);
    }
}

// Update star display based on rating value
function updateStarDisplay(elementId, rating) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const stars = container.querySelectorAll('.star');
    stars.forEach((star, index) => {
        if (index < Math.floor(rating)) {
            star.textContent = '★';
            star.classList.add('filled');
        } else if (index < rating) {
            star.textContent = '★';
            star.classList.add('half-filled');
        } else {
            star.textContent = '☆';
            star.classList.remove('filled', 'half-filled');
        }
    });
}

// Check if user can rate the product
async function checkCanRate(productId, accountId) {
    try {
        const response = await fetch(`${API_BASE}/api/products/${productId}/can-rate/${accountId}`);

        if (response.ok) {
            const data = await response.json();

            if (data.canRate) {
                // Show rating section for any logged-in user
                const message = data.hasPurchased ? 'Verified Purchase - Share your experience' : 'Share your experience with this product';
                document.getElementById('rateMessage').textContent = message;
                document.getElementById('userRatingSection').style.display = 'block';
            } else {
                document.getElementById('rateMessage').textContent = data.message || 'Login to rate this product';
                document.getElementById('userRatingSection').style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error checking can rate:', error);
        // On error, still show rating section for logged-in users
        document.getElementById('rateMessage').textContent = 'Share your experience with this product';
        document.getElementById('userRatingSection').style.display = 'block';
    }
}

// Load user's existing rating
async function loadUserRating(productId, accountId) {
    try {
        const response = await fetch(`${API_BASE}/api/products/${productId}/rating/${accountId}`);

        if (response.ok) {
            const data = await response.json();

            if (data.hasRated) {
                userCurrentRating = data.rating;
                selectedRating = data.rating;
                highlightStars(data.rating);
                document.getElementById('ratingText').textContent = `Your rating: ${data.rating} star${data.rating !== 1 ? 's' : ''}`;
                document.getElementById('submitRatingBtn').textContent = 'Update Rating';
                document.getElementById('submitRatingBtn').disabled = false;
            }
        }
    } catch (error) {
        console.error('Error loading user rating:', error);
    }
}

// Initialize star rating interactions
function initializeStarRating() {
    const stars = document.querySelectorAll('#starRating .rate-star');

    stars.forEach(star => {
        // Hover effect
        star.addEventListener('mouseenter', function() {
            const rating = parseInt(this.dataset.rating);
            highlightStars(rating);
        });

        // Mouse leave - restore selected rating
        star.addEventListener('mouseleave', function() {
            highlightStars(selectedRating);
        });

        // Click to select
        star.addEventListener('click', function() {
            selectedRating = parseInt(this.dataset.rating);
            highlightStars(selectedRating);
            document.getElementById('ratingText').textContent = getRatingText(selectedRating);
            document.getElementById('submitRatingBtn').disabled = false;
        });
    });

    // Submit button
    document.getElementById('submitRatingBtn').addEventListener('click', submitRating);
}

// Highlight stars up to a given rating
function highlightStars(rating) {
    const stars = document.querySelectorAll('#starRating .rate-star');

    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

// Get descriptive text for rating
function getRatingText(rating) {
    const texts = {
        1: 'Poor - Not recommended',
        2: 'Fair - Below average',
        3: 'Good - Average',
        4: 'Very Good - Recommended',
        5: 'Excellent - Highly recommended'
    };
    return texts[rating] || 'Click to rate';
}

// Submit rating
async function submitRating() {
    const accountId = sessionStorage.getItem('accountId');
    const productId = currentProduct?.productId;

    if (!accountId || !productId || !selectedRating) {
        showNotification('Unable to submit rating', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitRatingBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const response = await fetch(`${API_BASE}/api/products/${productId}/rating`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                rating: selectedRating
            })
        });

        if (response.ok) {
            const data = await response.json();

            showNotification(data.message, 'success');

            // Update display with new average
            document.getElementById('averageRating').textContent = data.averageRating.toFixed(1);
            document.getElementById('totalRatings').textContent = `${data.totalRatings} rating${data.totalRatings !== 1 ? 's' : ''}`;
            updateStarDisplay('averageRatingStars', data.averageRating);

            // Reload full rating data
            await loadProductRating(productId);

            userCurrentRating = selectedRating;
            document.getElementById('ratingText').textContent = `Your rating: ${selectedRating} star${selectedRating !== 1 ? 's' : ''}`;
            submitBtn.textContent = 'Update Rating';
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to submit rating', 'error');
        }
    } catch (error) {
        console.error('Error submitting rating:', error);
        showNotification('Error submitting rating', 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

// Call initializeRatings after product loads
const originalLoadProductDetails = loadProductDetails;
loadProductDetails = async function(productId) {
    await originalLoadProductDetails(productId);
    await initializeRatings(productId);
};

