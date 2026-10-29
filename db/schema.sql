-- ============================================================================
-- Lexalys Labs Client Portal - database schema
-- Works on MySQL 8 (EC2 Ubuntu apt package, Amazon RDS) and MariaDB 10.6+.
--
-- Run it by hand:   mysql -u root -p lexalys_portal < db/schema.sql
-- Or let the app do it: it runs this file on every start. Every statement is
-- "IF NOT EXISTS", so running it twice changes nothing.
-- ============================================================================

-- Module 1: Accounts ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  company        VARCHAR(160) NULL,
  phone          VARCHAR(40)  NULL,
  password_hash  VARCHAR(100) NOT NULL,
  role           ENUM('client','admin') NOT NULL DEFAULT 'client',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Module 3: Service catalogue ------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(10)  NOT NULL,
  slug           VARCHAR(120) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  category       VARCHAR(60)  NOT NULL,
  summary        TEXT         NOT NULL,
  setup_price    INT UNSIGNED NOT NULL,
  monthly_price  INT UNSIGNED NULL,
  timeline_days  INT UNSIGNED NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_code (code),
  UNIQUE KEY uq_services_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Module 2: Leads / enquiries ------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind           ENUM('contact','audit','callback') NOT NULL DEFAULT 'contact',
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  company        VARCHAR(160) NULL,
  phone          VARCHAR(40)  NULL,
  service_id     INT UNSIGNED NULL,
  budget         VARCHAR(40)  NULL,
  message        TEXT         NOT NULL,
  status         ENUM('new','contacted','qualified','won','lost') NOT NULL DEFAULT 'new',
  admin_note     TEXT         NULL,
  user_id        INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_leads_status (status),
  KEY ix_leads_email (email),
  CONSTRAINT fk_leads_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Module 3: Orders and their status history ----------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no       VARCHAR(32)  NOT NULL,
  user_id        INT UNSIGNED NOT NULL,
  service_id     INT UNSIGNED NOT NULL,
  rush           ENUM('standard','faster25','faster40','fastest') NOT NULL DEFAULT 'standard',
  care_plan      TINYINT(1)   NOT NULL DEFAULT 0,
  setup_total    INT UNSIGNED NOT NULL,
  monthly_total  INT UNSIGNED NOT NULL DEFAULT 0,
  timeline_days  INT UNSIGNED NULL,
  notes          TEXT         NULL,
  status         ENUM('pending','approved','in_progress','delivered','cancelled') NOT NULL DEFAULT 'pending',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_no (order_no),
  KEY ix_orders_status (status),
  CONSTRAINT fk_orders_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_orders_service FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_events (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       INT UNSIGNED NOT NULL,
  status         VARCHAR(20)  NOT NULL,
  note           VARCHAR(500) NULL,
  actor_id       INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_events_order (order_id),
  CONSTRAINT fk_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_actor FOREIGN KEY (actor_id) REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Login sessions (so a restart or a second instance does not log everyone out)
CREATE TABLE IF NOT EXISTS sessions (
  sid            VARCHAR(128) NOT NULL,
  expires        INT UNSIGNED NOT NULL,
  data           MEDIUMTEXT   NOT NULL,
  PRIMARY KEY (sid),
  KEY ix_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
