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
    const stockClass = item.stock > 10 ? 'in-stock' : (item.stock > 0 ? 'low-stock' : 'out-of-stock');
    const stockText = item.stock > 10 ? `In Stock (${item.stock} units)` : (item.stock > 0 ? `Low Stock (${item.stock} units)` : 'Out of Stock');
    const itemTotal = (item.price * item.quantity).toFixed(2);
    const productId = item.productId || item.id;

    return `
        <div class="cart-item" data-product-id="${productId}">
            <a href="product-detail.html?id=${productId}" class="cart-item-image-link">
                <img src="${item.image || '/static/images/placeholder.jpg'}" alt="${item.name}" class="cart-item-image" onerror="this.src='/static/images/placeholder.jpg'">
            </a>
            <div class="cart-item-details">
                <a href="product-detail.html?id=${productId}" class="cart-item-name-link">
                    <h3 class="cart-item-name">${item.name}</h3>
                </a>
                <p class="cart-item-price-unit">$${parseFloat(item.price).toFixed(2)} each</p>
                <div class="cart-item-stock ${stockClass}">
                    ${getStockIcon(stockClass)}
                    ${stockText}
                </div>
                <a href="product-detail.html?id=${productId}" class="btn-view-product">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View Product
                </a>
            </div>
            <div class="cart-item-actions">
                <div class="cart-item-total">$${itemTotal}</div>
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

    // Calculate total
    const total = subtotal - discount + shipping;

    // Update UI
    document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('shipping').textContent = shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`;
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

// ============================================
// Geolocation - Detect and Autofill Address
// ============================================
async function detectAndFillLocation() {
    const btn = document.querySelector('.btn-detect-location');
    const statusEl = document.getElementById('locationStatus');

    if (!navigator.geolocation) {
        if (statusEl) {
            statusEl.textContent = 'Geolocation not supported by your browser';
            statusEl.className = 'location-status error';
        }
        return;
    }

    // Show loading state
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }
    if (statusEl) {
        statusEl.textContent = 'Detecting your location...';
        statusEl.className = 'location-status';
    }

    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                // Reverse geocode to get address details
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
                const data = await response.json();

                if (data && data.address) {
                    const address = data.address;

                    // Fill in the form fields
                    const streetAddress = [
                        address.house_number,
                        address.road || address.street || address.pedestrian
                    ].filter(Boolean).join(' ');

                    // Address field
                    const shippingAddress = document.getElementById('shippingAddress');
                    if (shippingAddress && streetAddress) {
                        shippingAddress.value = streetAddress || address.suburb || address.neighbourhood || '';
                    }

                    // City field
                    const shippingCity = document.getElementById('shippingCity');
                    if (shippingCity) {
                        shippingCity.value = address.city || address.town || address.village || address.municipality || address.county || '';
                    }

                    // ZIP Code field
                    const shippingZip = document.getElementById('shippingZip');
                    if (shippingZip && address.postcode) {
                        shippingZip.value = address.postcode;
                    }

                    // Country field - try to match the select options
                    const shippingCountry = document.getElementById('shippingCountry');
                    if (shippingCountry && address.country) {
                        // Try to find matching option
                        const countryName = address.country;
                        const options = shippingCountry.options;

                        for (let i = 0; i < options.length; i++) {
                            if (options[i].value.toLowerCase() === countryName.toLowerCase() ||
                                options[i].text.toLowerCase() === countryName.toLowerCase()) {
                                shippingCountry.value = options[i].value;
                                break;
                            }
                        }

                        // If no match found, check common variations
                        const countryMappings = {
                            'palestinian territory': 'Palestine',
                            'palestinian territories': 'Palestine',
                            'hashemite kingdom of jordan': 'Jordan',
                            'united states of america': 'United States',
                            'usa': 'United States',
                            'uk': 'United Kingdom',
                            'great britain': 'United Kingdom',
                            'uae': 'United Arab Emirates'
                        };

                        const mappedCountry = countryMappings[countryName.toLowerCase()];
                        if (mappedCountry) {
                            shippingCountry.value = mappedCountry;
                        }
                    }

                    if (statusEl) {
                        statusEl.textContent = '✓ Location detected successfully!';
                        statusEl.className = 'location-status success';
                    }

                    showNotification('Address filled from your location!');
                } else {
                    throw new Error('Could not parse address');
                }
            } catch (error) {
                console.error('Error reverse geocoding:', error);
                if (statusEl) {
                    statusEl.textContent = 'Could not determine address. Please enter manually.';
                    statusEl.className = 'location-status error';
                }
            }

            // Reset button state
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        },
        function(error) {
            console.error('Geolocation error:', error);
            let errorMessage = 'Could not detect location.';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location access denied. Please enter address manually.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location unavailable. Please enter address manually.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out. Please try again.';
                    break;
            }

            if (statusEl) {
                statusEl.textContent = errorMessage;
                statusEl.className = 'location-status error';
            }

            // Reset button state
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

