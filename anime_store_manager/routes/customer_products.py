"""
Customer Products Routes
Contains APIs for product browsing, searching, filtering, and details
"""
from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error

customer_products_bp = Blueprint('customer_products', __name__)

# ============================================
# NORMAL QUERY 6: Get all products with pagination
# ============================================
@customer_products_bp.route('/api/customer/products', methods=['GET'])
def get_all_products():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 12))
        offset = (page - 1) * limit
        
        # Get total count
        cursor.execute("SELECT COUNT(*) as total FROM Product")
        total = cursor.fetchone()['total']
        
        # Get products with pagination and stock info
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                p.categoryId,
                c.name as categoryName,
                COALESCE((SELECT SUM(ib.quantityOnHand) FROM InventoryBalance ib WHERE ib.productId = p.productId), 0) as totalStock
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            ORDER BY p.productId DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(query, (limit, offset))
        products = cursor.fetchall()
        
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            p['totalStock'] = int(p['totalStock']) if p['totalStock'] else 0
        
        return jsonify({
            'products': products,
            'total': total,
            'page': page,
            'limit': limit,
            'totalPages': (total + limit - 1) // limit
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 6: Search products with full-text matching
# Uses LIKE with multiple fields and JOINs
# ============================================
@customer_products_bp.route('/api/customer/products/search', methods=['GET'])
def search_products():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        search_term = request.args.get('q', '')
        category_id = request.args.get('categoryId')
        min_price = request.args.get('minPrice')
        max_price = request.args.get('maxPrice')
        sort_by = request.args.get('sortBy', 'name')  # name, price_asc, price_desc
        
        # ADVANCED: Dynamic query building with multiple conditions
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                p.categoryId,
                c.name as categoryName,
                (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                 FROM InventoryBalance ib 
                 WHERE ib.productId = p.productId) as totalStock,
                CASE 
                    WHEN (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                          FROM InventoryBalance ib 
                          WHERE ib.productId = p.productId) > 10 THEN 'In Stock'
                    WHEN (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                          FROM InventoryBalance ib 
                          WHERE ib.productId = p.productId) > 0 THEN 'Low Stock'
                    ELSE 'Out of Stock'
                END as stockStatus
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE 1=1
        """
        params = []
        
        if search_term:
            query += " AND (p.name LIKE %s OR p.description LIKE %s OR c.name LIKE %s)"
            search_pattern = f"%{search_term}%"
            params.extend([search_pattern, search_pattern, search_pattern])
        
        if category_id:
            query += " AND p.categoryId = %s"
            params.append(int(category_id))
        
        if min_price:
            query += " AND p.unitPrice >= %s"
            params.append(float(min_price))
        
        if max_price:
            query += " AND p.unitPrice <= %s"
            params.append(float(max_price))
        
        # Sorting
        if sort_by == 'price_asc':
            query += " ORDER BY p.unitPrice ASC"
        elif sort_by == 'price_desc':
            query += " ORDER BY p.unitPrice DESC"
        elif sort_by == 'newest':
            query += " ORDER BY p.productId DESC"
        else:
            query += " ORDER BY p.name ASC"
        
        cursor.execute(query, tuple(params))
        products = cursor.fetchall()
        
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            p['totalStock'] = int(p['totalStock']) if p['totalStock'] else 0
        
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 7: Get product details with full info
# Uses JOINs and subqueries for stock per warehouse
# ============================================
@customer_products_bp.route('/api/customer/products/<int:product_id>', methods=['GET'])
def get_product_details(product_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # ADVANCED: Complex query with subquery and CASE
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                p.categoryId,
                c.name as categoryName,
                c.description as categoryDescription,
                (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                 FROM InventoryBalance ib 
                 WHERE ib.productId = p.productId) as totalStock,
                CASE 
                    WHEN (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                          FROM InventoryBalance ib 
                          WHERE ib.productId = p.productId) > 10 THEN 'In Stock'
                    WHEN (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                          FROM InventoryBalance ib 
                          WHERE ib.productId = p.productId) > 0 THEN 'Low Stock'
                    ELSE 'Out of Stock'
                END as stockStatus
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE p.productId = %s
        """
        cursor.execute(query, (product_id,))
        product = cursor.fetchone()
        
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        product['unitPrice'] = float(product['unitPrice']) if product['unitPrice'] else 0
        product['totalStock'] = int(product['totalStock']) if product['totalStock'] else 0
        
        return jsonify(product)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 8: Get related products (same category)
# Uses NOT IN to exclude current product
# ============================================
@customer_products_bp.route('/api/customer/products/<int:product_id>/related', methods=['GET'])
def get_related_products(product_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # ADVANCED: Subquery to find same category products
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                 FROM InventoryBalance ib 
                 WHERE ib.productId = p.productId) as totalStock
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE p.categoryId = (SELECT categoryId FROM Product WHERE productId = %s)
            AND p.productId != %s
            ORDER BY RAND()
            LIMIT 4
        """
        cursor.execute(query, (product_id, product_id))
        products = cursor.fetchall()
        
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            p['totalStock'] = int(p['totalStock']) if p['totalStock'] else 0
        
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 7: Get products by category ID
# ============================================
@customer_products_bp.route('/api/customer/products/category/<int:category_id>', methods=['GET'])
def get_products_by_category(category_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                p.categoryId,
                c.name as categoryName,
                COALESCE((SELECT SUM(ib.quantityOnHand) FROM InventoryBalance ib WHERE ib.productId = p.productId), 0) as totalStock
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE p.categoryId = %s
            ORDER BY p.name ASC
        """
        cursor.execute(query, (category_id,))
        products = cursor.fetchall()
        
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            p['totalStock'] = int(p['totalStock']) if p['totalStock'] else 0
        
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 8: Get price range for filters
# ============================================
@customer_products_bp.route('/api/customer/products/price-range', methods=['GET'])
def get_price_range():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT 
                MIN(unitPrice) as minPrice, 
                MAX(unitPrice) as maxPrice
            FROM Product
        """)
        result = cursor.fetchone()
        return jsonify({
            'minPrice': float(result['minPrice']) if result['minPrice'] else 0,
            'maxPrice': float(result['maxPrice']) if result['maxPrice'] else 0
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 9: Get products with inventory details per warehouse
# Complex JOIN with warehouse information
# ============================================
@customer_products_bp.route('/api/customer/products/<int:product_id>/availability', methods=['GET'])
def get_product_availability(product_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # ADVANCED: Multi-table JOIN for warehouse availability
        query = """
            SELECT 
                w.warehouseId,
                w.name as warehouseName,
                w.location as warehouseLocation,
                ib.quantityOnHand,
                CASE 
                    WHEN ib.quantityOnHand > 10 THEN 'High'
                    WHEN ib.quantityOnHand > 0 THEN 'Low'
                    ELSE 'None'
                END as availabilityLevel
            FROM InventoryBalance ib
            JOIN Warehouse w ON ib.warehouseId = w.warehouseId
            WHERE ib.productId = %s AND ib.quantityOnHand > 0
            ORDER BY ib.quantityOnHand DESC
        """
        cursor.execute(query, (product_id,))
        warehouses = cursor.fetchall()
        
        # Get total
        total_stock = sum(w['quantityOnHand'] for w in warehouses)
        
        return jsonify({
            'productId': product_id,
            'totalStock': total_stock,
            'warehouses': warehouses
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 9: Check single product stock
# ============================================
@customer_products_bp.route('/api/customer/products/<int:product_id>/stock', methods=['GET'])
def check_product_stock(product_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT COALESCE(SUM(quantityOnHand), 0) as stock
            FROM InventoryBalance
            WHERE productId = %s
        """, (product_id,))
        result = cursor.fetchone()
        stock = int(result['stock']) if result else 0
        return jsonify({
            'productId': product_id,
            'stock': stock,
            'inStock': stock > 0
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 10: Get products count by category
# ============================================
@customer_products_bp.route('/api/customer/products/count-by-category', methods=['GET'])
def get_products_count_by_category():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT c.categoryId, c.name, COUNT(p.productId) as productCount
            FROM Category c
            LEFT JOIN Product p ON c.categoryId = p.categoryId
            GROUP BY c.categoryId, c.name
            ORDER BY productCount DESC
        """
        cursor.execute(query)
        return jsonify(cursor.fetchall())
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
