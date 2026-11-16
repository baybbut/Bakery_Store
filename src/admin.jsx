import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { api, money, statuses } from "./customer.jsx";
import "./admin.css";

const date = (s) =>
  s
    ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
const next = {
  pending: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["delivered"],
  payment_review: ["processing", "cancelled"],
};
const actionLabel = {
  processing: "Xác nhận & chuẩn bị",
  shipping: "Bắt đầu giao",
  delivered: "Đã giao xong",
  cancelled: "Hủy đơn",
};
const tabs = {
  dashboard: "Tổng quan",
  orders: "Đơn hàng",
  products: "Sản phẩm",
  customers: "Khách hàng",
  reviews: "Đánh giá",
};

function useLoad(path) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const reload = useCallback(
    () =>
      api(path)
        .then((d) => (setData(d), setError("")))
        .catch((e) => setError(e.message)),
    [path],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  return [data, reload, error, setData];
}

function Login({ onDone }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("/admin/login", {
        method: "POST",
        body: { email: f.get("email"), password: f.get("password") },
      });
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rk-login-page">
      <section className="rk-login-story" aria-label="Rookie Bakery">
        <a className="rk-wordmark" href="/">
          rookie<small>BAKERY & LITTLE JOYS</small>
        </a>
        <p className="rk-eyebrow">BEHIND EVERY SWEET LITTLE MOMENT</p>
        <h1>
          MỘT CHÚT BÁNH.
          <br />
          THẬT NHIỀU <em>chăm chút.</em>
        </h1>
        <div className="rk-login-photo">
          <span className="rk-tape" />
          <div role="img" aria-label="Bánh ngọt thủ công Rookie" />
          <p>made with butter & love.</p>
        </div>
        <p className="rk-story-bottom">
          TỪ CĂN BẾP NHỎ, GỬI ĐI NHỮNG NIỀM VUI.
        </p>
      </section>
      <section className="rk-login-side">
        <a className="rk-home-link" href="/">
          ← Về tiệm bánh
        </a>
        <form className="rk-login" onSubmit={submit}>
          <p className="rk-script">Welcome back, sweet maker.</p>
          <h2>
            GÓC NHỎ <em>quản trị</em>
          </h2>
          <p className="rk-muted">
            Đăng nhập để chăm chút cho tiệm bánh của bạn.
          </p>
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="rk-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="rk-btn primary" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Vào góc quản trị →"}
          </button>
          <p className="rk-login-hint">
            Dành cho quản trị viên được cấp quyền của Rookie.
          </p>
        </form>
        <p className="rk-login-signature">A little care. A lot of love. ♡</p>
      </section>
    </div>
  );
}

