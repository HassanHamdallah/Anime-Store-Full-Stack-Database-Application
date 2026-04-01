from flask import Blueprint, request, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_orders_bp = Blueprint('manager_orders', __name__)

# ============================================
# PAY-FIRST MODEL: Get NEW PAID ORDERS only
# Orders appear here AFTER customer pays
# Manager does NOT approve sale, only manages fulfillment
# ============================================
@ manager_orders_bp.route('/api/manager/orders', methods=['GET'])


def get_all_orders():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        # Get filter parameter
        status_filter = request.args.get('status', 'all')

        # PAY-FIRST QUERY: Only show orders with Payment.status='Paid' or 'Refunded'
        # This ensures unpaid/failed orders don't appear in fulfillment queue
        query = """
                SELECT o.orderId, \
                       o.orderDate, \
                       o.status, \
                       o.shippingAddress, \
                       ot.totalAmount, \
                       c.username                                                 as customer_name, \
                       c.email                                                    as customer_email, \
                       (SELECT COUNT(*) FROM OrderLine WHERE orderId = o.orderId) as item_count, \
                       p.method                                                   as payment_method, \
                       p.status                                                   as payment_status, \
                       p.paidAt, \
                       p.referenceNo
                FROM `Order` o
                         JOIN Customer c ON o.accountId = c.accountId
                         JOIN Payment p ON o.orderId = p.orderId
                         LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
                WHERE p.status IN ('Paid', 'Refunded', 'REFUND_PENDING') \
                """

        # Apply status filter
        if status_filter != 'all':
            if status_filter == 'new':
                query += " AND o.status IN ('Paid')"
            elif status_filter == 'processing':
                query += " AND o.status IN ('Processing')"
            elif status_filter == 'shipped':
                query += " AND o.status IN ('Shipped', 'Delivered')"
            elif status_filter == 'cancelled':
                query += " AND o.status = 'Cancelled'"
            elif status_filter == 'refund':
                query += " AND o.status IN ('Refund Requested', 'Refunded')"

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

        # Verify order is paid
        cursor.execute(
            "SELECT o.status, p.status FROM `Order` o JOIN Payment p ON o.orderId = p.orderId WHERE o.orderId = %s",
            (order_id,))
        result = cursor.fetchone()
        if not result:
            return jsonify({'error': 'Order not found'}), 404
        if result[1] != 'Paid':
            return jsonify({'error': 'Order payment is not confirmed'}), 400

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
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()


@manager_orders_bp.route('/api/manager/orders/status-distribution', methods=['GET'])
def get_status_distribution():
    # Advanced: Distribution of orders (Pie Chart data)
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        query = "SELECT status, COUNT(*) as count FROM `Order` GROUP BY status"
        cursor.execute(query)
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()


# ============================
# PURCHASE ORDER ENDPOINTS
# ============================

