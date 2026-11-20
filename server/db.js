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
 CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,description TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS products(${PRODUCT_COLUMNS});
 CREATE TABLE IF NOT EXISTS cart(user_id TEXT REFERENCES users(id),product_id INTEGER REFERENCES products(id),qty INTEGER NOT NULL CHECK(qty>0),PRIMARY KEY(user_id,product_id));
 CREATE TABLE IF NOT EXISTS favorites(user_id TEXT REFERENCES users(id),product_id INTEGER REFERENCES products(id),PRIMARY KEY(user_id,product_id));
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created TEXT NOT NULL,status TEXT NOT NULL,payment TEXT NOT NULL,payment_status TEXT NOT NULL,shipping TEXT NOT NULL,subtotal INTEGER NOT NULL,fee INTEGER NOT NULL,total INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS order_items(order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,line INTEGER NOT NULL,product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,name TEXT NOT NULL,type TEXT NOT NULL DEFAULT '',img TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),qty INTEGER NOT NULL CHECK(qty>0),PRIMARY KEY(order_id,line));
 CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY,order_id TEXT REFERENCES orders(id),status TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),product_id INTEGER REFERENCES products(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),content TEXT NOT NULL,created TEXT NOT NULL,reply TEXT,UNIQUE(user_id,product_id));
 CREATE TABLE IF NOT EXISTS payment_attempts(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),data TEXT NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS staff(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL DEFAULT '',role TEXT NOT NULL CHECK(role IN ('admin','staff')),perms TEXT NOT NULL DEFAULT '[]',password TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff_sessions(token TEXT PRIMARY KEY,staff_id TEXT REFERENCES staff(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY,created TEXT NOT NULL,staff TEXT NOT NULL,supplier TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',total INTEGER NOT NULL CHECK(total>=0));
 CREATE TABLE IF NOT EXISTS purchase_items(purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,line INTEGER NOT NULL,product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,name TEXT NOT NULL,qty INTEGER NOT NULL CHECK(qty>0),cost INTEGER NOT NULL CHECK(cost>=0),PRIMARY KEY(purchase_id,line));`);
  migrate(db);
  // Seed only an empty shop, so products/categories deleted by an admin stay deleted.
  if (!db.prepare("SELECT COUNT(*) n FROM products").get().n)
    transaction(db, () => {
      for (const { stock, type, ...p } of catalog)
        db.prepare(
          "INSERT INTO products(id,category_id,name,note,description,ingredients,allergens,storage,price,img,stock) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(p.id, categoryId(db, type), p.name, p.note, p.description, p.ingredients, p.allergens, p.storage, p.price, p.img, stock);
    });
  db.exec(`CREATE INDEX IF NOT EXISTS products_category ON products(category_id);
 CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id,created);
 CREATE INDEX IF NOT EXISTS orders_created ON orders(created);
 CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id);
 CREATE INDEX IF NOT EXISTS order_items_product ON order_items(product_id);
 CREATE INDEX IF NOT EXISTS reviews_product ON reviews(product_id);
 CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
 CREATE INDEX IF NOT EXISTS staff_sessions_staff ON staff_sessions(staff_id);`);
  return db;
}
const PRODUCT_COLUMNS =
  "id INTEGER PRIMARY KEY,category_id INTEGER NOT NULL REFERENCES categories(id),name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',ingredients TEXT NOT NULL DEFAULT '',allergens TEXT NOT NULL DEFAULT '',storage TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),img TEXT NOT NULL DEFAULT 'cake.jpg',stock INTEGER NOT NULL CHECK(stock>=0),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))";
// Products with their category name exposed as `type`, the field the API has always returned.
export const PRODUCTS = "SELECT p.*,c.name type FROM products p JOIN categories c ON c.id=p.category_id";
export const itemsOf = (db, orderId) =>
  db
    .prepare("SELECT product_id id,name,type,img,price,qty FROM order_items WHERE order_id=? ORDER BY line")
    .all(orderId);
export function categoryId(db, name) {
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(name || "Khác");
  return db.prepare("SELECT id FROM categories WHERE name=?").get(name || "Khác").id;
}
const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
// Upgrades databases (and the old shared seed) from earlier versions in place, keeping all data.
function migrate(db) {
  if (!hasColumn(db, "users", "locked")) db.exec("ALTER TABLE users ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  if (hasColumn(db, "products", "data")) {
    // Rebuild instead of ALTER so the new NOT NULL/CHECK/FOREIGN KEY rules apply (SQLite's documented procedure).
    db.exec("PRAGMA foreign_keys=OFF");
    try {
      transaction(db, () => {
        db.exec(`CREATE TABLE products_new(${PRODUCT_COLUMNS})`);
        const add = db.prepare(
          "INSERT INTO products_new(id,category_id,name,note,description,ingredients,allergens,storage,price,img,stock,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        );
        for (const r of db.prepare("SELECT * FROM products").all()) {
          const p = JSON.parse(r.data);
          add.run(r.id, categoryId(db, p.type), p.name, p.note || "", p.description || "", p.ingredients || "", p.allergens || "", p.storage || "", p.price, p.img || "cake.jpg", r.stock, r.active ? 1 : 0);
        }
        db.exec("DROP TABLE products; ALTER TABLE products_new RENAME TO products;");
        if (db.prepare("PRAGMA foreign_key_check(products)").all().length)
          throw Error("Dữ liệu sản phẩm cũ vi phạm khóa ngoại.");
      });
    } finally {
      db.exec("PRAGMA foreign_keys=ON");
    }
  }
  if (hasColumn(db, "orders", "items"))
    transaction(db, () => {
      const add = db.prepare(
        "INSERT INTO order_items(order_id,line,product_id,name,type,img,price,qty) VALUES(?,?,?,?,?,?,?,?)",
      );
      const exists = db.prepare("SELECT 1 FROM products WHERE id=?");
      for (const o of db.prepare("SELECT id,items FROM orders").all())
        JSON.parse(o.items).forEach((i, n) =>
          add.run(o.id, n + 1, exists.get(i.id) ? i.id : null, i.name, i.type || "", i.img || "", i.price, i.qty),
        );
      db.exec("ALTER TABLE orders DROP COLUMN items");
    });
  if (hasColumn(db, "purchases", "items"))
    transaction(db, () => {
      const add = db.prepare(
        "INSERT INTO purchase_items(purchase_id,line,product_id,name,qty,cost) VALUES(?,?,?,?,?,?)",
      );
      const exists = db.prepare("SELECT 1 FROM products WHERE id=?");
      for (const p of db.prepare("SELECT id,items FROM purchases").all())
        JSON.parse(p.items).forEach((i, n) => add.run(p.id, n + 1, exists.get(i.id) ? i.id : null, i.name, i.qty, i.cost));
      db.exec("ALTER TABLE purchases DROP COLUMN items");
    });
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
