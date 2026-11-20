import { randomBytes, randomUUID } from "node:crypto";
import { transaction, readSettings, defaultSettings, dumpSql, PRODUCTS, itemsOf } from "./db.js";

// Permissions an admin can grant to staff accounts. Admins always have all of them.
export const PERMS = {
  stats: "Thống kê doanh thu",
  orders: "Đơn hàng",
  products: "Sản phẩm",
  categories: "Danh mục",
  customers: "Khách hàng",
  reviews: "Đánh giá",
  purchases: "Nhập hàng",
};
const IMAGES = ["hero.jpg", "berry.jpg", "cake.jpg", "toast.jpg", "memory.jpg", "doughnuts.jpg"];
const flow = {
  pending: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["delivered"],
  payment_review: ["processing", "cancelled"],
};
const TTL = 8 * 3600000;

export function createStaff(db, encode, { name, email, phone = "", role = "staff", perms = [], password }) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO staff(id,name,email,phone,role,perms,password,active,created) VALUES(?,?,?,?,?,?,?,1,?)",
  ).run(id, name, email, phone, role, JSON.stringify(perms), encode(password), new Date().toISOString());
  return id;
}

export function mountAdmin(app, c) {
  const { db, fail, text, email, validEmail, validPhone, encode, matches, hash, limit, dummy } = c;
  const unique = (fn, msg) => {
    try {
      return fn();
    } catch (e) {
      if (e.message.includes("UNIQUE")) fail(msg, 409);
      throw e;
    }
  };
  const effective = (s) =>
    s.role === "admin" ? Object.keys(PERMS) : JSON.parse(s.perms).filter((p) => p in PERMS);
  const safeStaff = (s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    role: s.role,
    perms: effective(s),
    active: !!s.active,
    created: s.created,
  });
  const cookieToken = (req) => req.headers.cookie?.match(/(?:^|;\s*)rookie_admin=([a-f0-9]+)/)?.[1];

  // ---- Đăng nhập / đăng xuất (UC1, UC16)
  app.post("/api/admin/login", limit, (req, res) => {
    const s = db.prepare("SELECT * FROM staff WHERE email=?").get(email(req.body.email));
    const ok = matches(req.body.password, s?.password || dummy);
    if (!s || !ok) fail("Email hoặc mật khẩu chưa đúng.", 401);
    if (!s.active) fail("Tài khoản nhân viên đã bị vô hiệu hóa.", 403);
    const t = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO staff_sessions VALUES(?,?,?)").run(hash(t), s.id, Date.now() + TTL);
    res.cookie("rookie_admin", t, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TTL,
      path: "/",
    });
    res.json({ user: safeStaff(s) });
  });
  app.post("/api/admin/logout", (req, res) => {
    const t = cookieToken(req);
    if (t) db.prepare("DELETE FROM staff_sessions WHERE token=?").run(hash(t));
    res.clearCookie("rookie_admin", { path: "/" });
    res.json({ ok: true });
  });
  app.use("/api/admin", (req, res, next) => {
    const t = cookieToken(req);
    req.staff =
      t &&
      db
        .prepare(
          "SELECT s.* FROM staff s JOIN staff_sessions x ON x.staff_id=s.id WHERE x.token=? AND x.expires>? AND s.active=1",
        )
        .get(hash(t), Date.now());
    if (!req.staff) return res.status(401).json({ error: "Vui lòng đăng nhập tài khoản quản trị." });
    next();
  });
  const can = (perm) => (req, res, next) =>
    effective(req.staff).includes(perm)
      ? next()
      : res.status(403).json({ error: "Bạn không có quyền sử dụng chức năng này." });
  const adminOnly = (req, res, next) =>
    req.staff.role === "admin"
      ? next()
      : res.status(403).json({ error: "Chỉ quản trị viên được dùng chức năng này." });

  // ---- Thông tin tài khoản của chính mình (UC2.2 nhân viên)
  app.get("/api/admin/me", (req, res) => res.json({ user: safeStaff(req.staff), perms: PERMS }));
  app.patch("/api/admin/me", (req, res) => {
    const name = text(req.body.name, 100),
      phone = text(req.body.phone, 20);
    if (name.length < 2 || (phone && !validPhone(phone)))
      fail("Nhập họ tên và số điện thoại Việt Nam gồm 10 số.");
    db.prepare("UPDATE staff SET name=?,phone=? WHERE id=?").run(name, phone, req.staff.id);
    res.json({ user: safeStaff({ ...req.staff, name, phone }) });
  });
  app.post("/api/admin/me/password", limit, (req, res) => {
    if (!matches(req.body.current, req.staff.password)) fail("Mật khẩu hiện tại chưa đúng.");
    const p = c.password(req.body.password);
    if (p !== req.body.confirm) fail("Xác nhận mật khẩu không trùng khớp.");
    transaction(db, () => {
      db.prepare("UPDATE staff SET password=? WHERE id=?").run(encode(p), req.staff.id);
      db.prepare("DELETE FROM staff_sessions WHERE staff_id=?").run(req.staff.id);
    });
    res.clearCookie("rookie_admin", { path: "/" });
    res.json({ ok: true });
  });

  // ---- Thống kê doanh thu (UC7.1.1): theo ngày/tháng/năm, theo danh mục
  const vnDate = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  app.get("/api/admin/stats", can("stats"), (req, res) => {
    c.expirePayments();
    const group = ["day", "month", "year"].includes(req.query.group) ? req.query.group : "day";
    const to = isDate(req.query.to) ? req.query.to : vnDate(Date.now());
    const from = isDate(req.query.from) ? req.query.from : vnDate(Date.parse(to) - 29 * 86400000);
    if (from > to) fail("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
    const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    if (days > 3700) fail("Chỉ thống kê tối đa 10 năm mỗi lần.");
    const key = (d) => (group === "day" ? d : group === "month" ? d.slice(0, 7) : d.slice(0, 4));
    const series = [],
      bucket = {};
    for (let i = 0; i < days; i++) {
      const k = key(new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10));
      if (!bucket[k]) series.push((bucket[k] = { label: k, revenue: 0, orders: 0 }));
    }
    const all = db.prepare("SELECT * FROM orders").all();
    const inRange = all.filter((o) => {
      const d = vnDate(Date.parse(o.created));
      return d >= from && d <= to;
    });
    const valid = inRange.filter((o) => o.status !== "cancelled");
    const top = {},
      cats = {},
      statuses = {};
    for (const o of inRange) statuses[o.status] = (statuses[o.status] || 0) + 1;
    for (const o of valid) {
      const b = bucket[key(vnDate(Date.parse(o.created)))];
      b.revenue += o.total;
      b.orders++;
      for (const i of itemsOf(db, o.id)) {
        const cat = i.type || "Khác";
        top[i.id] ||= { id: i.id, name: i.name, qty: 0, revenue: 0 };
        cats[cat] ||= { name: cat, qty: 0, revenue: 0 };
        top[i.id].qty += i.qty;
        top[i.id].revenue += i.qty * i.price;
        cats[cat].qty += i.qty;
        cats[cat].revenue += i.qty * i.price;
      }
    }
    const revenue = valid.reduce((n, o) => n + o.total, 0);
    res.json({
      from,
      to,
      group,
      revenue,
      delivered: valid.filter((o) => o.status === "delivered").reduce((n, o) => n + o.total, 0),
      orders: valid.length,
      cancelled: inRange.length - valid.length,
      average: valid.length ? Math.round(revenue / valid.length) : 0,
      customers: db.prepare("SELECT COUNT(*) n FROM users").get().n,
      waiting: all.filter((o) => ["pending", "payment_review"].includes(o.status)).length,
      series,
      statuses,
      top: Object.values(top).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      categories: Object.values(cats).sort((a, b) => b.revenue - a.revenue),
      lowStock: db
        .prepare("SELECT id,name,stock FROM products WHERE active=1 AND stock<=5 ORDER BY stock")
        .all(),
    });
  });

  // ---- Đơn hàng (UC4.1–UC4.6)
  const orderById = (id) => c.detail(db.prepare("SELECT * FROM orders WHERE id=?").get(id));
  app.get("/api/admin/orders", can("orders"), (req, res) =>
    res.json({
      orders: db
        .prepare(
          "SELECT o.*,u.name customer,u.email,u.phone FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created DESC",
        )
        .all()
        .map(c.detail),
    }),
  );
  app.post("/api/admin/orders/:id/status", can("orders"), (req, res) => {
    const status = req.body.status;
    transaction(db, () => {
      const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
      if (!o) fail("Không tìm thấy đơn hàng.", 404);
      if (!flow[o.status]?.includes(status)) fail("Không thể chuyển đơn sang trạng thái này.", 409);
      // payment_review orders never reserved stock: reserve on accept, nothing to restore on cancel.
      if (o.status === "payment_review" && status === "processing") c.reserve(itemsOf(db, o.id));
      if (status === "cancelled" && o.status !== "payment_review") c.restore(itemsOf(db, o.id));
      db.prepare("UPDATE orders SET status=?,payment_status=? WHERE id=?").run(
        status,
        status === "delivered" ? "paid" : o.payment_status,
        o.id,
      );
      db.prepare("INSERT INTO order_events(order_id,status,created) VALUES(?,?,?)").run(
        o.id,
        status,
        new Date().toISOString(),
      );
    });
    res.json({ order: orderById(req.params.id) });
  });

  // ---- Danh mục sản phẩm (UC5.1.1–UC5.1.4)
  const categoryList = () =>
    db
      .prepare(
        "SELECT c.*,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) products FROM categories c ORDER BY c.id",
      )
      .all();
  const categoryInput = (b) => {
    const r = { name: text(b.name, 50), description: text(b.description, 500) };
    if (r.name.length < 2) fail("Tên danh mục cần ít nhất 2 ký tự.");
    return r;
  };
  app.get("/api/admin/categories", can("categories"), (req, res) =>
    res.json({ categories: categoryList() }),
  );
  app.post("/api/admin/categories", can("categories"), (req, res) => {
    const r = categoryInput(req.body);
    unique(
      () => db.prepare("INSERT INTO categories(name,description) VALUES(?,?)").run(r.name, r.description),
      "Danh mục này đã tồn tại.",
    );
    res.status(201).json({ categories: categoryList() });
  });
  app.put("/api/admin/categories/:id", can("categories"), (req, res) => {
    const r = categoryInput(req.body);
    // Products reference the category by id, so a rename reaches them automatically.
    const u = unique(
      () =>
        db.prepare("UPDATE categories SET name=?,description=? WHERE id=?").run(r.name, r.description, Number(req.params.id)),
      "Danh mục này đã tồn tại.",
    );
    if (!u.changes) fail("Không tìm thấy danh mục.", 404);
    res.json({ categories: categoryList() });
  });
  app.delete("/api/admin/categories/:id", can("categories"), (req, res) => {
    const cat = categoryList().find((x) => x.id === Number(req.params.id));
    if (!cat) fail("Không tìm thấy danh mục.", 404);
    if (cat.products)
      fail(`Danh mục còn ${cat.products} sản phẩm. Hãy chuyển hoặc xóa các sản phẩm đó trước.`, 409);
    db.prepare("DELETE FROM categories WHERE id=?").run(cat.id);
    res.json({ categories: categoryList() });
  });

  // ---- Sản phẩm (UC6.1.1–UC6.1.6)
  function productInput(b) {
    const img = text(b.img, 500);
    const p = {
      name: text(b.name, 100),
      note: text(b.note, 200),
      description: text(b.description, 2000),
      ingredients: text(b.ingredients, 500),
      allergens: text(b.allergens, 300),
      storage: text(b.storage, 300),
      price: b.price,
      img: IMAGES.includes(img) || /^https?:\/\/\S+$/.test(img) ? img : "cake.jpg",
    };
    if (
      p.name.length < 2 ||
      !Number.isInteger(p.price) ||
      p.price < 1000 ||
      p.price > 100000000 ||
      !Number.isInteger(b.stock) ||
      b.stock < 0 ||
      b.stock > 100000
    )
      fail("Nhập tên bánh, giá (số nguyên ≥ 1.000₫) và tồn kho hợp lệ.");
    const cat = db.prepare("SELECT id FROM categories WHERE name=?").get(text(b.type, 50));
    if (!cat) fail("Chọn một danh mục có sẵn.");
    return [
      cat.id, p.name, p.note, p.description, p.ingredients, p.allergens, p.storage, p.price, p.img,
      b.stock, b.active === false ? 0 : 1,
    ];
  }
  const products = () =>
    db
      .prepare(PRODUCTS + " ORDER BY p.id")
      .all()
      .map(({ category_id, ...r }) => ({ ...r, active: !!r.active }));
  app.get("/api/admin/products", can("products"), (req, res) => res.json({ products: products() }));
  app.post("/api/admin/products", can("products"), (req, res) => {
    db.prepare(
      "INSERT INTO products(category_id,name,note,description,ingredients,allergens,storage,price,img,stock,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).run(...productInput(req.body));
    res.status(201).json({ products: products() });
  });
  app.put("/api/admin/products/:id", can("products"), (req, res) => {
    const r = db
      .prepare(
        "UPDATE products SET category_id=?,name=?,note=?,description=?,ingredients=?,allergens=?,storage=?,price=?,img=?,stock=?,active=? WHERE id=?",
      )
      .run(...productInput(req.body), Number(req.params.id));
    if (!r.changes) fail("Không tìm thấy bánh.", 404);
    res.json({ products: products() });
  });
  app.delete("/api/admin/products/:id", can("products"), (req, res) => {
    const id = Number(req.params.id);
    transaction(db, () => {
      if (!db.prepare("SELECT 1 FROM products WHERE id=?").get(id)) fail("Không tìm thấy bánh.", 404);
      // Orders keep their own item snapshot; only live references to the product go.
      for (const t of ["cart", "favorites", "reviews"])
        db.prepare(`DELETE FROM ${t} WHERE product_id=?`).run(id);
      db.prepare("DELETE FROM products WHERE id=?").run(id);
    });
    res.json({ products: products() });
  });

  // ---- Nhập hàng: phiếu nhập cộng tồn kho; phiếu giữ bản chụp tên bánh/người nhập
  // Includes the product picker list: staff may have this permission without "products".
  const purchases = () => ({
    purchases: db
      .prepare("SELECT * FROM purchases ORDER BY created DESC")
      .all()
      .map((p) => ({
        ...p,
        items: db
          .prepare("SELECT product_id id,name,qty,cost FROM purchase_items WHERE purchase_id=? ORDER BY line")
          .all(p.id),
      })),
    products: products().map(({ id, name, stock, active }) => ({ id, name, stock, active })),
  });
  app.get("/api/admin/purchases", can("purchases"), (req, res) => res.json(purchases()));
  app.post("/api/admin/purchases", can("purchases"), (req, res) => {
    const supplier = text(req.body.supplier, 100),
      note = text(req.body.note, 500),
      lines = Array.isArray(req.body.items) ? req.body.items : [];
    if (supplier.length < 2) fail("Nhập tên nhà cung cấp.");
    if (!lines.length || lines.length > 50) fail("Phiếu nhập cần từ 1 đến 50 dòng bánh.");
    transaction(db, () => {
      const items = lines.map((l) => {
        const qty = l?.qty,
          cost = l?.cost;
        if (!Number.isInteger(qty) || qty < 1 || qty > 10000 || !Number.isInteger(cost) || cost < 0 || cost > 100000000)
          fail("Mỗi dòng cần số lượng 1–10.000 và giá nhập là số nguyên không âm.");
        const r = db.prepare("SELECT name FROM products WHERE id=?").get(Number(l.id));
        if (!r) fail("Không tìm thấy bánh trong phiếu nhập.", 404);
        db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(qty, Number(l.id));
        return { id: Number(l.id), name: r.name, qty, cost };
      });
      const id = "PN-" + randomBytes(4).toString("hex").toUpperCase();
      db.prepare("INSERT INTO purchases(id,created,staff,supplier,note,total) VALUES(?,?,?,?,?,?)").run(
        id,
        new Date().toISOString(),
        req.staff.name,
        supplier,
        note,
        items.reduce((n, i) => n + i.qty * i.cost, 0),
      );
      const line = db.prepare(
        "INSERT INTO purchase_items(purchase_id,line,product_id,name,qty,cost) VALUES(?,?,?,?,?,?)",
      );
      items.forEach((i, n) => line.run(id, n + 1, i.id, i.name, i.qty, i.cost));
    });
    res.status(201).json(purchases());
  });

  // ---- Khách hàng (UC3.1–UC3.3, khóa/mở khóa)
  const customers = () =>
    db
      .prepare(
        `SELECT u.id,u.name,u.email,u.phone,u.address,u.locked,
          COUNT(o.id) orders,
          COALESCE(SUM(CASE WHEN o.status!='cancelled' THEN o.total END),0) spent,
          MAX(o.created) lastOrder
         FROM users u LEFT JOIN orders o ON o.user_id=u.id
         GROUP BY u.id ORDER BY u.name`,
      )
      .all()
      .map((u) => ({ ...u, locked: !!u.locked }));
  app.get("/api/admin/customers", can("customers"), (req, res) => res.json({ customers: customers() }));
  app.get("/api/admin/customers/:id", can("customers"), (req, res) => {
    const u = customers().find((x) => x.id === req.params.id);
    if (!u) fail("Không tìm thấy khách hàng.", 404);
    res.json({
      customer: u,
      orders: db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created DESC").all(u.id).map(c.detail),
    });
  });
  const dup = "Email hoặc số điện thoại đã được sử dụng.";
  app.post("/api/admin/customers", can("customers"), (req, res) => {
    const p = c.validateProfile(req.body),
      pw = c.password(req.body.password);
    unique(
      () =>
        db
          .prepare("INSERT INTO users(id,name,email,phone,address,password) VALUES(?,?,?,?,?,?)")
          .run(randomUUID(), p.name, p.email, p.phone, p.address, encode(pw)),
      dup,
    );
    res.status(201).json({ customers: customers() });
  });
  app.put("/api/admin/customers/:id", can("customers"), (req, res) => {
    const p = c.validateProfile(req.body);
    const r = unique(
      () =>
        db
          .prepare("UPDATE users SET name=?,email=?,phone=?,address=? WHERE id=?")
          .run(p.name, p.email, p.phone, p.address, req.params.id),
      dup,
    );
    if (!r.changes) fail("Không tìm thấy khách hàng.", 404);
    res.json({ customers: customers() });
  });
  app.post("/api/admin/customers/:id/lock", can("customers"), (req, res) => {
    const locked = req.body.locked === true;
    transaction(db, () => {
      const r = db.prepare("UPDATE users SET locked=? WHERE id=?").run(locked ? 1 : 0, req.params.id);
      if (!r.changes) fail("Không tìm thấy khách hàng.", 404);
      if (locked) db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
    });
    res.json({ customers: customers() });
  });

  // ---- Đánh giá và phản hồi (UC15)
  app.get("/api/admin/reviews", can("reviews"), (req, res) =>
    res.json({
      reviews: db
        .prepare(
          "SELECT r.id,r.rating,r.content,r.created,r.reply,r.product_id,u.name,p.name product FROM reviews r JOIN users u ON u.id=r.user_id JOIN products p ON p.id=r.product_id ORDER BY r.created DESC",
        )
        .all()
    }),
  );
  app.put("/api/admin/reviews/:id/reply", can("reviews"), (req, res) => {
    const reply = text(req.body.reply, 1000);
    const r = db.prepare("UPDATE reviews SET reply=? WHERE id=?").run(reply || null, text(req.params.id, 100));
    if (!r.changes) fail("Không tìm thấy đánh giá.", 404);
    res.json({ ok: true });
  });
  app.delete("/api/admin/reviews/:id", can("reviews"), adminOnly, (req, res) => {
    const r = db.prepare("DELETE FROM reviews WHERE id=?").run(text(req.params.id, 100));
    if (!r.changes) fail("Không tìm thấy đánh giá.", 404);
    res.json({ ok: true });
  });

  // ---- Nhân viên (UC2.1.1–UC2.3), chỉ quản trị viên
  const staffList = () => db.prepare("SELECT * FROM staff ORDER BY created").all().map(safeStaff);
  function staffInput(b, isNew) {
    const s = {
      name: text(b.name, 100),
      email: email(b.email),
      phone: text(b.phone, 20),
      role: b.role === "admin" ? "admin" : "staff",
      perms: Array.isArray(b.perms) ? b.perms.filter((p) => p in PERMS) : [],
      active: b.active !== false,
    };
    if (s.name.length < 2 || !validEmail(s.email) || (s.phone && !validPhone(s.phone)))
      fail("Nhập họ tên, email hợp lệ và số điện thoại 10 số (nếu có).");
    if (isNew || b.password) s.password = c.password(b.password);
    return s;
  }
  // Never leave the shop without an active admin.
  const keepAdmin = () => {
    if (!db.prepare("SELECT COUNT(*) n FROM staff WHERE role='admin' AND active=1").get().n)
      fail("Hệ thống cần ít nhất một quản trị viên đang hoạt động.", 409);
  };
  app.get("/api/admin/staff", adminOnly, (req, res) => res.json({ staff: staffList() }));
  app.post("/api/admin/staff", adminOnly, (req, res) => {
    const s = staffInput(req.body, true);
    unique(() => createStaff(db, encode, s), "Email này đã được dùng cho nhân viên khác.");
    res.status(201).json({ staff: staffList() });
  });
  app.put("/api/admin/staff/:id", adminOnly, (req, res) => {
    const s = staffInput(req.body, false);
    transaction(db, () => {
      if (!db.prepare("SELECT 1 FROM staff WHERE id=?").get(req.params.id)) fail("Không tìm thấy nhân viên.", 404);
      unique(
        () =>
          db
            .prepare("UPDATE staff SET name=?,email=?,phone=?,role=?,perms=?,active=? WHERE id=?")
            .run(s.name, s.email, s.phone, s.role, JSON.stringify(s.perms), s.active ? 1 : 0, req.params.id),
        "Email này đã được dùng cho nhân viên khác.",
      );
      if (s.password) db.prepare("UPDATE staff SET password=? WHERE id=?").run(encode(s.password), req.params.id);
      if (s.password || !s.active)
        db.prepare("DELETE FROM staff_sessions WHERE staff_id=?").run(req.params.id);
      keepAdmin();
    });
    res.json({ staff: staffList() });
  });
  app.delete("/api/admin/staff/:id", adminOnly, (req, res) => {
    if (req.params.id === req.staff.id) fail("Không thể tự xóa tài khoản đang đăng nhập.", 409);
    transaction(db, () => {
      const r = db.prepare("DELETE FROM staff WHERE id=?").run(req.params.id);
      if (!r.changes) fail("Không tìm thấy nhân viên.", 404);
      keepAdmin();
    });
    res.json({ staff: staffList() });
  });

  // ---- Cài đặt hệ thống (UC8.1–UC8.4), chỉ quản trị viên
  app.get("/api/admin/settings", adminOnly, (req, res) => res.json({ settings: readSettings(db) }));
  app.put("/api/admin/settings", adminOnly, (req, res) => {
    const b = req.body,
      s = {
        storeName: text(b.storeName, 100),
        storeAddress: text(b.storeAddress, 300),
        storePhone: text(b.storePhone, 20),
        storeEmail: email(b.storeEmail),
        storeHours: text(b.storeHours, 100),
        banner: text(b.banner, 300),
        cod: b.cod === true,
        vnpay: b.vnpay === true,
        shippingFee: b.shippingFee,
        freeShippingFrom: b.freeShippingFrom,
        open: b.open === true,
        closedMessage: text(b.closedMessage, 300),
      };
    if (s.storeName.length < 2) fail("Tên cửa hàng không được để trống.");
    if (s.storeEmail && !validEmail(s.storeEmail)) fail("Email cửa hàng không hợp lệ.");
    if (s.storePhone && !/^[0-9 +.-]{8,20}$/.test(s.storePhone)) fail("Số điện thoại cửa hàng không hợp lệ.");
    if (!s.cod && !s.vnpay) fail("Cần bật ít nhất một phương thức thanh toán.");
    for (const k of ["shippingFee", "freeShippingFrom"])
      if (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > 100000000) fail("Phí giao hàng phải là số nguyên không âm.");
    transaction(db, () => {
      const put = db.prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      );
      for (const k of Object.keys(defaultSettings)) put.run(k, JSON.stringify(s[k]));
    });
    res.json({ settings: readSettings(db) });
  });
  app.get("/api/admin/backup", adminOnly, (req, res) => {
    const out = dumpSql(db);
    res.set("Content-Type", "application/sql; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="rookie-backup-${vnDate(Date.now())}.sql"`);
    res.send(out);
  });
}
