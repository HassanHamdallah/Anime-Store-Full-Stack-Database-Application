"""
Customer Cart Routes
Contains APIs for cart management and checkout
Note: Cart is stored client-side (localStorage), server validates and processes orders
"""
from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error
from datetime import datetime

customer_cart_bp = Blueprint('customer_cart', __name__)

# ============================================
# NORMAL QUERY 11: Validate cart items (check if products exist and have stock)
# ============================================
@customer_cart_bp.route('/api/customer/cart/validate', methods=['POST'])
def validate_cart():
    data = request.get_json()
    cart_items = data.get('items', [])
    
    if not cart_items:
        return jsonify({'valid': True, 'items': []})
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        validated_items = []
        all_valid = True
        
        for item in cart_items:
            product_id = item.get('productId')
            quantity = item.get('quantity', 1)
            
            # Get product info and stock
            query = """
                SELECT 
                    p.productId,
                    p.name,
                    p.unitPrice,
                    p.productImage,
                    COALESCE(SUM(ib.quantityOnHand), 0) as stock
                FROM Product p
                LEFT JOIN InventoryBalance ib ON p.productId = ib.productId
                WHERE p.productId = %s
                GROUP BY p.productId, p.name, p.unitPrice, p.productImage
            """
            cursor.execute(query, (product_id,))
            product = cursor.fetchone()
            
            if product:
                stock = int(product['stock'])
                is_valid = stock >= quantity
                validated_items.append({
                    'productId': product['productId'],
                    'name': product['name'],
                    'unitPrice': float(product['unitPrice']),
                    'productImage': product['productImage'],
                    'quantity': quantity,
                    'stock': stock,
                    'valid': is_valid,
                    'message': 'Available' if is_valid else f'Only {stock} available'
                })
                if not is_valid:
                    all_valid = False
            else:
                validated_items.append({
                    'productId': product_id,
                    'quantity': quantity,
                    'valid': False,
                    'message': 'Product not found'
                })
                all_valid = False
        
        return jsonify({
            'valid': all_valid,
            'items': validated_items
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 12: Get cart summary (product details for cart items)
# ============================================
@customer_cart_bp.route('/api/customer/cart/summary', methods=['POST'])
def get_cart_summary():
    data = request.get_json()
    product_ids = data.get('productIds', [])
    
    if not product_ids:
        return jsonify({'items': [], 'subtotal': 0})
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Build query for multiple products
        placeholders = ','.join(['%s'] * len(product_ids))
        query = f"""
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                COALESCE(SUM(ib.quantityOnHand), 0) as stock
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            LEFT JOIN InventoryBalance ib ON p.productId = ib.productId
            WHERE p.productId IN ({placeholders})
            GROUP BY p.productId, p.name, p.description, p.unitPrice, p.productImage, c.name
        """
        cursor.execute(query, tuple(product_ids))
        products = cursor.fetchall()
        
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            p['stock'] = int(p['stock'])
        
        return jsonify({'items': products})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 10: Process checkout - Create order with IMMEDIATE PAYMENT
# PAY FIRST MODEL: Customer pays immediately, then order appears in manager queue
# Uses transaction to ensure data integrity
# ============================================
@customer_cart_bp.route('/api/customer/cart/checkout', methods=['POST'])
def checkout():
    data = request.get_json()
    account_id = data.get('accountId')
    items = data.get('items', [])  # [{productId, quantity}]
    shipping_address = data.get('shippingAddress', '')
    payment_method = data.get('paymentMethod', 'Credit Card')
    
    if not account_id:
        return jsonify({'error': 'Customer account ID required'}), 400
    if not items:
        return jsonify({'error': 'Cart is empty'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()
        
        # Validate stock first
        for item in items:
            cursor.execute("""
                SELECT COALESCE(SUM(quantityOnHand), 0) as stock
                FROM InventoryBalance WHERE productId = %s
            """, (item['productId'],))
            stock = cursor.fetchone()['stock']
            if stock < item['quantity']:
                conn.rollback()
                return jsonify({'error': f'Insufficient stock for product {item["productId"]}'}), 400
        
        # Create order with status 'Paid' (customer paid immediately)
        cursor.execute("""
            INSERT INTO `Order` (accountId, orderDate, status, shippingAddress)
            VALUES (%s, NOW(), 'Paid', %s)
        """, (account_id, shipping_address))
        order_id = cursor.lastrowid
        
        # Create order lines and calculate total
        total_amount = 0
        for item in items:
            # Get current unit price
            cursor.execute("SELECT unitPrice FROM Product WHERE productId = %s", (item['productId'],))
            product = cursor.fetchone()
            unit_price = float(product['unitPrice'])
            
            cursor.execute("""
                INSERT INTO OrderLine (orderId, productId, quantity, unitPrice)
                VALUES (%s, %s, %s, %s)
            """, (order_id, item['productId'], item['quantity'], unit_price))
            
            total_amount += unit_price * item['quantity']
        
        # Create Payment record with status='Paid' (PAY FIRST MODEL)
        cursor.execute("""
            INSERT INTO Payment (orderId, amount, method, status, paidAt, referenceNo)
            VALUES (%s, %s, %s, 'Paid', NOW(), %s)
        """, (order_id, total_amount, payment_method, f'REF-{order_id}-{datetime.now().strftime("%Y%m%d%H%M%S")}'))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Order placed and payment processed successfully',
            'orderId': order_id,
            'totalAmount': total_amount
        }), 201
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 18: Get customer's default address for checkout
# ============================================
@customer_cart_bp.route('/api/customer/cart/shipping-address/<int:account_id>', methods=['GET'])
def get_shipping_address(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT defaultShippingAddress, phone
            FROM Customer
            WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()
        if customer:
            return jsonify({
                'address': customer['defaultShippingAddress'] or '',
                'phone': customer['phone'] or ''
            })
        return jsonify({'error': 'Customer not found'}), 404
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 19: Check multiple products stock at once
# ============================================
@customer_cart_bp.route('/api/customer/cart/check-stock', methods=['POST'])
def check_stock_bulk():
    data = request.get_json()
    items = data.get('items', [])  # [{productId, quantity}]
    
    if not items:
        return jsonify({'available': True, 'items': []})
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        results = []
        all_available = True
        
        for item in items:
            cursor.execute("""
                SELECT COALESCE(SUM(quantityOnHand), 0) as stock
                FROM InventoryBalance WHERE productId = %s
            """, (item['productId'],))
            stock = int(cursor.fetchone()['stock'])
            available = stock >= item['quantity']
            results.append({
                'productId': item['productId'],
                'requested': item['quantity'],
                'available': stock,
                'sufficient': available
            })
            if not available:
                all_available = False
        
        return jsonify({'allAvailable': all_available, 'items': results})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 20: Get product price (for cart calculations)
# ============================================
@customer_cart_bp.route('/api/customer/product-price/<int:product_id>', methods=['GET'])
def get_product_price(product_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT productId, unitPrice FROM Product WHERE productId = %s", (product_id,))
        product = cursor.fetchone()
        if product:
            return jsonify({
                'productId': product['productId'],
                'unitPrice': float(product['unitPrice'])
            })
        return jsonify({'error': 'Product not found'}), 404
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
