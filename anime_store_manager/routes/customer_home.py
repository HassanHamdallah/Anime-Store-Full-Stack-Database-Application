"""
Customer Home Page Routes
Contains APIs for homepage data: featured products, categories, new arrivals, bestsellers
"""
from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error

customer_home_bp = Blueprint('customer_home', __name__)

# ============================================
# NORMAL QUERY 1: Get all categories
# ============================================
@customer_home_bp.route('/api/customer/categories', methods=['GET'])
def get_categories():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Category ORDER BY name ASC")
        categories = cursor.fetchall()
        return jsonify(categories)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 1: Get featured products with category and stock info
# Uses JOINs across Product, Category, and aggregates InventoryBalance
# ============================================
@customer_home_bp.route('/api/customer/home/featured', methods=['GET'])
def get_featured_products():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # ADVANCED: Multi-table JOIN with aggregation and CASE expression
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                c.categoryId,
                COALESCE(SUM(ib.quantityOnHand), 0) as totalStock,
                CASE 
                    WHEN COALESCE(SUM(ib.quantityOnHand), 0) > 10 THEN 'In Stock'
                    WHEN COALESCE(SUM(ib.quantityOnHand), 0) > 0 THEN 'Low Stock'
                    ELSE 'Out of Stock'
                END as stockStatus
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            LEFT JOIN InventoryBalance ib ON p.productId = ib.productId
            GROUP BY p.productId, p.name, p.description, p.unitPrice, p.productImage, c.name, c.categoryId
            ORDER BY RAND()
            LIMIT 8
        """
        cursor.execute(query)
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
# ADVANCED QUERY 2: Get bestselling products (most ordered)
# Uses JOINs with OrderLine and aggregation
# ============================================
@customer_home_bp.route('/api/customer/home/bestsellers', methods=['GET'])
def get_bestsellers():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # ADVANCED: Complex JOIN with GROUP BY, ORDER BY on aggregated value
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                SUM(ol.quantity) as totalSold,
                COALESCE((SELECT SUM(ib.quantityOnHand) FROM InventoryBalance ib WHERE ib.productId = p.productId), 0) as totalStock
            FROM Product p
            JOIN OrderLine ol ON p.productId = ol.productId
            JOIN `Order` o ON ol.orderId = o.orderId
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE o.status != 'Cancelled'
            GROUP BY p.productId, p.name, p.description, p.unitPrice, p.productImage, c.name
            ORDER BY totalSold DESC
            LIMIT 8
        """
        cursor.execute(query)
        products = cursor.fetchall()
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            p['totalSold'] = int(p['totalSold']) if p['totalSold'] else 0
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 3: Get new arrivals (recently added products)
# Uses date comparison and JOINs
# ============================================
@customer_home_bp.route('/api/customer/home/new-arrivals', methods=['GET'])
def get_new_arrivals():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # ADVANCED: JOIN with subquery for stock calculation
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                c.categoryId,
                (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                 FROM InventoryBalance ib 
                 WHERE ib.productId = p.productId) as totalStock
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            ORDER BY p.productId DESC
            LIMIT 8
        """
        cursor.execute(query)
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
# ADVANCED QUERY 4: Get trending products (most ordered in last 7 days)
# Uses date filtering with aggregation
# ============================================
@customer_home_bp.route('/api/customer/home/trending', methods=['GET'])
def get_trending_products():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # ADVANCED: Complex date filtering with aggregation and multiple JOINs
        query = """
            SELECT 
                p.productId,
                p.name,
                p.description,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                SUM(ol.quantity) as recentSales,
                (SELECT COALESCE(SUM(ib.quantityOnHand), 0) 
                 FROM InventoryBalance ib 
                 WHERE ib.productId = p.productId) as totalStock
            FROM Product p
            JOIN OrderLine ol ON p.productId = ol.productId
            JOIN `Order` o ON ol.orderId = o.orderId
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE o.orderDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            AND o.status != 'Cancelled'
            GROUP BY p.productId, p.name, p.description, p.unitPrice, p.productImage, c.name
            ORDER BY recentSales DESC
            LIMIT 8
        """
        cursor.execute(query)
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
# NORMAL QUERY 2: Get products by category
# ============================================
@customer_home_bp.route('/api/customer/home/category/<int:category_id>', methods=['GET'])
def get_products_by_category(category_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT p.*, c.name as categoryName
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE p.categoryId = %s
            ORDER BY p.name ASC
        """
        cursor.execute(query, (category_id,))
        products = cursor.fetchall()
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 3: Get category details
# ============================================
@customer_home_bp.route('/api/customer/category/<int:category_id>', methods=['GET'])
def get_category_details(category_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Category WHERE categoryId = %s", (category_id,))
        category = cursor.fetchone()
        if category:
            return jsonify(category)
        return jsonify({'error': 'Category not found'}), 404
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 5: Get homepage statistics
# Uses multiple subqueries and aggregations
# ============================================
@customer_home_bp.route('/api/customer/home/stats', methods=['GET'])
def get_home_stats():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        stats = {}
        
        # Total products
        cursor.execute("SELECT COUNT(*) as val FROM Product")
        stats['totalProducts'] = cursor.fetchone()['val']
        
        # Total categories
        cursor.execute("SELECT COUNT(*) as val FROM Category")
        stats['totalCategories'] = cursor.fetchone()['val']
        
        # Products in stock (ADVANCED subquery)
        cursor.execute("""
            SELECT COUNT(DISTINCT p.productId) as val 
            FROM Product p
            WHERE EXISTS (
                SELECT 1 FROM InventoryBalance ib 
                WHERE ib.productId = p.productId AND ib.quantityOnHand > 0
            )
        """)
        stats['productsInStock'] = cursor.fetchone()['val']
        
        return jsonify(stats)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 4: Get random products for recommendations
# ============================================
@customer_home_bp.route('/api/customer/home/recommendations', methods=['GET'])
def get_recommendations():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT p.*, c.name as categoryName
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            ORDER BY RAND()
            LIMIT 4
        """
        cursor.execute(query)
        products = cursor.fetchall()
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 5: Get category with product count
# ============================================
@customer_home_bp.route('/api/customer/categories-with-count', methods=['GET'])
def get_categories_with_count():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT c.*, COUNT(p.productId) as productCount
            FROM Category c
            LEFT JOIN Product p ON c.categoryId = p.categoryId
            GROUP BY c.categoryId, c.name, c.description
            ORDER BY c.name ASC
        """
        cursor.execute(query)
        categories = cursor.fetchall()
        return jsonify(categories)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
