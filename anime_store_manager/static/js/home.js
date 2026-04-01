// Home Page JavaScript - Connected to Database API
// All data fetched from backend - no dummy data

// State Management
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let featuredProducts = [];
let bestsellers = [];
let newArrivals = [];
let categories = [];
let homeStats = {};

// API Base URL
const API_BASE = '';

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    initializeNavbar();
    initializeParallax();
    updateCartCount();
    await loadAllHomeData();
    initializeEventListeners();
});

// ============================================
// Navbar scroll effect
// ============================================
function initializeNavbar() {
    const navbar = document.querySelector(".navbar");
    if (navbar) {
        window.addEventListener("scroll", () => {
            if (window.pageYOffset > 50) {
                navbar.classList.add("scrolled");
            } else {
                navbar.classList.remove("scrolled");
            }
        });
    }
}

// ============================================
// Parallax background effect
// ============================================
function initializeParallax() {
    document.addEventListener("mousemove", (e) => {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        const bgImage = document.querySelector(".background-image");
        if (bgImage) {
            bgImage.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.05)`;
        }
    });
}

// ============================================
// Load All Home Data from API
// ============================================
async function loadAllHomeData() {
    try {
        // Load all data in parallel for better performance
        const [
            featuredRes,
            categoriesRes
        ] = await Promise.all([
            fetch(`${API_BASE}/api/customer/home/featured`),
            fetch(`${API_BASE}/api/customer/categories`)
        ]);

        if (categoriesRes.ok) {
            categories = await categoriesRes.json();
            renderCategories();
        } else {
            console.error('Failed to load categories');
        }

        if (featuredRes.ok) {
            featuredProducts = await featuredRes.json();
            renderFeaturedProducts();
        } else {
            console.error('Failed to load featured products');
        }

    } catch (error) {
        console.error('Error loading home data:', error);
        showNotification('Error loading data. Please refresh the page.', 'error');
    }
}

// ============================================
// Render Featured Products
// ============================================
function renderFeaturedProducts() {
    const container = document.getElementById('featuredProductsGrid');
    if (!container) return;

    if (!featuredProducts || featuredProducts.length === 0) {
        container.innerHTML = '<p class="no-data">No featured products available.</p>';
        return;
    }

    container.innerHTML = featuredProducts.map(product => createProductCard(product)).join('');
    initializeProductCardEvents(container);
}

// ============================================
// Render Bestsellers
// ============================================
function renderBestsellers() {
    const container = document.querySelector('.bestsellers .product-grid');
    if (!container || bestsellers.length === 0) return;

    container.innerHTML = bestsellers.map(product => createProductCard(product, true)).join('');
    initializeProductCardEvents(container);
}

// ============================================
// Render New Arrivals
// ============================================
function renderNewArrivals() {
    const container = document.querySelector('.new-arrivals .product-grid');
    if (!container) return;

    if (newArrivals.length === 0) {
        container.innerHTML = '<p class="no-data">No new arrivals at the moment.</p>';
        return;
    }

    container.innerHTML = newArrivals.map(product => createProductCard(product, false, true)).join('');
    initializeProductCardEvents(container);
}

// ============================================
// Render Categories
// ============================================
function renderCategories() {
    const container = document.getElementById('categoriesGrid');
    if (!container) return;

    if (!categories || categories.length === 0) {
        container.innerHTML = '<p class="no-data">No categories available.</p>';
        return;
    }

    container.innerHTML = categories.map(category => `
        <div class="category-card" data-category-id="${category.categoryId}" onclick="window.location.href='products.html?category=${category.categoryId}'">
            <div class="category-content">
                <div class="category-icon">
                    ${getCategoryIcon(category.name)}
                </div>
                <h3>${category.name}</h3>
                <p>${category.description || ''}</p>
            </div>
        </div>
    `).join('');
}

// Get category icon based on name
function getCategoryIcon(categoryName) {
    const name = (categoryName || '').toLowerCase();
    
    if (name.includes('figure') || name.includes('statue') || name.includes('collectible')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5z"></path>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
        </svg>`;
    }
    if (name.includes('cloth') || name.includes('apparel') || name.includes('fashion') || name.includes('wear')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
        </svg>`;
    }
    if (name.includes('access') || name.includes('keychain') || name.includes('bag') || name.includes('pin')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="8" cy="21" r="2"></circle>
            <circle cx="20" cy="21" r="2"></circle>
            <path d="M5.67 6H23l-1.68 8.39a2 2 0 0 1-2 1.61H8.75a2 2 0 0 1-2-1.74L5.23 2.74A2 2 0 0 0 3.25 1H1"></path>
        </svg>`;
    }
    if (name.includes('poster') || name.includes('art') || name.includes('print') || name.includes('wall')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
        </svg>`;
    }
    
    // Default icon
    return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>`;
}

// ============================================
// Render Home Stats
// ============================================
function renderHomeStats() {
    const statsContainer = document.querySelector('.home-stats');
    if (!statsContainer) return;

    statsContainer.innerHTML = `
        <div class="stat-item">
            <span class="stat-number">${homeStats.totalProducts || 0}+</span>
            <span class="stat-label">Products</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${homeStats.totalCategories || 0}</span>
            <span class="stat-label">Categories</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${homeStats.inStockProducts || 0}</span>
            <span class="stat-label">In Stock</span>
        </div>
    `;
}

// ============================================
// Create Product Card HTML
// ============================================
function createProductCard(product, showSales = false, isNew = false) {
    const badge = isNew ? 'NEW' : (showSales && product.totalSold > 50 ? 'BESTSELLER' : '');
    const price = product.unitPrice ? parseFloat(product.unitPrice).toFixed(2) : '0.00';
    const stock = product.stock || product.totalStock || 0;
    
    // Determine stock class for UI
    let stockClass = '';
    let stockText = '';
    if (stock > 10) { stockClass = 'in-stock'; stockText = 'In Stock'; }
    else if (stock > 0) { stockClass = 'low-stock'; stockText = `Low Stock (${stock})`; }
    else { stockClass = 'out-of-stock'; stockText = 'Out of Stock'; }

    return `
        <div class="product-card" data-product-id="${product.productId}">
            ${badge ? `<div class="product-badge ${badge.toLowerCase()}">${badge}</div>` : ''}
            <div class="product-image-wrapper">
                <img src="${product.productImage || '/static/images/placeholder.jpg'}" alt="${product.name}" class="product-image" onerror="this.src='/static/images/placeholder.jpg'">
                <div class="product-overlay">
                    <button class="quick-view-btn" onclick="window.location.href='products.html?id=${product.productId}'">View Details</button>
                </div>
            </div>
            <div class="product-info">
                <p class="product-category">${product.categoryName || 'Uncategorized'}</p>
                <h3 class="product-name">${product.name}</h3>
                <div class="product-stock ${stockClass}">
                    ${stockText}
                </div>
                <div class="product-footer">
                    <span class="product-price">$${price}</span>
                    <button class="add-to-cart-btn" 
                            data-product-id="${product.productId}"
                            data-name="${product.name}"
                            data-price="${price}"
                            data-image="${product.productImage || '/static/images/placeholder.jpg'}"
                            data-stock="${stock}"
                            ${stock === 0 ? 'disabled' : ''}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                        </svg>
                        ${stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// Initialize Product Card Events
// ============================================
function initializeProductCardEvents(container) {
    // Add to cart buttons
    container.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            
            const productId = parseInt(btn.dataset.productId);
            const name = btn.dataset.name;
            const price = parseFloat(btn.dataset.price);
            const image = btn.dataset.image;
            const stock = parseInt(btn.dataset.stock);

            addToCart({ productId, name, price, image, stock });

            // Visual feedback
            btn.textContent = 'Added!';
            btn.style.background = '#28a745';
            setTimeout(() => {
                btn.textContent = 'Add to Cart';
                btn.style.background = '#e50914';
            }, 2000);
        });
    });

    // Product card click (navigate to details)
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-to-cart-btn')) return;
            const productId = card.dataset.productId;
            window.location.href = `products.html?product=${productId}`;
        });
    });
}

// ============================================
// Cart Functions
// ============================================
function addToCart(product) {
    const existingIndex = cart.findIndex(item => item.productId === product.productId);

    if (existingIndex > -1) {
        if (cart[existingIndex].quantity < product.stock) {
            cart[existingIndex].quantity++;
        } else {
            showNotification('Maximum stock reached', 'error');
            return;
        }
    } else {
        cart.push({
            productId: product.productId,
            name: product.name,
            price: product.price,
            image: product.image,
            stock: product.stock,
            quantity: 1
        });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    showNotification(`${product.name} added to cart!`);
    animateCartIcon();
}

function updateCartCount() {
    const cartCountElement = document.querySelector('.cart-count');
    if (cartCountElement) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountElement.textContent = totalItems;
    }
}

function animateCartIcon() {
    const cartBtn = document.querySelector('.cart-btn');
    if (cartBtn) {
        cartBtn.style.animation = 'none';
        setTimeout(() => {
            cartBtn.style.animation = 'cartBounce 0.5s ease';
        }, 10);
    }
}

// ============================================
// Helper Functions
// ============================================
function showNotification(message, type = 'success') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================
// Event Listeners
// ============================================
function initializeEventListeners() {
    // Newsletter subscription
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        const newsletterBtn = newsletterForm.querySelector('button');
        const newsletterInput = newsletterForm.querySelector('input');

        newsletterBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            const email = newsletterInput?.value.trim();

            if (!email) {
                showNotification('Please enter your email address', 'error');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showNotification('Please enter a valid email address', 'error');
                return;
            }

            newsletterBtn.textContent = 'Subscribed!';
            newsletterBtn.style.background = '#28a745';
            newsletterInput.value = '';

            setTimeout(() => {
                newsletterBtn.textContent = 'Subscribe';
                newsletterBtn.style.background = '#e50914';
            }, 3000);
        });
    }

    // Smooth scrolling for navigation
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            if (targetId === '#') return;

            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                const offsetTop = targetSection.offsetTop - 80;
                window.scrollTo({ top: offsetTop, behavior: 'smooth' });
            }
        });
    });

    // Intersection Observer for scroll animations
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = "1";
                    entry.target.style.transform = "translateY(0)";
                }
            });
        },
        { threshold: 0.1, rootMargin: "0px 0px -100px 0px" }
    );

    document.querySelectorAll(".category-card, .product-card").forEach((card) => {
        card.style.opacity = "0";
        card.style.transform = "translateY(30px)";
        card.style.transition = "opacity 0.6s ease, transform 0.6s ease";
        observer.observe(card);
    });
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    @keyframes cartBounce {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
    }
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        background: #28a745;
        color: white;
        font-weight: 500;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        z-index: 10000;
    }
    .notification.error { background: #dc3545; }
    .notification.show {
        opacity: 1;
        transform: translateY(0);
    }
    .no-data {
        text-align: center;
        padding: 40px;
        color: #888;
        font-size: 1.1rem;
    }
    .product-stock.in-stock { color: #28a745; }
    .product-stock.low-stock { color: #ffc107; }
    .product-stock.out-of-stock { color: #dc3545; }
`;
document.head.appendChild(style);

console.log('[AnimeStore] Home page loaded - connected to database API');
