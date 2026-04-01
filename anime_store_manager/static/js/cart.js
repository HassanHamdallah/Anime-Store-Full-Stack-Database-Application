// Shopping Cart JavaScript - Connected to Database API

// ============================================
// API ENDPOINTS USED:
// ============================================
// 1. POST /api/customer/cart/validate - Validate cart items and check stock
// 2. POST /api/customer/cart/summary - Get product details for cart items
// 3. POST /api/customer/cart/checkout - Process checkout and create order
// 4. GET /api/customer/cart/shipping-address/:accountId - Get customer address
// 5. POST /api/customer/cart/check-stock - Check stock availability
// 6. GET /api/customer/product-price/:productId - Get current product price
// ============================================

// API Base URL
const API_BASE = '';

// Mock promo codes (could also be from database)
const promoCodes = {
    'ANIME10': { discount: 0.10, type: 'percentage', description: '10% off' },
    'SAVE20': { discount: 20, type: 'fixed', description: '$20 off' },
    'FREESHIP': { discount: 0, type: 'shipping', description: 'Free shipping' },
    'NEWUSER': { discount: 0.15, type: 'percentage', description: '15% off for new users' }
};

// State Management
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let appliedPromo = null;
const TAX_RATE = 0.10; // 10% tax
const FREE_SHIPPING_THRESHOLD = 100;
const STANDARD_SHIPPING = 9.99;

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    await validateAndLoadCart();
    initializeCheckout();
    loadRecommendedProducts();
});