@manager_orders_bp.route('/api/manager/purchase-orders', methods=['GET'])
def get_purchase_orders():
    """Get all purchase orders with supplier and total info"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
                SELECT po.poId, \
                       po.supplierId, \
                       s.name                                                        as supplierName, \
                       po.staffId, \
                       st.username                                                   as staffName, \
                       po.orderDate, \
                       po.expectedArrival, \
                       po.status, \
                       pot.totalCost, \
                       (SELECT COUNT(*) FROM PurchaseOrderLine WHERE poId = po.poId) as itemCount
                FROM PurchaseOrder po
                         JOIN Supplier s ON po.supplierId = s.supplierId
                         LEFT JOIN Staff st ON po.staffId = st.accountId
                         LEFT JOIN PurchaseOrderTotals pot ON po.poId = pot.poId
                ORDER BY po.orderDate DESC \
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

        # Get PO header
        cursor.execute("""
                       SELECT po.*,
                              s.name      as supplierName,
                              s.email     as supplierEmail,
                              st.username as staffName
                       FROM PurchaseOrder po
                                JOIN Supplier s ON po.supplierId = s.supplierId
                                LEFT JOIN Staff st ON po.staffId = st.accountId
                       WHERE po.poId = %s
                       """, (po_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Purchase order not found'}), 404

        # Format dates
        if order['orderDate']:
            order['orderDate'] = order['orderDate'].strftime('%Y-%m-%d')
        if order['expectedArrival']:
            order['expectedArrival'] = order['expectedArrival'].strftime('%Y-%m-%d')

        # Get line items with supplier catalog info
        cursor.execute("""
                       SELECT pol.poLineId,
                              pol.productId,
                              p.name                               as productName,
                              pol.quantityOrdered,
                              pol.unitCost,
                              (pol.quantityOrdered * pol.unitCost) as lineTotal,
                              sp.supplierSKU,
                              sp.supplyPrice                       as catalogPrice,
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
    staff_id = data.get('staffId')  # Can be None
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

        # Verify supplier exists
        cursor.execute("SELECT supplierId FROM Supplier WHERE supplierId = %s", (supplier_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Supplier not found'}), 404

        # If staffId provided, verify it exists
        if staff_id:
            cursor.execute("SELECT accountId FROM Staff WHERE accountId = %s", (staff_id,))
            if not cursor.fetchone():
                staff_id = None  # Set to NULL if invalid

        # Validate all items are in supplier catalog and get default prices
        validated_items = []
        for item in items:
            product_id = item.get('productId')
            quantity = item.get('quantity', 1)
            unit_cost = item.get('unitCost')  # May be overridden

            # Check supplier catalog
            cursor.execute("""
                           SELECT sp.supplyPrice, sp.supplierSKU, p.name as productName
                           FROM SupplierProduct sp
                                    JOIN Product p ON sp.productId = p.productId
                           WHERE sp.supplierId = %s
                             AND sp.productId = %s
                           """, (supplier_id, product_id))
            catalog_entry = cursor.fetchone()

            if not catalog_entry:
                return jsonify({
                    'error': f'Product ID {product_id} is not in this supplier\'s catalog. Add it to the supplier catalog first.'
                }), 400

            # Use catalog price if not overridden
            if unit_cost is None:
                unit_cost = catalog_entry['supplyPrice']

            validated_items.append({
                'productId': product_id,
                'quantity': quantity,
                'unitCost': unit_cost
            })

        # Create PO header
        cursor.execute("""
                       INSERT INTO PurchaseOrder (supplierId, staffId, orderDate, expectedArrival, status)
                       VALUES (%s, %s, CURDATE(), %s, 'Pending')
                       """, (supplier_id, staff_id, expected_arrival))

        # Get new PO ID - use lastrowid from cursor
        po_id = cursor.lastrowid

        # Insert line items
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
    warehouse_id = data.get('warehouseId')  # Required if status is 'Received'

    if not new_status:
        return jsonify({'error': 'status is required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)

        # Get current PO status
        cursor.execute("SELECT status, supplierId FROM PurchaseOrder WHERE poId = %s", (po_id,))
        po = cursor.fetchone()

        if not po:
            return jsonify({'error': 'Purchase order not found'}), 404

        # If receiving, process inventory
        if new_status == 'Received' and po['status'] != 'Received':
            if not warehouse_id:
                return jsonify({'error': 'warehouseId is required to receive inventory'}), 400

            # Get all line items
            cursor.execute("""
                           SELECT productId, quantityOrdered, unitCost
                           FROM PurchaseOrderLine
                           WHERE poId = %s
                           """, (po_id,))
            items = cursor.fetchall()

            # Update inventory for each item
            for item in items:
                # Insert or update inventory balance
                cursor.execute("""
                               INSERT INTO InventoryBalance (warehouseId, productId, quantityOnHand, reorderLevel)
                               VALUES (%s, %s, %s, 10) ON DUPLICATE KEY
                               UPDATE quantityOnHand = quantityOnHand + %s
                               """, (warehouse_id, item['productId'], item['quantityOrdered'], item['quantityOrdered']))

                # Record inventory movement
                cursor.execute("""
                               INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                               VALUES (%s, %s, 'INBOUND', %s, NOW())
                               """, (warehouse_id, item['productId'], item['quantityOrdered']))

        # Update PO status
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

        # Get supplier from PO
        cursor.execute("SELECT supplierId, status FROM PurchaseOrder WHERE poId = %s", (po_id,))
        po = cursor.fetchone()

        if not po:
            return jsonify({'error': 'Purchase order not found'}), 404

        if po['status'] == 'Received':
            return jsonify({'error': 'Cannot modify a received purchase order'}), 400

        # Validate product is in supplier catalog
        cursor.execute("""
                       SELECT supplyPrice
                       FROM SupplierProduct
                       WHERE supplierId = %s
                         AND productId = %s
                       """, (po['supplierId'], product_id))
        catalog_entry = cursor.fetchone()

        if not catalog_entry:
            return jsonify({
                'error': 'Product is not in this supplier\'s catalog'
            }), 400

        # Use catalog price if not overridden
        if unit_cost is None:
            unit_cost = catalog_entry['supplyPrice']

        # Insert line item
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

        # Check PO status
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


# ============================
# PAYMENT ENDPOINTS
# ============================

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

        # Check if order exists
        cursor.execute("SELECT orderId, status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        # Check if payment already exists
        cursor.execute("SELECT paymentId FROM Payment WHERE orderId = %s", (order_id,))
        if cursor.fetchone():
            return jsonify({'error': 'Payment already exists for this order. Use PUT to update.'}), 409

        # Get order total from OrderTotals view
        cursor.execute("SELECT totalAmount FROM OrderTotals WHERE orderId = %s", (order_id,))
        total_row = cursor.fetchone()
        amount = data.get('amount') or (float(total_row['totalAmount']) if total_row else 0)

        method = data.get('method', 'Cash')
        status = data.get('status', 'Pending')
        reference_no = data.get('referenceNo', '')
        paid_at = 'NOW()' if status == 'Paid' else 'NULL'

        # Insert payment
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

        # Check if payment exists
        cursor.execute("SELECT paymentId, status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment:
            return jsonify({'error': 'Payment not found for this order'}), 404

        new_status = data.get('status', payment['status'])
        method = data.get('method')
        reference_no = data.get('referenceNo')
        amount = data.get('amount')

        # Build update query dynamically
        updates = ['status = %s']
        params = [new_status]

        # Set paidAt when status changes to Paid
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

        # Update order status if payment is completed
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


# ============================
# FULFILLMENT / SHIPSFROM ENDPOINTS - PAY FIRST MODEL
# ============================

@manager_orders_bp.route('/api/manager/orders/<int:order_id>/fulfillment', methods=['GET'])
def get_order_fulfillment(order_id):
    """Get fulfillment allocations for a PAID order"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify payment is completed
        cursor.execute("SELECT status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment or payment['status'] != 'Paid':
            return jsonify({'error': 'Order is not paid'}), 400

        # Get order items with fulfillment status
        cursor.execute("""
                       SELECT ol.orderLineId,
                              ol.productId,
                              p.name                                           as productName,
                              ol.quantity                                      as orderedQty,
                              COALESCE((SELECT SUM(sf.quantityAllocated)
                                        FROM ShipsFrom sf
                                        WHERE sf.orderId = ol.orderId
                                          AND sf.productId = ol.productId), 0) as allocatedQty
                       FROM OrderLine ol
                                JOIN Product p ON ol.productId = p.productId
                       WHERE ol.orderId = %s
                       """, (order_id,))
        items = cursor.fetchall()

        # Get existing allocations
        cursor.execute("""
                       SELECT sf.productId,
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

        return jsonify({
            'orderId': order_id,
            'items': items,
            'allocations': allocations
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


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
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)

        # Verify payment is completed (PAY FIRST validation)
        cursor.execute("SELECT status FROM Payment WHERE orderId = %s", (order_id,))
        payment = cursor.fetchone()
        if not payment or payment['status'] != 'Paid':
            return jsonify({'error': 'Cannot allocate - order is not paid'}), 400

        # Verify order exists and has this product
        cursor.execute("""
                       SELECT ol.quantity
                       FROM OrderLine ol
                       WHERE ol.orderId = %s
                         AND ol.productId = %s
                       """, (order_id, product_id))
        order_line = cursor.fetchone()
        if not order_line:
            return jsonify({'error': 'Product not in this order'}), 404

        # Check already allocated quantity
        cursor.execute("""
                       SELECT COALESCE(SUM(quantityAllocated), 0) as allocated
                       FROM ShipsFrom
                       WHERE orderId = %s
                         AND productId = %s
                       """, (order_id, product_id))
        already_allocated = cursor.fetchone()['allocated']

        if already_allocated + quantity > order_line['quantity']:
            return jsonify({
                               'error': f'Cannot allocate more than ordered. Ordered: {order_line["quantity"]}, Already allocated: {already_allocated}'}), 400

        # Check warehouse inventory
        cursor.execute("""
                       SELECT quantityOnHand
                       FROM InventoryBalance
                       WHERE warehouseId = %s
                         AND productId = %s
                       """, (warehouse_id, product_id))
        inv = cursor.fetchone()
        if not inv or inv['quantityOnHand'] < quantity:
            available = inv['quantityOnHand'] if inv else 0
            return jsonify({'error': f'Insufficient inventory. Available: {available}'}), 400

        # Check if allocation already exists for this combo
        cursor.execute("""
                       SELECT quantityAllocated
                       FROM ShipsFrom
                       WHERE orderId = %s
                         AND productId = %s
                         AND warehouseId = %s
                       """, (order_id, product_id, warehouse_id))
        existing = cursor.fetchone()

        if existing:
            # Update existing allocation
            new_qty = existing['quantityAllocated'] + quantity
            cursor.execute("""
                           UPDATE ShipsFrom
                           SET quantityAllocated = %s,
                               fulfilledAt       = NOW()
                           WHERE orderId = %s
                             AND productId = %s
                             AND warehouseId = %s
                           """, (new_qty, order_id, product_id, warehouse_id))
        else:
            # Create new allocation
            cursor.execute("""
                           INSERT INTO ShipsFrom (orderId, productId, warehouseId, quantityAllocated, fulfilledAt)
                           VALUES (%s, %s, %s, %s, NOW())
                           """, (order_id, product_id, warehouse_id, quantity))

        # Decrease inventory
        cursor.execute("""
                       UPDATE InventoryBalance
                       SET quantityOnHand = quantityOnHand - %s
                       WHERE warehouseId = %s
                         AND productId = %s
                       """, (quantity, warehouse_id, product_id))

        # Record inventory movement
        cursor.execute("""
                       INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                       VALUES (%s, %s, 'OUT', %s, NOW())
                       """, (warehouse_id, product_id, -quantity))

        conn.commit()

        return jsonify({'message': 'Fulfillment allocated successfully'}), 201
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


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
        if not payment or payment['status'] != 'Paid':
            return jsonify({'error': 'Cannot ship - order is not paid'}), 400

        # Check if all items are fully allocated
        cursor.execute("""
                       SELECT ol.productId,
                              ol.quantity                                      as ordered,
                              COALESCE((SELECT SUM(sf.quantityAllocated)
                                        FROM ShipsFrom sf
                                        WHERE sf.orderId = ol.orderId
                                          AND sf.productId = ol.productId), 0) as allocated
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

        # Verify order is shipped
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        result = cursor.fetchone()
        if not result or result[0] != 'Shipped':
            return jsonify({'error': 'Order must be shipped first'}), 400

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

        # Restore inventory for each allocation
        for alloc in allocations:
            # Increase inventory
            cursor.execute("""
                           UPDATE InventoryBalance
                           SET quantityOnHand = quantityOnHand + %s
                           WHERE warehouseId = %s
                             AND productId = %s
                           """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))

            # Record inventory movement (IN)
            cursor.execute("""
                           INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                           VALUES (%s, %s, 'IN', %s, NOW())
                           """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))

        # Update payment status to Refunded
        cursor.execute("UPDATE Payment SET status = 'Refunded' WHERE orderId = %s", (order_id,))

        # Update order status to Cancelled
        cursor.execute("UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s", (order_id,))

        conn.commit()

        return jsonify({'message': 'Order cancelled and refunded successfully'})
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
                           SELECT ib.warehouseId,
                                  w.name as warehouseName,
                                  ib.quantityOnHand
                           FROM InventoryBalance ib
                                    JOIN Warehouse w ON ib.warehouseId = w.warehouseId
                           WHERE ib.productId = %s
                             AND ib.quantityOnHand > 0
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


# ============================================
# REFUND MANAGEMENT ENDPOINTS
# ============================================

@manager_orders_bp.route('/api/manager/orders/<int:order_id>/approve-refund', methods=['POST'])
def approve_refund(order_id):
    """Approve a refund request - cancels order and refunds payment"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)

        # Verify order has refund requested status
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['status'] != 'Refund Requested':
            return jsonify({'error': 'Order does not have a pending refund request'}), 400

        # Get all allocations to restore inventory
        cursor.execute("""
                       SELECT warehouseId, productId, quantityAllocated
                       FROM ShipsFrom
                       WHERE orderId = %s
                       """, (order_id,))
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
                           VALUES (%s, %s, 'REFUND_RESTORE', %s, NOW())
                           """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))

        # Update payment status to Refunded
        cursor.execute("UPDATE Payment SET status = 'Refunded' WHERE orderId = %s", (order_id,))

        # Update order status to Refunded
        cursor.execute("UPDATE `Order` SET status = 'Refunded' WHERE orderId = %s", (order_id,))

        conn.commit()

        return jsonify({'message': 'Refund approved successfully'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_orders_bp.route('/api/manager/orders/<int:order_id>/reject-refund', methods=['POST'])
def reject_refund(order_id):
    """Reject a refund request - restore order to previous status"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Verify order has refund requested status
        cursor.execute("SELECT status FROM `Order` WHERE orderId = %s", (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404
        if order['status'] != 'Refund Requested':
            return jsonify({'error': 'Order does not have a pending refund request'}), 400

        # Check if order has been shipped/delivered - restore to that status
        # Otherwise restore to Paid
        cursor.execute("""
                       SELECT COUNT(*) as count FROM ShipsFrom WHERE orderId = %s
                       """, (order_id,))
        allocation = cursor.fetchone()

        new_status = 'Delivered' if allocation and allocation['count'] > 0 else 'Paid'

        cursor.execute("UPDATE `Order` SET status = %s WHERE orderId = %s", (new_status, order_id))
        conn.commit()

        return jsonify({'message': f'Refund rejected. Order status restored to {new_status}'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


# ============================================
# PUBLIC REFUND ENDPOINT - Called by customer side
# POST /api/orders/{orderId}/refund
# This endpoint properly handles:
# - Restores inventory to the correct warehouse
# - Updates Payment status to "Refunded"
# - Updates Order status to "Cancelled"
# - Cleans up allocation records
# - Blocks refund if order is already shipped/delivered
# ============================================
@manager_orders_bp.route('/api/orders/<int:order_id>/refund', methods=['POST'])
def process_refund(order_id):
    """
    Process a refund request for an order.
    This endpoint is called by the customer side to request a refund.
    It properly restores inventory and updates all related records.

    Only allows refunds for orders that haven't been shipped yet.
    Orders with status 'Shipped' or 'Delivered' will be rejected.
    """
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500

    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)

        # Get order details and payment info
        cursor.execute("""
            SELECT o.orderId, o.status, o.accountId, p.paymentId, p.amount, p.status as paymentStatus
            FROM `Order` o
            LEFT JOIN Payment p ON o.orderId = p.orderId
            WHERE o.orderId = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'success': False, 'error': 'Order not found'}), 404

        # Check if already cancelled/refunded
        if order['status'] == 'Cancelled':
            return jsonify({'success': False, 'error': 'Order is already cancelled'}), 400

        # Block refund for shipped/delivered orders
        blocked_statuses = ['Shipped', 'Delivered']
        if order['status'] in blocked_statuses:
            return jsonify({
                'success': False,
                'error': f'Cannot refund order with status: {order["status"]}. Orders that have been shipped or delivered cannot be refunded.'
            }), 400

        # Only allow refunds for Paid or Processing orders
        allowed_statuses = ['Paid', 'Processing']
        if order['status'] not in allowed_statuses:
            return jsonify({
                'success': False,
                'error': f'Cannot refund order with status: {order["status"]}. Only Paid or Processing orders can be refunded.'
            }), 400

        restored_items = []

        # Get all allocations to restore inventory
        cursor.execute("""
            SELECT sf.warehouseId, sf.productId, sf.quantityAllocated, p.name as productName, w.name as warehouseName
            FROM ShipsFrom sf
            JOIN Product p ON sf.productId = p.productId
            JOIN Warehouse w ON sf.warehouseId = w.warehouseId
            WHERE sf.orderId = %s
        """, (order_id,))
        allocations = cursor.fetchall()

        # Restore inventory for each allocation
        for alloc in allocations:
            # Increase inventory quantity
            cursor.execute("""
                UPDATE InventoryBalance
                SET quantityOnHand = quantityOnHand + %s
                WHERE warehouseId = %s AND productId = %s
            """, (alloc['quantityAllocated'], alloc['warehouseId'], alloc['productId']))

            # Record inventory movement (REFUND type)
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'REFUND', %s, NOW())
            """, (alloc['warehouseId'], alloc['productId'], alloc['quantityAllocated']))

            restored_items.append({
                'productId': alloc['productId'],
                'productName': alloc['productName'],
                'quantity': alloc['quantityAllocated'],
                'warehouseId': alloc['warehouseId'],
                'warehouseName': alloc['warehouseName']
            })

        # Delete allocation records from ShipsFrom
        cursor.execute("DELETE FROM ShipsFrom WHERE orderId = %s", (order_id,))

        # Update payment status to Refunded
        if order['paymentId']:
            cursor.execute("UPDATE Payment SET status = 'Refunded' WHERE paymentId = %s", (order['paymentId'],))

        # Update order status to Cancelled
        cursor.execute("UPDATE `Order` SET status = 'Cancelled' WHERE orderId = %s", (order_id,))

        conn.commit()

        refund_amount = float(order['amount']) if order['amount'] else 0

        return jsonify({
            'success': True,
            'message': 'Order refunded successfully',
            'orderId': order_id,
            'refundAmount': refund_amount,
            'restoredItems': restored_items,
            'inventoryRestored': len(restored_items) > 0
        })

    except Error as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

