// Button Test Script
// Add this to your HTML pages to test if buttons are working

console.log('=== BUTTON TEST SCRIPT LOADED ===');

// Test if jQuery or other libraries are interfering
console.log('Window object has openSupplierModal:', typeof window.openSupplierModal);
console.log('Window object has openStaffModal:', typeof window.openStaffModal);
console.log('Window object has openProductModal:', typeof window.openProductModal);

// Test button click handlers
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM Content Loaded');

    // Find all buttons with onclick attributes
    const buttons = document.querySelectorAll('button[onclick]');
    console.log('Found buttons with onclick:', buttons.length);

    buttons.forEach((btn, index) => {
        console.log(`Button ${index}:`, btn.getAttribute('onclick'));
    });

    // Test modal elements
    const supplierModal = document.getElementById('supplierModal');
    const staffModal = document.getElementById('staffModal');
    const productModal = document.getElementById('productModal');

    console.log('Supplier Modal exists:', !!supplierModal);
    console.log('Staff Modal exists:', !!staffModal);
    console.log('Product Modal exists:', !!productModal);
});

// Manual test functions
window.testSupplierButton = function () {
    console.log('Testing Supplier Button...');
    if (typeof window.openSupplierModal === 'function') {
        window.openSupplierModal();
        console.log('✓ Supplier modal function called');
    } else {
        console.error('✗ openSupplierModal is not a function');
    }
};

window.testStaffButton = function () {
    console.log('Testing Staff Button...');
    if (typeof window.openStaffModal === 'function') {
        window.openStaffModal();
        console.log('✓ Staff modal function called');
    } else {
        console.error('✗ openStaffModal is not a function');
    }
};

window.testProductButton = function () {
    console.log('Testing Product Button...');
    if (typeof window.openProductModal === 'function') {
        window.openProductModal();
        console.log('✓ Product modal function called');
    } else {
        console.error('✗ openProductModal is not a function');
    }
};

console.log('=== TEST FUNCTIONS READY ===');
console.log('Run testSupplierButton(), testStaffButton(), or testProductButton() in console');
