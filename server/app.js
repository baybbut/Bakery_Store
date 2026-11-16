import express from "express";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import nodemailer from "nodemailer";
import { openDatabase, transaction, readSettings } from "./db.js";
import { mountAdmin } from "./admin.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (s, max = 200) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";
const email = (s) => text(s).toLowerCase();
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const validPhone = (s) => /^0\d{9}$/.test(s);
function password(p) {
  if (
    typeof p !== "string" ||
    p.length < 8 ||
    p.length > 128 ||
    !/[A-Za-z]/.test(p) ||
    !/[0-9]/.test(p)
  )
    fail("Mật khẩu cần 8–128 ký tự, gồm chữ và số.");
  return p;
}
export function encode(p) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}
function matches(p, stored) {
  if (typeof p !== "string" || p.length > 128) return false;
  const [salt, h] = stored.split(":");
  return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(h, "hex"));
}
function validateProfile(b) {
  const p = {
    name: text(b.name, 100),
    email: email(b.email),
    phone: text(b.phone, 20),
    address: text(b.address, 500),
  };
  if (p.name.length < 2 || !validEmail(p.email) || !validPhone(p.phone))
    fail("Nhập họ tên, email hợp lệ và số điện thoại Việt Nam gồm 10 số.");
  return p;
}
function shipping(b = {}) {
  b ||= {};
  const s = {
    name: text(b.name, 100),
    phone: text(b.phone, 20),
    address: text(b.address, 500),
    note: text(b.note, 500),
  };
  if (s.name.length < 2 || !validPhone(s.phone) || s.address.length < 10)
    fail(
      "Điền người nhận, số điện thoại 10 số và địa chỉ giao hàng ít nhất 10 ký tự.",
    );
  return s;
}
function vnpDate(ms = Date.now()) {
  return new Date(ms + 7 * 3600000)
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
}
function vnpQuery(p) {
  return Object.keys(p)
    .sort()
    .map(
      (k) =>
        encodeURIComponent(k) +
        "=" +
        encodeURIComponent(String(p[k])).replace(/%20/g, "+"),
    )
    .join("&");
}
function devOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const u = new URL(origin);
    return (
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
const vnpReady = () =>
  !!(
    process.env.VNPAY_TMN_CODE &&
    process.env.VNPAY_HASH_SECRET &&
    process.env.APP_URL
  );
export function createApp({ db = openDatabase(), mailSink } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.get("host")}` &&
      req.headers.origin !== process.env.APP_URL &&
      !devOrigin(req.headers.origin)
    )
      return res.status(403).json({ error: "Nguồn yêu cầu không hợp lệ." });
    next();
  });
  const safe = (u) =>
    u
      ? {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          address: u.address,
        }
      : null;
  function session(req, res, u) {
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      u.id,
      Date.now() + 7 * 86400000,
    );
    res.cookie("rookie_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 86400000,
      path: "/",
    });
    return safe(u);
  }
  app.use("/api", (req, res, next) => {
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)rookie_session=([a-f0-9]+)/,
    )?.[1];
    req.sessionHash = token ? hash(token) : "";
    req.user = db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.locked=0",
      )
      .get(req.sessionHash, Date.now());
    next();
  });
  const auth = (req, res, next) =>
    req.user
      ? next()
      : res
          .status(401)
          .json({ error: "Vui lòng đăng nhập để sử dụng chức năng này." });
  const buckets = new Map();
  const limit = (req, res, next) => {
    const key = req.socket.remoteAddress,
      now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.until) b = { count: 0, until: now + 600000 };
    buckets.set(key, b);
    if (++b.count > 40)
      return res.status(429).json({
        error: "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau 10 phút.",
      });
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    next();
  };
  const product = (id) => {
    const r = db
      .prepare("SELECT * FROM products WHERE id=? AND active=1")
      .get(Number(id));
    if (!r) fail("Không tìm thấy bánh.", 404);
    return { ...JSON.parse(r.data), stock: r.stock };
  };
  const cartItems = (uid) =>
    db
      .prepare(
        "SELECT product_id,qty FROM cart WHERE user_id=? ORDER BY product_id",
      )
      .all(uid)
      .map((r) => ({ ...product(r.product_id), qty: r.qty }));
  const detail = (o) =>
    o
      ? {
          ...o,
          shipping: JSON.parse(o.shipping),
          items: JSON.parse(o.items),
          events: db
            .prepare(
              "SELECT status,created FROM order_events WHERE order_id=? ORDER BY id",
            )
            .all(o.id),
        }
      : null;
  function order(uid, id) {
    const o = db
      .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
      .get(id, uid);
    if (!o) fail("Không tìm thấy đơn hàng.", 404);
    return o;
  }
  function snapshot(uid, s) {
    const items = cartItems(uid);
    if (!items.length) fail("Giỏ bánh đang trống.");
    for (const p of items)
      if (p.qty > p.stock) fail(`${p.name} chỉ còn ${p.stock} sản phẩm.`, 409);
    const st = readSettings(db),
      subtotal = items.reduce((n, p) => n + p.qty * p.price, 0),
      fee = subtotal >= st.freeShippingFrom ? 0 : st.shippingFee;
    return {
      items: items.map(({ stock, ...p }) => p),
      shipping: s,
      subtotal,
      fee,
      total: subtotal + fee,
    };
  }
  function reserve(items) {
    for (const p of items) {
      const r = db
        .prepare(
          "UPDATE products SET stock=stock-? WHERE id=? AND active=1 AND stock>=?",
        )
        .run(p.qty, p.id, p.qty);
      if (!r.changes) fail(`${p.name} không đủ hàng.`, 409);
    }
  }
  function restore(items) {
    for (const p of items)
      db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(
        p.qty,
        p.id,
      );
  }
  function saveOrder(
    uid,
    s,
    key,
    payment,
    paymentStatus,
    id = "RK-" + randomBytes(5).toString("hex").toUpperCase(),
    status = "pending",
  ) {
    const created = new Date().toISOString();
    db.prepare("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      uid,
      created,
      status,
      payment,
      paymentStatus,
      JSON.stringify(s.shipping),
      JSON.stringify(s.items),
      s.subtotal,
      s.fee,
      s.total,
      key,
    );
    db.prepare(
      "INSERT INTO order_events(order_id,status,created) VALUES(?,?,?)",
    ).run(id, status, created);
    if (status === "pending") clearPurchased(uid, s.items);
    return detail(order(uid, id));
  }
  // Remove purchased quantities without deleting additions made during an online payment.
  function clearPurchased(uid, items) {
    for (const p of items) {
      const r = db
        .prepare("SELECT qty FROM cart WHERE user_id=? AND product_id=?")
        .get(uid, p.id);
      if (!r) continue;
      if (r.qty <= p.qty)
        db.prepare("DELETE FROM cart WHERE user_id=? AND product_id=?").run(
          uid,
          p.id,
        );
      else
        db.prepare(
          "UPDATE cart SET qty=qty-? WHERE user_id=? AND product_id=?",
        ).run(p.qty, uid, p.id);
    }
  }
  function expirePayments() {
    transaction(db, () => {
      for (const p of db
        .prepare(
          "SELECT * FROM payment_attempts WHERE status='pending' AND expires<?",
        )
        .all(Date.now())) {
        restore(JSON.parse(p.data).items);
        db.prepare(
          "UPDATE payment_attempts SET status='expired' WHERE id=?",
        ).run(p.id);
      }
    });
  }
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/config", (req, res) => {
    const s = readSettings(db);
    res.json({
      ...s,
      onlinePayment: vnpReady() && s.vnpay,
    });
  });
  app.get("/api/categories", (req, res) =>
    res.json({
      categories: db.prepare("SELECT name FROM categories ORDER BY id").all().map((c) => c.name),
    }),
  );
  // Temporary closing (admin setting) stops customers from shopping.
  const open = () => {
    const s = readSettings(db);
    if (!s.open) fail(s.closedMessage || "Cửa hàng đang tạm đóng.", 503);
    return s;
  };
  app.get("/api/auth/me", (req, res) => res.json({ user: safe(req.user) }));
  app.post("/api/auth/register", limit, (req, res) => {
    const p = validateProfile(req.body),
      pw = password(req.body.password);
    if (pw !== req.body.confirm) fail("Xác nhận mật khẩu không trùng khớp.");
    const u = { id: randomUUID(), ...p, password: encode(pw) };
    try {
      db.prepare("INSERT INTO users(id,name,email,phone,address,password) VALUES(?,?,?,?,?,?)").run(
        u.id,
        u.name,
        u.email,
        u.phone,
        u.address,
        u.password,
      );
    } catch (e) {
      if (e.code?.includes("CONSTRAINT") || e.message.includes("UNIQUE"))
        fail("Email hoặc số điện thoại đã được sử dụng.", 409);
      throw e;
    }
    res.status(201).json({ user: session(req, res, u) });
  });
  const dummy = encode(randomBytes(16).toString("hex"));
  app.post("/api/auth/login", limit, (req, res) => {
    const u = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email(req.body.email));
    const ok = matches(req.body.password, u?.password || dummy);
    if (!u || !ok) fail("Email hoặc mật khẩu chưa đúng.", 401);
    if (u.locked)
      fail("Tài khoản đã bị khóa. Vui lòng liên hệ cửa hàng.", 403);
    res.json({ user: session(req, res, u) });
  });
  app.post("/api/auth/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.sessionHash);
    res.clearCookie("rookie_session", { path: "/" });
    res.json({ ok: true });
  });
  app.post("/api/auth/forgot", limit, async (req, res, next) => {
    try {
      const address = email(req.body.email);
      if (!validEmail(address)) fail("Email không hợp lệ.");
      const u = db.prepare("SELECT * FROM users WHERE email=?").get(address);
      if (
        process.env.NODE_ENV === "production" &&
        !process.env.SMTP_HOST &&
        !mailSink
      )
        fail("Chức năng email chưa được cấu hình. Vui lòng liên hệ tiệm.", 503);
      if (u) {
        const token = randomBytes(32).toString("hex");
        transaction(db, () => {
          db.prepare("DELETE FROM resets WHERE user_id=?").run(u.id);
          db.prepare("INSERT INTO resets VALUES(?,?,?)").run(
            hash(token),
            u.id,
            Date.now() + 1800000,
          );
        });
        const url =
          (process.env.APP_URL || "http://localhost:5173") + "/?reset=" + token;
        const mail = {
          to: u.email,
          subject: "Rookie — Đặt lại mật khẩu",
          text: `Mở liên kết để đặt lại mật khẩu (hết hạn sau 30 phút): ${url}\nNếu không yêu cầu, hãy bỏ qua email này.`,
        };
        if (mailSink) await mailSink(mail);
        else if (process.env.SMTP_HOST) {
          await nodemailer
            .createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT || 587),
              secure: process.env.SMTP_PORT === "465",
              auth: process.env.SMTP_USER
                ? {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD,
                  }
                : undefined,
            })
            .sendMail({ ...mail, from: process.env.SMTP_FROM });
        } else {
          mkdirSync(resolve("data"), { recursive: true });
          appendFileSync(
            resolve("data/dev-mailbox.jsonl"),
            JSON.stringify(mail) + "\n",
            { mode: 0o600 },
          );
        }
      }
      res.json({
        message:
          "Nếu email đã đăng ký, hướng dẫn khôi phục sẽ được gửi. Liên kết có hiệu lực 30 phút.",
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/auth/reset", limit, (req, res) => {
    const p = password(req.body.password);
    if (p !== req.body.confirm) fail("Xác nhận mật khẩu không trùng khớp.");
    const r = db
      .prepare("SELECT * FROM resets WHERE token=? AND expires>?")
      .get(hash(text(req.body.token, 100)), Date.now());
    if (!r) fail("Liên kết không hợp lệ hoặc đã hết hạn.");
    transaction(db, () => {
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        encode(p),
        r.user_id,
      );
      db.prepare("DELETE FROM resets WHERE user_id=?").run(r.user_id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(r.user_id);
    });
    res.clearCookie("rookie_session", { path: "/" });
    res.json({ ok: true });
  });
  app.patch("/api/profile", auth, (req, res) => {
    const p = validateProfile(req.body);
    try {
      db.prepare(
        "UPDATE users SET name=?,email=?,phone=?,address=? WHERE id=?",
      ).run(p.name, p.email, p.phone, p.address, req.user.id);
    } catch (e) {
      if (e.message.includes("UNIQUE"))
        fail("Email hoặc số điện thoại đã được sử dụng.", 409);
      throw e;
    }
    res.json({ user: safe({ ...req.user, ...p }) });
  });
  app.post("/api/profile/password", auth, limit, (req, res) => {
    if (!matches(req.body.current, req.user.password))
      fail("Mật khẩu hiện tại chưa đúng.");
    const p = password(req.body.password);
    if (p !== req.body.confirm) fail("Xác nhận mật khẩu không trùng khớp.");
    if (matches(p, req.user.password))
      fail("Mật khẩu mới phải khác mật khẩu hiện tại.");
    transaction(db, () => {
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        encode(p),
        req.user.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
    });
    res.clearCookie("rookie_session", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/products", (req, res) => {
    expirePayments();
    let items = db
      .prepare("SELECT * FROM products WHERE active=1")
      .all()
      .map((r) => ({
        ...JSON.parse(r.data),
        stock: r.stock,
        ...db
          .prepare(
            "SELECT COUNT(*) reviewCount,COALESCE(AVG(rating),0) rating FROM reviews WHERE product_id=?",
          )
          .get(r.id),
      }));
    const norm = (s) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .toLowerCase();
    const q = norm(text(req.query.q));
    if (q)
      items = items.filter((p) =>
        norm(p.name + " " + p.note + " " + p.type).includes(q),
      );
    if (req.query.category)
      items = items.filter((p) => p.type === req.query.category);
    if (req.query.min)
      items = items.filter((p) => p.price >= Number(req.query.min));
    if (req.query.max)
      items = items.filter((p) => p.price <= Number(req.query.max));
    if (req.query.sort === "price-asc") items.sort((a, b) => a.price - b.price);
    if (req.query.sort === "price-desc")
      items.sort((a, b) => b.price - a.price);
    res.json({ products: items });
  });
  app.get("/api/products/:id", (req, res) =>
    res.json({ product: product(req.params.id) }),
  );
  app.get("/api/cart", auth, (req, res) =>
    res.json({ items: cartItems(req.user.id) }),
  );
  app.put("/api/cart/:id", auth, (req, res) => {
    const p = product(req.params.id),
      qty = req.body.qty;
    if (!Number.isInteger(qty) || qty < 0 || qty > 99)
      fail("Số lượng phải là số nguyên từ 0 đến 99.");
    if (qty > 0) open();
    if (qty > p.stock) fail(`${p.name} chỉ còn ${p.stock} sản phẩm.`, 409);
    if (qty === 0)
      db.prepare("DELETE FROM cart WHERE user_id=? AND product_id=?").run(
        req.user.id,
        p.id,
      );
    else
      db.prepare(
        "INSERT INTO cart VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET qty=excluded.qty",
      ).run(req.user.id, p.id, qty);
    res.json({ items: cartItems(req.user.id) });
  });
  app.get("/api/favorites", auth, (req, res) =>
    res.json({
      ids: db
        .prepare("SELECT product_id FROM favorites WHERE user_id=?")
        .all(req.user.id)
        .map((r) => r.product_id),
    }),
  );
  app.put("/api/favorites/:id", auth, (req, res) => {
    const p = product(req.params.id);
    if (req.body.saved === true)
      db.prepare("INSERT OR IGNORE INTO favorites VALUES(?,?)").run(
        req.user.id,
        p.id,
      );
    else
      db.prepare("DELETE FROM favorites WHERE user_id=? AND product_id=?").run(
        req.user.id,
        p.id,
      );
    res.json({ ok: true });
  });
  app.post("/api/checkout", auth, (req, res) => {
    expirePayments();
    const uid = req.user.id,
      key = text(req.body.key, 100);
    if (key.length < 8) fail("Mã yêu cầu không hợp lệ.");
    const old = db
      .prepare("SELECT * FROM orders WHERE user_id=? AND request_key=?")
      .get(uid, key);
    if (old) return res.json({ order: detail(old) });
    const st = open();
    if (!["cod", "vnpay"].includes(req.body.payment) || !st[req.body.payment])
      fail("Vui lòng chọn phương thức thanh toán đang được hỗ trợ.");
    const s = shipping(req.body.shipping);
    if (req.body.payment === "cod") {
      if (
        db
          .prepare(
            "SELECT id FROM payment_attempts WHERE user_id=? AND request_key=?",
          )
          .get(uid, key)
      )
        fail(
          "Yêu cầu này đã dùng cho VNPay. Vui lòng quay về giỏ và tạo lần đặt mới.",
          409,
        );
      const result = transaction(db, () => {
        const shot = snapshot(uid, s);
        reserve(shot.items);
        return saveOrder(uid, shot, key, "cod", "unpaid");
      });
      return res.status(201).json({ order: result });
    }
    if (!vnpReady())
      fail(
        "VNPay chưa được cấu hình. Vui lòng chọn thanh toán khi nhận hàng.",
        503,
      );
    const existing = db
      .prepare(
        "SELECT * FROM payment_attempts WHERE user_id=? AND request_key=?",
      )
      .get(uid, key);
    if (existing && existing.status !== "pending")
      fail(
        "Phiên thanh toán đã kết thúc. Vui lòng tạo lần thanh toán mới.",
        409,
      );
    const attempt =
      existing ||
      transaction(db, () => {
        const shot = snapshot(uid, s);
        reserve(shot.items);
        const a = {
          id: randomBytes(12).toString("hex"),
          user_id: uid,
          data: JSON.stringify(shot),
          status: "pending",
          expires: Date.now() + 15 * 60000,
          request_key: key,
        };
        db.prepare("INSERT INTO payment_attempts VALUES(?,?,?,?,?,?)").run(
          ...Object.values(a),
        );
        return a;
      });
    const params = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: process.env.VNPAY_TMN_CODE,
      vnp_Amount: JSON.parse(attempt.data).total * 100,
      vnp_CurrCode: "VND",
      vnp_TxnRef: attempt.id,
      vnp_OrderInfo: "Thanh toan Rookie " + attempt.id,
      vnp_OrderType: "other",
      vnp_Locale: "vn",
      vnp_ReturnUrl: process.env.APP_URL + "/api/payments/vnpay/return",
      vnp_IpAddr:
        req.socket.remoteAddress?.replace("::ffff:", "") || "127.0.0.1",
      vnp_CreateDate: vnpDate(attempt.expires - 15 * 60000),
      vnp_ExpireDate: vnpDate(attempt.expires),
    };
    const query = vnpQuery(params),
      signature = createHmac("sha512", process.env.VNPAY_HASH_SECRET)
        .update(query)
        .digest("hex");
    res.json({
      redirect:
        (process.env.VNPAY_URL ||
          "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html") +
        "?" +
        query +
        "&vnp_SecureHash=" +
        signature,
    });
  });
  function callback(req) {
    if (!vnpReady()) fail("Thanh toán chưa được cấu hình.", 503);
    const params = { ...req.query },
      signature = params.vnp_SecureHash;
    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;
    const expected = createHmac("sha512", process.env.VNPAY_HASH_SECRET)
      .update(vnpQuery(params))
      .digest("hex");
    if (
      typeof signature !== "string" ||
      !/^[a-f0-9]{128}$/i.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature.toLowerCase()),
        Buffer.from(expected),
      )
    )
      fail("Chữ ký thanh toán không hợp lệ.");
    return transaction(db, () => {
      const a = db
        .prepare("SELECT * FROM payment_attempts WHERE id=?")
        .get(params.vnp_TxnRef);
      if (!a) fail("Không tìm thấy giao dịch.", 404);
      const s = JSON.parse(a.data);
      if (
        Number(params.vnp_Amount) !== s.total * 100 ||
        params.vnp_TmnCode !== process.env.VNPAY_TMN_CODE
      )
        fail("Thông tin giao dịch không khớp.");
      if (a.status === "paid" || a.status === "review")
        return {
          success: a.status === "paid",
          review: a.status === "review",
          id: a.id,
        };
      const success =
        params.vnp_ResponseCode === "00" &&
        params.vnp_TransactionStatus === "00";
      let needsReview = false;
      if (success) {
        if (a.status !== "pending") {
          // A delayed successful notification can arrive after the reservation expired.
          const enough = s.items.every((p) => {
            const row = db
              .prepare("SELECT stock,active FROM products WHERE id=?")
              .get(p.id);
            return row?.active && row.stock >= p.qty;
          });
          if (enough) reserve(s.items);
          else needsReview = true;
        }
        saveOrder(
          a.user_id,
          s,
          a.request_key,
          "vnpay",
          "paid",
          "RK-" + a.id.toUpperCase(),
          needsReview ? "payment_review" : "pending",
        );
      } else if (a.status === "pending") restore(s.items);
      db.prepare("UPDATE payment_attempts SET status=? WHERE id=?").run(
        success ? (needsReview ? "review" : "paid") : "failed",
        a.id,
      );
      return {
        success: success && !needsReview,
        review: needsReview,
        id: a.id,
      };
    });
  }
  app.get("/api/payments/vnpay/return", (req, res) => {
    try {
      const r = callback(req);
      res.redirect(
        "/?payment=" + (r.review ? "review" : r.success ? "success" : "failed"),
      );
    } catch {
      res.redirect("/?payment=invalid");
    }
  });
  app.get("/api/payments/vnpay/ipn", (req, res) => {
    try {
      callback(req);
      res.json({ RspCode: "00", Message: "Confirm Success" });
    } catch {
      res.json({ RspCode: "97", Message: "Invalid callback" });
    }
  });
  app.get("/api/orders", auth, (req, res) =>
    res.json({
      orders: db
        .prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created DESC")
        .all(req.user.id)
        .map(detail),
    }),
  );
  app.get("/api/orders/:id", auth, (req, res) =>
    res.json({ order: detail(order(req.user.id, req.params.id)) }),
  );
  app.post("/api/orders/:id/cancel", auth, (req, res) => {
    transaction(db, () => {
      const o = order(req.user.id, req.params.id);
      if (o.status !== "pending" || o.payment_status === "paid")
        fail("Chỉ có thể tự hủy đơn chưa xác nhận và chưa thanh toán.", 409);
      restore(JSON.parse(o.items));
      db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(o.id);
      db.prepare(
        "INSERT INTO order_events(order_id,status,created) VALUES(?,?,?)",
      ).run(o.id, "cancelled", new Date().toISOString());
    });
    res.json({ order: detail(order(req.user.id, req.params.id)) });
  });
  app.get("/api/products/:id/reviews", (req, res) => {
    const p = product(req.params.id),
      reviews = db
        .prepare(
          "SELECT r.id,r.rating,r.content,r.created,r.reply,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE product_id=? ORDER BY created DESC",
        )
        .all(p.id);
    const purchased =
      req.user &&
      db
        .prepare(
          "SELECT items FROM orders WHERE user_id=? AND status='delivered'",
        )
        .all(req.user.id)
        .some((o) => JSON.parse(o.items).some((i) => i.id === p.id));
    const reviewed =
      req.user &&
      db
        .prepare("SELECT id FROM reviews WHERE user_id=? AND product_id=?")
        .get(req.user.id, p.id);
    res.json({
      reviews,
      canReview: !!purchased && !reviewed,
      reviewed: !!reviewed,
      average: reviews.length
        ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length
        : 0,
    });
  });
  app.post("/api/products/:id/reviews", auth, (req, res) => {
    const p = product(req.params.id),
      rating = req.body.rating,
      content = text(req.body.content, 2001);
    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      content.length < 5 ||
      content.length > 2000
    )
      fail("Chọn 1–5 sao và viết nhận xét từ 5 đến 2.000 ký tự.");
    if (/\b(fuck|shit)\b/i.test(content))
      fail("Vui lòng dùng ngôn từ phù hợp trong đánh giá.");
    const bought = db
      .prepare(
        "SELECT items FROM orders WHERE user_id=? AND status='delivered'",
      )
      .all(req.user.id)
      .some((o) => JSON.parse(o.items).some((i) => i.id === p.id));
    if (!bought) fail("Bạn chỉ có thể đánh giá sau khi đã nhận sản phẩm.", 403);
    if (
      db
        .prepare("SELECT id FROM reviews WHERE user_id=? AND product_id=?")
        .get(req.user.id, p.id)
    )
      fail("Bạn đã đánh giá sản phẩm này.", 409);
    db.prepare(
      "INSERT INTO reviews(id,user_id,product_id,rating,content,created) VALUES(?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      req.user.id,
      p.id,
      rating,
      content,
      new Date().toISOString(),
    );
    res.status(201).json({ ok: true });
  });
  mountAdmin(app, {
    db, limit, dummy, detail, reserve, restore, expirePayments,
    validateProfile, fail, text, email, validEmail, validPhone, password, encode, matches, hash,
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Không tìm thấy chức năng." }),
  );
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(resolve("dist")));
    app.get("/", (req, res) => res.sendFile(resolve("dist/index.html")));
    app.get("/admin", (req, res) => res.sendFile(resolve("dist/admin.html")));
  }
  app.use((err, req, res, next) => {
    if (!err.status) console.error(err.message);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "Không thể xử lý yêu cầu. Vui lòng thử lại.",
    });
  });
  return app;
}
