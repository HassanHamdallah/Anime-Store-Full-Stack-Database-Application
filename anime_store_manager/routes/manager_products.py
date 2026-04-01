from flask import Blueprint, request, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_products_bp = Blueprint('manager_products', __name__)

@manager_products_bp.route('/api/manager/products', methods=['GET'])
def list_products():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        # MEDIUM QUERY: Product List with Category and Supplier
        query = """
            SELECT 
                p.*,
                c.name as category_name
            FROM Product p
            JOIN Category c ON p.categoryId = c.categoryId
            ORDER BY p.productId DESC
        """
        cursor.execute(query)
        products = cursor.fetchall()
        return jsonify(products)
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_products_bp.route('/api/manager/products', methods=['POST'])
def create_product():
    data = request.get_json()
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        conn.start_transaction()
        cursor = conn.cursor()
        
        # 1. Insert Product
        # NORMAL QUERY: Insert product (Removed supplierId and sku as per schema)
        query = """
            INSERT INTO Product (categoryId, name, description, unitPrice, productImage)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (
            data.get('categoryId'),
            data.get('name'),
            data.get('description'),
            data.get('unitPrice'),
            data.get('productImage', '')
        ))
        product_id = cursor.lastrowid
        
        # 2. Insert Initial Inventory (if warehouse provided)
        warehouse_id = data.get('warehouseId')
        quantity = int(data.get('quantity', 0))
        
        if warehouse_id:
            # Insert Balance
            query_inv = "INSERT INTO InventoryBalance (warehouseId, productId, quantityOnHand, reorderLevel) VALUES (%s, %s, %s, 10)"
            cursor.execute(query_inv, (warehouse_id, product_id, quantity))
            
            # Track Initial Movement
            if quantity > 0:
                query_move = "INSERT INTO InventoryMovement (warehouseId, productId, movementType, qtyChange, movementAt) VALUES (%s, %s, 'INBOUND', %s, NOW())"
                cursor.execute(query_move, (warehouse_id, product_id, quantity))
                
        conn.commit()
        
        return jsonify({'message': 'Product created successfully', 'id': cursor.lastrowid}), 201
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_products_bp.route('/api/manager/products/<int:id>', methods=['DELETE'])
def delete_product(id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor()
        
        # Check for orders (soft restrict)
        cursor.execute("SELECT COUNT(*) FROM OrderLine WHERE productId = %s", (id,))
        if cursor.fetchone()[0] > 0:
            return jsonify({'error': 'Cannot delete product with existing customer orders'}), 400

        # Check for purchase orders (soft restrict)
        cursor.execute("SELECT COUNT(*) FROM PurchaseOrderLine WHERE productId = %s", (id,))
        if cursor.fetchone()[0] > 0:
            # For now, we restrict. If we wanted to cascade, we would delete from PurchaseOrderLine.
            return jsonify({'error': 'Cannot delete product associated with purchase orders'}), 400

        # Delete Inventory Data first
        cursor.execute("DELETE FROM InventoryBalance WHERE productId = %s", (id,))
        cursor.execute("DELETE FROM InventoryMovement WHERE productId = %s", (id,))
        
        # Delete Product
        cursor.execute("DELETE FROM Product WHERE productId = %s", (id,))
        conn.commit()
        return jsonify({'message': 'Product deleted successfully'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_products_bp.route('/api/manager/products/<int:id>/details', methods=['GET'])
def get_product_details_route(id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        # Fixed schema: Removed supplier join and SKU
        cursor.execute("""
            SELECT 
                p.*, 
                c.name as category_name
            FROM Product p 
            JOIN Category c ON p.categoryId=c.categoryId 
            WHERE p.productId = %s
        """, (id,))
        product = cursor.fetchone()
        if product: return jsonify(product)
        return jsonify({'error': 'Product not found'}), 404
    except Error as e: return jsonify({'error': str(e)}), 500
    finally: 
        if conn.is_connected(): cursor.close(); conn.close()

@manager_products_bp.route('/api/manager/categories', methods=['GET'])
def get_categories():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Category")
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_products_bp.route('/api/manager/categories', methods=['POST'])
def create_category():
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO Category (name, description) VALUES (%s, %s)", (data['name'], data.get('description')))
        conn.commit()
        return jsonify({'message': 'Category created', 'id': cursor.lastrowid}), 201
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_products_bp.route('/api/manager/products/<int:id>/price', methods=['PUT'])
def update_product_price(id):
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Product SET unitPrice = %s WHERE productId = %s", (data['unitPrice'], id))
        conn.commit()
        return jsonify({'message': 'Price updated'})
    finally:
        if conn.is_connected(): cursor.close(); conn.close()
