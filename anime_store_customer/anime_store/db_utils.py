import mysql.connector
from mysql.connector import Error

db_config = {
    'host': 'database-1.cv8saqisa1rm.eu-north-1.rds.amazonaws.com',
    'database': 'anime_store',
    'user': 'mohammad',
    'password': 'Mohammad@12345',
    'port': 3306
}

def get_db_connection():
    """Establishes a connection to the database."""
    try:
        connection = mysql.connector.connect(**db_config)
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

def execute_query(query, params=None, fetch_one=False):
    """Executes a SELECT query and returns results."""
    connection = get_db_connection()
    if not connection:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, params or ())
        if fetch_one:
            result = cursor.fetchone()
        else:
            result = cursor.fetchall()
        return result
    except Error as e:
        print(f"Database Query Error: {e}")
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def execute_insert(query, params=None):
    """Executes an INSERT query and returns the last row ID."""
    connection = get_db_connection()
    if not connection:
        return None
    try:
        cursor = connection.cursor()
        cursor.execute(query, params or ())
        connection.commit()
        return cursor.lastrowid
    except Error as e:
        print(f"Database Insert Error: {e}")
        connection.rollback()
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def execute_update(query, params=None):
    """Executes an UPDATE query and returns the number of affected rows."""
    connection = get_db_connection()
    if not connection:
        return None
    try:
        cursor = connection.cursor()
        cursor.execute(query, params or ())
        connection.commit()
        return cursor.rowcount
    except Error as e:
        print(f"Database Update Error: {e}")
        connection.rollback()
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def execute_delete(query, params=None):
    """Executes a DELETE query and returns the number of affected rows."""
    connection = get_db_connection()
    if not connection:
        return None
    try:
        cursor = connection.cursor()
        cursor.execute(query, params or ())
        connection.commit()
        return cursor.rowcount
    except Error as e:
        print(f"Database Delete Error: {e}")
        connection.rollback()
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
