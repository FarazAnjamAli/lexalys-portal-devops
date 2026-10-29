#!/bin/bash
# Runs once, the first time the MySQL container starts with an empty volume.
# Creates a read-only "grader" account so the evaluator can verify the data.
# The app's own user (lexalys_app) is created by the MYSQL_USER variable.
if [ -n "${GRADER_PASSWORD}" ]; then
  mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS 'grader'@'%' IDENTIFIED BY '${GRADER_PASSWORD}';
GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO 'grader'@'%';
FLUSH PRIVILEGES;
SQL
  echo "[init] read-only user 'grader' created"
else
  echo "[init] GRADER_PASSWORD not set, skipping grader user"
fi
