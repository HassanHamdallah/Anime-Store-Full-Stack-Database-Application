from db_utils import get_db_connection

def describe_table(table_name):
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor(dictionary=True)
    cursor.execute(f"DESCRIBE {table_name}")
    print(f"Columns for {table_name}: ", [row['Field'] for row in cursor.fetchall()])
    cursor.close()
    conn.close()

if __name__ == "__main__":
    describe_table("inventory_movements")
    describe_table("inventory_balances")
    describe_table("order_lines")
    describe_table("purchase_order_lines")
