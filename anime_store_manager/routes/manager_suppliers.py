from flask import Blueprint, request, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_suppliers_bp = Blueprint('manager_suppliers', __name__)

@manager_suppliers_bp.route('/api/manager/suppliers', methods=['GET'])
def get_suppliers():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # SIMPLE QUERY: List suppliers
        query = "SELECT * FROM Supplier ORDER BY supplierId DESC"
        cursor.execute(query)
        suppliers = cursor.fetchall()
        return jsonify(suppliers)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_suppliers_bp.route('/api/manager/suppliers', methods=['POST'])
def create_supplier():
    data = request.get_json()
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        # NORMAL QUERY: Create supplier
        query = "INSERT INTO Supplier (name, email, address) VALUES (%s, %s, %s)"
        cursor.execute(query, (
            data.get('name'), 
            data.get('email'), 
            data.get('address')
        ))
        conn.commit()
        return jsonify({'message': 'Supplier created', 'id': cursor.lastrowid}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_suppliers_bp.route('/api/manager/suppliers/<int:id>', methods=['DELETE'])
def delete_supplier(id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        conn.start_transaction()
        cursor = conn.cursor()
        
        # First, delete all catalog entries for this supplier
        cursor.execute("DELETE FROM SupplierProduct WHERE supplierId = %s", (id,))
        
        # Then delete the supplier
        cursor.execute("DELETE FROM Supplier WHERE supplierId = %s", (id,))
        conn.commit()
        return jsonify({'message': 'Supplier deleted'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_suppliers_bp.route('/api/manager/suppliers/<int:id>', methods=['GET'])
def get_supplier_detail(id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Supplier WHERE supplierId = %s", (id,))
        return jsonify(cursor.fetchone() or {})
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_suppliers_bp.route('/api/manager/suppliers/<int:id>', methods=['PUT'])
def update_supplier(id):
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # NORMAL QUERY: Update
        query = "UPDATE Supplier SET name=%s, email=%s, address=%s WHERE supplierId=%s"
        cursor.execute(query, (
            data.get('name'), 
            data.get('email'), 
            data.get('address'), 
            id
        ))
        conn.commit()
        return jsonify({'message': 'Supplier updated'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_suppliers_bp.route('/api/manager/suppliers/search', methods=['GET'])
def search_suppliers():
    q = request.args.get('q', '')
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        # NORMAL QUERY: Search
        cursor.execute("SELECT * FROM Supplier WHERE name LIKE %s", (f"%{q}%",))
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_suppliers_bp.route('/api/manager/suppliers/<int:id>/products', methods=['GET'])
def get_supplier_products(id):
    # Note: Product table no longer has supplierId column
    # This would require PurchaseOrderLine to link suppliers to products
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        # Get products that this supplier has supplied via purchase orders
        query = """
            SELECT DISTINCT p.*, c.name as category_name 
            FROM Product p 
            JOIN Category c ON p.categoryId = c.categoryId
            JOIN PurchaseOrderLine pol ON p.productId = pol.productId
            JOIN PurchaseOrder po ON pol.poId = po.poId
            WHERE po.supplierId = %s
        """
        cursor.execute(query, (id,))
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()


# ============================
# SUPPLIER CATALOG ENDPOINTS
# ============================

@manager_suppliers_bp.route('/api/manager/suppliers/<int:supplier_id>/catalog', methods=['GET'])
def get_supplier_catalog(supplier_id):
    """Get all products in a supplier's catalog (SupplierProduct entries)"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                sp.supplierId,
                sp.productId,
                sp.supplierSKU,
                sp.supplyPrice,
                sp.leadTimeDays,
                p.name as productName,
                p.unitPrice as retailPrice,
                p.description,
                p.productImage,
                c.name as categoryName
            FROM SupplierProduct sp
            JOIN Product p ON sp.productId = p.productId
            JOIN Category c ON p.categoryId = c.categoryId
            WHERE sp.supplierId = %s
            ORDER BY p.name
        """
        cursor.execute(query, (supplier_id,))
        catalog = cursor.fetchall()
        return jsonify(catalog)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_suppliers_bp.route('/api/manager/suppliers/<int:supplier_id>/catalog', methods=['POST'])
def add_to_supplier_catalog(supplier_id):
    """Add a product to a supplier's catalog"""
    data = request.get_json()
    product_id = data.get('productId')
    supplier_sku = data.get('supplierSKU', '')
    supply_price = data.get('supplyPrice')
    lead_time_days = data.get('leadTimeDays')
    
    if not product_id:
        return jsonify({'error': 'productId is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        
        # Check if product exists
        cursor.execute("SELECT productId FROM Product WHERE productId = %s", (product_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Product not found'}), 404
        
        # Check if supplier exists
        cursor.execute("SELECT supplierId FROM Supplier WHERE supplierId = %s", (supplier_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Supplier not found'}), 404
        
        # Check if entry already exists
        cursor.execute(
            "SELECT * FROM SupplierProduct WHERE supplierId = %s AND productId = %s",
            (supplier_id, product_id)
        )
        if cursor.fetchone():
            return jsonify({'error': 'This product is already in the supplier catalog'}), 409
        
        # Insert catalog entry
        query = """
            INSERT INTO SupplierProduct (supplierId, productId, supplierSKU, supplyPrice, leadTimeDays)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (supplier_id, product_id, supplier_sku, supply_price, lead_time_days))
        conn.commit()
        
        return jsonify({
            'message': 'Product added to supplier catalog',
            'supplierId': supplier_id,
            'productId': product_id
        }), 201
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_suppliers_bp.route('/api/manager/suppliers/<int:supplier_id>/catalog/<int:product_id>', methods=['PUT'])
def update_supplier_catalog_entry(supplier_id, product_id):
    """Update a supplier catalog entry"""
    data = request.get_json()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        
        # Check if entry exists
        cursor.execute(
            "SELECT * FROM SupplierProduct WHERE supplierId = %s AND productId = %s",
            (supplier_id, product_id)
        )
        if not cursor.fetchone():
            return jsonify({'error': 'Catalog entry not found'}), 404
        
        # Update catalog entry
        query = """
            UPDATE SupplierProduct 
            SET supplierSKU = %s, supplyPrice = %s, leadTimeDays = %s
            WHERE supplierId = %s AND productId = %s
        """
        cursor.execute(query, (
            data.get('supplierSKU', ''),
            data.get('supplyPrice'),
            data.get('leadTimeDays'),
            supplier_id,
            product_id
        ))
        conn.commit()
        
        return jsonify({'message': 'Catalog entry updated'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_suppliers_bp.route('/api/manager/suppliers/<int:supplier_id>/catalog/<int:product_id>', methods=['DELETE'])
def remove_from_supplier_catalog(supplier_id, product_id):
    """Remove a product from a supplier's catalog"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        
        # Delete catalog entry
        cursor.execute(
            "DELETE FROM SupplierProduct WHERE supplierId = %s AND productId = %s",
            (supplier_id, product_id)
        )
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Catalog entry not found'}), 404
        
        return jsonify({'message': 'Product removed from supplier catalog'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@manager_suppliers_bp.route('/api/manager/suppliers/<int:supplier_id>/available-products', methods=['GET'])
def get_available_products_for_supplier(supplier_id):
    """Get products NOT already in the supplier's catalog (for adding new entries)"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT p.productId, p.name, p.unitPrice, p.description, c.name as categoryName
            FROM Product p
            JOIN Category c ON p.categoryId = c.categoryId
            WHERE p.productId NOT IN (
                SELECT productId FROM SupplierProduct WHERE supplierId = %s
            )
            ORDER BY p.name
        """
        cursor.execute(query, (supplier_id,))
        return jsonify(cursor.fetchall())
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
