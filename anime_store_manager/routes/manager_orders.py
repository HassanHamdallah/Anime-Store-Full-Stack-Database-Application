from flask import Blueprint, request, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_orders_bp = Blueprint('manager_orders', __name__)

# Helper function to check if payment is confirmed (case-insensitive)
def is_payment_confirmed(status):
    """Check if payment status indicates confirmed payment"""
    if not status:
        return False
    return status.lower() in ['paid', 'completed', 'success']

# Helper function to check order status (case-insensitive)
def normalize_status(status):
    """Normalize status to lowercase for comparison"""
    return status.lower() if status else ''

# ============================================
# PAY-FIRST MODEL: Get NEW PAID ORDERS only
# Orders appear here AFTER customer pays
# Manager does NOT approve sale, only manages fulfillment
# ============================================
@manager_orders_bp.route('/api/manager/orders', methods=['GET'])
def get_all_orders():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get filter parameter
        status_filter = request.args.get('status', 'all')
        
        # Query: Show all orders with payments (including refunded/cancelled)
        query = """
            SELECT 
                o.orderId,
                o.orderDate,
                o.status,
                o.shippingAddress,
                ot.totalAmount,
                c.username as customer_name,
                c.email as customer_email,
                (SELECT COUNT(*) FROM OrderLine WHERE orderId = o.orderId) as item_count,
                p.method as payment_method,
                p.status as payment_status,
                p.paidAt,
                p.referenceNo
            FROM `Order` o
            JOIN Customer c ON o.accountId = c.accountId
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE LOWER(p.status) IN ('paid', 'refunded', 'completed', 'success')
        """
        
        # Apply status filter (case-insensitive comparison)
        if status_filter != 'all':
            if status_filter == 'Paid':
                query += " AND LOWER(o.status) IN ('paid', 'new order (paid)')"
            elif status_filter == 'Processing':
                query += " AND LOWER(o.status) = 'processing'"
            elif status_filter == 'Shipped':
                query += " AND LOWER(o.status) = 'shipped'"
            elif status_filter == 'Delivered':
                query += " AND LOWER(o.status) = 'delivered'"
            elif status_filter == 'Cancelled':
                query += " AND LOWER(o.status) = 'cancelled'"
        
        query += " ORDER BY o.orderDate DESC"
        
        cursor.execute(query)
        orders = cursor.fetchall()
        
        # Format dates and amounts
        for order in orders:
            if order['orderDate']:
                order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d %H:%M:%S')
            if order['paidAt']:
                order['paidAt'] = order['paidAt'].strftime('%Y-%m-%d %H:%M:%S')
            if order['totalAmount']:
                order['totalAmount'] = float(order['totalAmount'])
                
        return jsonify(orders)
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# FULFILLMENT ACTION 1: Accept order for processing
# Move from 'Paid' to 'Processing' status
# ============================================
@manager_orders_bp.route('/api/manager/orders/<int:order_id>/accept', methods=['POST'])
def accept_order_for_processing(order_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        
        # Verify order exists and check current status
        cursor.execute("SELECT o.status, p.status FROM `Order` o JOIN Payment p ON o.orderId = p.orderId WHERE o.orderId = %s", (order_id,))
        result = cursor.fetchone()
        if not result:
            return jsonify({'error': 'Order not found'}), 404
        
        order_status = result[0].lower() if result[0] else ''
        payment_status = result[1].lower() if result[1] else ''
        
        # Check payment is confirmed (handle different formats)
        if payment_status not in ['paid', 'completed', 'success']:
            return jsonify({'error': f'Order payment is not confirmed. Payment status: {result[1]}'}), 400
        
        # Check order is in acceptable state (Paid, New Order, etc. - not already processing/shipped/delivered)
        if order_status in ['processing', 'shipped', 'delivered', 'cancelled']:
            return jsonify({'error': f'Order cannot be accepted. Current status: {result[0]}'}), 400
        
        # Update order status to Processing
        cursor.execute("UPDATE `Order` SET status = 'Processing' WHERE orderId = %s", (order_id,))
        conn.commit()
        
        return jsonify({'message': 'Order accepted for processing'})
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_orders_bp.route('/api/manager/orders/<int:order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    data = request.get_json()
    new_status = data.get('status')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        
        # SIMPLE QUERY: Update Status
        cursor.execute("UPDATE `Order` SET status = %s WHERE orderId = %s", (new_status, order_id))
        conn.commit()
        
        return jsonify({'message': 'Order status updated successfully'})
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_orders_bp.route('/api/manager/orders/<int:id>/details', methods=['GET'])
def get_order_details(id):
    # Advanced: Get Order + Customer + Items + Address
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'DB Connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # 1. Order Header (Normal)
        cursor.execute("SELECT * FROM `Order` WHERE orderId = %s", (id,))
        order = cursor.fetchone()
        
        # 2. Order Items (Normal)
        cursor.execute("""
            SELECT ol.*, p.name 
            FROM OrderLine ol 
            JOIN Product p ON ol.productId = p.productId 
            WHERE ol.orderId = %s
        """, (id,))
        items = cursor.fetchall()
        
        if order: order['items'] = items
        return jsonify(order)
    except Error as e: return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_orders_bp.route('/api/manager/orders/status-distribution', methods=['GET'])
def get_status_distribution():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        query = "SELECT status, COUNT(*) as count FROM `Order` GROUP BY status"
        cursor.execute(query)
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()



@manager_orders_bp.route('/api/manager/purchase-orders', methods=['GET'])
def get_purchase_orders():
    """Get all purchase orders with supplier and total info"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                po.poId,
                po.supplierId,
                s.name as supplierName,
                po.staffId,
                st.username as staffName,
                po.orderDate,
                po.expectedArrival,
                po.status,
                pot.totalCost,
                (SELECT COUNT(*) FROM PurchaseOrderLine WHERE poId = po.poId) as itemCount
            FROM PurchaseOrder po
            JOIN Supplier s ON po.supplierId = s.supplierId
            LEFT JOIN Staff st ON po.staffId = st.accountId
            LEFT JOIN PurchaseOrderTotals pot ON po.poId = pot.poId
            ORDER BY po.orderDate DESC
        """
        cursor.execute(query)
        orders = cursor.fetchall()
        
        for order in orders:
            if order['orderDate']:
                order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d')
            if order['expectedArrival']:
                order['expectedArrival'] = order['expectedArrival'].strftime('%Y-%m-%d')
                
        return jsonify(orders)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/purchase-orders/<int:po_id>', methods=['GET'])
def get_purchase_order_details(po_id):
    """Get a single purchase order with line items"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT 
                po.*,
                s.name as supplierName,
                s.email as supplierEmail,
                st.username as staffName
            FROM PurchaseOrder po
            JOIN Supplier s ON po.supplierId = s.supplierId
            LEFT JOIN Staff st ON po.staffId = st.accountId
            WHERE po.poId = %s
        """, (po_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Purchase order not found'}), 404

        if order['orderDate']:
            order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d')
        if order['expectedArrival']:
            order['expectedArrival'] = order['expectedArrival'].strftime('%Y-%m-%d')
   
        cursor.execute("""
            SELECT 
                pol.poLineId,
                pol.productId,
                p.name as productName,
                pol.quantityOrdered,
                pol.unitCost,
                (pol.quantityOrdered * pol.unitCost) as lineTotal,
                sp.supplierSKU,
                sp.supplyPrice as catalogPrice,
                sp.leadTimeDays
            FROM PurchaseOrderLine pol
            JOIN Product p ON pol.productId = p.productId
            LEFT JOIN SupplierProduct sp ON sp.supplierId = %s AND sp.productId = pol.productId
            WHERE pol.poId = %s
        """, (order['supplierId'], po_id))
        order['items'] = cursor.fetchall()
        
        return jsonify(order)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/purchase-orders', methods=['POST'])
def create_purchase_order():
    """Create a new purchase order with line items (validates supplier catalog)"""
    data = request.get_json()
    supplier_id = data.get('supplierId')
    staff_id = data.get('staffId') 
    expected_arrival = data.get('expectedArrival')
    items = data.get('items', [])
    
    if not supplier_id:
        return jsonify({'error': 'supplierId is required'}), 400
    
    if not items or len(items) == 0:
        return jsonify({'error': 'At least one item is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT supplierId FROM Supplier WHERE supplierId = %s", (supplier_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Supplier not found'}), 404
        
        if staff_id:
            cursor.execute("SELECT accountId FROM Staff WHERE accountId = %s", (staff_id,))
            if not cursor.fetchone():
                staff_id = None 
        
        validated_items = []
        for item in items:
            product_id = item.get('productId')
            quantity = item.get('quantity', 1)
            unit_cost = item.get('unitCost')  
            
            cursor.execute("""
                SELECT sp.supplyPrice, sp.supplierSKU, p.name as productName
                FROM SupplierProduct sp
                JOIN Product p ON sp.productId = p.productId
                WHERE sp.supplierId = %s AND sp.productId = %s
            """, (supplier_id, product_id))
            catalog_entry = cursor.fetchone()
            
            if not catalog_entry:
                return jsonify({
                    'error': f'Product ID {product_id} is not in this supplier\'s catalog. Add it to the supplier catalog first.'
                }), 400
            
            if unit_cost is None:
                unit_cost = catalog_entry['supplyPrice']
            
            validated_items.append({
                'productId': product_id,
                'quantity': quantity,
                'unitCost': unit_cost
            })

        cursor.execute("""
            INSERT INTO PurchaseOrder (supplierId, staffId, orderDate, expectedArrival, status)
            VALUES (%s, %s, CURDATE(), %s, 'Pending')
        """, (supplier_id, staff_id, expected_arrival))
        
        po_id = cursor.lastrowid
        
        for item in validated_items:
            cursor.execute("""
                INSERT INTO PurchaseOrderLine (poId, productId, quantityOrdered, unitCost)
                VALUES (%s, %s, %s, %s)
            """, (po_id, item['productId'], item['quantity'], item['unitCost']))
        
        conn.commit()
        
        return jsonify({
            'message': 'Purchase order created successfully',
            'poId': po_id
        }), 201
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/purchase-orders/<int:po_id>/status', methods=['PUT'])
def update_purchase_order_status(po_id):
    """Update PO status (and optionally receive inventory)"""
    data = request.get_json()
    new_status = data.get('status')
    warehouse_id = data.get('warehouseId') 
    
    if not new_status:
        return jsonify({'error': 'status is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT status, supplierId FROM PurchaseOrder WHERE poId = %s", (po_id,))
        po = cursor.fetchone()
        
        if not po:
            return jsonify({'error': 'Purchase order not found'}), 404
        
        if new_status == 'Received' and po['status'] != 'Received':
            if not warehouse_id:
                return jsonify({'error': 'warehouseId is required to receive inventory'}), 400
            
            cursor.execute("""
                SELECT productId, quantityOrdered, unitCost
                FROM PurchaseOrderLine
                WHERE poId = %s
            """, (po_id,))
            items = cursor.fetchall()
            
            for item in items:
                cursor.execute("""
                    INSERT INTO InventoryBalance (warehouseId, productId, quantityOnHand, reorderLevel)
                    VALUES (%s, %s, %s, 10)
                    ON DUPLICATE KEY UPDATE quantityOnHand = quantityOnHand + %s
                """, (warehouse_id, item['productId'], item['quantityOrdered'], item['quantityOrdered']))

                cursor.execute("""
                    INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                    VALUES (%s, %s, 'INBOUND', %s, NOW())
                """, (warehouse_id, item['productId'], item['quantityOrdered']))
        
        cursor.execute("UPDATE PurchaseOrder SET status = %s WHERE poId = %s", (new_status, po_id))
        conn.commit()
        
        return jsonify({'message': f'Purchase order status updated to {new_status}'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/purchase-orders/<int:po_id>/lines', methods=['POST'])
def add_purchase_order_line(po_id):
    """Add a line item to an existing purchase order (validates supplier catalog)"""
    data = request.get_json()
    product_id = data.get('productId')
    quantity = data.get('quantity', 1)
    unit_cost = data.get('unitCost')
    
    if not product_id:
        return jsonify({'error': 'productId is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT supplierId, status FROM PurchaseOrder WHERE poId = %s", (po_id,))
        po = cursor.fetchone()
        
        if not po:
            return jsonify({'error': 'Purchase order not found'}), 404
        
        if po['status'] == 'Received':
            return jsonify({'error': 'Cannot modify a received purchase order'}), 400
        
        cursor.execute("""
            SELECT supplyPrice FROM SupplierProduct
            WHERE supplierId = %s AND productId = %s
        """, (po['supplierId'], product_id))
        catalog_entry = cursor.fetchone()
        
        if not catalog_entry:
            return jsonify({
                'error': 'Product is not in this supplier\'s catalog'
            }), 400
        
        if unit_cost is None:
            unit_cost = catalog_entry['supplyPrice']
        
        cursor.execute("""
            INSERT INTO PurchaseOrderLine (poId, productId, quantityOrdered, unitCost)
            VALUES (%s, %s, %s, %s)
        """, (po_id, product_id, quantity, unit_cost))
        conn.commit()
        
        return jsonify({
            'message': 'Line item added',
            'poLineId': cursor.lastrowid
        }), 201
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/purchase-orders/<int:po_id>/lines/<int:line_id>', methods=['DELETE'])
def delete_purchase_order_line(po_id, line_id):
    """Remove a line item from a purchase order"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT status FROM PurchaseOrder WHERE poId = %s", (po_id,))
        po = cursor.fetchone()
        
        if not po:
            return jsonify({'error': 'Purchase order not found'}), 404
        
        if po['status'] == 'Received':
            return jsonify({'error': 'Cannot modify a received purchase order'}), 400
        
        cursor.execute("DELETE FROM PurchaseOrderLine WHERE poLineId = %s AND poId = %s", (line_id, po_id))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Line item not found'}), 404
        
        return jsonify({'message': 'Line item removed'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()



@manager_orders_bp.route('/api/manager/orders/<int:order_id>/payment', methods=['GET'])
def get_order_payment(order_id):
    """Get payment for an order"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT p.*, o.status as orderStatus
            FROM Payment p
            JOIN `Order` o ON p.orderId = o.orderId
            WHERE p.orderId = %s
        """, (order_id,))
        payment = cursor.fetchone()
        
        if payment and payment.get('paidAt'):
            payment['paidAt'] = payment['paidAt'].strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify(payment or {})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/payment', methods=['POST'])
def create_order_payment(order_id):
    """Create payment for an order"""
    data = request.get_json()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT orderId, status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute("SELECT paymentId FROM Payment WHERE orderId = %s", (order_id,))
        if cursor.fetchone():
            return jsonify({'error': 'Payment already exists for this order. Use PUT to update.'}), 409
        
        cursor.execute("SELECT totalAmount FROM OrderTotals WHERE orderId = %s", (order_id,))
        total_row = cursor.fetchone()
        amount = data.get('amount') or (float(total_row['totalAmount']) if total_row else 0)
        
        method = data.get('method', 'Cash')
        status = data.get('status', 'Pending')
        reference_no = data.get('referenceNo', '')
        paid_at = 'NOW()' if status == 'Paid' else 'NULL'
        
        if status == 'Paid':
            cursor.execute("""
                INSERT INTO Payment (orderId, amount, method, status, paidAt, referenceNo)
                VALUES (%s, %s, %s, %s, NOW(), %s)
            """, (order_id, amount, method, status, reference_no))
        else:
            cursor.execute("""
                INSERT INTO Payment (orderId, amount, method, status, referenceNo)
                VALUES (%s, %s, %s, %s, %s)
            """, (order_id, amount, method, status, reference_no))
        
        conn.commit()
        
        return jsonify({
            'message': 'Payment created successfully',
            'paymentId': cursor.lastrowid
        }), 201
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/payment', methods=['PUT'])
def update_order_payment(order_id):
    """Update payment status for an order"""
    data = request.get_json()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT paymentId, status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment:
            return jsonify({'error': 'Payment not found for this order'}), 404
        
        new_status = data.get('status', payment['status'])
        method = data.get('method')
        reference_no = data.get('referenceNo')
        amount = data.get('amount')

        updates = ['status = %s']
        params = [new_status]

        if new_status == 'Paid' and payment['status'] != 'Paid':
            updates.append('paidAt = NOW()')
        
        if method:
            updates.append('method = %s')
            params.append(method)
        
        if reference_no is not None:
            updates.append('referenceNo = %s')
            params.append(reference_no)
        
        if amount is not None:
            updates.append('amount = %s')
            params.append(amount)
        
        params.append(order_id)
        
        cursor.execute(f"""
            UPDATE Payment SET {', '.join(updates)}
            WHERE orderId = %s
        """, tuple(params))
        
        if new_status == 'Paid':
            cursor.execute("UPDATE `Order` SET status = 'Paid' WHERE orderId = %s", (order_id,))
        
        conn.commit()
        
        return jsonify({'message': 'Payment updated successfully'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()




@manager_orders_bp.route('/api/manager/orders/<int:order_id>/fulfillment', methods=['GET'])
def get_order_fulfillment(order_id):
    """Get fulfillment allocations for a PAID order"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment:
            return jsonify({'error': 'No payment found for this order'}), 400
        
        payment_status = payment['status'].lower() if payment['status'] else ''
        if payment_status not in ['paid', 'completed', 'success']:
            return jsonify({'error': f'Order payment not confirmed. Status: {payment["status"]}'}), 400
        
        cursor.execute("""
            SELECT 
                ol.productId,
                p.name as productName,
                SUM(ol.quantity) as orderedQty,
                COALESCE((SELECT SUM(sf.quantityAllocated) 
                          FROM ShipsFrom sf 
                          WHERE sf.orderId = %s AND sf.productId = ol.productId), 0) as allocatedQty
            FROM OrderLine ol
            JOIN Product p ON ol.productId = p.productId
            WHERE ol.orderId = %s
            GROUP BY ol.productId, p.name
        """, (order_id, order_id,))
        items = cursor.fetchall()
        
        cursor.execute("""
            SELECT 
                sf.productId,
                sf.warehouseId,
                w.name as warehouseName,
                sf.quantityAllocated,
                sf.fulfilledAt
            FROM ShipsFrom sf
            JOIN Warehouse w ON sf.warehouseId = w.warehouseId
            WHERE sf.orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        for alloc in allocations:
            if alloc.get('fulfilledAt'):
                alloc['fulfilledAt'] = alloc['fulfilledAt'].strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'orderId': order_id,
            'items': items,
            'allocations': allocations
        })
    except Error as e:
        if conn and conn.is_connected():
            conn.close()
        return jsonify({'error': str(e)}), 500


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/fulfillment', methods=['POST'])
def allocate_fulfillment(order_id):
    """Allocate products from warehouses for a PAID order - PAY FIRST MODEL"""
    data = request.get_json()
    product_id = data.get('productId')
    warehouse_id = data.get('warehouseId')
    quantity = data.get('quantity', 1)
    
    if not product_id or not warehouse_id:
        return jsonify({'error': 'productId and warehouseId are required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment or not is_payment_confirmed(payment['status']):
            cursor.close()
            conn.close()
            return jsonify({'error': f'Cannot allocate - order payment not confirmed. Status: {payment["status"] if payment else "No payment"}'}), 400
        
        cursor.execute("""
            SELECT COALESCE(SUM(ol.quantity), 0) as total_ordered
            FROM OrderLine ol 
            WHERE ol.orderId = %s AND ol.productId = %s
        """, (order_id, product_id))
        order_line = cursor.fetchone()
        if not order_line or order_line['total_ordered'] == 0:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Product not in this order'}), 404
        
        total_ordered = order_line['total_ordered']
        
        cursor.execute("""
            SELECT COALESCE(SUM(quantityAllocated), 0) as allocated
            FROM ShipsFrom 
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        already_allocated = cursor.fetchone()['allocated']
        
        if already_allocated + quantity > total_ordered:
            cursor.close()
            conn.close()
            return jsonify({'error': f'Cannot allocate more than ordered. Ordered: {total_ordered}, Already allocated: {already_allocated}'}), 400
        
        cursor.execute("""
            SELECT quantityOnHand 
            FROM InventoryBalance 
            WHERE warehouseId = %s AND productId = %s
        """, (warehouse_id, product_id))
        inv = cursor.fetchone()
        if not inv or inv['quantityOnHand'] < quantity:
            available = inv['quantityOnHand'] if inv else 0
            cursor.close()
            conn.close()
            return jsonify({'error': f'Insufficient inventory. Available: {available}'}), 400
        
        cursor.execute("""
            SELECT quantityAllocated FROM ShipsFrom 
            WHERE orderId = %s AND productId = %s AND warehouseId = %s
        """, (order_id, product_id, warehouse_id))
        existing = cursor.fetchone()
        
        if existing:
            new_qty = existing['quantityAllocated'] + quantity
            cursor.execute("""
                UPDATE ShipsFrom 
                SET quantityAllocated = %s, fulfilledAt = NOW()
                WHERE orderId = %s AND productId = %s AND warehouseId = %s
            """, (new_qty, order_id, product_id, warehouse_id))
        else:
            cursor.execute("""
                INSERT INTO ShipsFrom (orderId, productId, warehouseId, quantityAllocated, fulfilledAt)
                VALUES (%s, %s, %s, %s, NOW())
            """, (order_id, product_id, warehouse_id, quantity))
        
        cursor.execute("""
            UPDATE InventoryBalance 
            SET quantityOnHand = quantityOnHand - %s
            WHERE warehouseId = %s AND productId = %s
        """, (quantity, warehouse_id, product_id))
        
        cursor.execute("""
            INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
            VALUES (%s, %s, 'OUTBOUND', %s, NOW())
        """, (warehouse_id, product_id, -quantity))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'message': 'Fulfillment allocated successfully'}), 201
    except Exception as e:
        if conn and conn.is_connected():
            conn.rollback()
            if cursor:
                cursor.close()
            conn.close()
        return jsonify({'error': str(e)}), 500


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/ship', methods=['POST'])
def mark_order_shipped(order_id):
    """Mark PAID order as shipped after full allocation"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Verify payment (PAY FIRST)
        cursor.execute("SELECT status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment or not is_payment_confirmed(payment['status']):
            return jsonify({'error': f'Cannot ship - order payment not confirmed. Status: {payment["status"] if payment else "No payment"}'}), 400
        
        # Check if all items are fully allocated
        cursor.execute("""
            SELECT 
                ol.productId,
                ol.quantity as ordered,
                COALESCE((SELECT SUM(sf.quantityAllocated) 
                          FROM ShipsFrom sf 
                          WHERE sf.orderId = ol.orderId AND sf.productId = ol.productId), 0) as allocated
            FROM OrderLine ol
            WHERE ol.orderId = %s
        """, (order_id,))
        items = cursor.fetchall()
        
        for item in items:
            if item['allocated'] < item['ordered']:
                return jsonify({
                    'error': f'Not all items allocated. Product {item["productId"]}: {item["allocated"]}/{item["ordered"]}'
                }), 400
        
        # Update order status to Shipped
        cursor.execute("UPDATE `Order` SET status = 'Shipped' WHERE orderId = %s", (order_id,))
        conn.commit()
        
        return jsonify({'message': 'Order marked as shipped'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/deliver', methods=['POST'])
def mark_order_delivered(order_id):
    """Mark shipped order as delivered"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        
        # Verify order is shipped (case-insensitive)
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        result = cursor.fetchone()
        if not result or normalize_status(result[0]) != 'shipped':
            return jsonify({'error': f'Order must be shipped first. Current status: {result[0] if result else "Not found"}'}), 400
        
        cursor.execute("UPDATE `Order` SET status = 'Delivered' WHERE orderId = %s", (order_id,))
        conn.commit()
        
        return jsonify({'message': 'Order marked as delivered'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/cancel', methods=['POST'])
def cancel_and_refund_order(order_id):
    """Cancel PAID order and refund - restore inventory if allocated"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        # Check order status - cannot cancel if already delivered
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        order_status = order['status'].lower() if order['status'] else ''
        if order_status == 'delivered':
            return jsonify({'error': 'Cannot cancel - order already delivered'}), 400
        if order_status == 'cancelled':
            return jsonify({'error': 'Order already cancelled'}), 400
        
        # Verify payment exists
        cursor.execute("SELECT status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment:
            return jsonify({'error': 'Payment not found'}), 404
        
        # Get all allocations to restore inventory
        cursor.execute("""
            SELECT warehouseId, productId, quantityAllocated
            FROM ShipsFrom
            WHERE orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        restored_count = 0
        # Restore inventory for each allocation
        for alloc in allocations:
            # Increase inventory back to warehouse
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            # Record inventory movement (RETURN)
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'RETURN', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
            
            restored_count += alloc['quantityAllocated']
        
        # Delete all allocations from ShipsFrom
        cursor.execute("DELETE FROM ShipsFrom WHERE orderId = %s", (order_id,))
        
        # Update payment status to Refunded
        cursor.execute("UPDATE Payment SET status = 'Refunded' WHERE orderId = %s", (order_id,))
        
        # Update order status to Cancelled
        cursor.execute("UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s", (order_id,))
        
        conn.commit()
        
        return jsonify({
            'message': 'Order cancelled and refunded successfully',
            'allocationsRestored': len(allocations),
            'unitsRestored': restored_count
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


# Customer-facing refund endpoint (for partner to call)
@manager_orders_bp.route('/api/orders/<int:order_id>/refund', methods=['POST'])
def customer_refund_order(order_id):
    """
    Customer refund endpoint - call this when customer requests refund.
    Restores all allocated inventory to original warehouses.
    Can be called by partner's customer-side application.
    """
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        # Check order exists and status
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        order_status = order['status'].lower() if order['status'] else ''
        
        # Cannot refund if already delivered or cancelled
        if order_status == 'delivered':
            return jsonify({'error': 'Cannot refund - order already delivered'}), 400
        if order_status == 'cancelled':
            return jsonify({'error': 'Order already cancelled/refunded'}), 400
        
        # Get all allocations to restore inventory
        cursor.execute("""
            SELECT sf.warehouseId, sf.productId, sf.quantityAllocated, 
                   p.name as productName, w.name as warehouseName
            FROM ShipsFrom sf
            JOIN Product p ON sf.productId = p.productId
            JOIN Warehouse w ON sf.warehouseId = w.warehouseId
            WHERE sf.orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        restored_items = []
        # Restore inventory for each allocation
        for alloc in allocations:
            # Increase inventory back to warehouse
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            # Record inventory movement (REFUND)
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'REFUND', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
            
            restored_items.append({
                'productId': alloc['productId'],
                'productName': alloc['productName'],
                'quantity': alloc['quantityAllocated'],
                'warehouse': alloc['warehouseName']
            })
        
        # Delete all allocations from ShipsFrom
        cursor.execute("DELETE FROM ShipsFrom WHERE orderId = %s", (order_id,))
        
        # Update payment status to Refunded
        cursor.execute("UPDATE Payment SET status = 'Refunded' WHERE orderId = %s", (order_id,))
        
        # Update order status to Cancelled
        cursor.execute("UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s", (order_id,))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Order refunded successfully. Inventory restored to warehouses.',
            'orderId': order_id,
            'restoredItems': restored_items,
            'totalItemsRestored': len(restored_items)
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/available-inventory', methods=['GET'])
def get_available_inventory_for_order(order_id):
    """Get available inventory per warehouse for order items"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get order products
        cursor.execute("""
            SELECT ol.productId, p.name as productName, ol.quantity
            FROM OrderLine ol
            JOIN Product p ON ol.productId = p.productId
            WHERE ol.orderId = %s
        """, (order_id,))
        products = cursor.fetchall()
        
        result = []
        for product in products:
            cursor.execute("""
                SELECT 
                    ib.warehouseId,
                    w.name as warehouseName,
                    w.managerStaffId,
                    ib.quantityOnHand
                FROM InventoryBalance ib
                JOIN Warehouse w ON ib.warehouseId = w.warehouseId
                WHERE ib.productId = %s AND ib.quantityOnHand > 0
            """, (product['productId'],))
            warehouses = cursor.fetchall()
            
            result.append({
                'productId': product['productId'],
                'productName': product['productName'],
                'orderedQty': product['quantity'],
                'warehouses': warehouses
            })
        
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


# ============================
# SYNC ENDPOINTS - For partner integration
# When order items change, sync allocations accordingly
# ============================

@manager_orders_bp.route('/api/manager/orders/<int:order_id>/deallocate/<int:product_id>', methods=['DELETE'])
def deallocate_product(order_id, product_id):
    """Remove allocation for a specific product and restore inventory to warehouse"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        # Get all allocations for this order+product
        cursor.execute("""
            SELECT warehouseId, productId, quantityAllocated
            FROM ShipsFrom
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        allocations = cursor.fetchall()
        
        if not allocations:
            return jsonify({'message': 'No allocations found for this product'}), 200
        
        # Restore inventory for each allocation
        for alloc in allocations:
            # Increase inventory back
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            # Record inventory movement (RETURN)
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'RETURN', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
        
        # Delete the allocations
        cursor.execute("""
            DELETE FROM ShipsFrom
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        
        conn.commit()
        
        total_restored = sum(a['quantityAllocated'] for a in allocations)
        return jsonify({
            'message': f'Deallocated {total_restored} units of product {product_id}',
            'restoredAllocations': len(allocations)
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/remove-item/<int:product_id>', methods=['DELETE'])
def remove_order_item(order_id, product_id):
    """Remove a product from the order and restore its allocation if exists"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        # Check order status - cannot modify if shipped/delivered
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        order_status = normalize_status(order['status'])
        if order_status in ['shipped', 'delivered']:
            return jsonify({'error': 'Cannot modify order - already shipped/delivered'}), 400
        
        # Get allocations for this product first
        cursor.execute("""
            SELECT warehouseId, productId, quantityAllocated
            FROM ShipsFrom
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        allocations = cursor.fetchall()
        
        # Restore inventory for each allocation
        for alloc in allocations:
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'RETURN', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
        
        # Delete allocations
        cursor.execute("""
            DELETE FROM ShipsFrom
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        
        # Delete order line
        cursor.execute("""
            DELETE FROM OrderLine
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        
        conn.commit()
        
        return jsonify({
            'message': f'Product {product_id} removed from order and inventory restored',
            'allocationsRestored': len(allocations)
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/add-item', methods=['POST'])
def add_order_item(order_id):
    """Add a new product to an existing order (no auto-allocation)"""
    data = request.get_json()
    product_id = data.get('productId')
    quantity = data.get('quantity', 1)
    
    if not product_id:
        return jsonify({'error': 'Product ID required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Check order status - cannot modify if shipped/delivered
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        order_status = normalize_status(order['status'])
        if order_status in ['shipped', 'delivered']:
            return jsonify({'error': 'Cannot modify order - already shipped/delivered'}), 400
        
        # Get product price
        cursor.execute("SELECT unitPrice FROM Product WHERE productId = %s", (product_id,))
        product = cursor.fetchone()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        unit_price = float(product['unitPrice'])
        
        # Check if product already in order
        cursor.execute("""
            SELECT orderLineId, quantity FROM OrderLine
            WHERE orderId = %s AND productId = %s
        """, (order_id, product_id))
        existing = cursor.fetchone()
        
        if existing:
            # Update quantity
            new_qty = existing['quantity'] + quantity
            cursor.execute("""
                UPDATE OrderLine SET quantity = %s
                WHERE orderLineId = %s
            """, (new_qty, existing['orderLineId']))
        else:
            # Insert new order line
            cursor.execute("""
                INSERT INTO OrderLine (orderId, productId, quantity, unitPrice)
                VALUES (%s, %s, %s, %s)
            """, (order_id, product_id, quantity, unit_price))
        
        conn.commit()
        
        return jsonify({
            'message': f'Added {quantity} x product {product_id} to order',
            'note': 'Remember to manually allocate inventory for this item'
        }), 201
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/restore-all-allocations', methods=['POST'])
def restore_all_allocations(order_id):
    """Restore all allocations for an order back to warehouses (clear ShipsFrom)"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        # Get all allocations
        cursor.execute("""
            SELECT warehouseId, productId, quantityAllocated
            FROM ShipsFrom
            WHERE orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        if not allocations:
            return jsonify({'message': 'No allocations to restore'}), 200
        
        # Restore inventory for each allocation
        for alloc in allocations:
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'RETURN', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
        
        # Delete all allocations
        cursor.execute("DELETE FROM ShipsFrom WHERE orderId = %s", (order_id,))
        
        conn.commit()
        
        return jsonify({
            'message': f'Restored {len(allocations)} allocations to warehouses',
            'totalUnitsRestored': sum(a['quantityAllocated'] for a in allocations)
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/sync-allocations', methods=['POST'])
def sync_allocations(order_id):
    """
    Clean up orphaned allocations - remove allocations for products 
    that are no longer in the order and restore inventory to warehouse.
    Call this after customer removes items from their order.
    """
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        
        # Find orphaned allocations (in ShipsFrom but not in OrderLine)
        cursor.execute("""
            SELECT sf.warehouseId, sf.productId, sf.quantityAllocated, p.name as productName
            FROM ShipsFrom sf
            LEFT JOIN OrderLine ol ON sf.orderId = ol.orderId AND sf.productId = ol.productId
            JOIN Product p ON sf.productId = p.productId
            WHERE sf.orderId = %s AND ol.orderLineId IS NULL
        """, (order_id,))
        orphaned = cursor.fetchall()
        
        if not orphaned:
            return jsonify({'message': 'No orphaned allocations found', 'cleaned': 0}), 200
        
        cleaned_products = []
        
        # Restore inventory for each orphaned allocation
        for alloc in orphaned:
            # Restore inventory
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))
            
            # Record movement
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'RETURN', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
            
            # Delete the orphaned allocation
            cursor.execute("""
                DELETE FROM ShipsFrom 
                WHERE orderId = %s AND productId = %s AND warehouseId = %s
            """, (order_id, alloc['productId'], alloc['warehouseId']))
            
            cleaned_products.append({
                'productId': alloc['productId'],
                'productName': alloc['productName'],
                'quantityRestored': alloc['quantityAllocated']
            })
        
        conn.commit()
        
        return jsonify({
            'message': f'Cleaned {len(orphaned)} orphaned allocations',
            'cleaned': len(orphaned),
            'products': cleaned_products
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


# ============================================
# PARTNER REFUND ENDPOINT: Process refund and restore inventory
# Partner calls this endpoint when customer requests refund
# This will:
# 1. Check order exists and is not already refunded/cancelled
# 2. Block refund if order is shipped/delivered
# 3. Restore inventory from ShipsFrom allocations
# 4. Delete ShipsFrom records
# 5. Update Payment status to 'Refunded'
# 6. Update Order status to 'Cancelled'
# ============================================
@manager_orders_bp.route('/api/orders/<int:order_id>/refund', methods=['POST'])
def partner_refund_order(order_id):
    """
    Partner endpoint to process refund and restore inventory.
    Call this when customer requests a refund.
    """
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get order and payment status
        cursor.execute("""
            SELECT o.orderId, o.status as orderStatus, p.status as paymentStatus
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        order_status = order['orderStatus'].lower() if order['orderStatus'] else ''
        payment_status = order['paymentStatus'].lower() if order['paymentStatus'] else ''
        
        # Check if already refunded/cancelled
        if order_status == 'cancelled' or payment_status == 'refunded':
            return jsonify({'error': 'Order is already cancelled/refunded'}), 400
        
        # Block refund for shipped/delivered orders
        if order_status in ['shipped', 'delivered']:
            return jsonify({'error': f'Cannot refund order that is {order_status}. Contact support.'}), 400
        
        # Get all ShipsFrom allocations for this order
        cursor.execute("""
            SELECT sf.productId, sf.warehouseId, sf.quantityAllocated, p.name as productName
            FROM ShipsFrom sf
            JOIN Product p ON sf.productId = p.productId
            WHERE sf.orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()
        
        restored_items = []
        
        # Restore inventory for each allocation
        for alloc in allocations:
            # Restore to InventoryBalance
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE productId = %s AND warehouseId = %s
            """, (alloc['quantityAllocated'], alloc['productId'], alloc['warehouseId']))
            
            # Record the inventory movement
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'REFUND_RETURN', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))
            
            restored_items.append({
                'productId': alloc['productId'],
                'productName': alloc['productName'],
                'quantityRestored': alloc['quantityAllocated'],
                'warehouseId': alloc['warehouseId']
            })
        
        # Delete all ShipsFrom records for this order
        cursor.execute("DELETE FROM ShipsFrom WHERE orderId = %s", (order_id,))
        
        # Update Payment status to Refunded
        cursor.execute("""
            UPDATE Payment SET status = 'Refunded' WHERE orderId = %s
        """, (order_id,))
        
        # Update Order status to Cancelled
        cursor.execute("""
            UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s
        """, (order_id,))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Order refunded successfully',
            'orderId': order_id,
            'restoredItems': restored_items,
            'totalItemsRestored': len(restored_items)
        })
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
