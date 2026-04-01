create database anime_store;
use anime_store ;
drop database anime_store;

CREATE USER 'mohammad'@'%' IDENTIFIED BY 'Mohammad@12345';
GRANT ALL PRIVILEGES ON anime_store.* TO 'mohammad'@'%';
FLUSH PRIVILEGES;

-- =========================
-- Inheritance (No Account table)
-- Customer + Staff include Account attributes
-- =========================

CREATE TABLE Customer (
  accountId               INT AUTO_INCREMENT,
  username                VARCHAR(50) NOT NULL,
  email                   VARCHAR(100) NOT NULL,
  password                VARCHAR(255) NOT NULL,
  createdAt               DATETIME,
  defaultShippingAddress  VARCHAR(255),
  phone                   VARCHAR(30),

  PRIMARY KEY (accountId)
);

CREATE TABLE Staff (
  accountId   INT AUTO_INCREMENT,
  username    VARCHAR(50) NOT NULL,
  email       VARCHAR(100) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  createdAt   DATETIME,
  managerId   INT,
  role        VARCHAR(50),
  salary      DECIMAL(10,2),

  PRIMARY KEY (accountId),
  FOREIGN KEY (managerId) REFERENCES Staff(accountId)
);

-- =========================
-- Warehouse 
-- =========================

CREATE TABLE Warehouse (
  warehouseId        INT AUTO_INCREMENT,
  managerStaffId     INT,
  name               VARCHAR(150),
  location           VARCHAR(150),

  PRIMARY KEY (warehouseId),
  FOREIGN KEY (managerStaffId) REFERENCES Staff(accountId)
);

-- =========================
-- Category + Product
-- =========================

CREATE TABLE Category (
  categoryId   INT AUTO_INCREMENT,
  name         VARCHAR(80),
  description  VARCHAR(255),

  PRIMARY KEY (categoryId)
);

CREATE TABLE Product (
  productId     INT AUTO_INCREMENT,
  categoryId    INT,
  name          VARCHAR(120),
  description   VARCHAR(255),
  unitPrice     DECIMAL(10,2),
  productImage  VARCHAR(255),

  PRIMARY KEY (productId),
  FOREIGN KEY (categoryId) REFERENCES Category(categoryId)
);

-- =========================
-- InventoryBalance + InventoryMovement
-- =========================

CREATE TABLE InventoryBalance (
  warehouseId     INT,
  productId       INT,
  quantityOnHand  INT,
  reorderLevel    INT,

  PRIMARY KEY (warehouseId, productId),
  FOREIGN KEY (warehouseId) REFERENCES Warehouse(warehouseId),
  FOREIGN KEY (productId) REFERENCES Product(productId)
);

CREATE TABLE InventoryMovement (
  movementId    INT AUTO_INCREMENT,
  warehouseId   INT,
  productId     INT,
  movementType  VARCHAR(30),
  qtyChange     INT,
  movementAt    DATETIME,

  PRIMARY KEY (movementId),
  FOREIGN KEY (warehouseId, productId)
    REFERENCES InventoryBalance(warehouseId, productId)
);

-- =========================
-- Orders + OrderLine (keep totalAmount + lineTotal as in your diagram)
-- =========================

CREATE TABLE `Order` (
  orderId           INT AUTO_INCREMENT,
  accountId         INT,
  staffId			INT,
  orderDate         DATETIME,
  status            VARCHAR(30),
  totalAmount       DECIMAL(10,2),
  shippingAddress   VARCHAR(255),

  PRIMARY KEY (orderId),
  FOREIGN KEY (accountId) REFERENCES Customer(accountId),
  FOREIGN KEY (staffId) REFERENCES Staff(accountId)
);

CREATE TABLE OrderLine (
  orderLineId  INT AUTO_INCREMENT,
  orderId      INT,
  productId    INT,
  quantity     INT,
  unitPrice    DECIMAL(10,2),

  PRIMARY KEY (orderLineId),
  FOREIGN KEY (orderId) REFERENCES `Order`(orderId),
  FOREIGN KEY (productId) REFERENCES Product(productId)
);

-- =========================
-- Ternary relationship: ShipsFrom (Order, Product, Warehouse)
-- Attributes: quantityAllocated, fulfilledAt
-- =========================

CREATE TABLE ShipsFrom (
  orderId           INT,
  productId         INT,
  warehouseId       INT,
  quantityAllocated INT,
  fulfilledAt       DATETIME,

  PRIMARY KEY (orderId, productId, warehouseId),
  FOREIGN KEY (orderId) REFERENCES `Order`(orderId),
  FOREIGN KEY (productId) REFERENCES Product(productId),
  FOREIGN KEY (warehouseId) REFERENCES Warehouse(warehouseId)
);

