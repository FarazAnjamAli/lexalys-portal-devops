-- ============================================================================
-- Read-only account for the assignment's automated evaluation script.
-- It can SELECT from the portal database and nothing else: no INSERT,
-- UPDATE, DELETE, DROP, and no access to any other database.
--
-- 1. Replace CHANGE_ME_Grader123 with your own password.
-- 2. Run it as the MySQL admin:
--      EC2:  sudo mysql < db/readonly-user.sql
--      RDS:  mysql -h <rds-endpoint> -u admin -p < db/readonly-user.sql
-- 3. Put "grader" and that password in the Google Form.
-- ============================================================================
CREATE USER IF NOT EXISTS 'grader'@'%' IDENTIFIED BY 'CHANGE_ME_Grader123';
GRANT SELECT ON lexalys_portal.* TO 'grader'@'%';
FLUSH PRIVILEGES;

-- Check it worked: this should list only "GRANT USAGE" and "GRANT SELECT".
SHOW GRANTS FOR 'grader'@'%';
