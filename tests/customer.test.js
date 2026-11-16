import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
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
    return async (path, method = "GET", body) => {
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
    };
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
test("admin: access control, stats, order workflow, products and review replies", async (t) => {
  process.env.ADMIN_EMAILS = "boss@example.com";
  t.after(() => delete process.env.ADMIN_EMAILS);
  const { client } = await fixture(t),
    shop = client(),
    admin = client();
  assert.equal((await shop("/admin/stats")).status, 401);
  await shop("/auth/register", "POST", account);
  assert.equal((await shop("/admin/stats")).status, 403);
  await admin("/auth/register", "POST", {
    ...account,
    email: "boss@example.com",
    phone: "0912345678",
  });
  assert.equal((await admin("/admin/me")).admin, true);
  await shop("/cart/1", "PUT", { qty: 2 });
  const { order } = await shop("/checkout", "POST", { key: "admin-order-1", payment: "cod", shipping });
  const stats = await admin("/admin/stats?days=7");
  assert.equal(stats.orders, 1);
  assert.equal(stats.revenue, order.total);
  assert.equal(stats.series.length, 7);
  assert.equal(stats.series.at(-1).revenue, order.total);
  assert.equal(stats.top[0].qty, 2);
  const move = (status) => admin(`/admin/orders/${order.id}/status`, "POST", { status });
  assert.equal((await move("delivered")).status, 409);
  assert.equal((await move("processing")).order.status, "processing");
  assert.equal((await move("cancelled")).order.status, "cancelled");
  assert.equal((await admin("/admin/products")).products[0].stock, 20);
  assert.equal((await admin("/admin/stats")).revenue, 0);
  assert.equal((await admin("/admin/orders")).orders[0].customer, account.name);
  const bad = await admin("/admin/products", "POST", { name: "X", type: "", price: 1, stock: -1 });
  assert.equal(bad.status, 400);
  const made = await admin("/admin/products", "POST", { name: "Tart chanh", type: "Bánh ngọt", price: 55000, stock: 3, img: "cake.jpg" });
  const tart = made.products.find((p) => p.name === "Tart chanh");
  assert.equal(tart.id, 5);
  await admin("/admin/products/5", "PUT", { ...tart, active: false });
  assert.ok(!(await shop("/products")).products.some((p) => p.id === 5));
  assert.equal((await admin("/admin/customers")).customers.length, 2);
  assert.equal((await admin("/admin/reviews/nope/reply", "PUT", { reply: "Cảm ơn" })).status, 404);
});
