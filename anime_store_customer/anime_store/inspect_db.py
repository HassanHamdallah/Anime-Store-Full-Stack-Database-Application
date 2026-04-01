from db_utils import get_db_connection

def inspect_foreign_keys():
    conn = get_db_connection()
    if not conn:
        print("Failed to connect")
        return

    cursor = conn.cursor(dictionary=True)
    
    # Query to find all tables that reference the 'products' table
    query = """
    SELECT 
        TABLE_NAME, 
        COLUMN_NAME, 
        CONSTRAINT_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
    FROM 
        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE 
        REFERENCED_TABLE_SCHEMA = 'anime_store' 
        AND REFERENCED_TABLE_NAME = 'products';
    """
    
    cursor.execute(query)
    results = cursor.fetchall()
    
    with open('schema_info.txt', 'w') as f:
        f.write("Tables with 'productId' column:\n")
        query_cols = """
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE COLUMN_NAME = 'productId' AND TABLE_SCHEMA = 'anime_store'
        """
        cursor.execute(query_cols)
        cols = cursor.fetchall()
        for row in cols:
            f.write(f"- {row['TABLE_NAME']}\n")
            
        f.write("\nAll Tables:\n")
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        for t in tables:
             f.write(f"- {list(t.values())[0]}\n")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    inspect_foreign_keys()
