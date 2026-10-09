import { describe, expect, it } from 'vitest'
import { tokenize } from './parseSql.ts'
import { isServiceStatement } from './statementKinds.ts'

const service = (sql: string) => isServiceStatement(tokenize(sql))

describe('kinds of statements', () => {
  it('takes settings, transactions, rights, comments, sequences, schemas and data for statements that describe no table', () => {
    for (const sql of [
      'SET statement_timeout = 0',
      'SET @saved_cs_client = @@character_set_client',
      "SELECT pg_catalog.set_config('search_path', '', false)",
      "SELECT setval('users_id_seq', 2, true)",
      'RESET ALL',
      'USE `shop`',
      'BEGIN',
      'START TRANSACTION',
      'COMMIT',
      'LOCK TABLES `orders` WRITE',
      'UNLOCK TABLES',
      'ALTER TABLE public.users OWNER TO postgres',
      'ALTER VIEW public.active_orders OWNER TO postgres',
      'ALTER FUNCTION public.touch() OWNER TO "Admin"',
      'GRANT SELECT ON TABLE public.users TO reporting',
      'REVOKE ALL ON SCHEMA public FROM PUBLIC',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO reporting',
      "COMMENT ON COLUMN public.users.email IS 'Почта'",
      'CREATE SCHEMA app',
      'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public',
      'CREATE DATABASE shop',
      'CREATE SEQUENCE public.users_id_seq START WITH 1',
      'ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id',
      'CREATE ROLE reporting',
      'DROP PROCEDURE IF EXISTS `add_order`',
      'INSERT INTO users (id) VALUES (1)',
      'COPY public.users (id) FROM stdin',
      'UPDATE users SET name = NULL',
      'DELETE FROM users',
      'REPLACE INTO users VALUES (1)',
      'TRUNCATE users',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_stats',
    ]) {
      expect(service(sql), sql).toBe(true)
    }
  })

  it('leaves tables, indexes, views, objects that are not drawn and other queries to the import', () => {
    for (const sql of [
      'CREATE TABLE users (id int)',
      'ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)',
      "ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq'::regclass)",
      'DROP TABLE IF EXISTS users',
      'DROP INDEX users_email_idx',
      'CREATE INDEX users_email_idx ON users (email)',
      'CREATE OR REPLACE VIEW active AS SELECT 1',
      'CREATE MATERIALIZED VIEW stats AS SELECT 1',
      'ALTER VIEW active RENAME TO recent',
      'DROP VIEW IF EXISTS `paid_orders`',
      'DROP MATERIALIZED VIEW stats',
      'CREATE TYPE public.order_status AS ENUM (\'new\')',
      'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql',
      'CREATE TRIGGER t BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION f()',
      'SELECT 1',
      "SELECT pg_catalog.pg_sleep(1)",
    ]) {
      expect(service(sql), sql).toBe(false)
    }
  })
})
