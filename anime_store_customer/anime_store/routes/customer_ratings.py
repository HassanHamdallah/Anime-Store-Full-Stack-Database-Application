"""
Customer Ratings Routes
Contains APIs for product ratings management
"""
from flask import Blueprint, jsonify, request
from db_utils import get_db_connection
from mysql.connector import Error

customer_ratings_bp = Blueprint('customer_ratings', __name__)

# ============================================
# NORMAL QUERY: Get product rating summary
# ============================================
@customer_ratings_bp.route('/api/products/<int:product_id>/rating', methods=['GET'])
def get_product_rating(product_id):
    """Get average rating and rating count for a product"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT 
                COALESCE(AVG(rating), 0) as averageRating,
                COUNT(*) as totalRatings
            FROM Rating
            WHERE productId = %s
        """, (product_id,))
        result = cursor.fetchone()

        # Get rating distribution (how many 1-star, 2-star, etc.)
        cursor.execute("""
            SELECT rating, COUNT(*) as count
            FROM Rating
            WHERE productId = %s
            GROUP BY rating
            ORDER BY rating DESC
        """, (product_id,))
        distribution = cursor.fetchall()

        # Create distribution map
        dist_map = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        for d in distribution:
            dist_map[d['rating']] = d['count']

        return jsonify({
            'averageRating': round(float(result['averageRating']), 1),
            'totalRatings': result['totalRatings'],
            'distribution': dist_map
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY: Get user's rating for a product
# ============================================
@customer_ratings_bp.route('/api/products/<int:product_id>/rating/<int:account_id>', methods=['GET'])
def get_user_rating(product_id, account_id):
    """Get a specific user's rating for a product"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT rating
            FROM Rating
            WHERE productId = %s AND accountId = %s
        """, (product_id, account_id))
        result = cursor.fetchone()

        if result:
            return jsonify({'rating': result['rating'], 'hasRated': True})
        else:
            return jsonify({'rating': 0, 'hasRated': False})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY: Submit or update a rating
# ============================================
@customer_ratings_bp.route('/api/products/<int:product_id>/rating', methods=['POST'])
def submit_rating(product_id):
    """Submit or update a rating for a product"""
    data = request.get_json()
    account_id = data.get('accountId')
    rating = data.get('rating')

    if not account_id:
        return jsonify({'error': 'Account ID is required'}), 400

    if not rating or rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be between 1 and 5'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Check if user has already rated this product
        cursor.execute("""
            SELECT rating FROM Rating
            WHERE productId = %s AND accountId = %s
        """, (product_id, account_id))
        existing = cursor.fetchone()

        if existing:
            # Update existing rating
            cursor.execute("""
                UPDATE Rating SET rating = %s
                WHERE productId = %s AND accountId = %s
            """, (rating, product_id, account_id))
            message = 'Rating updated successfully'
        else:
            # Insert new rating
            cursor.execute("""
                INSERT INTO Rating (accountId, productId, rating)
                VALUES (%s, %s, %s)
            """, (account_id, product_id, rating))
            message = 'Rating submitted successfully'

        conn.commit()

        # Get updated average rating
        cursor.execute("""
            SELECT 
                COALESCE(AVG(rating), 0) as averageRating,
                COUNT(*) as totalRatings
            FROM Rating
            WHERE productId = %s
        """, (product_id,))
        updated = cursor.fetchone()

        return jsonify({
            'success': True,
            'message': message,
            'averageRating': round(float(updated['averageRating']), 1),
            'totalRatings': updated['totalRatings']
        })
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# NORMAL QUERY: Delete a rating
# ============================================
@customer_ratings_bp.route('/api/products/<int:product_id>/rating/<int:account_id>', methods=['DELETE'])
def delete_rating(product_id, account_id):
    """Delete a user's rating for a product"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM Rating
            WHERE productId = %s AND accountId = %s
        """, (product_id, account_id))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'error': 'Rating not found'}), 404

        return jsonify({'success': True, 'message': 'Rating deleted successfully'})
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY: Get all ratings for a product with user info
# ============================================
@customer_ratings_bp.route('/api/products/<int:product_id>/reviews', methods=['GET'])
def get_product_reviews(product_id):
    """Get all ratings/reviews for a product with user info"""
    limit = request.args.get('limit', 10, type=int)
    offset = request.args.get('offset', 0, type=int)

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT 
                r.accountId,
                r.rating,
                c.username
            FROM Rating r
            JOIN Customer c ON r.accountId = c.accountId
            WHERE r.productId = %s
            ORDER BY r.rating DESC
            LIMIT %s OFFSET %s
        """, (product_id, limit, offset))
        reviews = cursor.fetchall()

        # Get total count
        cursor.execute("""
            SELECT COUNT(*) as total
            FROM Rating
            WHERE productId = %s
        """, (product_id,))
        total = cursor.fetchone()['total']

        return jsonify({
            'reviews': reviews,
            'total': total,
            'hasMore': offset + limit < total
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY: Get customer's rated products
# ============================================
@customer_ratings_bp.route('/api/customer/<int:account_id>/ratings', methods=['GET'])
def get_customer_ratings(account_id):
    """Get all products rated by a customer"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT 
                r.productId,
                r.rating,
                p.name as productName,
                p.productImage,
                p.unitPrice
            FROM Rating r
            JOIN Product p ON r.productId = p.productId
            WHERE r.accountId = %s
            ORDER BY r.rating DESC
        """, (account_id,))
        ratings = cursor.fetchall()

        for r in ratings:
            r['unitPrice'] = float(r['unitPrice']) if r['unitPrice'] else 0

        return jsonify({'ratings': ratings})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================
# ADVANCED QUERY: Check if user can rate (any logged-in customer can rate)
# ============================================
@customer_ratings_bp.route('/api/products/<int:product_id>/can-rate/<int:account_id>', methods=['GET'])
def check_can_rate(product_id, account_id):
    """Check if a user can rate the product - any logged in customer can rate"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Check if user exists in Customer table
        cursor.execute("""
            SELECT accountId FROM Customer WHERE accountId = %s
        """, (account_id,))
        customer = cursor.fetchone()

        if not customer:
            return jsonify({
                'canRate': False,
                'message': 'Please login to rate this product'
            })

        # Any logged-in customer can rate
        # Optionally check if they purchased (for "Verified Purchase" badge)
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM `Order` o
            JOIN OrderLine ol ON o.orderId = ol.orderId
            WHERE o.accountId = %s 
                AND ol.productId = %s
                AND o.status IN ('Delivered', 'Shipped', 'Processing', 'Paid')
        """, (account_id, product_id))
        result = cursor.fetchone()

        has_purchased = result['count'] > 0

        return jsonify({
            'canRate': True,
            'hasPurchased': has_purchased,
            'message': 'Verified Purchase' if has_purchased else 'Rate this product'
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

