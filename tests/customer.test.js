import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApp, encode } from "../server/app.js";
import { createStaff } from "../server/admin.js";
import { openDatabase, dumpSql } from "../server/db.js";
import { DatabaseSync } from "node:sqlite";
async function fixture(t) {
  const db = openDatabase(":memory:"),
    mail = [];
  const server = createApp({ db, mailSink: (m) => mail.push(m) }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((r) => server.once("listening", r));
  t.after(
    () =>
      new Promise((r) =>
        server.close(() => {
          db.close();
          r();
        }),
      ),
  );
  const base = "http://127.0.0.1:" + server.address().port;
  function client() {
    let cookie = "";
    return Object.assign(async (path, method = "GET", body) => {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      const data = await res
        .json()
        .catch(() => ({ location: res.headers.get("location") }));
      return { status: res.status, ...data };
    }, { base, cookie: () => cookie });
  }
  return { db, mail, client };
}
const account = {
  name: "Khách Rookie",
  email: "hello@example.com",
  phone: "0901234567",
  password: "Rookie123!",
  confirm: "Rookie123!",
};
const shipping = {
  name: "Khách Rookie",
  phone: "0901234567",
  address: "123 Nguyễn Trãi, phường Bến Thành, TP Hồ Chí Minh",
  note: "Viết lời chúc sinh nhật",
};
test("customer lifecycle: accounts, server cart, checkout, ownership, cancellation, reviews and password security", async (t) => {
  const { db, client } = await fixture(t),
    a = client(),
    b = client();
  assert.equal((await a("/cart")).status, 401);
  assert.equal(
    (await a("/auth/register", "POST", { ...account, confirm: "different" }))
      .status,
    400,
  );
  assert.equal((await a("/auth/register", "POST", account)).status, 201);
  assert.equal((await b("/auth/register", "POST", account)).status, 409);
  assert.equal(
    (
      await b("/auth/register", "POST", {
        ...account,
        email: "other@example.com",
        phone: "0912345678",
      })
    ).status,
    201,
  );
  assert.equal((await a("/auth/me")).user.email, account.email);
  assert.equal((await a("/products?q=dau")).products.length, 1);
  assert.equal(
    (await a("/products?max=100000&sort=price-asc")).products[0].price,
    65000,
  );
  assert.equal((await a("/cart/1", "PUT", { qty: 1.2 })).status, 400);
  assert.equal((await a("/cart/1", "PUT", { qty: 21 })).status, 409);
  assert.equal((await a("/cart/1", "PUT", { qty: 2 })).items[0].qty, 2);
  assert.equal((await b("/cart")).items.length, 0);
  assert.equal((await a("/favorites/1", "PUT", { saved: true })).status, 200);
  assert.deepEqual((await a("/favorites")).ids, [1]);
  assert.equal((await a("/favorites/1", "PUT", { saved: false })).status, 200);
  const before = (await a("/products/1")).product.stock;
  const bad = await a("/checkout", "POST", {
    key: "bad-checkout",
    payment: "cod",
    shipping: {},
  });
  assert.equal(bad.status, 400);
  assert.equal((await a("/products/1")).product.stock, before);
  const c = await a("/checkout", "POST", {
    key: "checkout-one",
    payment: "cod",
    shipping,
    total: 1,
  });
  assert.equal(c.status, 201);
  assert.equal(c.order.total, 370000);
  assert.equal(c.order.fee, 0);
  assert.equal(c.order.items.length, 1);
  assert.equal((await a("/cart")).items.length, 0);
  assert.equal((await a("/products/1")).product.stock, before - 2);
  assert.equal(
    (
      await a("/checkout", "POST", {
        key: "checkout-one",
        payment: "cod",
        shipping,
      })
    ).order.id,
    c.order.id,
  );
  assert.equal((await b("/orders/" + c.order.id)).status, 404);
  assert.equal(
    (await b("/orders/" + c.order.id + "/cancel", "POST")).status,
    404,
  );
  assert.equal(
    (
      await a("/products/1/reviews", "POST", {
        rating: 5,
        content: "Bánh rất ngon!",
      })
    ).status,
    403,
  );
  assert.equal(
    (await a("/orders/" + c.order.id + "/cancel", "POST")).order.status,
    "cancelled",
  );
  assert.equal((await a("/products/1")).product.stock, before);
  assert.equal(
    (await a("/orders/" + c.order.id + "/cancel", "POST")).status,
    409,
  );
  await a("/cart/1", "PUT", { qty: 1 });
  const delivered = (
    await a("/checkout", "POST", {
      key: "checkout-two",
      payment: "cod",
      shipping,
    })
  ).order;
  // Staff delivery is an external prerequisite; fixture represents an actually delivered order.
  db.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(
    delivered.id,
  );
  assert.equal((await a("/products/1/reviews")).canReview, true);
  assert.equal(
    (
      await a("/products/1/reviews", "POST", {
        rating: 6,
        content: "Bánh rất ngon!",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a("/products/1/reviews", "POST", {
        rating: 5,
        content: "Bánh mềm, rất thơm ngon!",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await a("/products/1/reviews", "POST", {
        rating: 4,
        content: "Thêm đánh giá",
      })
    ).status,
    409,
  );
  const review = await b("/products/1/reviews");
  assert.equal(review.average, 5);
  assert.equal(review.reviews.length, 1);
  assert.equal(
    (
      await a("/profile", "PATCH", {
        ...account,
        email: "other@example.com",
        address: shipping.address,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await a("/profile", "PATCH", {
        ...account,
        name: "Tên mới",
        address: shipping.address,
      })
    ).user.name,
    "Tên mới",
  );
  assert.equal(
    (
      await a("/profile/password", "POST", {
        current: "bad",
        password: "Newpassword123",
        confirm: "Newpassword123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a("/profile/password", "POST", {
        current: account.password,
        password: "Newpassword123",
        confirm: "Newpassword123",
      })
    ).status,
    200,
  );
  assert.equal((await a("/auth/me")).user, null);
  assert.equal(
    (
      await a("/auth/login", "POST", {
        email: account.email,
        password: account.password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await a("/auth/login", "POST", {
        email: account.email,
        password: "Newpassword123",
      })
    ).status,
    200,
  );
  await a("/auth/logout", "POST");
  assert.equal((await a("/orders")).status, 401);
  assert.ok(
    !JSON.stringify(db.prepare("SELECT password FROM users").all()).includes(
      account.password,
    ),
  );
});
test("password recovery tokens are private, expire, are single-use and revoke sessions", async (t) => {
  const { client, mail, db } = await fixture(t),
    a = client();
  await a("/auth/register", "POST", account);
  const forgot = await a("/auth/forgot", "POST", { email: account.email }),
    unknown = await a("/auth/forgot", "POST", { email: "missing@example.com" });
  assert.deepEqual(forgot, unknown);
  assert.equal(mail.length, 1);
  assert.ok(!JSON.stringify(forgot).includes("token"));
  const token = mail[0].text.match(/reset=([a-f0-9]+)/)[1];
  assert.notEqual(db.prepare("SELECT token FROM resets").get().token, token);
  assert.equal(
    (
      await a("/auth/reset", "POST", {
        token: "wrong",
        password: "Changed123",
        confirm: "Changed123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a("/auth/reset", "POST", {
        token,
        password: "Changed123",
        confirm: "Changed123",
      })
    ).status,
    200,
  );
  assert.equal((await a("/auth/me")).user, null);
  assert.equal(
    (
      await a("/auth/reset", "POST", {
        token,
        password: "Changed456",
        confirm: "Changed456",
      })
    ).status,
    400,
  );
  await a("/auth/forgot", "POST", { email: account.email });
  const token2 = mail[1].text.match(/reset=([a-f0-9]+)/)[1];
  db.prepare("UPDATE resets SET expires=0").run();
  assert.equal(
    (
      await a("/auth/reset", "POST", {
        token: token2,
        password: "Changed789",
        confirm: "Changed789",
      })
    ).status,
    400,
  );
});
test("stock is transactional, checkout cannot oversell and failed checkout leaves cart intact", async (t) => {
  const { client, db } = await fixture(t),
    a = client(),
    b = client();
  await a("/auth/register", "POST", account);
  await b("/auth/register", "POST", {
    ...account,
    email: "second@example.com",
    phone: "0912345678",
  });
  db.prepare("UPDATE products SET stock=1 WHERE id=1").run();
  await a("/cart/1", "PUT", { qty: 1 });
  await b("/cart/1", "PUT", { qty: 1 });
  const results = await Promise.all([
    a("/checkout", "POST", { key: "parallel-aaa", payment: "cod", shipping }),
    b("/checkout", "POST", { key: "parallel-bbb", payment: "cod", shipping }),
  ]);
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
  assert.equal((await a("/products/1")).product.stock, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM orders").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cart").get().n, 1);
});
test("VNPay callback signatures, amounts, idempotency and failed/expired stock reservations", async (t) => {
  const previous = { ...process.env };
  process.env.VNPAY_TMN_CODE = "TESTTMN";
  process.env.VNPAY_HASH_SECRET = "test-secret-only";
  process.env.APP_URL = "http://localhost:5173";
  t.after(() => {
    for (const k of ["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET", "APP_URL"])
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
  });
  const { client, db } = await fixture(t),
    a = client();
  await a("/auth/register", "POST", account);
  await a("/cart/1", "PUT", { qty: 2 });
  const before = (await a("/products/1")).product.stock;
  const start = await a("/checkout", "POST", {
    key: "vnpay-first",
    payment: "vnpay",
    shipping,
  });
  assert.equal(start.status, 200);
  const url = new URL(start.redirect),
    id = url.searchParams.get("vnp_TxnRef");
  assert.equal((await a("/products/1")).product.stock, before - 2);
  assert.equal((await a("/orders")).orders.length, 0);
  function callback(id, success, amount = 37000000, signature = true) {
    const p = {
      vnp_TxnRef: id,
      vnp_Amount: String(amount),
      vnp_TmnCode: "TESTTMN",
      vnp_ResponseCode: success ? "00" : "24",
      vnp_TransactionStatus: success ? "00" : "02",
    };
    const query = Object.keys(p)
      .sort()
      .map(
        (k) =>
          encodeURIComponent(k) +
          "=" +
          encodeURIComponent(p[k]).replace(/%20/g, "+"),
      )
      .join("&");
    return (
      "/payments/vnpay/ipn?" +
      query +
      "&vnp_SecureHash=" +
      (signature
        ? createHmac("sha512", "test-secret-only").update(query).digest("hex")
        : "bad")
    );
  }
  assert.equal((await a(callback(id, true, 37000000, false))).RspCode, "97");
  assert.equal((await a(callback(id, true, 1))).RspCode, "97");
  assert.equal((await a(callback(id, false))).RspCode, "00");
  assert.equal((await a("/products/1")).product.stock, before);
  assert.equal((await a("/cart")).items.length, 1);
  const next = await a("/checkout", "POST", {
    key: "vnpay-second",
    payment: "vnpay",
    shipping,
  });
  const id2 = new URL(next.redirect).searchParams.get("vnp_TxnRef");
  await a("/cart/1", "PUT", { qty: 3 });
  assert.equal((await a(callback(id2, true))).RspCode, "00");
  assert.equal((await a(callback(id2, true))).RspCode, "00");
  assert.equal((await a("/orders")).orders.length, 1);
  assert.equal((await a("/orders")).orders[0].payment_status, "paid");
  assert.equal((await a("/cart")).items[0].qty, 1);
  assert.equal((await a("/products/1")).product.stock, before - 2);
  const third = await a("/checkout", "POST", {
    key: "vnpay-expiry",
    payment: "vnpay",
    shipping,
  });
  const id3 = new URL(third.redirect).searchParams.get("vnp_TxnRef");
  assert.equal(
    (
      await a("/checkout", "POST", {
        key: "vnpay-expiry",
        payment: "cod",
        shipping,
      })
    ).status,
    409,
  );
  db.prepare("UPDATE payment_attempts SET expires=0 WHERE id=?").run(id3);
  await a("/products");
  assert.equal((await a("/products/1")).product.stock, before - 2);
  assert.equal(
    db.prepare("SELECT status FROM payment_attempts WHERE id=?").get(id3)
      .status,
    "expired",
  );
  db.prepare("UPDATE products SET stock=0 WHERE id=1").run();
  assert.equal((await a(callback(id3, true, 21000000))).RspCode, "00");
  assert.equal((await a(callback(id3, true, 21000000))).RspCode, "00");
  const late = (await a("/orders")).orders.find(
    (o) => o.status === "payment_review",
  );
  assert.equal(late.payment_status, "paid");
  assert.equal((await a("/orders")).orders.length, 2);
  assert.equal((await a("/cart")).items[0].qty, 1);
  assert.equal((await a("/products/1")).product.stock, 0);
});
test("admin: staff accounts, permissions, orders, catalog, customers, reviews, stats and settings", async (t) => {
  const { db, client } = await fixture(t),
    shop = client(),
    admin = client(),
    clerk = client();
  createStaff(db, encode, { name: "Chủ tiệm", email: "boss@example.com", role: "admin", password: "1234" });
  // Staff and customers are separate: neither can log in on the other side.
  assert.equal((await admin("/admin/stats")).status, 401);
  assert.equal((await admin("/auth/login", "POST", { email: "boss@example.com", password: "1234" })).status, 401);
  await shop("/auth/register", "POST", account);
  assert.equal((await shop("/admin/login", "POST", { email: account.email, password: account.password })).status, 401);
  assert.equal((await shop("/admin/stats")).status, 401);
  assert.equal((await admin("/admin/login", "POST", { email: "boss@example.com", password: "1234" })).status, 200);
  assert.equal((await admin("/admin/me")).user.role, "admin");
  assert.equal((await admin("/auth/me")).user, null);

  // Staff management + permissions.
  const staffBody = { name: "Bé Na", email: "na@example.com", phone: "0911111111", role: "staff", perms: ["orders"], password: "Staff12345" };
  const made = await admin("/admin/staff", "POST", staffBody);
  assert.equal(made.status, 201);
  const na = made.staff.find((s) => s.email === "na@example.com");
  assert.deepEqual(na.perms, ["orders"]);
  assert.equal((await clerk("/admin/login", "POST", { email: na.email, password: "Staff12345" })).status, 200);
  assert.equal((await clerk("/admin/orders")).status, 200);
  assert.equal((await clerk("/admin/products")).status, 403);
  assert.equal((await clerk("/admin/staff")).status, 403);
  assert.equal((await clerk("/admin/settings")).status, 403);
  const me = (await admin("/admin/me")).user;
  assert.equal((await admin(`/admin/staff/${me.id}`, "PUT", { ...me, role: "staff" })).status, 409);
  assert.equal((await admin(`/admin/staff/${me.id}`, "DELETE")).status, 409);
  await admin(`/admin/staff/${na.id}`, "PUT", { ...staffBody, active: false, password: "" });
  assert.equal((await clerk("/admin/orders")).status, 401);

  // Categories: add, rename carries to products, delete blocked while in use.
  let cats = (await admin("/admin/categories", "POST", { name: "Bánh su", description: "Su kem" })).categories;
  assert.equal((await admin("/admin/categories", "POST", { name: "Bánh su" })).status, 409);
  const kem = cats.find((x) => x.name === "Bánh kem");
  assert.equal(kem.products, 2);
  assert.equal((await admin(`/admin/categories/${kem.id}`, "DELETE")).status, 409);
  await admin(`/admin/categories/${kem.id}`, "PUT", { name: "Bánh kem sinh nhật" });
  assert.equal((await shop("/products/1")).product.type, "Bánh kem sinh nhật");
  assert.ok((await shop("/categories")).categories.includes("Bánh su"));

  // Products: validation, create, hide, delete.
  assert.equal((await admin("/admin/products", "POST", { name: "Su", type: "Không có", price: 20000, stock: 1 })).status, 400);
  const list = (await admin("/admin/products", "POST", { name: "Su kem", type: "Bánh su", price: 20000, stock: 3, img: "https://example.com/su.jpg" })).products;
  const su = list.find((p) => p.name === "Su kem");
  assert.equal(su.img, "https://example.com/su.jpg");
  await admin(`/admin/products/${su.id}`, "PUT", { ...su, active: false });
  assert.ok(!(await shop("/products")).products.some((p) => p.id === su.id));
  assert.ok(!(await admin(`/admin/products/${su.id}`, "DELETE")).products.some((p) => p.id === su.id));

  // Orders + stats.
  await shop("/cart/1", "PUT", { qty: 2 });
  const { order } = await shop("/checkout", "POST", { key: "admin-order-1", payment: "cod", shipping });
  const stats = await admin("/admin/stats?group=month");
  assert.equal(stats.orders, 1);
  assert.equal(stats.revenue, order.total);
  assert.equal(stats.series.at(-1).revenue, order.total);
  assert.equal(stats.categories[0].name, "Bánh kem sinh nhật");
  assert.equal(stats.customers, 1);
  assert.equal((await admin("/admin/stats?from=2026-02-01&to=2026-01-01")).status, 400);
  const move = (status) => admin(`/admin/orders/${order.id}/status`, "POST", { status });
  assert.equal((await move("delivered")).status, 409);
  assert.equal((await move("processing")).order.status, "processing");
  assert.equal((await move("cancelled")).order.status, "cancelled");
  assert.equal((await admin("/admin/products")).products[0].stock, 20);
  assert.equal((await admin("/admin/orders")).orders[0].customer, account.name);

  // Customers: add, edit, details, lock blocks login and live session.
  const cust = (await admin("/admin/customers")).customers;
  assert.deepEqual(cust.map((x) => x.email), [account.email]);
  assert.equal((await admin("/admin/customers", "POST", { ...account, password: "Khach12345" })).status, 409);
  await admin("/admin/customers", "POST", { name: "Khách Mới", email: "new@example.com", phone: "0922222222", address: "", password: "Khach12345" });
  const id = cust[0].id;
  assert.equal((await admin(`/admin/customers/${id}`)).orders.length, 1);
  await admin(`/admin/customers/${id}`, "PUT", { ...account, name: "Khách Đổi Tên" });
  await admin(`/admin/customers/${id}/lock`, "POST", { locked: true });
  assert.equal((await shop("/cart")).status, 401);
  assert.equal((await shop("/auth/login", "POST", account)).status, 403);
  await admin(`/admin/customers/${id}/lock`, "POST", { locked: false });
  assert.equal((await shop("/auth/login", "POST", account)).user.name, "Khách Đổi Tên");

  // Settings: payment methods, shipping fee, closing the shop.
  const settings = (await admin("/admin/settings")).settings;
  assert.equal((await admin("/admin/settings", "PUT", { ...settings, cod: false, vnpay: false })).status, 400);
  await admin("/admin/settings", "PUT", { ...settings, shippingFee: 10000, freeShippingFrom: 99999999, cod: true, open: false });
  assert.equal((await shop("/config")).shippingFee, 10000);
  assert.equal((await shop("/cart/1", "PUT", { qty: 1 })).status, 503);
  await admin("/admin/settings", "PUT", { ...settings, shippingFee: 10000, freeShippingFrom: 99999999 });
  await shop("/cart/1", "PUT", { qty: 1 });
  assert.equal((await shop("/checkout", "POST", { key: "admin-order-2", payment: "cod", shipping })).order.fee, 10000);
  const backup = await fetch(admin.base + "/api/admin/backup", { headers: { Cookie: admin.cookie() } }).then((r) => r.text());
  assert.match(backup, /INSERT INTO "products"/);
  assert.doesNotMatch(backup, /staff_sessions/);

  // Reviews: reply, admin-only delete.
  assert.equal((await admin("/admin/reviews/nope/reply", "PUT", { reply: "Cảm ơn" })).status, 404);
  assert.equal((await admin("/admin/reviews/nope", "DELETE")).status, 404);
  await admin("/admin/logout", "POST");
  assert.equal((await admin("/admin/me")).status, 401);
});
test("SQL export restores staff, customers, catalog and settings into an empty database", () => {
  const db = openDatabase(":memory:");
  createStaff(db, encode, { name: "Chủ tiệm", email: "boss@example.com", role: "admin", password: "1234" });
  db.prepare("INSERT INTO users(id,name,email,phone,address,password,locked) VALUES('u1','Khách ''Rookie''','k@example.com','0900000000','',?,1)").run(encode("Khach12345"));
  db.prepare("INSERT INTO settings VALUES('shippingFee','15000')").run();
  db.prepare("INSERT INTO sessions VALUES('secret','u1',?)").run(Date.now() + 1000);
  const sql = dumpSql(db),
    copy = new DatabaseSync(":memory:");
  copy.exec(sql);
  assert.equal(copy.prepare("SELECT email FROM staff").get().email, "boss@example.com");
  assert.equal(copy.prepare("SELECT name,locked FROM users").get().name, "Khách 'Rookie'");
  assert.equal(copy.prepare("SELECT COUNT(*) n FROM products").get().n, 4);
  assert.equal(copy.prepare("SELECT value FROM settings WHERE key='shippingFee'").get().value, "15000");
  assert.doesNotMatch(sql, /secret/);
});
test("admin purchases add stock atomically and need the purchases permission", async (t) => {
  const { db, client } = await fixture(t),
    admin = client(),
    clerk = client();
  createStaff(db, encode, { name: "Chủ tiệm", email: "boss@example.com", role: "admin", password: "1234" });
  createStaff(db, encode, { name: "Bé Na", email: "na@example.com", perms: ["orders"], password: "Staff12345" });
  await admin("/admin/login", "POST", { email: "boss@example.com", password: "1234" });
  await clerk("/admin/login", "POST", { email: "na@example.com", password: "Staff12345" });
  assert.equal((await clerk("/admin/purchases")).status, 403);
  const stock = (id) => db.prepare("SELECT stock FROM products WHERE id=?").get(id).stock;
  assert.equal((await admin("/admin/purchases", "POST", { supplier: "Lò A", items: [] })).status, 400);
  assert.equal((await admin("/admin/purchases", "POST", { supplier: "Lò A", items: [{ id: 1, qty: 0, cost: 1 }] })).status, 400);
  // A bad line rolls back the whole receipt, including earlier valid lines.
  assert.equal((await admin("/admin/purchases", "POST", { supplier: "Lò A", items: [{ id: 1, qty: 5, cost: 1 }, { id: 999, qty: 1, cost: 1 }] })).status, 404);
  assert.equal(stock(1), 20);
  const r = await admin("/admin/purchases", "POST", { supplier: "Lò A", note: "Giao sáng", items: [{ id: 1, qty: 5, cost: 90000 }, { id: 3, qty: 10, cost: 30000 }] });
  assert.equal(r.status, 201);
  assert.equal(stock(1), 25);
  assert.equal(stock(3), 40);
  assert.equal(r.purchases[0].total, 5 * 90000 + 10 * 30000);
  assert.equal(r.purchases[0].staff, "Chủ tiệm");
  assert.equal(r.purchases[0].items[0].name, "Strawberry little love");
  assert.ok(r.products.some((p) => p.id === 1 && p.stock === 25));
});
