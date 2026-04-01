from flask import Blueprint, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_analytics_bp = Blueprint('manager_analytics', __name__)

@manager_analytics_bp.route('/api/manager/analytics/overview', methods=['GET'])
def get_analytics_overview():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        stats = {}
        
        # 1. Total Revenue (only Paid orders)
        cursor.execute("""
            SELECT SUM(ot.totalAmount) as val 
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE p.status = 'Paid'
        """)
        stats['total_revenue'] = float(cursor.fetchone()['val'] or 0)
        
        # 2. Total Orders
        cursor.execute("SELECT COUNT(*) as val FROM `Order`")
        stats['total_orders'] = cursor.fetchone()['val']
        
        # 3. Avg Order Value (only Paid orders)
        cursor.execute("""
            SELECT AVG(ot.totalAmount) as val 
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE p.status = 'Paid'
        """)
        stats['avg_order_value'] = float(cursor.fetchone()['val'] or 0)
        
        # 4. Estimated Profit (Approx 30% margin for demo since we don't track cost price per item explicitly in schema)
        # OR: We could subtract a cost, but let's assume valid data not present.
        stats['total_profit'] = stats['total_revenue'] * 0.3
        
        return jsonify(stats)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_analytics_bp.route('/api/manager/analytics/sales-trends', methods=['GET'])
def get_sales_trends():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Advanced: Sales by month (Last 6 months) - Only Paid orders
        query = """
            SELECT 
                DATE_FORMAT(o.orderDate, '%Y-%m') as month_key,
                DATE_FORMAT(o.orderDate, '%b') as month_name,
                SUM(ot.totalAmount) as sales,
                COUNT(*) as orders
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE o.orderDate >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            AND p.status = 'Paid'
            GROUP BY month_key, month_name
            ORDER BY month_key ASC
        """
        cursor.execute(query)
        trends = cursor.fetchall()
        for t in trends:
            t['sales'] = float(t['sales'])
        return jsonify(trends)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_analytics_bp.route('/api/manager/analytics/top-customers', methods=['GET'])
def get_top_customers():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Advanced: Top customers by revenue - Only Paid orders
        query = """
            SELECT 
                c.username as name,
                COUNT(o.orderId) as orders,
                SUM(ot.totalAmount) as revenue
            FROM Customer c
            JOIN `Order` o ON c.accountId = o.accountId
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE p.status = 'Paid'
            GROUP BY c.accountId, c.username
            ORDER BY revenue DESC
            LIMIT 5
        """
        cursor.execute(query)
        result = cursor.fetchall()
        for r in result:
            r['revenue'] = float(r['revenue'])
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_analytics_bp.route('/api/manager/analytics/product-performance', methods=['GET'])
def get_product_performance():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Advanced: Product performance (Sold counts, Revenue) - Only Paid orders
        # Estimating profit as 30% of revenue for demo
        query = """
            SELECT 
                p.name as product,
                SUM(ol.quantity) as sold,
                SUM(ol.quantity * ol.unitPrice) as revenue
            FROM Product p
            JOIN OrderLine ol ON p.productId = ol.productId
            JOIN `Order` o ON ol.orderId = o.orderId
            JOIN Payment py ON o.orderId = py.orderId
            WHERE py.status = 'Paid'
            GROUP BY p.productId, p.name
            ORDER BY revenue DESC
            LIMIT 5
        """
        cursor.execute(query)
        result = cursor.fetchall()
        for r in result:
            r['sales'] = int(r['sold']) # mapping alias if needed
            r['sold'] = int(r['sold'])
            r['revenue'] = float(r['revenue'])
            r['profit'] = r['revenue'] * 0.30
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_analytics_bp.route('/api/manager/analytics/sales-comparison', methods=['GET'])
def get_sales_comparison():
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'DB Connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Advanced: Compare this month's revenue vs last month's - Only Paid orders
        query = """
            SELECT 
                (SELECT SUM(ot.totalAmount) FROM `Order` o
                 JOIN Payment p ON o.orderId = p.orderId
                 LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
                 WHERE p.status = 'Paid'
                 AND MONTH(o.orderDate) = MONTH(CURRENT_DATE()) 
                 AND YEAR(o.orderDate) = YEAR(CURRENT_DATE())) as current_month,
                (SELECT SUM(ot.totalAmount) FROM `Order` o
                 JOIN Payment p ON o.orderId = p.orderId
                 LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
                 WHERE p.status = 'Paid'
                 AND MONTH(o.orderDate) = MONTH(CURRENT_DATE() - INTERVAL 1 MONTH) 
                 AND YEAR(o.orderDate) = YEAR(CURRENT_DATE() - INTERVAL 1 MONTH)) as last_month
        """
        cursor.execute(query)
        result = cursor.fetchone()
        return jsonify(result or {'current_month': 0, 'last_month': 0})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_analytics_bp.route('/api/manager/analytics/category-performance', methods=['GET'])
def get_category_profit():
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'DB Connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Advanced: Profitability by Category (Assuming 30% margin) - Only Paid orders
        query = """
            SELECT 
                c.name as category,
                COUNT(ol.orderLineId) as units_sold,
                SUM(ol.quantity * ol.unitPrice) as revenue,
                SUM(ol.quantity * ol.unitPrice) * 0.3 as estimated_profit
            FROM Category c
            JOIN Product p ON c.categoryId = p.categoryId
            JOIN OrderLine ol ON p.productId = ol.productId
            JOIN `Order` o ON ol.orderId = o.orderId
            JOIN Payment py ON o.orderId = py.orderId
            WHERE py.status = 'Paid'
            GROUP BY c.categoryId, c.name
            ORDER BY estimated_profit DESC
        """
        cursor.execute(query)
        result = cursor.fetchall()
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_analytics_bp.route('/api/manager/analytics/customer-segments', methods=['GET'])
def get_customer_segments():
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'DB Connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Advanced: Segment customers by spend tier - Only Paid orders
        query = """
            SELECT 
                CASE 
                    WHEN SUM(ot.totalAmount) > 1000 THEN 'VIP'
                    WHEN SUM(ot.totalAmount) > 500 THEN 'Regular'
                    ELSE 'New/Low Spender'
                END as segment,
                COUNT(DISTINCT c.accountId) as count,
                SUM(ot.totalAmount) as total_value
            FROM Customer c
            JOIN `Order` o ON c.accountId = o.accountId
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE p.status = 'Paid'
            GROUP BY segment
        """
        cursor.execute(query)
        result = cursor.fetchall()
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected(): cursor.close(); conn.close()
