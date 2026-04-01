# Anime Store — Full-Stack Database Application

A full-stack web application for an anime merchandise store, featuring a **MySQL relational database**, a **customer-facing storefront**, and a **manager dashboard**. The system handles everything from product browsing and checkout to inventory tracking, supplier management, and sales analytics.

---

## Database Schema (ERD)

![Anime Store ER Diagram](erd_diagram.png)

---

## Tables

| Table | Description |
|-------|-------------|
| `Customer` | Registered customers with login and shipping info |
| `Staff` | Store staff with self-referencing manager hierarchy |
| `Warehouse` | Storage locations managed by staff |
| `Category` | Product categories |
| `Product` | Products with price, image, and category |
| `InventoryBalance` | Stock levels per product per warehouse |
| `InventoryMovement` | Log of all stock changes (sales, restocks) |
| `Order` | Customer orders |
| `OrderLine` | Line items per order |
| `ShipsFrom` | Ternary table — which warehouse fulfills which product in which order |
| `Payment` | One payment per order (1:1) |
| `Rating` | Customer product ratings (M:N) |
| `Supplier` | Product suppliers |
| `PurchaseOrder` | Orders placed to suppliers |
| `PurchaseOrderLine` | Line items per purchase order |
| `SupplierProduct` | M:N catalog linking suppliers to products with SKU and lead time |

---

## Normalization

The schema is normalized to **3NF**:

- **1NF** — All attributes are atomic; no repeating groups (order items separated into `OrderLine`).
- **2NF** — No partial dependencies; composite keys like `InventoryBalance(warehouseId, productId)` have attributes depending on the full key.
- **3NF** — Derived totals (`totalAmount`, `totalCost`) are **removed** from `Order` and `PurchaseOrder` and replaced with computed views (`OrderTotals`, `PurchaseOrderTotals`).

---

## Project Structure

```
anime-store/
├── anime_store.sql          # Full database DDL + sample queries
├── anime_store_customer/    # Customer-facing web app
└── anime_store_manager/     # Manager dashboard web app
```

---

## Setup

### 1. Create the database

```sql
CREATE DATABASE anime_store;
USE anime_store;
```

Run `anime_store.sql` to create all tables and views.

### 2. Create the database user

```sql
CREATE USER 'mohammad'@'%' IDENTIFIED BY 'Mohammad@12345';
GRANT ALL PRIVILEGES ON anime_store.* TO 'mohammad'@'%';
FLUSH PRIVILEGES;
```

### 3. Run the apps

Set up each app (customer / manager) according to the instructions in their respective directories.

---

## Key SQL Queries

**Inventory status with reorder alerts:**
```sql
SELECT w.name, p.name, ib.quantityOnHand,
  CASE
    WHEN ib.quantityOnHand <= 0 THEN 'Out of Stock'
    WHEN ib.quantityOnHand <= ib.reorderLevel THEN 'Low Stock'
    ELSE 'In Stock'
  END AS status
FROM InventoryBalance ib
JOIN Product p ON ib.productId = p.productId
JOIN Warehouse w ON ib.warehouseId = w.warehouseId;
```

**Monthly sales trends (last 6 months):**
```sql
SELECT DATE_FORMAT(o.orderDate, '%b %Y') AS month,
       SUM(ol.quantity * ol.unitPrice) AS sales,
       COUNT(DISTINCT o.orderId) AS orders
FROM `Order` o
JOIN OrderLine ol ON o.orderId = ol.orderId
JOIN Payment p ON o.orderId = p.orderId
WHERE o.orderDate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
  AND p.status = 'Paid'
GROUP BY DATE_FORMAT(o.orderDate, '%Y-%m')
ORDER BY month ASC;
```

**Top 10 customers by revenue:**
```sql
SELECT c.username, COUNT(DISTINCT o.orderId) AS orders,
       SUM(ol.quantity * ol.unitPrice) AS revenue
FROM Customer c
JOIN `Order` o ON c.accountId = o.accountId
JOIN OrderLine ol ON o.orderId = ol.orderId
JOIN Payment p ON o.orderId = p.orderId
WHERE p.status = 'Paid'
GROUP BY c.accountId
ORDER BY revenue DESC LIMIT 10;
```

---

## Features

**Customer app:** product browsing, cart, checkout with warehouse allocation, payment, product ratings.

**Manager dashboard:** inventory overview, sales trends, top customers, supplier catalog, purchase order management, warehouse management.
