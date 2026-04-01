from flask import Blueprint, request, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_inventory_bp = Blueprint('manager_inventory', __name__)

@manager_inventory_bp.route('/api/manager/inventory', methods=['GET'])
def get_inventory():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor(dictionary=True)
        
        # ADVANCED QUERY: Full Inventory Overview with Joins (Fixed schema)
        query = """
            SELECT 
                ib.warehouseId,
                w.name as warehouse_name,
                ib.productId,
                p.name as product_name,
                p.unitPrice,
                p.categoryId,
                ib.quantityOnHand,
                ib.reorderLevel,
                CASE 
                    WHEN ib.quantityOnHand <= 0 THEN 'Out of Stock'
                    WHEN ib.quantityOnHand <= ib.reorderLevel THEN 'Low Stock'
                    ELSE 'In Stock'
                END as status
            FROM InventoryBalance ib
            JOIN Product p ON ib.productId = p.productId
            JOIN Warehouse w ON ib.warehouseId = w.warehouseId
            ORDER BY ib.quantityOnHand ASC
        """
        cursor.execute(query)
        inventory = cursor.fetchall()
        return jsonify(inventory)
        
    except Error as e:
        print(f"Inventory Error: {str(e)}")
        # Return empty array instead of error to prevent page crash
        return jsonify([]), 200
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_inventory_bp.route('/api/manager/inventory/move', methods=['POST'])
def move_inventory():
    data = request.get_json()
    warehouse_id = data.get('warehouseId')
    product_id = data.get('productId')
    qty_change = int(data.get('qtyChange'))
    staff_id = data.get('staffId', 1)
    movement_type = data.get('movementType', 'Adjustment')
    to_warehouse_id = data.get('toWarehouseId')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        conn.start_transaction()
        cursor = conn.cursor()
        
        if movement_type == 'TRANSFER':
            if not to_warehouse_id:
                return jsonify({'error': 'Destination warehouse required for transfer'}), 400
                
            qty = abs(qty_change) # Ensure positive base quantity
            
            # 1. OUT from Source
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'TRANSFER_OUT', %s, NOW())
            """, (warehouse_id, product_id, -qty))
            
            cursor.execute("""
                INSERT INTO InventoryBalance (warehouseId, productId, quantityOnHand, reorderLevel)
                VALUES (%s, %s, %s, 10)
                ON DUPLICATE KEY UPDATE quantityOnHand = quantityOnHand - %s
            """, (warehouse_id, product_id, -qty, qty))
            
            # 2. IN to Destination
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, 'TRANSFER_IN', %s, NOW())
            """, (to_warehouse_id, product_id, qty))
            
            cursor.execute("""
                INSERT INTO InventoryBalance (warehouseId, productId, quantityOnHand, reorderLevel)
                VALUES (%s, %s, %s, 10)
                ON DUPLICATE KEY UPDATE quantityOnHand = quantityOnHand + %s
            """, (to_warehouse_id, product_id, qty, qty))
            
        else:
            # Standard Logic (Inbound/Outbound/Adjustment)
            cursor.execute("""
                INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt)
                VALUES (%s, %s, %s, %s, NOW())
            """, (warehouse_id, product_id, movement_type, qty_change))
            
            cursor.execute("""
                INSERT INTO InventoryBalance (warehouseId, productId, quantityOnHand, reorderLevel)
                VALUES (%s, %s, %s, 10)
                ON DUPLICATE KEY UPDATE quantityOnHand = quantityOnHand + %s
            """, (warehouse_id, product_id, qty_change, qty_change))
        
        conn.commit()
        return jsonify({'message': 'Inventory updated successfully'}), 200
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_inventory_bp.route('/api/manager/inventory/warehouse-stats', methods=['GET'])
def get_warehouse_stats():
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'DB Connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # ADVANCED: Aggregation
        query = """
            SELECT 
                w.name, 
                COUNT(ib.productId) as unique_items,
                SUM(ib.quantityOnHand) as total_units
            FROM Warehouse w
            LEFT JOIN InventoryBalance ib ON w.warehouseId = ib.warehouseId
            GROUP BY w.warehouseId, w.name
        """
        cursor.execute(query)
        return jsonify(cursor.fetchall())
    except Error as e: return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_inventory_bp.route('/api/manager/inventory/low-stock-count', methods=['GET'])
def get_low_stock_count():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT COUNT(*) as val FROM InventoryBalance WHERE quantityOnHand <= reorderLevel")
        return jsonify(cursor.fetchone())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_inventory_bp.route('/api/manager/warehouses', methods=['GET'])
def get_warehouses():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        # Get warehouses with stats
        query = """
            SELECT 
                w.warehouseId,
                w.name,
                w.location,
                w.managerStaffId,
                COUNT(DISTINCT ib.productId) as productCount,
                COALESCE(SUM(ib.quantityOnHand), 0) as totalStock
            FROM Warehouse w
            LEFT JOIN InventoryBalance ib ON w.warehouseId = ib.warehouseId
            GROUP BY w.warehouseId, w.name, w.location, w.managerStaffId
            ORDER BY w.name
        """
        cursor.execute(query)
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_inventory_bp.route('/api/manager/warehouses', methods=['POST'])
def create_warehouse():
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO Warehouse (name, location, managerStaffId) VALUES (%s, %s, NULL)", 
                      (data.get('name'), data.get('location')))
        conn.commit()
        return jsonify({'message': 'Warehouse created', 'id': cursor.lastrowid}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_inventory_bp.route('/api/manager/warehouses/<int:id>', methods=['PUT'])
def update_warehouse(id):
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Warehouse SET name = %s, location = %s WHERE warehouseId = %s",
                      (data.get('name'), data.get('location'), id))
        conn.commit()
        return jsonify({'message': 'Warehouse updated'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_inventory_bp.route('/api/manager/warehouses/<int:id>', methods=['DELETE'])
def delete_warehouse(id):
    conn = get_db_connection()
    try:
        conn.start_transaction()
        cursor = conn.cursor()
        
        # Check if warehouse has inventory
        cursor.execute("SELECT COUNT(*) FROM InventoryBalance WHERE warehouseId = %s AND quantityOnHand > 0", (id,))
        if cursor.fetchone()[0] > 0:
            return jsonify({'error': 'Cannot delete warehouse with existing inventory. Transfer stock first.'}), 400
        
        # Delete empty inventory records
        cursor.execute("DELETE FROM InventoryBalance WHERE warehouseId = %s", (id,))
        
        # Delete inventory movements
        cursor.execute("DELETE FROM InventoryMovement WHERE warehouseId = %s", (id,))
        
        # Delete warehouse
        cursor.execute("DELETE FROM Warehouse WHERE warehouseId = %s", (id,))
        conn.commit()
        return jsonify({'message': 'Warehouse deleted'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        if conn.is_connected(): cursor.close(); conn.close()