function Bars({ series, value, format }) {
  const max = Math.max(1, ...series.map((d) => d[value]));
  return (
    <div
      className="rk-bars"
      role="img"
      aria-label="Biểu đồ doanh thu theo ngày"
    >
      {series.map((d) => (
        <div
          key={d.day}
          className="rk-bar"
          title={`${d.day}: ${format(d[value])} · ${d.orders} đơn`}
        >
          <span style={{ height: (d[value] / max) * 100 + "%" }} />
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const [days, setDays] = useState(30);
  const [s, , error] = useLoad("/admin/stats?days=" + days);
  if (error) return <p className="rk-error">{error}</p>;
  if (!s) return <p>Đang tải…</p>;
  const total = Object.values(s.statuses).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="rk-head">
        <h2>Tổng quan</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Khoảng thời gian"
        >
          <option value={7}>7 ngày</option>
          <option value={30}>30 ngày</option>
          <option value={90}>90 ngày</option>
        </select>
      </div>
      <div className="rk-kpis">
        <div>
          <small>Doanh thu</small>
          <b>{money(s.revenue)}</b>
          <em>Đã giao: {money(s.delivered)}</em>
        </div>
        <div>
          <small>Đơn hàng</small>
          <b>{s.orders}</b>
          <em>Không tính đơn hủy</em>
        </div>
        <div>
          <small>Giá trị TB/đơn</small>
          <b>{money(s.average)}</b>
        </div>
        <div>
          <small>Khách hàng</small>
          <b>{s.customers}</b>
          <em>{s.waiting} đơn chờ xử lý</em>
        </div>
      </div>
      <section className="rk-card">
        <h3>Doanh thu theo ngày</h3>
        <Bars series={s.series} value="revenue" format={money} />
        <div className="rk-axis">
          <span>{s.series[0].day}</span>
          <span>{s.series[s.series.length - 1].day}</span>
        </div>
      </section>
      <div className="rk-grid">
        <section className="rk-card">
          <h3>Bánh bán chạy</h3>
          {s.top.length ? (
            <table>
              <thead>
                <tr>
                  <th>Bánh</th>
                  <th>SL</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {s.top.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.qty}</td>
                    <td>{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rk-muted">Chưa có đơn trong kỳ.</p>
          )}
        </section>
        <section className="rk-card">
          <h3>Trạng thái đơn</h3>
          {total ? (
            Object.entries(s.statuses).map(([k, n]) => (
              <div key={k} className="rk-meter">
                <span>{statuses[k] || k}</span>
                <b>{n}</b>
                <i>
                  <i style={{ width: (n / total) * 100 + "%" }} />
                </i>
              </div>
            ))
          ) : (
            <p className="rk-muted">Chưa có đơn trong kỳ.</p>
          )}
        </section>
        <section className="rk-card">
          <h3>Sắp hết hàng (≤ 5)</h3>
          {s.lowStock.length ? (
            <ul className="rk-list">
              {s.lowStock.map((p) => (
                <li key={p.id}>
                  {p.name}
                  <b className={p.stock ? "" : "danger"}>{p.stock}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rk-muted">Tồn kho ổn định.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Orders() {
  const [d, reload, error] = useLoad("/admin/orders");
  const [filter, setFilter] = useState(""),
    [q, setQ] = useState(""),
    [open, setOpen] = useState(null),
    [msg, setMsg] = useState("");
  async function move(id, status) {
    if (
      status === "cancelled" &&
      !confirm("Hủy đơn " + id + "? Tồn kho sẽ được hoàn lại.")
    )
      return;
    try {
      await api(`/admin/orders/${id}/status`, {
        method: "POST",
        body: { status },
      });
      setMsg("");
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  }
  if (error) return <p className="rk-error">{error}</p>;
  if (!d) return <p>Đang tải…</p>;
  const needle = q.trim().toLowerCase();
  const list = d.orders.filter(
    (o) =>
      (!filter || o.status === filter) &&
      (!needle ||
        (o.id + o.customer + o.email + o.shipping.phone)
          .toLowerCase()
          .includes(needle)),
  );
  return (
    <>
      <div className="rk-head">
        <h2>Đơn hàng</h2>
        <input
          placeholder="Tìm mã đơn, khách, SĐT…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm đơn"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Lọc trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(statuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="rk-btn" onClick={reload}>
          Làm mới
        </button>
      </div>
      {msg && (
        <p className="rk-error" role="alert">
          {msg}
        </p>
      )}
      <div className="rk-card rk-scroll">
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Ngày đặt</th>
              <th>Khách</th>
              <th>Tổng</th>
              <th>Thanh toán</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <React.Fragment key={o.id}>
                <tr>
                  <td>
                    <button
                      className="rk-link"
                      onClick={() => setOpen(open === o.id ? null : o.id)}
                      aria-expanded={open === o.id}
                    >
                      {o.id}
                    </button>
                  </td>
                  <td>{date(o.created)}</td>
                  <td>{o.customer}</td>
                  <td>{money(o.total)}</td>
                  <td>
                    {o.payment.toUpperCase()} ·{" "}
                    {o.payment_status === "paid" ? "đã trả" : "chưa trả"}
                  </td>
                  <td>
                    <span className={"rk-tag " + o.status}>
                      {statuses[o.status]}
                    </span>
                  </td>
                  <td className="rk-actions">
                    {(next[o.status] || []).map((s) => (
                      <button
                        key={s}
                        className={
                          "rk-btn small" + (s === "cancelled" ? " danger" : "")
                        }
                        onClick={() => move(o.id, s)}
                      >
                        {actionLabel[s]}
                      </button>
                    ))}
                  </td>
                </tr>
                {open === o.id && (
                  <tr className="rk-detail">
                    <td colSpan={7}>
                      <p>
                        <b>Nhận hàng:</b> {o.shipping.name} · {o.shipping.phone}{" "}
                        · {o.shipping.address}
                      </p>
                      {o.shipping.note && (
                        <p>
                          <b>Ghi chú:</b> {o.shipping.note}
                        </p>
                      )}
                      <ul>
                        {o.items.map((i) => (
                          <li key={i.id}>
                            {i.qty} × {i.name} — {money(i.qty * i.price)}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Tạm tính {money(o.subtotal)} · Phí giao {money(o.fee)} ·{" "}
                        <b>Tổng {money(o.total)}</b>
                      </p>
                      {o.status === "cancelled" &&
                        o.payment_status === "paid" && (
                          <p className="rk-error">
                            Đơn đã thanh toán online — cần hoàn tiền cho khách.
                          </p>
                        )}
                      <p className="rk-muted">
                        {o.events
                          .map(
                            (e) => `${statuses[e.status]} (${date(e.created)})`,
                          )
                          .join(" → ")}
                      </p>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rk-muted">Không có đơn phù hợp.</p>}
      </div>
    </>
  );
}

const blank = {
  name: "",
  type: "Bánh kem",
  note: "",
  description: "",
  ingredients: "",
  allergens: "",
  storage: "",
  price: 100000,
  stock: 10,
  img: "cake.jpg",
  active: true,
};
function Products() {
  const [d, , error, setData] = useLoad("/admin/products");
  const [edit, setEdit] = useState(null),
    [msg, setMsg] = useState("");
  async function save(e) {
    e.preventDefault();
    try {
      const body = {
        ...edit,
        price: Number(edit.price),
        stock: Number(edit.stock),
      };
      setData(
        await api("/admin/products" + (edit.id ? "/" + edit.id : ""), {
          method: edit.id ? "PUT" : "POST",
          body,
        }),
      );
      setEdit(null);
      setMsg("");
    } catch (err) {
      setMsg(err.message);
    }
  }
  async function toggle(p) {
    try {
      setData(
        await api("/admin/products/" + p.id, {
          method: "PUT",
          body: { ...p, active: !p.active },
        }),
      );
    } catch (err) {
      setMsg(err.message);
    }
  }
  if (error) return <p className="rk-error">{error}</p>;
  if (!d) return <p>Đang tải…</p>;
  const field = (k, label, type = "text") => (
    <label className={type === "textarea" ? "wide" : undefined}>
      {label}
      {type === "textarea" ? (
        <textarea
          value={edit[k]}
          onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
        />
      ) : (
        <input
          type={type}
          value={edit[k]}
          required={["name", "type", "price", "stock"].includes(k)}
          onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <>
      <div className="rk-head">
        <h2>Sản phẩm</h2>
        <button
          className="rk-btn primary"
          onClick={() => setEdit({ ...blank })}
        >
          + Thêm bánh
        </button>
      </div>
      {msg && (
        <p className="rk-error" role="alert">
          {msg}
        </p>
      )}
      {edit && (
        <form className="rk-card rk-form" onSubmit={save}>
          <h3>{edit.id ? "Sửa: " + edit.name : "Bánh mới"}</h3>
          {field("name", "Tên bánh")}
          {field("type", "Loại bánh")}
          {field("price", "Giá (₫)", "number")}
          {field("stock", "Tồn kho", "number")}
          <label>
            Ảnh
            <select
              value={edit.img}
              onChange={(e) => setEdit({ ...edit, img: e.target.value })}
            >
              <option value="hero.jpg">Bánh chocolate</option>
              <option value="berry.jpg">Bánh dâu</option>
              <option value="cake.jpg">Bánh lát</option>
              <option value="toast.jpg">Bánh nướng</option>
            </select>
          </label>
          {field("note", "Mô tả ngắn")}
          {field("description", "Mô tả", "textarea")}
          {field("ingredients", "Thành phần")}
          {field("allergens", "Dị ứng")}
          {field("storage", "Bảo quản")}
          <div className="rk-actions">
            <button className="rk-btn primary">Lưu</button>
            <button
              type="button"
              className="rk-btn"
              onClick={() => setEdit(null)}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
      <div className="rk-card rk-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tên</th>
              <th>Loại</th>
              <th>Giá</th>
              <th>Tồn kho</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.products.map((p) => (
              <tr key={p.id} className={p.active ? "" : "rk-off"}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td>{p.type}</td>
                <td>{money(p.price)}</td>
                <td className={p.stock <= 5 ? "danger" : ""}>{p.stock}</td>
                <td>{p.active ? "Đang bán" : "Ngừng bán"}</td>
                <td className="rk-actions">
                  <button
                    className="rk-btn small"
                    onClick={() => setEdit({ ...p })}
                  >
                    Sửa
                  </button>
                  <button className="rk-btn small" onClick={() => toggle(p)}>
                    {p.active ? "Ẩn" : "Bán lại"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Customers() {
  const [d, , error] = useLoad("/admin/customers");
  const [q, setQ] = useState("");
  if (error) return <p className="rk-error">{error}</p>;
  if (!d) return <p>Đang tải…</p>;
  const needle = q.trim().toLowerCase();
  const list = d.customers.filter((c) =>
    (c.name + c.email + c.phone).toLowerCase().includes(needle),
  );
  return (
    <>
      <div className="rk-head">
        <h2>Khách hàng ({d.customers.length})</h2>
        <input
          placeholder="Tìm tên, email, SĐT…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm khách"
        />
      </div>
      <div className="rk-card rk-scroll">
        <table>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Email</th>
              <th>SĐT</th>
              <th>Số đơn</th>
              <th>Đã chi</th>
              <th>Đơn gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td>{c.orders}</td>
                <td>{money(c.spent)}</td>
                <td>{date(c.lastOrder)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Reviews() {
  const [d, reload, error] = useLoad("/admin/reviews");
  const [drafts, setDrafts] = useState({}),
    [msg, setMsg] = useState("");
  async function reply(r) {
    try {
      await api(`/admin/reviews/${r.id}/reply`, {
        method: "PUT",
        body: { reply: drafts[r.id] ?? r.reply ?? "" },
      });
      setMsg("Đã lưu phản hồi.");
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  }
  if (error) return <p className="rk-error">{error}</p>;
  if (!d) return <p>Đang tải…</p>;
  return (
    <>
      <div className="rk-head">
        <h2>Đánh giá ({d.reviews.length})</h2>
      </div>
      {msg && (
        <p className="rk-muted" role="status">
          {msg}
        </p>
      )}
      {!d.reviews.length && <p className="rk-muted">Chưa có đánh giá.</p>}
      {d.reviews.map((r) => (
        <section key={r.id} className="rk-card rk-review">
          <p>
            <b>{r.name}</b> · {r.product} ·{" "}
            <span aria-label={r.rating + " sao"}>
              {"★".repeat(r.rating)}
              {"☆".repeat(5 - r.rating)}
            </span>{" "}
            · <span className="rk-muted">{date(r.created)}</span>
          </p>
          <p>{r.content}</p>
          <textarea
            aria-label="Phản hồi"
            placeholder="Phản hồi của tiệm…"
            value={drafts[r.id] ?? r.reply ?? ""}
            onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })}
          />
          <button className="rk-btn small" onClick={() => reply(r)}>
            Lưu phản hồi
          </button>
        </section>
      ))}
    </>
  );
}

// Show the error instead of a blank page when a tab crashes (e.g. an old browser).
class Guard extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <p className="rk-error" role="alert">
        Trang gặp lỗi: {String(this.state.error.message || this.state.error)}.
        Hãy cập nhật trình duyệt (Safari ≥ 15.4, hoặc Chrome/Edge/Firefox mới)
        rồi tải lại.
      </p>
    ) : (
      this.props.children
    );
  }
}
const pages = {
  dashboard: Dashboard,
  orders: Orders,
  products: Products,
  customers: Customers,
  reviews: Reviews,
};
function Admin() {
  // Always start logged out: a reload or revisit must show the login form again.
  const [me, setMe] = useState({ user: null }),
    [tab, setTab] = useState("dashboard");
  const check = useCallback(
    () =>
      api("/admin/me")
        .then(setMe)
        .catch(() => setMe({ user: null })),
    [],
  );
  // Leaving the page (F5, closing the tab, navigating away) ends the server session too.
  useEffect(() => {
    if (!me.user) return;
    const end = () => navigator.sendBeacon("/api/admin/logout");
    addEventListener("pagehide", end);
    return () => removeEventListener("pagehide", end);
  }, [me.user]);
  if (!me.user) return <Login onDone={check} />;
  const logout = () => api("/admin/logout", { method: "POST" }).then(check);
  const Page = pages[tab];
  return (
    <div className="rk-shell">
      <aside className="rk-sidebar">
        <button
          className="rk-logo rk-wordmark"
          onClick={() => setTab("dashboard")}
        >
          rookie<small>BAKERY & LITTLE JOYS</small>
        </button>
        <p className="rk-sidebar-label">GÓC QUẢN TRỊ</p>
        <nav aria-label="Quản trị Rookie">
          {Object.entries(tabs).map(([k, v], i) => (
            <button
              key={k}
              className={tab === k ? "on" : ""}
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
            >
              <span className="rk-nav-number">0{i + 1}</span>
              {v}
              <span className="rk-nav-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </nav>
        <div className="rk-sidebar-note">
          <span className="rk-tape" />
          <p>
            Mỗi chiếc bánh,
            <br />
            một niềm vui nhỏ.
          </p>
          <span aria-hidden="true">♡</span>
        </div>
        <div className="rk-user">
          <span className="rk-avatar" aria-hidden="true">
            {me.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{me.user.name}</strong>
            <small>Quản trị viên</small>
            <button className="rk-link" onClick={logout}>
              Đăng xuất →
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="rk-topbar">
          <p>
            Rookie Bakery <span>/</span> {tabs[tab]}
          </p>
          <a href="/">Ghé trang chủ ↗</a>
        </header>
        <section className="rk-page-banner">
          <div>
            <p className="rk-eyebrow">A LITTLE CARE, A LOT OF LOVE</p>
            <h1>
              {tab === "dashboard" ? (
                <>
                  CHÀO NGÀY MỚI, <em>{me.user.name}.</em>
                </>
              ) : (
                <>
                  {tabs[tab]} <em>của Rookie.</em>
                </>
              )}
            </h1>
            <p>
              {tab === "dashboard"
                ? "Cùng chăm chút cho những niềm vui ngọt ngào hôm nay."
                : "Mọi điều nhỏ bé, đều xứng đáng được chăm chút."}
            </p>
          </div>
          <span className="rk-banner-stamp" aria-hidden="true">
            made with
            <br />
            <em>love</em>
            <br />
            ROOKIE BAKERY
          </span>
        </section>
        <div className="rk-page-content">
          <Guard key={tab}>
            <Page />
          </Guard>
        </div>
        <footer className="rk-footer">
          <span>Rookie · Góc nhỏ quản trị</span>
          <span>Made with butter & love ♡</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Admin />);