async function openCheckoutModal() {
    if (cart.length === 0) {
        showNotification('Your cart is empty!');
        return;
    }

    const modal = document.getElementById('checkoutModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Fetch and pre-fill customer information from database
    const accountId = sessionStorage.getItem('accountId');

    if (accountId) {
        try {
            // Get customer profile (username, email, phone, address)
            const profileResponse = await fetch(`${API_BASE}/api/customer/profile/${accountId}`);
            if (profileResponse.ok) {
                const profileData = await profileResponse.json();

                // Auto-fill Full Name from database
                if (profileData.username) {
                    const shippingNameInput = document.getElementById('shippingName');
                    if (shippingNameInput) shippingNameInput.value = profileData.username;
                }

                // Auto-fill Email
                if (profileData.email) {
                    const shippingEmailInput = document.getElementById('shippingEmail');
                    if (shippingEmailInput) shippingEmailInput.value = profileData.email;
                }

                // Auto-fill Phone Number from database
                if (profileData.phone) {
                    const shippingPhoneInput = document.getElementById('shippingPhone');
                    if (shippingPhoneInput) shippingPhoneInput.value = profileData.phone;
                }

                // Auto-fill Address
                if (profileData.defaultShippingAddress) {
                    const shippingAddressInput = document.getElementById('shippingAddress');
                    if (shippingAddressInput) shippingAddressInput.value = profileData.defaultShippingAddress;
                }
            }
        } catch (error) {
            console.error('Error loading customer info:', error);
        }
    }

    // Reset to step 1
    nextStep(1);
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function nextStep(stepNumber) {
    // Validate current step before moving forward
    if (stepNumber === 2) {
        // Validate shipping info
        const shippingName = document.getElementById('shippingName')?.value;
        const shippingAddress = document.getElementById('shippingAddress')?.value;
        const shippingCity = document.getElementById('shippingCity')?.value;
        const shippingCountry = document.getElementById('shippingCountry')?.value;

        if (!shippingName || !shippingAddress || !shippingCity || !shippingCountry) {
            showNotification('Please fill in all required shipping fields');
            return;
        }
    }

    if (stepNumber === 3) {
        // Validate payment info if CARD
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'CARD';
        if (paymentMethod === 'CARD') {
            const cardNumber = document.getElementById('cardNumber')?.value;
            const cardExpiry = document.getElementById('cardExpiry')?.value;
            const cardCvv = document.getElementById('cardCvv')?.value;

            if (!cardNumber || !cardExpiry || !cardCvv) {
                showNotification('Please fill in all card details');
                return;
            }
        }

        // Update review section
        updateReviewSection();
    }

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

    // Mark previous steps as completed
    for (let i = 1; i < stepNumber; i++) {
        document.querySelector(`.step[data-step="${i}"]`)?.classList.add('completed');
    }
}

// ============================================
// Payment Method Selection
// ============================================
function selectPaymentMethod(method) {
    // Always use CARD method
    method = 'CARD';

    // Update radio button
    document.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
        input.checked = input.value === 'CARD';
    });

    // Update visual selection
    document.querySelectorAll('.payment-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`.payment-option input[value="CARD"]`)?.closest('.payment-option')?.classList.add('selected');

    // Show card details
    const cardDetails = document.getElementById('cardDetails');
    if (cardDetails) cardDetails.style.display = 'block';
}

// ============================================
// Format Card Number Input
// ============================================
function formatCardNumber(input) {
    let value = input.value.replace(/\s/g, '').replace(/\D/g, '');
    let formattedValue = '';
    for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) {
            formattedValue += ' ';
        }
        formattedValue += value[i];
    }
    input.value = formattedValue.substring(0, 19);
}

