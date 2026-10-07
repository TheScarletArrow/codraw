-- The schema of the MySQL and MariaDB dumps next to this file, made in mysql:8.4 and mariadb:11 (database `shop`):
--   mysql --default-character-set=utf8mb4 -uroot -p shop < shop.mysql.sql
--   mysqldump -uroot -p --no-data --routines --triggers shop > mysqldump-8.4-no-data.sql
--   mariadb-dump -uroot -p --no-data --routines --triggers shop > mariadb-dump-11.8-no-data.sql
-- The dumps are the output of the tools as it is.

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL COMMENT 'Адрес почты',
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_key (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Пользователи магазина';

CREATE TABLE products (
  id BIGINT NOT NULL AUTO_INCREMENT,
  sku VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  price DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT '0.00',
  description TEXT,
  PRIMARY KEY (id),
  UNIQUE KEY products_sku_key (sku),
  KEY products_title_idx (title(50)),
  FULLTEXT KEY products_description_ft (description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  status ENUM('new','paid','shipped','cancelled') NOT NULL DEFAULT 'new',
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY orders_user_status_idx (user_id, status),
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT orders_total_check CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_items (
  order_id INT UNSIGNED NOT NULL,
  product_id BIGINT NOT NULL,
  quantity SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_id),
  KEY order_items_product_idx (product_id),
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE VIEW paid_orders AS SELECT id, user_id, total FROM orders WHERE status = 'paid';

DELIMITER ;;
CREATE TRIGGER orders_before_insert BEFORE INSERT ON orders FOR EACH ROW
BEGIN
  IF NEW.total < 0 THEN
    SET NEW.total = 0;
  END IF;
END;;

CREATE PROCEDURE add_order(IN p_user INT UNSIGNED)
BEGIN
  INSERT INTO orders (user_id) VALUES (p_user);
  SELECT LAST_INSERT_ID();
END;;
DELIMITER ;
