-- Runs once, when the Postgres data volume is first initialised.
-- `bossbyte` (from POSTGRES_DB) is the development database; this adds the
-- separate database the integration tests migrate and truncate freely.
CREATE DATABASE bossbyte_test OWNER bossbyte;
