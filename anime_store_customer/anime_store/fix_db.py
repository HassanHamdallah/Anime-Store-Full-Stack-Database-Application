from db_utils import get_db_connection
from mysql.connector import Error

def fix_database():
    print("Connecting to database...")
    conn = get_db_connection()
    if not conn:
        print("Failed to connect.")
        return

    try:
        cursor = conn.cursor()
        
        # 1. Update Suppliers Table Schema
        print("Ensuring Suppliers table has all fields...")
        try:
            cursor.execute("ALTER TABLE suppliers ADD COLUMN contact VARCHAR(100) AFTER email")
            print("Added 'contact' to suppliers")
        except: pass
        try:
            cursor.execute("ALTER TABLE suppliers ADD COLUMN phone VARCHAR(50) AFTER contact")
            print("Added 'phone' to suppliers")
        except: pass

        # 2. Update Products Table Schema
        print("Ensuring Products table has supplierId...")
        try:
            cursor.execute("ALTER TABLE products ADD COLUMN supplierId INT AFTER productId")
            print("Added 'supplierId' to products")
        except: pass

        # 3. Seed Warehouses
        print("Seeding Warehouses...")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        cursor.execute("TRUNCATE TABLE warehouses")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        
        warehouses = [
            ('Main Store', 'Downtown'),
            ('Warehouse A', 'Industrial Park'),
            ('Warehouse B', 'North Sector'),
            ('Warehouse C', 'West Sector')
        ]
        
        for name, loc in warehouses:
            cursor.execute("INSERT INTO warehouses (name, location, managerStaffId) VALUES (%s, %s, 1)", (name, loc))
            print(f"Inserted {name}")

        # 4. Clean Staff
        print("Cleaning Staff...")
        cursor.execute("DELETE FROM staff WHERE username != 'head_manager'")
        print(f"Deleted {cursor.rowcount} dummy staff members.")

        conn.commit()
        print("Database fix complete.")

    except Error as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    fix_database()
