from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error
from datetime import datetime
import random
import string

customer_cart_bp = Blueprint('customer_cart', __name__)

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

@customer_cart_bp.route('/api/customer/cart/checkout', methods=['POST'])
def checkout():
    data = request.get_json()
    account_id = data.get('accountId')
    items = data.get('items', [])  # [{productId, quantity}]
    shipping_address = data.get('shippingAddress', '')
    payment_method = data.get('paymentMethod', 'CARD')  # CARD, CASH, PAYPAL
    payment_details = data.get('paymentDetails', {})

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
        
        # NORMAL QUERY 13: Create order
        cursor.execute("""
            INSERT INTO `Order` (accountId, orderDate, status, shippingAddress)
            VALUES (%s, NOW(), 'Paid', %s)
        """, (account_id, shipping_address))
        order_id = cursor.lastrowid
        
        # NORMAL QUERY 14: Create order lines
        for item in items:
            # Get current unit price
            cursor.execute("SELECT unitPrice FROM Product WHERE productId = %s", (item['productId'],))
            product = cursor.fetchone()
            unit_price = float(product['unitPrice'])
            
            cursor.execute("""
                INSERT INTO OrderLine (orderId, productId, quantity, unitPrice)
                VALUES (%s, %s, %s, %s)
            """, (order_id, item['productId'], item['quantity'], unit_price))
            
            # ADVANCED: Allocate inventory from warehouses (FIFO)
            remaining_qty = item['quantity']
            cursor.execute("""
                SELECT warehouseId, quantityOnHand 
                FROM InventoryBalance 
                WHERE productId = %s AND quantityOnHand > 0
                ORDER BY quantityOnHand DESC
            """, (item['productId'],))
            warehouses = cursor.fetchall()
            
            for wh in warehouses:
                if remaining_qty <= 0:
                    break
                    
                allocate_qty = min(remaining_qty, wh['quantityOnHand'])
                
                # NORMAL QUERY 15: Record ShipsFrom
                cursor.execute("""
                    INSERT INTO ShipsFrom (orderId, productId, warehouseId, quantityAllocated)
                    VALUES (%s, %s, %s, %s)
                """, (order_id, item['productId'], wh['warehouseId'], allocate_qty))
                
                # NORMAL QUERY 16: Update inventory balance
                cursor.execute("""
                    UPDATE InventoryBalance 
                    SET quantityOnHand = quantityOnHand - %s
                    WHERE warehouseId = %s AND productId = %s
                """, (allocate_qty, wh['warehouseId'], item['productId']))
                
                # NORMAL QUERY 17: Record inventory movement
                cursor.execute("""
                    INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                    VALUES (%s, %s, 'SALE', %s, NOW())
                """, (wh['warehouseId'], item['productId'], -allocate_qty))
                
                remaining_qty -= allocate_qty
        
        conn.commit()
        
        # Get order total from view
        cursor.execute("""
            SELECT COALESCE(totalAmount, 0) as totalAmount 
            FROM OrderTotals 
            WHERE orderId = %s
        """, (order_id,))
        total_result = cursor.fetchone()
        total_amount = float(total_result['totalAmount']) if total_result else 0
        
        # Create payment record
        reference_no = 'PAY-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))

        cursor.execute("""
            INSERT INTO Payment (orderId, amount, method, status, paidAt, referenceNo)
            VALUES (%s, %s, %s, 'PAID', NOW(), %s)
        """, (order_id, total_amount, payment_method, reference_no))

        conn.commit()

        return jsonify({
            'success': True,
            'orderId': order_id,
            'totalAmount': total_amount,
            'paymentReference': reference_no,
            'message': 'Order placed and payment processed successfully'
        }), 201
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

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
