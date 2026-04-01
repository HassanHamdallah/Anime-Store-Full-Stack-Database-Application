"""
Customer Orders Routes
Contains APIs for order management, history, tracking, and order details
"""
from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error
from datetime import datetime

customer_orders_bp = Blueprint('customer_orders', __name__)

# ============================================
# ADVANCED QUERY 11: Get customer order history with totals from OrderTotals view
# Uses JOIN with view and aggregation
# ============================================
@customer_orders_bp.route('/api/customer/orders/<int:account_id>', methods=['GET'])
def get_customer_orders(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Get pagination params
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 10, type=int)
        status_filter = request.args.get('status', None)
        offset = (page - 1) * limit
        
        # ADVANCED: Join with OrderTotals view and count order lines
        query = """
            SELECT 
                o.orderId,
                o.orderDate,
                o.status,
                o.shippingAddress,
                COALESCE(ot.totalAmount, 0) as totalAmount,
                (SELECT COUNT(*) FROM OrderLine ol WHERE ol.orderId = o.orderId) as itemCount,
                (SELECT SUM(ol.quantity) FROM OrderLine ol WHERE ol.orderId = o.orderId) as totalItems
            FROM `Order` o
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE o.accountId = %s
        """
        params = [account_id]
        
        if status_filter:
            query += " AND o.status = %s"
            params.append(status_filter)
        
        query += " ORDER BY o.orderDate DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(query, tuple(params))
        orders = cursor.fetchall()
        
        # Format dates and totals
        for order in orders:
            if order['orderDate']:
                order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
            order['totalAmount'] = float(order['totalAmount']) if order['totalAmount'] else 0
            order['totalItems'] = int(order['totalItems']) if order['totalItems'] else 0
        
        # NORMAL QUERY 21: Get total count
        count_query = "SELECT COUNT(*) as count FROM `Order` WHERE accountId = %s"
        count_params = [account_id]
        if status_filter:
            count_query += " AND status = %s"
            count_params.append(status_filter)
        cursor.execute(count_query, tuple(count_params))
        total = cursor.fetchone()['count']
        
        return jsonify({
            'orders': orders,
            'total': total,
            'page': page,
            'totalPages': (total + limit - 1) // limit
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 12: Get detailed order with all line items and product info
# Complex JOIN across Order, OrderLine, Product, Category
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>', methods=['GET'])
def get_order_details(order_id):
    account_id = request.args.get('accountId', type=int)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get order header with total
        cursor.execute("""
            SELECT 
                o.orderId,
                o.accountId,
                o.orderDate,
                o.status,
                o.shippingAddress,
                c.firstName,
                c.lastName,
                c.email,
                c.phone,
                COALESCE(ot.totalAmount, 0) as totalAmount
            FROM `Order` o
            JOIN Customer c ON o.accountId = c.accountId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        # Verify order belongs to customer if accountId provided
        if account_id and order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Format order data
        if order['orderDate']:
            order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
        order['totalAmount'] = float(order['totalAmount']) if order['totalAmount'] else 0
        
        # ADVANCED: Get order lines with product details and line totals (calculated)
        cursor.execute("""
            SELECT 
                ol.orderLineId,
                ol.productId,
                p.name as productName,
                p.productImage,
                cat.name as categoryName,
                ol.quantity,
                ol.unitPrice,
                (ol.quantity * ol.unitPrice) as lineTotal
            FROM OrderLine ol
            JOIN Product p ON ol.productId = p.productId
            LEFT JOIN Category cat ON p.categoryId = cat.categoryId
            WHERE ol.orderId = %s
            ORDER BY ol.orderLineId
        """, (order_id,))
        items = cursor.fetchall()
        
        for item in items:
            item['unitPrice'] = float(item['unitPrice']) if item['unitPrice'] else 0
            item['lineTotal'] = float(item['lineTotal']) if item['lineTotal'] else 0
        
        order['items'] = items
        
        return jsonify(order)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 13: Track order fulfillment - which warehouses shipped which items
# Uses JOIN with ShipsFrom and Warehouse tables
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/tracking', methods=['GET'])
def get_order_tracking(order_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get order status
        cursor.execute("""
            SELECT orderId, status, orderDate 
            FROM `Order` 
            WHERE orderId = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        if order['orderDate']:
            order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
        
        # ADVANCED: Get shipping allocations with warehouse and product details
        cursor.execute("""
            SELECT 
                sf.shipsFromId,
                sf.productId,
                p.name as productName,
                p.productImage,
                sf.warehouseId,
                w.name as warehouseName,
                w.city as warehouseCity,
                w.address as warehouseAddress,
                sf.quantityAllocated
            FROM ShipsFrom sf
            JOIN Product p ON sf.productId = p.productId
            JOIN Warehouse w ON sf.warehouseId = w.warehouseId
            WHERE sf.orderId = %s
            ORDER BY p.name
        """, (order_id,))
        shipments = cursor.fetchall()
        
        # Group shipments by product
        products_shipping = {}
        for s in shipments:
            pid = s['productId']
            if pid not in products_shipping:
                products_shipping[pid] = {
                    'productId': pid,
                    'productName': s['productName'],
                    'productImage': s['productImage'],
                    'shipments': []
                }
            products_shipping[pid]['shipments'].append({
                'warehouseId': s['warehouseId'],
                'warehouseName': s['warehouseName'],
                'warehouseCity': s['warehouseCity'],
                'quantity': s['quantityAllocated']
            })
        
        return jsonify({
            'orderId': order['orderId'],
            'status': order['status'],
            'orderDate': order['orderDate'],
            'fulfillment': list(products_shipping.values())
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 22: Cancel/Refund order - RESTORES INVENTORY TO WAREHOUSE
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/cancel', methods=['PUT'])
def cancel_order(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    
    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Verify order exists and belongs to customer
        cursor.execute("""
            SELECT orderId, status, accountId 
            FROM `Order` 
            WHERE orderId = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Check status - cannot cancel if shipped or delivered
        status_lower = order['status'].lower() if order['status'] else ''
        if status_lower in ['shipped', 'delivered']:
            return jsonify({'error': f'Cannot cancel order with status: {order["status"]}. Order already shipped/delivered.'}), 400
        if status_lower == 'cancelled':
            return jsonify({'error': 'Order already cancelled'}), 400
        
        conn.start_transaction()
        
        # ADVANCED QUERY 14: Restore inventory - reverse the ShipsFrom allocations
        cursor.execute("""
            SELECT sf.productId, sf.warehouseId, sf.quantityAllocated, p.name as productName
            FROM ShipsFrom sf
            JOIN Product p ON sf.productId = p.productId
            WHERE sf.orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        restored_items = []
        for alloc in allocations:
            # NORMAL QUERY 23: Restore inventory balance to warehouse
            cursor.execute("""
                UPDATE InventoryBalance 
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            # NORMAL QUERY 24: Record cancellation movement
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'REFUND', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
            
            restored_items.append({
                'productId': alloc['productId'],
                'productName': alloc['productName'],
                'quantity': alloc['quantityAllocated']
            })
        
        # Delete ShipsFrom records (clear allocations)
        cursor.execute("DELETE FROM ShipsFrom WHERE orderId = %s", (order_id,))
        
        # Update Payment status to Refunded
        cursor.execute("""
            UPDATE Payment SET status = 'Refunded' WHERE orderId = %s
        """, (order_id,))
        
        # Update order status to Cancelled
        cursor.execute("""
            UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
        """, (order_id,))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Order cancelled and refunded. Inventory restored to warehouse.',
            'orderId': order_id,
            'restoredItems': restored_items,
            'itemsRestored': len(restored_items)
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 25: Get order status
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/status', methods=['GET'])
def get_order_status(order_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT orderId, status, orderDate 
            FROM `Order` 
            WHERE orderId = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        if order['orderDate']:
            order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify(order)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 15: Get recent orders summary for dashboard
# Aggregates order data with line counts and totals
# ============================================
@customer_orders_bp.route('/api/customer/orders/<int:account_id>/recent', methods=['GET'])
def get_recent_orders(account_id):
    limit = request.args.get('limit', 5, type=int)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT 
                o.orderId,
                o.orderDate,
                o.status,
                COALESCE(ot.totalAmount, 0) as totalAmount,
                (
                    SELECT GROUP_CONCAT(p.name SEPARATOR ', ')
                    FROM OrderLine ol
                    JOIN Product p ON ol.productId = p.productId
                    WHERE ol.orderId = o.orderId
                    LIMIT 3
                ) as productNames,
                (SELECT COUNT(*) FROM OrderLine ol WHERE ol.orderId = o.orderId) as itemCount
            FROM `Order` o
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE o.accountId = %s
            ORDER BY o.orderDate DESC
            LIMIT %s
        """, (account_id, limit))
        orders = cursor.fetchall()
        
        for order in orders:
            if order['orderDate']:
                order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
            order['totalAmount'] = float(order['totalAmount']) if order['totalAmount'] else 0
        
        return jsonify({'orders': orders})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 26: Get order count by status for dashboard
# ============================================
@customer_orders_bp.route('/api/customer/orders/<int:account_id>/status-count', methods=['GET'])
def get_order_status_count(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT status, COUNT(*) as count
            FROM `Order`
            WHERE accountId = %s
            GROUP BY status
        """, (account_id,))
        results = cursor.fetchall()
        
        # Convert to object
        status_counts = {r['status']: r['count'] for r in results}
        return jsonify(status_counts)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 27: Get all unique statuses in orders table
# ============================================
@customer_orders_bp.route('/api/customer/order-statuses', methods=['GET'])
def get_order_statuses():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT DISTINCT status FROM `Order` ORDER BY status")
        statuses = [row['status'] for row in cursor.fetchall()]
        return jsonify({'statuses': statuses})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 28: Reorder - create new order from previous order items
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/reorder', methods=['POST'])
def reorder(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    
    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get original order items
        cursor.execute("""
            SELECT ol.productId, ol.quantity
            FROM OrderLine ol
            JOIN `Order` o ON ol.orderId = o.orderId
            WHERE o.orderId = %s AND o.accountId = %s
        """, (order_id, account_id))
        items = cursor.fetchall()
        
        if not items:
            return jsonify({'error': 'Order not found or no access'}), 404
        
        # Return items for cart (frontend will add to cart)
        cart_items = []
        for item in items:
            cursor.execute("""
                SELECT p.productId, p.name, p.unitPrice, p.productImage,
                    COALESCE(SUM(ib.quantityOnHand), 0) as stock
                FROM Product p
                LEFT JOIN InventoryBalance ib ON p.productId = ib.productId
                WHERE p.productId = %s
                GROUP BY p.productId
            """, (item['productId'],))
            product = cursor.fetchone()
            
            if product:
                cart_items.append({
                    'productId': product['productId'],
                    'name': product['name'],
                    'unitPrice': float(product['unitPrice']),
                    'productImage': product['productImage'],
                    'quantity': item['quantity'],
                    'stock': int(product['stock'])
                })
        
        return jsonify({
            'items': cart_items,
            'message': 'Items ready to add to cart'
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