// ============================================
// Validate Cart with API and Load
// ============================================
async function validateAndLoadCart() {
    if (cart.length === 0) {
        loadCart();
        return;
    }

    try {
        // Validate cart items with backend
        const response = await fetch(`${API_BASE}/api/customer/cart/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart.map(item => ({
                    productId: item.productId || item.id,
                    quantity: item.quantity
                }))
            })
        });

        if (response.ok) {
            const data = await response.json();
            
            // Update cart with validated data
            data.items.forEach(validatedItem => {
                const cartItem = cart.find(c => (c.productId || c.id) === validatedItem.productId);
                if (cartItem && validatedItem.valid) {
                    cartItem.name = validatedItem.name;
                    cartItem.price = validatedItem.unitPrice;
                    cartItem.image = validatedItem.productImage;
                    cartItem.stock = validatedItem.stock;
                } else if (cartItem && !validatedItem.valid) {
                    // Update stock info even if not fully valid
                    cartItem.stock = validatedItem.stock;
                    if (validatedItem.stock < cartItem.quantity) {
                        cartItem.quantity = validatedItem.stock;
                    }
                }
            });

            // Remove items that don't exist anymore
            cart = cart.filter(item => {
                const validated = data.items.find(v => v.productId === (item.productId || item.id));
                return validated && validated.stock > 0;
            });

            localStorage.setItem('cart', JSON.stringify(cart));
        }
    } catch (error) {
        console.error('Error validating cart:', error);
    }

    loadCart();
}

// ============================================
// QUERY 1: Load Cart Items
// ============================================
function loadCart() {
    const cartItemsContainer = document.getElementById('cartItems');
    const emptyCart = document.getElementById('emptyCart');
    const orderSummary = document.getElementById('orderSummary');
    const continueShopping = document.getElementById('continueShopping');
    const itemCount = document.getElementById('itemCount');

    if (cart.length === 0) {
        cartItemsContainer.style.display = 'none';
        emptyCart.style.display = 'block';
        orderSummary.style.display = 'none';
        continueShopping.style.display = 'none';
        itemCount.textContent = '0';
        updateCartCount();
        return;
    }

    cartItemsContainer.style.display = 'flex';
    emptyCart.style.display = 'none';
    orderSummary.style.display = 'block';
    continueShopping.style.display = 'block';
    itemCount.textContent = cart.length;

    cartItemsContainer.innerHTML = cart.map((item, index) => createCartItemHTML(item, index)).join('');
    calculateTotals();
    updateCartCount();
}

// ============================================
// Create Cart Item HTML
// ============================================
function createCartItemHTML(item, index) {
    const stockClass = item.stock > 10 ? 'in-stock' : 'low-stock';
    const stockText = item.stock > 10 ? `In Stock (${item.stock} units)` : `Low Stock (${item.stock} units)`;
    const itemTotal = (item.price * item.quantity).toFixed(2);

    return `
        <div class="cart-item">
            <img src="${item.image}" alt="${item.name}" class="cart-item-image">
            <div class="cart-item-details">
                <h3 class="cart-item-name">${item.name}</h3>
                <p class="cart-item-category">${formatCategory(item.category)}</p>
                <p class="cart-item-sku">SKU: ${item.sku}</p>
                <div class="cart-item-stock ${stockClass}">
                    ${getStockIcon(stockClass)}
                    ${stockText}
                </div>
            </div>
            <div class="cart-item-actions">
                <div class="cart-item-price">$${itemTotal}</div>
                <div class="quantity-controls">
                    <button class="qty-btn" onclick="updateQuantity(${index}, -1)" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                    <input type="number" value="${item.quantity}" min="1" max="${item.stock}" readonly>
                    <button class="qty-btn" onclick="updateQuantity(${index}, 1)" ${item.quantity >= item.stock ? 'disabled' : ''}>+</button>
                </div>
                <button class="btn-remove" onclick="removeItem(${index})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Remove
                </button>
            </div>
        </div>
    `;
}

// ============================================
// QUERY 5: Update Quantity
// ============================================
function updateQuantity(index, change) {
    const item = cart[index];
    const newQuantity = item.quantity + change;

    if (newQuantity < 1 || newQuantity > item.stock) {
        return;
    }

    cart[index].quantity = newQuantity;
    localStorage.setItem('cart', JSON.stringify(cart));
    loadCart();
    showNotification(`Quantity updated for ${item.name}`);
}

// ============================================
// QUERY 6: Remove Item
// ============================================
function removeItem(index) {
    const item = cart[index];
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    loadCart();
    showNotification(`${item.name} removed from cart`);
}

// ============================================
// Clear Cart
// ============================================
document.getElementById('clearCart')?.addEventListener('click', function () {
    if (confirm('Are you sure you want to clear your cart?')) {
        cart = [];
        localStorage.setItem('cart', JSON.stringify(cart));
        loadCart();
        showNotification('Cart cleared');
    }
});

// ============================================
// QUERY 2-4, 7-10: Calculate Totals
// ============================================
function calculateTotals() {
    // Calculate subtotal
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Calculate shipping
    let shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;

    // Apply promo code for free shipping
    if (appliedPromo && appliedPromo.type === 'shipping') {
        shipping = 0;
    }

    // Calculate discount
    let discount = 0;
    if (appliedPromo) {
        if (appliedPromo.type === 'percentage') {
            discount = subtotal * appliedPromo.discount;
        } else if (appliedPromo.type === 'fixed') {
            discount = appliedPromo.discount;
        }
    }

    // Calculate tax (after discount, before shipping)
    const taxableAmount = subtotal - discount;
    const tax = taxableAmount * TAX_RATE;

    // Calculate total
    const total = subtotal - discount + tax + shipping;

    // Update UI
    document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('shipping').textContent = shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`;
    document.getElementById('tax').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('total').textContent = `$${total.toFixed(2)}`;
    document.getElementById('reviewTotal').textContent = `$${total.toFixed(2)}`;

    // Show/hide discount row
    const discountRow = document.getElementById('discountRow');
    if (discount > 0) {
        discountRow.style.display = 'flex';
        document.getElementById('discount').textContent = `-$${discount.toFixed(2)}`;
    } else {
        discountRow.style.display = 'none';
    }
}

// ============================================
// QUERY 7: Apply Promo Code
// ============================================
document.getElementById('applyPromo')?.addEventListener('click', function () {
    const promoInput = document.getElementById('promoCode');
    const promoCode = promoInput.value.trim().toUpperCase();
    const promoMessage = document.getElementById('promoMessage');

    if (!promoCode) {
        promoMessage.textContent = 'Please enter a promo code';
        promoMessage.className = 'promo-message error';
        return;
    }

    if (promoCodes[promoCode]) {
        appliedPromo = promoCodes[promoCode];
        promoMessage.textContent = `✓ Promo code applied: ${appliedPromo.description}`;
        promoMessage.className = 'promo-message success';
        promoInput.value = '';
        calculateTotals();
        showNotification('Promo code applied successfully!');
    } else {
        promoMessage.textContent = '✗ Invalid promo code';
        promoMessage.className = 'promo-message error';
    }
});

// ============================================
// QUERY 11: Load Recommended Products from API
// ============================================
async function loadRecommendedProducts() {
    const recommendedContainer = document.getElementById('recommendedItems');
    if (!recommendedContainer) return;

    const accountId = sessionStorage.getItem('accountId');
    
    try {
        const response = await fetch(`${API_BASE}/api/customer/home/recommendations${accountId ? `?accountId=${accountId}` : ''}`);
        
        if (response.ok) {
            const data = await response.json();
            const recommended = data.products || [];

            if (recommended.length === 0) {
                recommendedContainer.innerHTML = '<p class="no-recommendations">No recommendations available</p>';
                return;
            }

            recommendedContainer.innerHTML = recommended.slice(0, 4).map(item => `
                <div class="recommended-item">
                    <img src="${item.productImage || '/static/images/placeholder.jpg'}" alt="${item.name}" onerror="this.src='/static/images/placeholder.jpg'">
                    <div class="recommended-item-info">
                        <h4>${item.name}</h4>
                        <p>$${parseFloat(item.unitPrice).toFixed(2)}</p>
                    </div>
                    <button class="btn-add-recommended" onclick="addRecommendedToCart(${item.productId}, '${item.name.replace(/'/g, "\\'")}', ${item.unitPrice}, '${item.productImage || ''}', ${item.stock || 0})">
                        Add
                    </button>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading recommendations:', error);
        recommendedContainer.innerHTML = '<p class="no-recommendations">Unable to load recommendations</p>';
    }
}

function addRecommendedToCart(productId, name, price, image, stock) {
    const existingIndex = cart.findIndex(item => (item.productId || item.id) === productId);

    if (existingIndex > -1) {
        if (cart[existingIndex].quantity < stock) {
            cart[existingIndex].quantity++;
        } else {
            showNotification('Maximum stock reached');
            return;
        }
    } else {
        cart.push({
            productId: productId,
            name: name,
            price: price,
            image: image || '/static/images/placeholder.jpg',
            stock: stock,
            quantity: 1
        });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    loadCart();
    showNotification('Product added to cart!');
}

// ============================================
// Checkout Modal Functions
// ============================================
function initializeCheckout() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', openCheckoutModal);
    }
}

function openCheckoutModal() {
    if (cart.length === 0) {
        showNotification('Your cart is empty!');
        return;
    }

    const modal = document.getElementById('checkoutModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function nextStep(stepNumber) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
    });

    // Show selected step
    document.getElementById(`step${stepNumber}`).classList.add('active');
    document.querySelector(`.step[data-step="${stepNumber}"]`).classList.add('active');
}

// ============================================
// QUERY 12: Place Order via API
// ============================================
async function placeOrder() {
    const accountId = sessionStorage.getItem('accountId');
    
    if (!accountId) {
        showNotification('Please login to place an order');
        window.location.href = 'login.html';
        return;
    }

    // Get shipping address from form
    const shippingAddress = document.getElementById('shippingAddress')?.value || 
                           document.getElementById('address')?.value || '';

    try {
        const response = await fetch(`${API_BASE}/api/customer/cart/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: parseInt(accountId),
                items: cart.map(item => ({
                    productId: item.productId || item.id,
                    quantity: item.quantity
                })),
                shippingAddress: shippingAddress
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Clear cart
            cart = [];
            localStorage.setItem('cart', JSON.stringify(cart));

            // Show success message
            closeCheckoutModal();
            showSuccessModal(data.orderId, data.totalAmount);
        } else {
            showNotification(data.error || 'Failed to place order. Please try again.');
        }
    } catch (error) {
        console.error('Error placing order:', error);
        showNotification('Error placing order. Please try again.');
    }
}

function showSuccessModal(orderId, totalAmount) {
    const successHTML = `
        <div class="modal active" id="successModal">
            <div class="modal-overlay" onclick="closeSuccessModal()"></div>
            <div class="modal-content" style="max-width: 500px; text-align: center; padding: 50px;">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#00ff87" stroke-width="2" style="margin-bottom: 20px;">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h2 style="font-size: 32px; color: #ffffff; margin-bottom: 15px;">Order Placed Successfully!</h2>
                <p style="font-size: 16px; color: rgba(255,255,255,0.7); margin-bottom: 10px;">
                    Order ID: <strong>#${orderId || 'N/A'}</strong>
                </p>
                <p style="font-size: 18px; color: #00ff87; margin-bottom: 30px;">
                    Total: $${totalAmount ? parseFloat(totalAmount).toFixed(2) : '0.00'}
                </p>
                <p style="font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 30px;">
                    You will receive a confirmation email shortly.
                </p>
                <button onclick="closeSuccessModal()" style="background: linear-gradient(135deg, #e50914, #c40812); color: #ffffff; border: none; padding: 16px 40px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer;">
                    Continue Shopping
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', successHTML);
    setTimeout(() => {
        loadCart();
    }, 500);
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.remove();
    }
    window.location.href = 'products.html';
}

// ============================================
// Update Cart Count
// ============================================
function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) {
        cartCount.textContent = totalItems;
    }
}

// ============================================
// Utility Functions
// ============================================
function formatCategory(category) {
    const categories = {
        'figures': 'Figures & Statues',
        'clothing': 'Apparel & Fashion',
        'accessories': 'Accessories',
        'posters': 'Wall Art & Prints',
        'manga': 'Manga & Books',
        'collectibles': 'Collectibles'
    };
    return categories[category] || category;
}

function getStockIcon(stockClass) {
    const icons = {
        'in-stock': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        'low-stock': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    };
    return icons[stockClass] || '';
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

// Navbar scroll effect
window.addEventListener('scroll', function () {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});
