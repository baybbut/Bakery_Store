import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { catalog } from "./catalog.js";
export function openDatabase(
  path = process.env.DATABASE_PATH || resolve("data/rookie.sqlite"),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT UNIQUE NOT NULL,address TEXT NOT NULL DEFAULT '',password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,data TEXT NOT NULL,stock INTEGER NOT NULL CHECK(stock>=0),active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS cart(user_id TEXT REFERENCES users(id),product_id INTEGER REFERENCES products(id),qty INTEGER NOT NULL CHECK(qty>0),PRIMARY KEY(user_id,product_id));
 CREATE TABLE IF NOT EXISTS favorites(user_id TEXT REFERENCES users(id),product_id INTEGER REFERENCES products(id),PRIMARY KEY(user_id,product_id));
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created TEXT NOT NULL,status TEXT NOT NULL,payment TEXT NOT NULL,payment_status TEXT NOT NULL,shipping TEXT NOT NULL,items TEXT NOT NULL,subtotal INTEGER NOT NULL,fee INTEGER NOT NULL,total INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY,order_id TEXT REFERENCES orders(id),status TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),product_id INTEGER REFERENCES products(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),content TEXT NOT NULL,created TEXT NOT NULL,reply TEXT,UNIQUE(user_id,product_id));
 CREATE TABLE IF NOT EXISTS payment_attempts(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),data TEXT NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(user_id,request_key));`);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO products(id,data,stock) VALUES(?,?,?)",
  );
  for (const { stock, ...p } of catalog)
    insert.run(p.id, JSON.stringify(p), stock);
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