// ============================================
// Format Expiry Date Input
// ============================================
function formatExpiry(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    input.value = value;
}

// ============================================
// Update Review Section
// ============================================
function updateReviewSection() {
    // Shipping address
    const shippingName = document.getElementById('shippingName')?.value || '';
    const shippingAddress = document.getElementById('shippingAddress')?.value || '';
    const shippingCity = document.getElementById('shippingCity')?.value || '';
    const shippingZip = document.getElementById('shippingZip')?.value || '';
    const shippingCountry = document.getElementById('shippingCountry')?.value || '';
    const shippingPhone = document.getElementById('shippingPhone')?.value || '';

    const reviewShippingAddress = document.getElementById('reviewShippingAddress');
    if (reviewShippingAddress) {
        reviewShippingAddress.innerHTML = `
            <strong>${shippingName}</strong><br>
            ${shippingAddress}<br>
            ${shippingCity}, ${shippingZip}<br>
            ${shippingCountry}<br>
            Phone: ${shippingPhone}
        `;
    }

    // Payment method - Always CARD/Visa
    const paymentMethod = 'CARD';
    const cardNumber = document.getElementById('cardNumber')?.value || '';
    const reviewPaymentMethod = document.getElementById('reviewPaymentMethod');
    if (reviewPaymentMethod) {
        const last4 = cardNumber.replace(/\s/g, '').slice(-4);
        reviewPaymentMethod.textContent = `Visa / Credit Card ending in ${last4 || '****'}`;
    }

    // Order items
    const reviewOrderItems = document.getElementById('reviewOrderItems');
    if (reviewOrderItems) {
        reviewOrderItems.innerHTML = cart.map(item => `
            <div class="review-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span>${item.name} x ${item.quantity}</span>
                <span>$${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        `).join('');
    }

    // Totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
    if (appliedPromo && appliedPromo.type === 'shipping') shipping = 0;

    let discount = 0;
    if (appliedPromo) {
        if (appliedPromo.type === 'percentage') discount = subtotal * appliedPromo.discount;
        else if (appliedPromo.type === 'fixed') discount = appliedPromo.discount;
    }

    const total = subtotal - discount + shipping;

    const reviewSubtotal = document.getElementById('reviewSubtotal');
    const reviewShipping = document.getElementById('reviewShipping');
    const reviewTotal = document.getElementById('reviewTotal');

    if (reviewSubtotal) reviewSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    if (reviewShipping) reviewShipping.textContent = shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`;
    if (reviewTotal) reviewTotal.textContent = `$${total.toFixed(2)}`;
}

// ============================================
// QUERY 12: Place Order via API with Payment
// ============================================
async function placeOrder() {
    const accountId = sessionStorage.getItem('accountId');
    
    if (!accountId) {
        showNotification('Please login to place an order');
        window.location.href = 'login.html';
        return;
    }

    // Get shipping address from form
    const shippingName = document.getElementById('shippingName')?.value || '';
    const shippingAddress = document.getElementById('shippingAddress')?.value || '';
    const shippingCity = document.getElementById('shippingCity')?.value || '';
    const shippingZip = document.getElementById('shippingZip')?.value || '';
    const shippingCountry = document.getElementById('shippingCountry')?.value || '';
    const shippingPhone = document.getElementById('shippingPhone')?.value || '';

    const fullAddress = `${shippingName}, ${shippingAddress}, ${shippingCity} ${shippingZip}, ${shippingCountry}, Phone: ${shippingPhone}`;

    // Get selected payment method - Always CARD/Visa
    const paymentMethod = 'CARD';

    // Validate required fields
    if (!shippingAddress || !shippingCity || !shippingCountry) {
        showNotification('Please complete shipping information');
        nextStep(1);
        return;
    }

    // Validate card details
    const cardNumber = document.getElementById('cardNumber')?.value || '';
    const cardExpiry = document.getElementById('cardExpiry')?.value || '';
    const cardCvv = document.getElementById('cardCvv')?.value || '';

    if (!cardNumber || !cardExpiry || !cardCvv) {
        showNotification('Please complete card details');
        nextStep(2);
        return;
    }

    // Disable button during processing
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    const placeOrderText = document.getElementById('placeOrderText');
    if (placeOrderBtn) {
        placeOrderBtn.disabled = true;
        if (placeOrderText) placeOrderText.textContent = 'Processing...';
    }

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
                shippingAddress: fullAddress,
                paymentMethod: paymentMethod,
                paymentDetails: {
                    cardLast4: paymentMethod === 'CARD' ? (document.getElementById('cardNumber')?.value || '').slice(-4) : null
                }
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Clear cart
            cart = [];
            localStorage.setItem('cart', JSON.stringify(cart));

            // Show success message
            closeCheckoutModal();
            showSuccessModal(data.orderId, data.totalAmount, data.paymentReference, paymentMethod);
        } else {
            showNotification(data.error || 'Failed to place order. Please try again.');
            if (placeOrderBtn) {
                placeOrderBtn.disabled = false;
                if (placeOrderText) placeOrderText.textContent = 'Place Order';
            }
        }
    } catch (error) {
        console.error('Error placing order:', error);
        showNotification('Error placing order. Please try again.');
        if (placeOrderBtn) {
            placeOrderBtn.disabled = false;
            if (placeOrderText) placeOrderText.textContent = 'Place Order';
        }
    }
}

function showSuccessModal(orderId, totalAmount, paymentReference, paymentMethod) {
    const paymentMethodText = 'Visa / Credit Card';

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
                    Order ID: <strong style="color: #00ff87;">#${orderId || 'N/A'}</strong>
                </p>
                <p style="font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 10px;">
                    Payment Reference: <strong>${paymentReference || 'N/A'}</strong>
                </p>
                <p style="font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 10px;">
                    Payment Method: <strong>${paymentMethodText}</strong>
                </p>
                <p style="font-size: 24px; color: #00ff87; margin-bottom: 20px; font-weight: bold;">
                    Total Paid: $${totalAmount ? parseFloat(totalAmount).toFixed(2) : '0.00'}
                </p>
                <div style="background: rgba(0,255,135,0.1); border: 1px solid rgba(0,255,135,0.3); border-radius: 10px; padding: 15px; margin-bottom: 25px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00ff87" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span style="color: #00ff87;">Payment Successful</span>
                </div>
                <p style="font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 30px;">
                    A confirmation email has been sent to your email address.
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="viewOrderDetails(${orderId})" style="background: transparent; border: 2px solid rgba(255,255,255,0.3); color: #ffffff; padding: 14px 30px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        View Order
                    </button>
                    <button onclick="closeSuccessModal()" style="background: linear-gradient(135deg, #e50914, #c40812); color: #ffffff; border: none; padding: 14px 30px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        Continue Shopping
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', successHTML);
    setTimeout(() => {
        loadCart();
    }, 500);
}

function viewOrderDetails(orderId) {
    window.location.href = `orders.html?orderId=${orderId}`;
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

