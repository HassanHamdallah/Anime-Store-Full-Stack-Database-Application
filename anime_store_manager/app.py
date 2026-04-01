from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from db_utils import get_db_connection


from routes.manager_dashboard import manager_dashboard_bp
from routes.manager_products import manager_products_bp
from routes.manager_inventory import manager_inventory_bp
from routes.manager_orders import manager_orders_bp
from routes.manager_staff import manager_staff_bp
from routes.manager_suppliers import manager_suppliers_bp
from routes.manager_analytics import manager_analytics_bp


from routes.customer_home import customer_home_bp
from routes.customer_products import customer_products_bp
from routes.customer_cart import customer_cart_bp
from routes.customer_orders import customer_orders_bp
from routes.customer_profile import customer_profile_bp

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

app.register_blueprint(manager_dashboard_bp)
app.register_blueprint(manager_products_bp)
app.register_blueprint(manager_inventory_bp)
app.register_blueprint(manager_orders_bp)
app.register_blueprint(manager_staff_bp)
app.register_blueprint(manager_suppliers_bp)
app.register_blueprint(manager_analytics_bp)

app.register_blueprint(customer_home_bp)
app.register_blueprint(customer_products_bp)
app.register_blueprint(customer_cart_bp)
app.register_blueprint(customer_orders_bp)
app.register_blueprint(customer_profile_bp)


@app.route('/')
def home():
    return send_from_directory('templates', 'login.html')

@app.route('/<path:filename>')
def serve_html(filename):
    if filename.endswith('.html'):
        return send_from_directory('templates', filename)
    return send_from_directory('static', filename)

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM Staff WHERE email = %s", (email,))
        staff = cursor.fetchone()

        if staff:
            password_match = False
            if staff['password'] == password: 
                password_match = True
            elif check_password_hash(staff['password'], password):
                password_match = True
            
            if password_match:
                return jsonify({
                    'message': 'Login successful',
                    'userType': 'STAFF',
                    'role': staff['role'],
                    'accountId': staff['accountId'],
                    'authToken': f"staff-{staff['accountId']}-token" 
                })


        cursor.execute("SELECT * FROM Customer WHERE email = %s", (email,))
        customer = cursor.fetchone()

        if customer:
            password_match = False
            if customer['password'] == password: 
                password_match = True
            elif check_password_hash(customer['password'], password):
                password_match = True
                
            if password_match:
                return jsonify({
                    'message': 'Login successful',
                    'userType': 'CUSTOMER',
                    'role': 'CUSTOMER',
                    'accountId': customer['accountId'],
                    'authToken': f"customer-{customer['accountId']}-token" 
                })

        return jsonify({'error': 'Invalid email or password'}), 401

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    name = data.get('name') 
    
    if not email or not password or not name:
        return jsonify({'error': 'All fields are required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
   
        cursor.execute("SELECT accountId FROM Customer WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'error': 'Email already registered'}), 400
            
        cursor.execute("SELECT accountId FROM Staff WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'error': 'Email already registered'}), 400
        
 
        hashed_password = generate_password_hash(password)
        
 
        query = """
        INSERT INTO Customer (username, email, password, defaultShippingAddress, phone, createdAt) 
        VALUES (%s, %s, %s, NULL, NULL, NOW())
        """
        
        cursor.execute(query, (name, email, hashed_password))
        conn.commit()
   
        new_account_id = cursor.lastrowid

        return jsonify({
            'message': 'Registration successful',
            'accountId': new_account_id
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


@app.route('/api/products', methods=['GET'])
def get_products():
    from db_utils import get_db_connection
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        query = "SELECT * FROM Product"
        
        category_id = request.args.get('categoryId')
        if category_id:
            query += f" WHERE categoryId = {int(category_id)}"
            
        cursor.execute(query)
        products = cursor.fetchall()
        return jsonify(products)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    print("Starting Flask Server...")
    app.run(debug=True, port=5000)
