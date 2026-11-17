import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { catalog } from "./catalog.js";
export const seedPath = resolve("database/rookie.sql");
// Plain-SQL copy of the shop data. Login sessions and reset tokens are short-lived secrets, not shop data.
export function dumpSql(db) {
  const q = (v) =>
    v === null
      ? "NULL"
      : typeof v === "number" || typeof v === "bigint"
        ? String(v)
        : "'" + String(v).replace(/'/g, "''") + "'";
  let out = `-- Rookie Bakery data ${new Date().toISOString()}\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n`;
  const tables = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','staff_sessions','resets') ORDER BY rowid",
    )
    .all();
  for (const t of tables) {
    out += `DROP TABLE IF EXISTS "${t.name}";\n${t.sql};\n`;
    for (const row of db.prepare(`SELECT * FROM "${t.name}"`).all())
      out += `INSERT INTO "${t.name}"(${Object.keys(row).join(",")}) VALUES(${Object.values(row).map(q).join(",")});\n`;
  }
  return out + "COMMIT;\n";
}
export const defaultSettings = {
  storeName: "Rookie Bakery",
  storeAddress: "",
  storePhone: "",
  storeEmail: "",
  storeHours: "",
  banner: "",
  cod: true,
  vnpay: true,
  shippingFee: 25000,
  freeShippingFrom: 300000,
  open: true,
  closedMessage: "Tiệm đang tạm nghỉ, bạn quay lại sau nhé.",
};
export function openDatabase(
  path = process.env.DATABASE_PATH || resolve("data/rookie.sqlite"),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // A brand-new database file starts from the team's shared SQL seed, when there is one.
  if (
    path !== ":memory:" &&
    existsSync(seedPath) &&
    !db.prepare("SELECT COUNT(*) n FROM sqlite_master").get().n
  )
    db.exec(readFileSync(seedPath, "utf8"));
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
 CREATE TABLE IF NOT EXISTS payment_attempts(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),data TEXT NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS staff(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL DEFAULT '',role TEXT NOT NULL CHECK(role IN ('admin','staff')),perms TEXT NOT NULL DEFAULT '[]',password TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff_sessions(token TEXT PRIMARY KEY,staff_id TEXT REFERENCES staff(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,description TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY,created TEXT NOT NULL,staff TEXT NOT NULL,supplier TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',items TEXT NOT NULL,total INTEGER NOT NULL);`);
  // Migration for databases created before customer locking existed.
  if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "locked"))
    db.exec("ALTER TABLE users ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  // Seed only an empty shop, so products/categories deleted by an admin stay deleted.
  if (!db.prepare("SELECT COUNT(*) n FROM products").get().n) {
    const insert = db.prepare("INSERT INTO products(id,data,stock) VALUES(?,?,?)");
    for (const { stock, ...p } of catalog) insert.run(p.id, JSON.stringify(p), stock);
  }
  if (!db.prepare("SELECT COUNT(*) n FROM categories").get().n) {
    const types = db.prepare("SELECT DISTINCT json_extract(data,'$.type') t FROM products").all();
    for (const { t } of types) db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(t);
  }
  return db;
}
export function readSettings(db) {
  const s = { ...defaultSettings };
  for (const r of db.prepare("SELECT key,value FROM settings").all())
    if (r.key in s) s[r.key] = JSON.parse(r.value);
  return s;
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
