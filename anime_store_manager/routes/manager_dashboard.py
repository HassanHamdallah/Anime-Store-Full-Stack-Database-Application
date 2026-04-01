from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error
from datetime import datetime, timedelta

manager_dashboard_bp = Blueprint('manager_dashboard', __name__)

def get_date_filter(period):
    """Returns SQL date condition based on period"""
    today = datetime.now()
    if period == 'today':
        return f"DATE(o.orderDate) = CURDATE()"
    elif period == 'week':
        return f"o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
    elif period == 'month':
        return f"o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
    elif period == 'year':
        return f"o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)"
    else:
        return "1=1"  # No filter

@manager_dashboard_bp.route('/api/manager/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    period = request.args.get('period', 'month')
    date_filter = get_date_filter(period)
    
    try:
        cursor = conn.cursor(dictionary=True)
        stats = {}
        
        # 1. Total Sales (Only Paid orders - filtered by period)
        cursor.execute(f"""
            SELECT COALESCE(SUM(ot.totalAmount), 0) as val 
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE p.status = 'Paid' AND {date_filter}
        """)
        stats['total_revenue'] = float(cursor.fetchone()['val'] or 0)
        
        # 2. Total Orders (filtered by period)
        cursor.execute(f"SELECT COUNT(*) as val FROM `Order` o WHERE {date_filter}")
        stats['total_orders'] = cursor.fetchone()['val']
        
        # 3. Inventory Value (not filtered by date - current snapshot)
        cursor.execute("""
            SELECT COALESCE(SUM(p.unitPrice * ib.quantityOnHand), 0) as val 
            FROM Product p 
            JOIN InventoryBalance ib ON p.productId = ib.productId
        """)
        stats['inventory_value'] = float(cursor.fetchone()['val'] or 0)
        
        # 4. Inventory Count
        cursor.execute("SELECT COALESCE(SUM(quantityOnHand), 0) as val FROM InventoryBalance")
        stats['inventory_count'] = int(cursor.fetchone()['val'] or 0)
        
        # 5. Active Customers
        cursor.execute("SELECT COUNT(*) as val FROM Customer")
        stats['active_customers'] = cursor.fetchone()['val']
        
        # 6. Pending Orders (Paid but not processed yet - filtered by period)
        cursor.execute(f"""
            SELECT COUNT(*) as val 
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            WHERE o.status = 'Paid' AND p.status = 'Paid' AND {date_filter}
        """)
        stats['pending_orders'] = cursor.fetchone()['val']

        return jsonify(stats)
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_dashboard_bp.route('/api/manager/dashboard/top-products', methods=['GET'])
def get_top_products():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    period = request.args.get('period', 'month')
    date_filter = get_date_filter(period)
        
    try:
        cursor = conn.cursor(dictionary=True)
        # Top 5 products by revenue (Only Paid orders, filtered by period)
        query = f"""
            SELECT 
                p.name,
                SUM(ol.quantity) as sales,
                SUM(ol.quantity * ol.unitPrice) as revenue,
                p.productImage as image
            FROM Product p
            JOIN OrderLine ol ON p.productId = ol.productId
            JOIN `Order` o ON ol.orderId = o.orderId
            JOIN Payment pm ON o.orderId = pm.orderId
            WHERE pm.status = 'Paid' AND {date_filter}
            GROUP BY p.productId, p.name, p.productImage
            ORDER BY revenue DESC
            LIMIT 5
        """
        cursor.execute(query)
        result = cursor.fetchall()
        for r in result:
            r['sales'] = int(r['sales'])
            r['revenue'] = float(r['revenue'])
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_dashboard_bp.route('/api/manager/dashboard/recent-orders', methods=['GET'])
def get_recent_orders():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    period = request.args.get('period', 'month')
    date_filter = get_date_filter(period)
    
    try:
        cursor = conn.cursor(dictionary=True)
        # Recent orders filtered by period
        query = f"""
            SELECT 
                o.orderId, 
                c.username as customer, 
                ot.totalAmount as amount, 
                o.status, 
                o.orderDate as date,
                p.method as paymentMethod,
                p.status as paymentStatus
            FROM `Order` o
            JOIN Customer c ON o.accountId = c.accountId
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            LEFT JOIN Payment p ON o.orderId = p.orderId
            WHERE {date_filter}
            ORDER BY o.orderDate DESC
            LIMIT 10
        """
        cursor.execute(query)
        orders = cursor.fetchall()
        for o in orders:
            o['amount'] = float(o['amount']) if o['amount'] else 0
            o['date'] = o['date'].strftime('%Y-%m-%d') if o['date'] else ''
        return jsonify(orders)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_dashboard_bp.route('/api/manager/dashboard/category-revenue', methods=['GET'])
def get_category_revenue():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    period = request.args.get('period', 'month')
    date_filter = get_date_filter(period)
    
    try:
        cursor = conn.cursor(dictionary=True)
        # Revenue per category filtered by period
        query = f"""
            SELECT c.name, COALESCE(SUM(ol.quantity * ol.unitPrice), 0) as amount
            FROM Category c
            LEFT JOIN Product p ON c.categoryId = p.categoryId
            LEFT JOIN OrderLine ol ON p.productId = ol.productId
            LEFT JOIN `Order` o ON ol.orderId = o.orderId
            LEFT JOIN Payment pm ON o.orderId = pm.orderId
            WHERE (pm.status = 'Paid' AND {date_filter}) OR pm.status IS NULL
            GROUP BY c.categoryId, c.name
            ORDER BY amount DESC
        """
        cursor.execute(query)
        result = cursor.fetchall()
        for r in result:
            r['amount'] = float(r['amount'])
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_dashboard_bp.route('/api/manager/dashboard/low-stock', methods=['GET'])
def get_low_stock():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Low stock items
        query = """
            SELECT p.name as product, ib.quantityOnHand as stock, w.name as warehouse
            FROM InventoryBalance ib
            JOIN Product p ON ib.productId = p.productId
            JOIN Warehouse w ON ib.warehouseId = w.warehouseId
            WHERE ib.quantityOnHand <= ib.reorderLevel
            LIMIT 5
        """
        cursor.execute(query)
        result = cursor.fetchall()
        return jsonify(result)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_dashboard_bp.route('/api/manager/notifications', methods=['GET'])
def get_notifications():
    # Normal: Mock Notifications
    return jsonify([
        {'id': 1, 'message': 'Low stock alert: Demon Slayer Figure', 'type': 'alert', 'time': '2 mins ago'},
        {'id': 2, 'message': 'New large order received: #ORD-2026-004', 'type': 'info', 'time': '1 hour ago'},
        {'id': 3, 'message': 'Monthly sales report ready', 'type': 'success', 'time': '5 hours ago'}
    ])

@manager_dashboard_bp.route('/api/manager/system-health', methods=['GET'])
def get_system_health():
    # Normal: Simple DB Ping
    conn = get_db_connection()
    try:
        if conn.is_connected():
            return jsonify({'status': 'operational', 'db_latency': '12ms'})
        return jsonify({'status': 'degraded'})
    except:
        return jsonify({'status': 'offline'})
    finally:
        if conn and conn.is_connected(): conn.close()

@manager_dashboard_bp.route('/api/manager/pending-approvals', methods=['GET'])
def get_pending_approvals():
    # Advanced: Count pending orders + pending new products (mock)
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT COUNT(*) as val FROM `Order` WHERE status = 'Pending'")
        pending_orders = cursor.fetchone()['val']
        return jsonify({'pending_orders': pending_orders, 'pending_reviews': 5})
    finally:
        if conn.is_connected(): cursor.close(); conn.close()
