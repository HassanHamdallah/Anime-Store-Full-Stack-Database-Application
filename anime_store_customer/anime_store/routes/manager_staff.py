from flask import Blueprint, request, jsonify
from db_utils import get_db_connection
from mysql.connector import Error

manager_staff_bp = Blueprint('manager_staff', __name__)

@manager_staff_bp.route('/api/manager/staff', methods=['GET'])
def get_staff():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Simple: List all staff
        query = "SELECT * FROM Staff ORDER BY accountId DESC"
        cursor.execute(query)
        staff = cursor.fetchall()
        for s in staff:
            s['salary'] = float(s['salary']) if s['salary'] else 0
            s['createdAt'] = s['createdAt'].strftime('%Y-%m-%d') if s['createdAt'] else None
        return jsonify(staff)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_staff_bp.route('/api/manager/staff', methods=['POST'])
def create_staff():
    data = request.get_json()
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO Staff (username, email, password, role, salary, managerId, createdAt)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """
        role = data.get('role', 'Staff')
        # managerId is the logged-in manager who is adding this staff member
        manager_id = data.get('managerId')  # This should be the logged-in user's accountId
        
        cursor.execute(query, (
            data['username'], 
            data['email'], 
            data['password'], 
            role, 
            data['salary'],
            manager_id
        ))
        conn.commit()
        return jsonify({'message': 'Staff created'}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_staff_bp.route('/api/manager/staff/<int:id>', methods=['DELETE'])
def delete_staff(id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Staff WHERE accountId = %s", (id,))
        conn.commit()
        return jsonify({'message': 'Staff deleted'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_staff_bp.route('/api/manager/staff/<int:id>', methods=['GET'])
def get_staff_detail(id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Staff WHERE accountId = %s", (id,))
        return jsonify(cursor.fetchone() or {})
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_staff_bp.route('/api/manager/staff/<int:id>', methods=['PUT'])
def update_staff(id):
    data = request.get_json()
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        # Build update query dynamically based on provided fields
        updates = []
        values = []
        
        if 'username' in data:
            updates.append("username = %s")
            values.append(data['username'])
        if 'email' in data:
            updates.append("email = %s")
            values.append(data['email'])
        if 'password' in data and data['password']:  # Only update if password provided
            updates.append("password = %s")
            values.append(data['password'])
        if 'role' in data:
            updates.append("role = %s")
            values.append(data['role'])
        if 'salary' in data:
            updates.append("salary = %s")
            values.append(data['salary'])
        if 'managerId' in data:
            updates.append("managerId = %s")
            values.append(data['managerId'] if data['managerId'] else None)
        
        if not updates:
            return jsonify({'error': 'No fields to update'}), 400
        
        values.append(id)
        query = f"UPDATE Staff SET {', '.join(updates)} WHERE accountId = %s"
        cursor.execute(query, tuple(values))
        conn.commit()
        return jsonify({'message': 'Staff updated successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@manager_staff_bp.route('/api/manager/staff/<int:id>/password', methods=['PUT'])
def update_staff_password(id):
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Staff SET password = %s WHERE accountId = %s", (data['password'], id))
        conn.commit()
        return jsonify({'message': 'Password updated'})
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_staff_bp.route('/api/manager/staff/<int:id>/role', methods=['PUT'])
def update_staff_role(id):
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Staff SET role = %s WHERE accountId = %s", (data['role'], id))
        conn.commit()
        return jsonify({'message': 'Role updated'})
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_staff_bp.route('/api/manager/staff/roles', methods=['GET'])
def get_roles():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT DISTINCT role FROM Staff")
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()

@manager_staff_bp.route('/api/manager/staff/search', methods=['GET'])
def search_staff():
    q = request.args.get('q', '')
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Staff WHERE username LIKE %s OR email LIKE %s", (f"%{q}%", f"%{q}%"))
        return jsonify(cursor.fetchall())
    finally:
        if conn.is_connected(): cursor.close(); conn.close()
