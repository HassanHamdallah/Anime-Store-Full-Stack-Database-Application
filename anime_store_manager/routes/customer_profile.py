"""
Customer Profile Routes
Contains APIs for customer profile management, address, password, and statistics
"""
from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error
from datetime import datetime
import hashlib

customer_profile_bp = Blueprint('customer_profile', __name__)

# ============================================
# NORMAL QUERY 29: Get customer profile
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>', methods=['GET'])
def get_profile(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT 
                accountId,
                username,
                email,
                phone,
                defaultShippingAddress,
                createdAt
            FROM Customer
            WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()
        
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        if customer['createdAt']:
            customer['createdAt'] = customer['createdAt'].strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify(customer)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 30: Update customer profile
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>', methods=['PUT'])
def update_profile(account_id):
    data = request.get_json()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Build update query dynamically based on provided fields
        allowed_fields = ['username', 'phone', 'defaultShippingAddress']
        updates = []
        values = []
        
        for field in allowed_fields:
            if field in data:
                updates.append(f"{field} = %s")
                values.append(data[field])
        
        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        values.append(account_id)
        query = f"UPDATE Customer SET {', '.join(updates)} WHERE accountId = %s"
        cursor.execute(query, tuple(values))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Customer not found'}), 404
        
        return jsonify({'success': True, 'message': 'Profile updated successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 31: Update shipping address
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/address', methods=['PUT'])
def update_address(account_id):
    data = request.get_json()
    address = data.get('address')
    
    if not address:
        return jsonify({'error': 'Address is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE Customer 
            SET defaultShippingAddress = %s 
            WHERE accountId = %s
        """, (address, account_id))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Customer not found'}), 404
        
        return jsonify({'success': True, 'message': 'Address updated successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 32: Update phone number
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/phone', methods=['PUT'])
def update_phone(account_id):
    data = request.get_json()
    phone = data.get('phone')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE Customer 
            SET phone = %s 
            WHERE accountId = %s
        """, (phone, account_id))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Customer not found'}), 404
        
        return jsonify({'success': True, 'message': 'Phone updated successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 33: Change password
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/password', methods=['PUT'])
def change_password(account_id):
    data = request.get_json()
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')
    
    if not current_password or not new_password:
        return jsonify({'error': 'Current and new passwords are required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Verify current password
        cursor.execute("""
            SELECT passwordHash FROM Customer WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()
        
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        # Simple hash comparison (in production use bcrypt)
        current_hash = hashlib.sha256(current_password.encode()).hexdigest()
        if customer['passwordHash'] != current_hash:
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        # Update password
        new_hash = hashlib.sha256(new_password.encode()).hexdigest()
        cursor.execute("""
            UPDATE Customer SET passwordHash = %s WHERE accountId = %s
        """, (new_hash, account_id))
        conn.commit()
        
        return jsonify({'success': True, 'message': 'Password changed successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 16: Get customer order statistics
# Uses aggregation with OrderTotals view and date functions
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/stats', methods=['GET'])
def get_customer_stats(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get comprehensive stats using subqueries and aggregations
        cursor.execute("""
            SELECT 
                (SELECT COUNT(*) FROM `Order` WHERE accountId = %s) as totalOrders,
                (SELECT COUNT(*) FROM `Order` WHERE accountId = %s AND status = 'Pending') as pendingOrders,
                (SELECT COUNT(*) FROM `Order` WHERE accountId = %s AND status = 'Completed') as completedOrders,
                (SELECT COUNT(*) FROM `Order` WHERE accountId = %s AND status = 'Cancelled') as cancelledOrders,
                (SELECT COALESCE(SUM(ot.totalAmount), 0) 
                 FROM `Order` o 
                 JOIN OrderTotals ot ON o.orderId = ot.orderId 
                 WHERE o.accountId = %s AND o.status != 'Cancelled') as totalSpent,
                (SELECT COALESCE(AVG(ot.totalAmount), 0) 
                 FROM `Order` o 
                 JOIN OrderTotals ot ON o.orderId = ot.orderId 
                 WHERE o.accountId = %s AND o.status != 'Cancelled') as avgOrderValue,
                (SELECT COUNT(DISTINCT ol.productId) 
                 FROM `Order` o 
                 JOIN OrderLine ol ON o.orderId = ol.orderId 
                 WHERE o.accountId = %s) as uniqueProductsBought
        """, (account_id, account_id, account_id, account_id, account_id, account_id, account_id))
        stats = cursor.fetchone()
        
        # Convert decimal types to float
        stats['totalSpent'] = float(stats['totalSpent']) if stats['totalSpent'] else 0
        stats['avgOrderValue'] = float(stats['avgOrderValue']) if stats['avgOrderValue'] else 0
        
        return jsonify(stats)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 17: Get customer's favorite categories (most ordered from)
# Uses JOIN with aggregation and GROUP BY
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/favorite-categories', methods=['GET'])
def get_favorite_categories(account_id):
    limit = request.args.get('limit', 5, type=int)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT 
                c.categoryId,
                c.name as categoryName,
                COUNT(DISTINCT o.orderId) as orderCount,
                SUM(ol.quantity) as totalItemsBought,
                SUM(ol.quantity * ol.unitPrice) as totalSpentInCategory
            FROM `Order` o
            JOIN OrderLine ol ON o.orderId = ol.orderId
            JOIN Product p ON ol.productId = p.productId
            JOIN Category c ON p.categoryId = c.categoryId
            WHERE o.accountId = %s AND o.status != 'Cancelled'
            GROUP BY c.categoryId, c.name
            ORDER BY totalItemsBought DESC
            LIMIT %s
        """, (account_id, limit))
        categories = cursor.fetchall()
        
        for cat in categories:
            cat['totalSpentInCategory'] = float(cat['totalSpentInCategory']) if cat['totalSpentInCategory'] else 0
        
        return jsonify({'categories': categories})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 18: Get customer's frequently bought products
# Uses JOIN with aggregation and ranking
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/frequent-products', methods=['GET'])
def get_frequent_products(account_id):
    limit = request.args.get('limit', 10, type=int)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT 
                p.productId,
                p.name,
                p.unitPrice,
                p.productImage,
                c.name as categoryName,
                COUNT(DISTINCT o.orderId) as timesOrdered,
                SUM(ol.quantity) as totalQuantityBought,
                MAX(o.orderDate) as lastOrderDate
            FROM `Order` o
            JOIN OrderLine ol ON o.orderId = ol.orderId
            JOIN Product p ON ol.productId = p.productId
            LEFT JOIN Category c ON p.categoryId = c.categoryId
            WHERE o.accountId = %s AND o.status != 'Cancelled'
            GROUP BY p.productId, p.name, p.unitPrice, p.productImage, c.name
            ORDER BY timesOrdered DESC, totalQuantityBought DESC
            LIMIT %s
        """, (account_id, limit))
        products = cursor.fetchall()
        
        for p in products:
            p['unitPrice'] = float(p['unitPrice']) if p['unitPrice'] else 0
            if p['lastOrderDate']:
                p['lastOrderDate'] = p['lastOrderDate'].strftime('%Y-%m-%d')
        
        return jsonify({'products': products})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY 19: Get monthly spending trend
# Uses date aggregation for analytics
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/spending-trend', methods=['GET'])
def get_spending_trend(account_id):
    months = request.args.get('months', 6, type=int)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT 
                DATE_FORMAT(o.orderDate, '%%Y-%%m') as month,
                COUNT(o.orderId) as orderCount,
                COALESCE(SUM(ot.totalAmount), 0) as totalSpent
            FROM `Order` o
            LEFT JOIN OrderTotals ot ON o.orderId = ot.orderId
            WHERE o.accountId = %s 
                AND o.status != 'Cancelled'
                AND o.orderDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
            GROUP BY DATE_FORMAT(o.orderDate, '%%Y-%%m')
            ORDER BY month DESC
        """, (account_id, months))
        trends = cursor.fetchall()
        
        for t in trends:
            t['totalSpent'] = float(t['totalSpent']) if t['totalSpent'] else 0
        
        return jsonify({'trends': trends})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 34: Get customer member since date
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/member-since', methods=['GET'])
def get_member_since(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT createdAt FROM Customer WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()
        
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        member_since = customer['createdAt'].strftime('%Y-%m-%d') if customer['createdAt'] else None
        
        return jsonify({'memberSince': member_since})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 35: Check if email exists (for profile update)
# ============================================
@customer_profile_bp.route('/api/customer/check-email', methods=['POST'])
def check_email():
    data = request.get_json()
    email = data.get('email')
    exclude_account_id = data.get('excludeAccountId')
    
    if not email:
        return jsonify({'error': 'Email is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        query = "SELECT accountId FROM Customer WHERE email = %s"
        params = [email]
        
        if exclude_account_id:
            query += " AND accountId != %s"
            params.append(exclude_account_id)
        
        cursor.execute(query, tuple(params))
        exists = cursor.fetchone() is not None
        
        return jsonify({'exists': exists})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 36: Delete customer account (soft delete - anonymize data)
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/delete', methods=['DELETE'])
def delete_account(account_id):
    data = request.get_json()
    password = data.get('password')
    
    if not password:
        return jsonify({'error': 'Password confirmation required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Verify password
        cursor.execute("""
            SELECT passwordHash FROM Customer WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()
        
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        if customer['passwordHash'] != password_hash:
            return jsonify({'error': 'Invalid password'}), 401
        
        # Soft delete by anonymizing data
        cursor.execute("""
            UPDATE Customer 
            SET 
                firstName = 'Deleted',
                lastName = 'User',
                email = CONCAT('deleted_', %s, '@deleted.com'),
                phone = NULL,
                defaultShippingAddress = NULL,
                passwordHash = ''
            WHERE accountId = %s
        """, (account_id, account_id))
        conn.commit()
        
        return jsonify({'success': True, 'message': 'Account deleted successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY 37: Get all customer info for profile page
# ============================================
@customer_profile_bp.route('/api/customer/profile/<int:account_id>/full', methods=['GET'])
def get_full_profile(account_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get customer basic info
        cursor.execute("""
            SELECT 
                accountId, firstName, lastName, email, phone, 
                defaultShippingAddress, createdAt
            FROM Customer WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()
        
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        if customer['createdAt']:
            customer['createdAt'] = customer['createdAt'].strftime('%Y-%m-%d %H:%M:%S')
        
        # Get order count
        cursor.execute("""
            SELECT COUNT(*) as orderCount FROM `Order` WHERE accountId = %s
        """, (account_id,))
        order_count = cursor.fetchone()['orderCount']
        
        customer['orderCount'] = order_count
        
        return jsonify(customer)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
