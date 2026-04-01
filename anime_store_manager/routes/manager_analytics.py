from flask import Blueprint, request, jsonify
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
        
        # 1. Total Revenue (exclude cancelled orders)
        cursor.execute("""
            SELECT SUM(ol.quantity * ol.unitPrice) as val 
            FROM `Order` o
            JOIN Payment p ON o.orderId = p.orderId
            JOIN OrderLine ol ON o.orderId = ol.orderId
            WHERE p.status = 'Paid' AND o.status != 'Cancelled'
        """)
        stats['total_revenue'] = float(cursor.fetchone()['val'] or 0)
        
        # 2. Total Orders
        cursor.execute("SELECT COUNT(*) as val FROM `Order`")
        stats['total_orders'] = cursor.fetchone()['val']
        
        # 3. Total Profit = Revenue - Cost
        # Cost is calculated from SupplierProduct.supplyPrice for sold items
        cursor.execute("""
            SELECT COALESCE(SUM(ol.quantity * sp.supplyPrice), 0) as total_cost
            FROM `Order` o
            JOIN Payment pay ON o.orderId = pay.orderId
            JOIN OrderLine ol ON o.orderId = ol.orderId
            JOIN SupplierProduct sp ON ol.productId = sp.productId
            WHERE pay.status = 'Paid' AND o.status != 'Cancelled'
        """)
        total_cost = float(cursor.fetchone()['total_cost'] or 0)
        stats['total_profit'] = stats['total_revenue'] - total_cost
        
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
        
        # Get sales by month for the last 12
        cursor.execute("""
            SELECT 
                DATE_FORMAT(o.orderDate, '%Y-%m') as month,
                DATE_FORMAT(o.orderDate, '%b %Y') as month_name,
                COALESCE(SUM(ol.quantity * ol.unitPrice), 0) as sales,
                COUNT(DISTINCT o.orderId) as orders
            FROM `Order` o
            JOIN OrderLine ol ON o.orderId = ol.orderId
            JOIN Payment p ON o.orderId = p.orderId
            WHERE o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
              AND p.status = 'Paid'
              AND o.status != 'Cancelled'
            GROUP BY DATE_FORMAT(o.orderDate, '%Y-%m'), DATE_FORMAT(o.orderDate, '%b %Y')
            ORDER BY month ASC
        """)
        trends = cursor.fetchall()
        
        # Convert Decimal to float for JSON serialization
        for t in trends:
            t['sales'] = float(t['sales'])
        
        return jsonify(trends)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_analytics_bp.route('/api/manager/analytics/order-status', methods=['GET'])
def get_order_status_distribution():
    """Get order status distribution for pie chart based on time range"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        range_param = request.args.get('range', 'last30')
        
        # Determine the date filter based on range
        if range_param == 'today':
            date_filter = "DATE(o.orderDate) = CURDATE()"
        elif range_param == 'last7':
            date_filter = "o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
        elif range_param == 'last365':
            date_filter = "o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)"
        else:  # last30 default
            date_filter = "o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
        
        # Query order status distribution
        cursor.execute(f"""
            SELECT 
                o.status AS label,
                COUNT(*) AS value
            FROM `Order` o
            WHERE {date_filter}
            GROUP BY o.status
            ORDER BY value DESC
        """)
        results = cursor.fetchall()
        
        # Normalize status labels for consistency
        status_data = []
        for r in results:
            label = r['label']
            # Normalize labels to match UI
            if label.lower() in ['paid', 'new order (paid)']:
                label = 'New Order (Paid)'
            elif label.lower() == 'delivered':
                label = 'Delivered'
            elif label.lower() == 'shipped':
                label = 'Shipped'
            elif label.lower() == 'processing':
                label = 'Processing'
            elif label.lower() == 'cancelled':
                label = 'Cancelled'
            
            status_data.append({
                'label': label,
                'value': int(r['value'])
            })
        
        return jsonify(status_data)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_analytics_bp.route('/api/manager/analytics/yearly-sales', methods=['GET'])
def get_yearly_sales():
    """Get last 12 months sales data for bar chart - includes all months even with 0 sales"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get sales by month for the last 12 months
        cursor.execute("""
            SELECT 
                DATE_FORMAT(o.orderDate, '%Y-%m') as month,
                COALESCE(SUM(ol.quantity * ol.unitPrice), 0) as sales
            FROM `Order` o
            JOIN OrderLine ol ON o.orderId = ol.orderId
            JOIN Payment p ON o.orderId = p.orderId
            WHERE o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
              AND p.status = 'Paid'
              AND o.status != 'Cancelled'
            GROUP BY DATE_FORMAT(o.orderDate, '%Y-%m')
            ORDER BY month ASC
        """)
        trends = cursor.fetchall()
        
        # Create a dict of existing data
        sales_by_month = {}
        for t in trends:
            sales_by_month[t['month']] = float(t['sales'])
        
        # Generate all 12 months (including months with no data as 0)
        from datetime import datetime
        
        labels = []
        values = []
        current_date = datetime.now()
        
        for i in range(11, -1, -1):
            year = current_date.year
            month = current_date.month - i
            while month <= 0:
                month += 12
                year -= 1
            
            month_key = f"{year}-{month:02d}"
            month_date = datetime(year, month, 1)
            month_label = month_date.strftime('%b %Y')
            
            labels.append(month_label)
            values.append(sales_by_month.get(month_key, 0))
        
        return jsonify({
            'labels': labels,
            'values': values
        })
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
        
        cursor.execute("""
            SELECT 
                c.username as name,
                COUNT(DISTINCT o.orderId) as orders,
                COALESCE(SUM(ol.quantity * ol.unitPrice), 0) as revenue
            FROM Customer c
            JOIN `Order` o ON c.accountId = o.accountId
            JOIN OrderLine ol ON o.orderId = ol.orderId
            JOIN Payment p ON o.orderId = p.orderId
            WHERE p.status = 'Paid' AND o.status != 'Cancelled'
            GROUP BY c.accountId, c.username
            ORDER BY revenue DESC
            LIMIT 10
        """)
        customers = cursor.fetchall()
        
        for c in customers:
            c['revenue'] = float(c['revenue'])
        
        return jsonify(customers)
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
        
        cursor.execute("""
            SELECT 
                p.name as product,
                SUM(ol.quantity) as sold,
                SUM(ol.quantity * ol.unitPrice) as revenue,
                SUM(ol.quantity * COALESCE(sp.supplyPrice, 0)) as cost
            FROM Product p
            JOIN OrderLine ol ON p.productId = ol.productId
            JOIN `Order` o ON ol.orderId = o.orderId
            JOIN Payment pay ON o.orderId = pay.orderId
            LEFT JOIN SupplierProduct sp ON p.productId = sp.productId
            WHERE pay.status = 'Paid' AND o.status != 'Cancelled'
            GROUP BY p.productId, p.name
            ORDER BY revenue DESC
            LIMIT 10
        """)
        products = cursor.fetchall()
        
        for p in products:
            p['sold'] = int(p['sold'])
            p['revenue'] = float(p['revenue'])
            p['cost'] = float(p['cost'] or 0)
            p['profit'] = p['revenue'] - p['cost']
        
        return jsonify(products)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