-- =========================
-- Supplier + PurchaseOrder + PurchaseOrderLine (keep totalCost + lineTotal)
-- =========================

CREATE TABLE Supplier (
  supplierId  INT AUTO_INCREMENT,
  name        VARCHAR(120),
  email       VARCHAR(100),
  address     VARCHAR(255),

  PRIMARY KEY (supplierId)
);

CREATE TABLE PurchaseOrder (
  poId            INT AUTO_INCREMENT,
  supplierId      INT,
  staffId		  INT,
  orderDate       DATE,
  expectedArrival DATE,
  status          VARCHAR(30),
  totalCost       DECIMAL(10,2),

  PRIMARY KEY (poId),
  FOREIGN KEY (supplierId) REFERENCES Supplier(supplierId),
  FOREIGN KEY (staffId) REFERENCES Staff(accountId)
);

CREATE TABLE PurchaseOrderLine (
  poLineId         INT AUTO_INCREMENT,
  poId             INT,
  productId        INT,
  quantityOrdered  INT,
  unitCost         DECIMAL(10,2),

  PRIMARY KEY (poLineId),
  FOREIGN KEY (poId) REFERENCES PurchaseOrder(poId),
  FOREIGN KEY (productId) REFERENCES Product(productId)
);

CREATE TABLE SupplierProduct (
  supplierId   INT,
  productId    INT,
  supplierSKU  VARCHAR(50),
  supplyPrice  DECIMAL(10,2),
  leadTimeDays INT,

  PRIMARY KEY (supplierId, productId),
  FOREIGN KEY (supplierId) REFERENCES Supplier(supplierId),
  FOREIGN KEY (productId) REFERENCES Product(productId)
);

CREATE TABLE Payment (
  paymentId    INT AUTO_INCREMENT,
  orderId      INT NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  method       VARCHAR(30) NOT NULL,
  status       VARCHAR(20) NOT NULL,
  paidAt       DATETIME,
  referenceNo  VARCHAR(80),

  PRIMARY KEY (paymentId),
  UNIQUE (orderId),
  FOREIGN KEY (orderId) REFERENCES `Order`(orderId)
);

CREATE TABLE Rating (
  accountId INT NOT NULL,
  productId INT NOT NULL,
  rating    TINYINT NOT NULL,

  PRIMARY KEY (accountId, productId),
  FOREIGN KEY (accountId) REFERENCES Customer(accountId),
  FOREIGN KEY (productId) REFERENCES Product(productId)
);
-- =========================
-- 3NF: remove derived/redundant attributes
-- =========================

ALTER TABLE `Order`
  DROP COLUMN totalAmount;

ALTER TABLE PurchaseOrder
  DROP COLUMN totalCost;

-- =========================
-- Views to compute totals (instead of storing)
-- =========================

CREATE VIEW OrderTotals AS
SELECT
  ol.orderId,
  SUM(ol.quantity * ol.unitPrice) AS totalAmount
FROM OrderLine ol
GROUP BY ol.orderId;

CREATE VIEW PurchaseOrderTotals AS
SELECT
  pol.poId,
  SUM(pol.quantityOrdered * pol.unitCost) AS totalCost
FROM PurchaseOrderLine pol
GROUP BY pol.poId;
-- ===================testing
SELECT * FROM Staff;
SELECT * FROM Customer;
SELECT * FROM Category;
SELECT * FROM Product;
SELECT * FROM Supplier;
SELECT * FROM SupplierProduct;
SELECT * FROM PurchaseOrder;
SELECT * FROM PurchaseOrderLine;
SELECT * FROM InventoryBalance;
SELECT * FROM InventoryMovement;
SELECT * FROM `Order`;
SELECT * FROM OrderLine;
SELECT * FROM ShipsFrom;
SELECT * FROM Payment;
select * from Warehouse;

Show tables;
-- Totals (Views)
SELECT * FROM OrderTotals;
SELECT * FROM PurchaseOrderTotals;
use anime_store;
show tables;
INSERT INTO Staff (username, email, password, createdAt, managerId, role, salary)
VALUES ('Hassan Khaled', 'headmanager@animestore.com', '1234', NOW(), NULL, 'Manager', 8000.00);


select w.name , w.location,count(*),sum(ib.quantityOnHand)
from Warehouse w , InventoryBalance ib , Product p
where w.warehouseId = ib.warehouseId and
	  ib.productId = p.productId
      group by w.warehouseId , w.name ;


select sum(ib.quantityOnHand * p.unitPrice )
from InventoryBalance ib , Product p
where p.productId = ib.productId ;

