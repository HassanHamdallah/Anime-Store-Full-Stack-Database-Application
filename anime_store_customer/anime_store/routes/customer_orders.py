from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error
from datetime import datetime

customer_orders_bp = Blueprint('customer_orders', __name__)


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
        
        query = """
            SELECT 
                o.orderId,
                o.orderDate,
                o.status,
                o.shippingAddress,
                COALESCE(ot.totalAmount, 0) as totalAmount,
                (SELECT COUNT(*) FROM OrderLine ol WHERE ol.orderId = o.orderId) as itemCount,
                (SELECT SUM(ol.quantity) FROM OrderLine ol WHERE ol.orderId = o.orderId) as totalItems,
                (SELECT GROUP_CONCAT(p.name SEPARATOR ', ') 
                 FROM OrderLine ol2 
                 JOIN Product p ON ol2.productId = p.productId 
                 WHERE ol2.orderId = o.orderId) as productNames
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
        
        for order in orders:
            if order['orderDate']:
                order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
            order['totalAmount'] = float(order['totalAmount']) if order['totalAmount'] else 0
            order['totalItems'] = int(order['totalItems']) if order['totalItems'] else 0
        
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


@customer_orders_bp.route('/api/customer/order/<int:order_id>', methods=['GET'])
def get_order_details(order_id):
    account_id = request.args.get('accountId', type=int)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT 
                o.orderId,
                o.accountId,
                o.orderDate,
                o.status,
                o.shippingAddress,
                c.username,
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
        if order['status'] not in ['Pending', 'Processing']:
            return jsonify({'error': f'Cannot cancel order with status: {order["status"]}'}), 400
        
        conn.start_transaction()
        
        cursor.execute("""
            UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
        """, (order_id,))
        
        # ADVANCED QUERY 14: Restore inventory - reverse the ShipsFrom allocations
        cursor.execute("""
            SELECT sf.productId, sf.warehouseId, sf.quantityAllocated
            FROM ShipsFrom sf
            WHERE sf.orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        for alloc in allocations:
            # NORMAL QUERY 23: Restore inventory balance
            cursor.execute("""
                UPDATE InventoryBalance 
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            # NORMAL QUERY 24: Record cancellation movement
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'CANCEL_RESTORE', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Order cancelled successfully',
            'orderId': order_id
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

# ============================================
# NORMAL QUERY 29: Request refund for an order
# Calls manager's refund endpoint to ensure inventory is properly restored
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/refund', methods=['PUT'])
def request_refund(order_id):
    import requests

    data = request.get_json()
    account_id = data.get('accountId')
    reason = data.get('reason', 'Customer requested refund')

    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order exists and belongs to customer
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId, p.paymentId, p.amount, p.status as paymentStatus
            FROM `Order` o
            LEFT JOIN Payment p ON o.orderId = p.orderId
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Check if already cancelled
        if order['status'] == 'Cancelled':
            return jsonify({'error': 'Order is already cancelled'}), 400

        # Check if refund is allowed (only for Paid or Processing orders - not shipped/delivered)
        allowed_statuses = ['Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot request refund for order with status: {order["status"]}. Refunds are only allowed for orders that have not been shipped yet.'}), 400

        # Get refund amount
        refund_amount = float(order['amount']) if order['amount'] else 0

        # Close the database connection before making the API call
        cursor.close()
        conn.close()
        cursor = None
        conn = None

        # Call the manager's refund endpoint to properly restore inventory
        # This endpoint handles: inventory restoration, payment refund, order cancellation, allocation cleanup
        try:
            manager_refund_url = f'http://localhost:5000/api/orders/{order_id}/refund'
            response = requests.post(
                manager_refund_url,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )

            if response.status_code == 200:
                result = response.json()
                restored_items = result.get('restoredItems', [])
                return jsonify({
                    'success': True,
                    'message': f'Order cancelled successfully. ${refund_amount:.2f} has been refunded to your account.',
                    'orderId': order_id,
                    'refundAmount': refund_amount,
                    'restoredItems': restored_items
                })
            else:
                # If the manager endpoint fails, return the error
                error_data = response.json() if response.content else {'error': 'Refund request failed'}
                return jsonify(error_data), response.status_code

        except requests.exceptions.RequestException as e:
            # If cannot connect to the manager endpoint, fall back to direct update
            # This ensures the system still works even if there's a network issue
            conn = get_db_connection()
            if not conn:
                return jsonify({'error': 'Database connection failed'}), 500
            cursor = conn.cursor(dictionary=True)

            # Update order status to Cancelled
            cursor.execute("""
                UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
            """, (order_id,))

            # Update payment status to REFUNDED if exists
            if order['paymentId']:
                cursor.execute("""
                    UPDATE Payment SET status = 'REFUNDED' WHERE paymentId = %s
                """, (order['paymentId'],))

            conn.commit()

            return jsonify({
                'success': True,
                'message': f'Order cancelled successfully. ${refund_amount:.2f} has been refunded to your account.',
                'orderId': order_id,
                'refundAmount': refund_amount,
                'warning': 'Inventory restoration may be pending'
            })

    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

# ============================================
# NORMAL QUERY 30: Update order (shipping address)
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/update', methods=['PUT'])
def update_order(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    shipping_address = data.get('shippingAddress')

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

        # Only allow updates for orders that haven't shipped
        allowed_statuses = ['Pending', 'Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot update order with status: {order["status"]}'}), 400

        # Update shipping address
        if shipping_address:
            cursor.execute("""
                UPDATE `Order` SET shippingAddress = %s WHERE orderId = %s
            """, (shipping_address, order_id))
            conn.commit()

        return jsonify({
            'success': True,
            'message': 'Order updated successfully',
            'orderId': order_id
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY: Refund specific items from an order
# Calls manager's refund endpoint to ensure inventory is properly restored
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/refund-items', methods=['PUT'])
def refund_order_items(order_id):
    import requests

    data = request.get_json()
    account_id = data.get('accountId')
    order_line_ids = data.get('orderLineIds', [])
    reason = data.get('reason', 'Customer requested refund')

    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400

    if not order_line_ids or len(order_line_ids) == 0:
        return jsonify({'error': 'No items selected for refund'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order exists and belongs to customer
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId
            FROM `Order` o
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Check if already cancelled
        if order['status'] == 'Cancelled':
            return jsonify({'error': 'Order is already cancelled'}), 400

        # Check if refund is allowed (only for Paid or Processing orders - not shipped/delivered)
        allowed_statuses = ['Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot request refund for order with status: {order["status"]}. Refunds are only allowed for orders that have not been shipped yet.'}), 400

        # Get total items in order
        cursor.execute("""
            SELECT COUNT(*) as total FROM OrderLine WHERE orderId = %s
        """, (order_id,))
        total_items = cursor.fetchone()['total']

        # Calculate refund amount for selected items
        placeholders = ','.join(['%s'] * len(order_line_ids))
        cursor.execute(f"""
            SELECT SUM(ol.quantity * ol.unitPrice) as refundAmount
            FROM OrderLine ol
            WHERE ol.orderId = %s AND ol.orderLineId IN ({placeholders})
        """, [order_id] + order_line_ids)
        refund_data = cursor.fetchone()
        refund_amount = float(refund_data['refundAmount']) if refund_data['refundAmount'] else 0

        # Close the database connection before making the API call
        cursor.close()
        conn.close()
        cursor = None
        conn = None

        # Call the manager's refund endpoint to properly restore inventory
        # This endpoint handles: inventory restoration, payment refund, order cancellation, allocation cleanup
        try:
            manager_refund_url = f'http://localhost:5000/api/orders/{order_id}/refund'
            response = requests.post(
                manager_refund_url,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )

            if response.status_code == 200:
                result = response.json()
                restored_items = result.get('restoredItems', [])

                if len(order_line_ids) >= total_items:
                    message = f'Order cancelled successfully. ${refund_amount:.2f} has been refunded to your account.'
                else:
                    message = f'Order cancelled successfully. ${refund_amount:.2f} has been refunded to your account.'

                return jsonify({
                    'success': True,
                    'message': message,
                    'refundAmount': refund_amount,
                    'itemsRefunded': len(order_line_ids),
                    'restoredItems': restored_items
                })
            else:
                # If the manager endpoint fails, return the error
                error_data = response.json() if response.content else {'error': 'Refund request failed'}
                return jsonify(error_data), response.status_code

        except requests.exceptions.RequestException as e:
            # If cannot connect to the manager endpoint, fall back to direct update
            conn = get_db_connection()
            if not conn:
                return jsonify({'error': 'Database connection failed'}), 500
            cursor = conn.cursor(dictionary=True)

            # Update order status to Cancelled
            cursor.execute("""
                UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
            """, (order_id,))

            # Update payment status to REFUNDED
            cursor.execute("""
                UPDATE Payment SET status = 'REFUNDED' WHERE orderId = %s
            """, (order_id,))

            if len(order_line_ids) >= total_items:
                message = f'Order cancelled successfully. ${refund_amount:.2f} has been refunded to your account.'
            else:
                message = f'Order cancelled successfully. ${refund_amount:.2f} has been refunded to your account.'

            conn.commit()

            return jsonify({
                'success': True,
                'message': message,
                'refundAmount': refund_amount,
                'itemsRefunded': len(order_line_ids),
                'warning': 'Inventory restoration may be pending'
            })

    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

# ============================================
# ADVANCED QUERY: Cancel specific items from an order
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/cancel-items', methods=['PUT'])
def cancel_order_items(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    order_line_ids = data.get('orderLineIds', [])

    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400

    if not order_line_ids or len(order_line_ids) == 0:
        return jsonify({'error': 'No items selected for cancellation'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order exists and belongs to customer
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId
            FROM `Order` o
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Check if cancellation is allowed (only before shipping)
        allowed_statuses = ['Pending', 'Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot cancel items for order with status: {order["status"]}. Only orders that have not been shipped can be cancelled.'}), 400

        # Get total items in order
        cursor.execute("""
            SELECT COUNT(*) as total FROM OrderLine WHERE orderId = %s
        """, (order_id,))
        total_items = cursor.fetchone()['total']

        conn.start_transaction()

        # If all items are being cancelled, cancel the entire order
        if len(order_line_ids) >= total_items:
            cursor.execute("""
                UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
            """, (order_id,))

            # Return inventory for all items
            cursor.execute("""
                SELECT ol.productId, ol.quantity
                FROM OrderLine ol
                WHERE ol.orderId = %s
            """, (order_id,))
            items = cursor.fetchall()

            for item in items:
                # Return stock to inventory
                cursor.execute("""
                    UPDATE InventoryBalance 
                    SET quantityOnHand = quantityOnHand + %s 
                    WHERE productId = %s
                    LIMIT 1
                """, (item['quantity'], item['productId']))

                # Record inventory movement
                cursor.execute("""
                    INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                    SELECT warehouseId, %s, 'CANCEL_RETURN', %s, NOW()
                    FROM InventoryBalance WHERE productId = %s LIMIT 1
                """, (item['productId'], item['quantity'], item['productId']))

            message = 'Order cancelled successfully.'
        else:
            # Partial cancellation - delete specific order lines
            placeholders = ','.join(['%s'] * len(order_line_ids))

            # Get items being cancelled to return inventory
            cursor.execute(f"""
                SELECT ol.productId, ol.quantity
                FROM OrderLine ol
                WHERE ol.orderId = %s AND ol.orderLineId IN ({placeholders})
            """, [order_id] + order_line_ids)
            items = cursor.fetchall()

            # Return inventory for cancelled items
            for item in items:
                cursor.execute("""
                    UPDATE InventoryBalance 
                    SET quantityOnHand = quantityOnHand + %s 
                    WHERE productId = %s
                    LIMIT 1
                """, (item['quantity'], item['productId']))

                cursor.execute("""
                    INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                    SELECT warehouseId, %s, 'CANCEL_RETURN', %s, NOW()
                    FROM InventoryBalance WHERE productId = %s LIMIT 1
                """, (item['productId'], item['quantity'], item['productId']))

            # Delete the cancelled order lines
            cursor.execute(f"""
                DELETE FROM OrderLine 
                WHERE orderId = %s AND orderLineId IN ({placeholders})
            """, [order_id] + order_line_ids)

            message = f'{len(order_line_ids)} item(s) cancelled successfully.'

        conn.commit()

        return jsonify({
            'success': True,
            'message': message,
            'itemsCancelled': len(order_line_ids)
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY: Request full order refund (Cancelled status)
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/refund', methods=['PUT'])
def request_order_refund(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    reason = data.get('reason', 'Customer requested refund')

    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order exists and belongs to customer
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId
            FROM `Order` o
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Check if refund is allowed (only for Paid or Processing orders)
        allowed_statuses = ['Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot refund order with status: {order["status"]}'}), 400

        # Update order status to Cancelled
        cursor.execute("""
            UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
        """, (order_id,))

        conn.commit()

        return jsonify({
            'success': True,
            'message': 'Order refunded and cancelled successfully',
            'orderId': order_id
        })
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

# ============================================
# NORMAL QUERY: Remove items from order
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/remove-items', methods=['DELETE'])
def remove_order_items(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    order_line_ids = data.get('orderLineIds', [])

    if not account_id:
        return jsonify({'error': 'Account ID required'}), 400

    if not order_line_ids or len(order_line_ids) == 0:
        return jsonify({'error': 'No items selected'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order exists, belongs to customer, and can be edited
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId
            FROM `Order` o
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Check if editing is allowed (only for Paid or Processing orders)
        allowed_statuses = ['Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot edit order with status: {order["status"]}'}), 400

        # Delete the specified order lines
        placeholders = ','.join(['%s'] * len(order_line_ids))
        cursor.execute(f"""
            DELETE FROM OrderLine 
            WHERE orderId = %s AND orderLineId IN ({placeholders})
        """, [order_id] + order_line_ids)

        deleted_count = cursor.rowcount

        # Check if order still has items
        cursor.execute("""
            SELECT COUNT(*) as count FROM OrderLine WHERE orderId = %s
        """, (order_id,))
        remaining = cursor.fetchone()['count']

        if remaining == 0:
            # If no items left, cancel the order
            cursor.execute("""
                UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
            """, (order_id,))

        conn.commit()

        return jsonify({
            'success': True,
            'message': f'{deleted_count} item(s) removed successfully',
            'itemsRemoved': deleted_count,
            'orderCancelled': remaining == 0
        })
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

# ============================================
# NORMAL QUERY: Add item to existing order
# ============================================
@customer_orders_bp.route('/api/customer/order/<int:order_id>/add-item', methods=['POST'])
def add_order_item(order_id):
    data = request.get_json()
    account_id = data.get('accountId')
    product_id = data.get('productId')
    quantity = data.get('quantity', 1)

    if not account_id or not product_id:
        return jsonify({'error': 'Account ID and Product ID required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order exists, belongs to customer, and can be edited
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId
            FROM `Order` o
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['accountId'] != account_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Check if editing is allowed (only for Paid or Processing orders)
        allowed_statuses = ['Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({'error': f'Cannot edit order with status: {order["status"]}'}), 400

        # Get product details
        cursor.execute("""
            SELECT productId, name, unitPrice 
            FROM Product 
            WHERE productId = %s
        """, (product_id,))
        product = cursor.fetchone()

        if not product:
            return jsonify({'error': 'Product not found'}), 404

        # Check if product already in order
        cursor.execute("""
            SELECT orderLineId, quantity 
            FROM OrderLine 
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        existing = cursor.fetchone()

        if existing:
            # Update quantity
            new_quantity = existing['quantity'] + quantity
            cursor.execute("""
                UPDATE OrderLine 
                SET quantity = %s
                WHERE orderLineId = %s
            """, (new_quantity, existing['orderLineId']))
            message = f'Product quantity updated to {new_quantity}'
        else:
            # Insert new order line
            cursor.execute("""
                INSERT INTO OrderLine (orderId, productId, quantity, unitPrice)
                VALUES (%s, %s, %s, %s)
            """, (order_id, product_id, quantity, product['unitPrice']))
            message = 'Product added to order successfully'

        conn.commit()

        return jsonify({
            'success': True,
            'message': message
        })
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

