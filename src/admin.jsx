import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { api, money, statuses } from "./customer.jsx";
import "./admin.css";

const date = (s) =>
  s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 7 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
const has = (q, ...fields) => !q.trim() || norm(fields.join(" ")).includes(norm(q.trim()));
const next = {
  pending: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["delivered"],
  payment_review: ["processing", "cancelled"],
};
const actionLabel = {
  processing: "Xác nhận đơn",
  shipping: "Bắt đầu giao",
  delivered: "Đã giao xong",
  cancelled: "Hủy đơn",
};
const images = { "hero.jpg": "Bánh kem", "berry.jpg": "Red velvet", "cake.jpg": "Bánh nhỏ", "toast.jpg": "Croissant", "memory.jpg": "Bánh trà", "doughnuts.jpg": "Donut" };

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
// Runs an API action and turns its outcome into a notice line.
function useAction() {
  const [note, setNote] = useState(null);
  const run = useCallback(async (fn, ok) => {
    try {
      const r = await fn();
      setNote(ok ? { ok: true, text: ok } : null);
      return r || true;
    } catch (e) {
      setNote({ ok: false, text: e.message });
      return false;
    }
  }, []);
  const view = note && (
    <p className={note.ok ? "rk-ok" : "rk-error"} role={note.ok ? "status" : "alert"}>
      {note.text}
    </p>
  );
  return [run, view, setNote];
}
function Input({ label, value, onChange, type = "text", wide, options, ...rest }) {
  const props = { value: value ?? "", onChange: (e) => onChange(e.target.value), ...rest };
  return (
    <label className={wide ? "wide" : undefined}>
      {label}
      {type === "textarea" ? (
        <textarea {...props} />
      ) : type === "select" ? (
        <select {...props}>
          {Object.entries(options).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      ) : (
        <input type={type} {...props} />
      )}
    </label>
  );
}
function Check({ label, checked, onChange }) {
  return (
    <label className="rk-check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
const binder = (obj, set) => (k) => ({ value: obj[k], onChange: (v) => set({ ...obj, [k]: v }) });
const Loading = ({ error }) => (error ? <p className="rk-error">{error}</p> : <p className="rk-muted">Đang tải…</p>);

function Login({ onDone }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!f.get("email") || !f.get("password")) return setError("Vui lòng nhập email và mật khẩu.");
    setBusy(true);
    try {
      await api("/admin/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
      onDone();
    } catch (err) {
      setError(err.message);
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
        <p className="rk-story-bottom">TỪ CĂN BẾP NHỎ, GỬI ĐI NHỮNG NIỀM VUI.</p>
      </section>
      <section className="rk-login-side">
        <a className="rk-home-link" href="/">
          ← Về tiệm bánh
        </a>
        <form className="rk-login" onSubmit={submit} noValidate>
          <p className="rk-script">Welcome back, sweet maker.</p>
          <h2>
            GÓC NHỎ <em>quản trị</em>
          </h2>
          <p className="rk-muted">Đăng nhập để chăm chút cho tiệm bánh của bạn.</p>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          {error && <p className="rk-error" role="alert">{error}</p>}
          <button type="submit" className="rk-btn primary" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Vào góc quản trị →"}
          </button>
          <p className="rk-login-hint">
            Dành cho quản trị viên và nhân viên của Rookie. Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.
          </p>
        </form>
        <p className="rk-login-signature">A little care. A lot of love. ♡</p>
      </section>
    </div>
  );
}

function Bars({ series }) {
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const few = series.length <= 12;
  return (
    <>
      <div className="rk-bars" role="img" aria-label="Biểu đồ doanh thu">
        {series.map((d) => (
          <div key={d.label} className="rk-bar" title={`${d.label}: ${money(d.revenue)} · ${d.orders} đơn`}>
            <span style={{ height: (d.revenue / max) * 100 + "%" }} />
          </div>
        ))}
      </div>
      {few ? (
        <div className="rk-bar-labels">
          {series.map((d) => <span key={d.label}>{d.label}</span>)}
        </div>
      ) : (
        <div className="rk-axis">
          <span>{series[0].label}</span>
          <span>{series[series.length - 1].label}</span>
        </div>
      )}
    </>
  );
}
function Kpis({ s }) {
  return (
    <div className="rk-kpis">
      <div><small>Doanh thu</small><b>{money(s.revenue)}</b><em>Đã giao: {money(s.delivered)}</em></div>
      <div><small>Đơn hàng</small><b>{s.orders}</b><em>{s.cancelled} đơn đã hủy</em></div>
      <div><small>Giá trị TB/đơn</small><b>{money(s.average)}</b></div>
      <div><small>Khách hàng</small><b>{s.customers}</b><em>{s.waiting} đơn chờ xử lý</em></div>
    </div>
  );
}
function TopTable({ rows, first = "Bánh" }) {
  return rows.length ? (
    <table>
      <thead><tr><th>{first}</th><th>SL</th><th>Doanh thu</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id ?? p.name}><td>{p.name}</td><td>{p.qty}</td><td>{money(p.revenue)}</td></tr>)}</tbody>
    </table>
  ) : <p className="rk-muted">Chưa có dữ liệu trong kỳ.</p>;
}

function Dashboard() {
  const [s, , error] = useLoad("/admin/stats");
  if (!s) return <Loading error={error} />;
  const total = Object.values(s.statuses).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="rk-head"><h2>Tổng quan</h2><span className="rk-muted">30 ngày gần nhất</span></div>
      <Kpis s={s} />
      <section className="rk-card"><h3>Doanh thu theo ngày</h3><Bars series={s.series} /></section>
      <div className="rk-grid">
        <section className="rk-card"><h3>Bánh bán chạy</h3><TopTable rows={s.top.slice(0, 5)} /></section>
        <section className="rk-card">
          <h3>Trạng thái đơn</h3>
          {total ? Object.entries(s.statuses).map(([k, n]) => (
            <div key={k} className="rk-meter">
              <span>{statuses[k] || k}</span><b>{n}</b>
              <i><i style={{ width: (n / total) * 100 + "%" }} /></i>
            </div>
          )) : <p className="rk-muted">Chưa có đơn trong kỳ.</p>}
        </section>
        <section className="rk-card">
          <h3>Sắp hết hàng (≤ 5)</h3>
          {s.lowStock.length ? (
            <ul className="rk-list">{s.lowStock.map((p) => <li key={p.id}>{p.name}<b className={p.stock ? "" : "danger"}>{p.stock}</b></li>)}</ul>
          ) : <p className="rk-muted">Tồn kho ổn định.</p>}
        </section>
      </div>
    </>
  );
}

function Reports() {
  const [q, setQ] = useState({ from: daysAgo(29), to: today(), group: "day" });
  const [s, , error] = useLoad(`/admin/stats?from=${q.from}&to=${q.to}&group=${q.group}`);
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  const preset = (from, group) => setQ({ from, to: today(), group });
  return (
    <>
      <div className="rk-head">
        <h2>Thống kê doanh thu</h2>
        <label className="rk-inline">Từ <input type="date" value={q.from} max={q.to} onChange={set("from")} /></label>
        <label className="rk-inline">Đến <input type="date" value={q.to} min={q.from} onChange={set("to")} /></label>
        <select value={q.group} onChange={set("group")} aria-label="Nhóm theo">
          <option value="day">Theo ngày</option>
          <option value="month">Theo tháng</option>
          <option value="year">Theo năm</option>
        </select>
      </div>
      <div className="rk-actions rk-presets">
        <button className="rk-btn small" onClick={() => preset(today(), "day")}>Hôm nay</button>
        <button className="rk-btn small" onClick={() => preset(daysAgo(6), "day")}>7 ngày</button>
        <button className="rk-btn small" onClick={() => preset(daysAgo(29), "day")}>30 ngày</button>
        <button className="rk-btn small" onClick={() => preset(today().slice(0, 4) + "-01-01", "month")}>Năm nay</button>
        <button className="rk-btn small" onClick={() => preset(daysAgo(365 * 3), "year")}>3 năm</button>
      </div>
      {!s || s.from !== q.from || s.to !== q.to || s.group !== q.group ? <Loading error={error} /> : (
        <>
          {!s.orders && !s.cancelled && <p className="rk-ok" role="status">Không có đơn hàng nào trong khoảng thời gian này.</p>}
          <Kpis s={s} />
          <section className="rk-card"><h3>Biểu đồ doanh thu</h3><Bars series={s.series} /></section>
          <div className="rk-grid">
            <section className="rk-card"><h3>Theo danh mục</h3><TopTable rows={s.categories} first="Danh mục" /></section>
            <section className="rk-card"><h3>Top 10 bánh bán chạy</h3><TopTable rows={s.top} /></section>
          </div>
          <section className="rk-card rk-scroll">
            <h3>Bảng số liệu</h3>
            <table>
              <thead><tr><th>Thời gian</th><th>Số đơn</th><th>Doanh thu</th></tr></thead>
              <tbody>
                {s.series.filter((r) => r.orders).map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.orders}</td><td>{money(r.revenue)}</td></tr>)}
                <tr className="rk-total"><td>Tổng</td><td>{s.orders}</td><td>{money(s.revenue)}</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

function Orders() {
  const [d, reload, error] = useLoad("/admin/orders");
  const [run, note] = useAction();
  const [f, setF] = useState({ status: "", q: "", from: "", to: "" }),
    [open, setOpen] = useState(null);
  async function move(id, status) {
    if (status === "cancelled" && !confirm(`Hủy đơn ${id}? Tồn kho sẽ được hoàn lại.`)) return;
    if (await run(() => api(`/admin/orders/${id}/status`, { method: "POST", body: { status } }), `Đã cập nhật đơn ${id}: ${statuses[status]}.`)) reload();
  }
  if (!d) return <Loading error={error} />;
  const day = (o) => new Date(Date.parse(o.created) + 7 * 3600000).toISOString().slice(0, 10);
  const list = d.orders.filter(
    (o) =>
      (!f.status || o.status === f.status) &&
      (!f.from || day(o) >= f.from) &&
      (!f.to || day(o) <= f.to) &&
      has(f.q, o.id, o.customer, o.email, o.phone, o.shipping.phone, o.shipping.name),
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="rk-head">
        <h2>Đơn hàng</h2>
        <input placeholder="Mã đơn, tên, email, SĐT…" value={f.q} onChange={set("q")} aria-label="Tìm đơn" />
        <select value={f.status} onChange={set("status")} aria-label="Lọc trạng thái">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="rk-inline">Từ <input type="date" value={f.from} onChange={set("from")} /></label>
        <label className="rk-inline">Đến <input type="date" value={f.to} onChange={set("to")} /></label>
        <button className="rk-btn" onClick={reload}>Làm mới</button>
      </div>
      {note}
      <div className="rk-card rk-scroll">
        <table>
          <thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Khách</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {list.map((o) => (
              <React.Fragment key={o.id}>
                <tr>
                  <td><button className="rk-link" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>{o.id}</button></td>
                  <td>{date(o.created)}</td>
                  <td>{o.customer}</td>
                  <td>{money(o.total)}</td>
                  <td>{o.payment.toUpperCase()} · {o.payment_status === "paid" ? "đã trả" : "chưa trả"}</td>
                  <td><span className={"rk-tag " + o.status}>{statuses[o.status]}</span></td>
                  <td className="rk-actions">
                    {(next[o.status] || []).map((s) => (
                      <button key={s} className={"rk-btn small" + (s === "cancelled" ? " danger" : "")} onClick={() => move(o.id, s)}>{actionLabel[s]}</button>
                    ))}
                  </td>
                </tr>
                {open === o.id && <tr className="rk-detail"><td colSpan={7}><OrderDetail o={o} /></td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rk-muted">Không tìm thấy đơn hàng phù hợp.</p>}
      </div>
    </>
  );
}
function OrderDetail({ o }) {
  return (
    <>
      <p><b>Khách:</b> {o.customer} · {o.email}</p>
      <p><b>Nhận hàng:</b> {o.shipping.name} · {o.shipping.phone} · {o.shipping.address}</p>
      {o.shipping.note && <p><b>Ghi chú:</b> {o.shipping.note}</p>}
      <ul>{o.items.map((i) => <li key={i.id}>{i.qty} × {i.name} — {money(i.qty * i.price)}</li>)}</ul>
      <p>Tạm tính {money(o.subtotal)} · Phí giao {money(o.fee)} · <b>Tổng {money(o.total)}</b></p>
      {o.status === "cancelled" && o.payment_status === "paid" && <p className="rk-error">Đơn đã thanh toán online — cần hoàn tiền cho khách.</p>}
      <p className="rk-muted">{o.events.map((e) => `${statuses[e.status]} (${date(e.created)})`).join(" → ")}</p>
    </>
  );
}

const blankProduct = { name: "", type: "", note: "", description: "", ingredients: "", allergens: "", storage: "", price: 100000, stock: 10, img: "cake.jpg", active: true };
const productStatus = (p) => (!p.active ? "Ngừng kinh doanh" : p.stock ? "Còn hàng" : "Hết hàng");
function Products() {
  const [d, , error, setData] = useLoad("/admin/products");
  const [cats] = useLoad("/admin/categories");
  const [run, note] = useAction();
  const [edit, setEdit] = useState(null),
    [open, setOpen] = useState(null),
    [f, setF] = useState({ q: "", type: "", min: "", max: "", status: "" });
  const save = async (e) => {
    e.preventDefault();
    const body = { ...edit, price: Number(edit.price), stock: Number(edit.stock) };
    const r = await run(() => api("/admin/products" + (edit.id ? "/" + edit.id : ""), { method: edit.id ? "PUT" : "POST", body }), edit.id ? "Đã lưu thay đổi." : "Đã thêm bánh mới.");
    if (r) setData(r), setEdit(null);
  };
  const toggle = async (p) => {
    const r = await run(() => api("/admin/products/" + p.id, { method: "PUT", body: { ...p, active: !p.active } }), p.active ? `Đã ẩn ${p.name}.` : `Đã mở bán lại ${p.name}.`);
    if (r) setData(r);
  };
  const remove = async (p) => {
    if (!confirm(`Xóa vĩnh viễn "${p.name}"? Đánh giá và giỏ hàng chứa bánh này cũng bị xóa. Đơn hàng cũ vẫn giữ nguyên.`)) return;
    const r = await run(() => api("/admin/products/" + p.id, { method: "DELETE" }), `Đã xóa ${p.name}.`);
    if (r) setData(r);
  };
  if (!d) return <Loading error={error} />;
  const catNames = (cats?.categories || []).map((c) => c.name);
  const list = d.products.filter(
    (p) =>
      has(f.q, p.name, p.note, p.type) &&
      (!f.type || p.type === f.type) &&
      (!f.min || p.price >= Number(f.min)) &&
      (!f.max || p.price <= Number(f.max)) &&
      (!f.status || productStatus(p) === f.status),
  );
  const b = edit && binder(edit, setEdit);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const custom = edit && !(edit.img in images);
  return (
    <>
      <div className="rk-head">
        <h2>Sản phẩm</h2>
        <button className="rk-btn primary" onClick={() => setEdit({ ...blankProduct, type: catNames[0] || "" })}>+ Thêm bánh</button>
      </div>
      <div className="rk-head rk-filters">
        <input placeholder="Tìm tên bánh…" value={f.q} onChange={set("q")} aria-label="Tìm bánh" />
        <select value={f.type} onChange={set("type")} aria-label="Lọc danh mục">
          <option value="">Mọi danh mục</option>
          {catNames.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="number" placeholder="Giá từ" value={f.min} onChange={set("min")} aria-label="Giá từ" />
        <input type="number" placeholder="Giá đến" value={f.max} onChange={set("max")} aria-label="Giá đến" />
        <select value={f.status} onChange={set("status")} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          <option>Còn hàng</option><option>Hết hàng</option><option>Ngừng kinh doanh</option>
        </select>
      </div>
      {note}
      {edit && (
        <form className="rk-card rk-form" onSubmit={save}>
          <h3>{edit.id ? "Sửa: " + edit.name : "Bánh mới"}</h3>
          <Input label="Tên bánh *" required {...b("name")} />
          <Input label="Danh mục *" type="select" options={Object.fromEntries(catNames.map((c) => [c, c]))} {...b("type")} />
          <Input label="Giá (₫) *" type="number" min="1000" required {...b("price")} />
          <Input label="Tồn kho *" type="number" min="0" required {...b("stock")} />
          <label>Ảnh
            <select value={custom ? "url" : edit.img} onChange={(e) => setEdit({ ...edit, img: e.target.value === "url" ? "https://" : e.target.value })}>
              {Object.entries(images).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="url">Ảnh từ đường link…</option>
            </select>
          </label>
          {custom && <Input label="Link ảnh (https://…)" type="url" {...b("img")} />}
          <Check label="Đang bán" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
          <Input label="Mô tả ngắn" wide {...b("note")} />
          <Input label="Mô tả" type="textarea" wide {...b("description")} />
          <Input label="Thành phần" {...b("ingredients")} />
          <Input label="Dị ứng" {...b("allergens")} />
          <Input label="Bảo quản" {...b("storage")} />
          <div className="rk-actions wide">
            <button className="rk-btn primary">Hoàn tất</button>
            <button type="button" className="rk-btn" onClick={() => setEdit(null)}>Hủy</button>
          </div>
        </form>
      )}
      <div className="rk-card rk-scroll">
        <table>
          <thead><tr><th>#</th><th>Tên</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <React.Fragment key={p.id}>
                <tr className={p.active ? "" : "rk-off"}>
                  <td>{p.id}</td>
                  <td><button className="rk-link" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>{p.name}</button></td>
                  <td>{p.type}</td><td>{money(p.price)}</td>
                  <td className={p.stock <= 5 ? "danger" : ""}>{p.stock}</td>
                  <td>{productStatus(p)}</td>
                  <td className="rk-actions">
                    <button className="rk-btn small" onClick={() => setEdit({ ...blankProduct, ...p })}>Sửa</button>
                    <button className="rk-btn small" onClick={() => toggle(p)}>{p.active ? "Ẩn" : "Bán lại"}</button>
                    <button className="rk-btn small danger" onClick={() => remove(p)}>Xóa</button>
                  </td>
                </tr>
                {open === p.id && (
                  <tr className="rk-detail"><td colSpan={7}>
                    <p><b>Mô tả ngắn:</b> {p.note || "—"}</p>
                    <p><b>Mô tả:</b> {p.description || "—"}</p>
                    <p><b>Thành phần:</b> {p.ingredients || "—"} · <b>Dị ứng:</b> {p.allergens || "—"} · <b>Bảo quản:</b> {p.storage || "—"}</p>
                    <p><b>Ảnh:</b> {images[p.img] || p.img}</p>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rk-muted">Không tìm thấy sản phẩm phù hợp.</p>}
      </div>
    </>
  );
}

function Categories() {
  const [d, , error, setData] = useLoad("/admin/categories");
  const [run, note] = useAction();
  const [edit, setEdit] = useState(null),
    [q, setQ] = useState("");
  const save = async (e) => {
    e.preventDefault();
    const r = await run(() => api("/admin/categories" + (edit.id ? "/" + edit.id : ""), { method: edit.id ? "PUT" : "POST", body: edit }), edit.id ? "Đã lưu danh mục." : "Đã thêm danh mục.");
    if (r) setData(r), setEdit(null);
  };
  const remove = async (c) => {
    if (!confirm(`Xóa danh mục "${c.name}"?`)) return;
    const r = await run(() => api("/admin/categories/" + c.id, { method: "DELETE" }), `Đã xóa ${c.name}.`);
    if (r) setData(r);
  };
  if (!d) return <Loading error={error} />;
  const b = edit && binder(edit, setEdit);
  const list = d.categories.filter((c) => has(q, c.name, c.description));
  return (
    <>
      <div className="rk-head">
        <h2>Danh mục sản phẩm</h2>
        <input placeholder="Tìm danh mục…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm danh mục" />
        <button className="rk-btn primary" onClick={() => setEdit({ name: "", description: "" })}>+ Thêm danh mục</button>
      </div>
      {note}
      {edit && (
        <form className="rk-card rk-form" onSubmit={save}>
          <h3>{edit.id ? "Sửa: " + edit.name : "Danh mục mới"}</h3>
          <Input label="Tên danh mục *" required {...b("name")} />
          <Input label="Mô tả" type="textarea" wide {...b("description")} />
          {edit.id && <p className="rk-muted wide">Đổi tên sẽ cập nhật luôn danh mục của các bánh thuộc nhóm này.</p>}
          <div className="rk-actions wide">
            <button className="rk-btn primary">Hoàn tất</button>
            <button type="button" className="rk-btn" onClick={() => setEdit(null)}>Hủy</button>
          </div>
        </form>
      )}
      <div className="rk-card rk-scroll">
        <table>
          <thead><tr><th>Tên</th><th>Mô tả</th><th>Số bánh</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.description || "—"}</td><td>{c.products}</td>
                <td className="rk-actions">
                  <button className="rk-btn small" onClick={() => setEdit({ ...c })}>Sửa</button>
                  <button className="rk-btn small danger" onClick={() => remove(c)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rk-muted">Không có danh mục phù hợp.</p>}
      </div>
    </>
  );
}

function CustomerHistory({ id }) {
  const [d, , error] = useLoad("/admin/customers/" + id);
  if (!d) return <Loading error={error} />;
  const c = d.customer;
  return (
    <>
      <p><b>Địa chỉ:</b> {c.address || "—"} · <b>Trạng thái:</b> {c.locked ? "Đã khóa" : "Hoạt động"}</p>
      <h4>Lịch sử mua hàng ({d.orders.length})</h4>
      {d.orders.length ? (
        <ul>{d.orders.map((o) => (
          <li key={o.id}>{o.id} · {date(o.created)} · {money(o.total)} · {statuses[o.status]} — {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</li>
        ))}</ul>
      ) : <p className="rk-muted">Chưa có đơn hàng.</p>}
    </>
  );
}
const blankCustomer = { name: "", email: "", phone: "", address: "", password: "" };
function Customers() {
  const [d, , error, setData] = useLoad("/admin/customers");
  const [run, note] = useAction();
  const [q, setQ] = useState(""),
    [open, setOpen] = useState(null),
    [edit, setEdit] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const r = await run(() => api("/admin/customers" + (edit.id ? "/" + edit.id : ""), { method: edit.id ? "PUT" : "POST", body: edit }), edit.id ? "Đã lưu thông tin khách hàng." : "Đã thêm khách hàng.");
    if (r) setData(r), setEdit(null);
  };
  const lock = async (c) => {
    if (!confirm(c.locked ? `Mở khóa tài khoản ${c.email}?` : `Khóa tài khoản ${c.email}? Khách sẽ bị đăng xuất và không đăng nhập được.`)) return;
    const r = await run(() => api(`/admin/customers/${c.id}/lock`, { method: "POST", body: { locked: !c.locked } }), c.locked ? "Đã mở khóa." : "Đã khóa tài khoản.");
    if (r) setData(r);
  };
  if (!d) return <Loading error={error} />;
  const list = d.customers.filter((c) => has(q, c.name, c.email, c.phone));
  const b = edit && binder(edit, setEdit);
  return (
    <>
      <div className="rk-head">
        <h2>Khách hàng ({d.customers.length})</h2>
        <input placeholder="Tìm tên, email, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm khách" />
        <button className="rk-btn primary" onClick={() => setEdit({ ...blankCustomer })}>+ Thêm khách hàng</button>
      </div>
      {note}
      {edit && (
        <form className="rk-card rk-form" onSubmit={save}>
          <h3>{edit.id ? "Sửa: " + edit.name : "Khách hàng mới"}</h3>
          <Input label="Họ tên *" required {...b("name")} />
          <Input label="Email *" type="email" required {...b("email")} />
          <Input label="Số điện thoại *" type="tel" required {...b("phone")} />
          <Input label="Địa chỉ" {...b("address")} />
          {!edit.id && <Input label="Mật khẩu * (8+ ký tự, có chữ và số)" type="password" required {...b("password")} />}
          <div className="rk-actions wide">
            <button className="rk-btn primary">Hoàn tất</button>
            <button type="button" className="rk-btn" onClick={() => setEdit(null)}>Hủy</button>
          </div>
        </form>
      )}
      <div className="rk-card rk-scroll">
        <table>
          <thead><tr><th>Họ tên</th><th>Email</th><th>SĐT</th><th>Số đơn</th><th>Đã chi</th><th>Đơn gần nhất</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <React.Fragment key={c.id}>
                <tr className={c.locked ? "rk-off" : ""}>
                  <td><button className="rk-link" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>{c.name}</button></td>
                  <td>{c.email}</td><td>{c.phone}</td><td>{c.orders}</td><td>{money(c.spent)}</td><td>{date(c.lastOrder)}</td>
                  <td>{c.locked ? <span className="rk-tag cancelled">Đã khóa</span> : "Hoạt động"}</td>
                  <td className="rk-actions">
                    <button className="rk-btn small" onClick={() => setEdit({ id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address })}>Sửa</button>
                    <button className={"rk-btn small" + (c.locked ? "" : " danger")} onClick={() => lock(c)}>{c.locked ? "Mở khóa" : "Khóa"}</button>
                  </td>
                </tr>
                {open === c.id && <tr className="rk-detail"><td colSpan={8}><CustomerHistory id={c.id} /></td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rk-muted">Không tìm thấy khách hàng phù hợp.</p>}
      </div>
    </>
  );
}

function Reviews({ me }) {
  const [d, reload, error] = useLoad("/admin/reviews");
  const [run, note] = useAction();
  const [drafts, setDrafts] = useState({}),
    [f, setF] = useState({ q: "", rating: "", state: "" });
  const isAdmin = me.role === "admin";
  const reply = async (r) => {
    if (await run(() => api(`/admin/reviews/${r.id}/reply`, { method: "PUT", body: { reply: drafts[r.id] ?? r.reply ?? "" } }), "Đã lưu phản hồi.")) reload();
  };
  const remove = async (r) => {
    if (!confirm(`Xóa đánh giá của ${r.name} về ${r.product}?`)) return;
    if (await run(() => api(`/admin/reviews/${r.id}`, { method: "DELETE" }), "Đã xóa đánh giá.")) reload();
  };
  if (!d) return <Loading error={error} />;
  const all = d.reviews;
  const list = all.filter(
    (r) =>
      has(f.q, r.name, r.product, r.content) &&
      (!f.rating || r.rating === Number(f.rating)) &&
      (!f.state || (f.state === "replied") === !!r.reply),
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const byProduct = Object.values(
    all.reduce((m, r) => {
      m[r.product] ||= { name: r.product, n: 0, sum: 0 };
      m[r.product].n++;
      m[r.product].sum += r.rating;
      return m;
    }, {}),
  );
  return (
    <>
      <div className="rk-head">
        <h2>Đánh giá ({all.length})</h2>
        <input placeholder="Tìm khách, bánh, nội dung…" value={f.q} onChange={set("q")} aria-label="Tìm đánh giá" />
        <select value={f.rating} onChange={set("rating")} aria-label="Lọc số sao">
          <option value="">Mọi số sao</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} sao</option>)}
        </select>
        <select value={f.state} onChange={set("state")} aria-label="Lọc phản hồi">
          <option value="">Tất cả</option>
          <option value="open">Chưa phản hồi</option>
          <option value="replied">Đã phản hồi</option>
        </select>
      </div>
      {isAdmin && all.length > 0 && (
        <div className="rk-grid">
          <section className="rk-card">
            <h3>Thống kê đánh giá</h3>
            <p><b>{(all.reduce((n, r) => n + r.rating, 0) / all.length).toFixed(1)} ★</b> trung bình · {all.filter((r) => r.reply).length}/{all.length} đã phản hồi</p>
            {[5, 4, 3, 2, 1].map((n) => {
              const c = all.filter((r) => r.rating === n).length;
              return (
                <div key={n} className="rk-meter">
                  <span>{n} sao</span><b>{c}</b>
                  <i><i style={{ width: (c / all.length) * 100 + "%" }} /></i>
                </div>
              );
            })}
          </section>
          <section className="rk-card">
            <h3>Theo sản phẩm</h3>
            <table>
              <thead><tr><th>Bánh</th><th>Lượt</th><th>TB</th></tr></thead>
              <tbody>{byProduct.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.n}</td><td>{(p.sum / p.n).toFixed(1)} ★</td></tr>)}</tbody>
            </table>
          </section>
        </div>
      )}
      {note}
      {!list.length && <p className="rk-muted">Không có đánh giá phù hợp.</p>}
      {list.map((r) => (
        <section key={r.id} className="rk-card rk-review">
          <p><b>{r.name}</b> · {r.product} · <span aria-label={r.rating + " sao"}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> · <span className="rk-muted">{date(r.created)}</span></p>
          <p>{r.content}</p>
          <textarea aria-label="Phản hồi" placeholder="Phản hồi của tiệm…" value={drafts[r.id] ?? r.reply ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} />
          <div className="rk-actions">
            <button className="rk-btn small" onClick={() => reply(r)}>Lưu phản hồi</button>
            {isAdmin && <button className="rk-btn small danger" onClick={() => remove(r)}>Xóa đánh giá</button>}
          </div>
        </section>
      ))}
    </>
  );
}

const blankStaff = { name: "", email: "", phone: "", role: "staff", perms: ["orders", "customers", "reviews"], active: true, password: "" };
function Staff({ me, labels }) {
  const [d, , error, setData] = useLoad("/admin/staff");
  const [run, note] = useAction();
  const [edit, setEdit] = useState(null),
    [open, setOpen] = useState(null),
    [q, setQ] = useState("");
  const save = async (e) => {
    e.preventDefault();
    const r = await run(() => api("/admin/staff" + (edit.id ? "/" + edit.id : ""), { method: edit.id ? "PUT" : "POST", body: edit }), edit.id ? "Đã lưu thông tin nhân viên." : "Đã thêm nhân viên.");
    if (r) setData(r), setEdit(null);
  };
  const remove = async (s) => {
    if (!confirm(`Xóa nhân viên ${s.name} (${s.email})?`)) return;
    const r = await run(() => api("/admin/staff/" + s.id, { method: "DELETE" }), `Đã xóa ${s.name}.`);
    if (r) setData(r);
  };
  if (!d) return <Loading error={error} />;
  const b = edit && binder(edit, setEdit);
  const list = d.staff.filter((s) => has(q, s.name, s.email, s.phone));
  const togglePerm = (p, on) => setEdit({ ...edit, perms: on ? [...edit.perms, p] : edit.perms.filter((x) => x !== p) });
  return (
    <>
      <div className="rk-head">
        <h2>Nhân viên ({d.staff.length})</h2>
        <input placeholder="Tìm tên, email, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm nhân viên" />
        <button className="rk-btn primary" onClick={() => setEdit({ ...blankStaff })}>+ Thêm nhân viên</button>
      </div>
      {note}
      {edit && (
        <form className="rk-card rk-form" onSubmit={save}>
          <h3>{edit.id ? "Sửa: " + edit.name : "Nhân viên mới"}</h3>
          <Input label="Họ tên *" required {...b("name")} />
          <Input label="Email đăng nhập *" type="email" required {...b("email")} />
          <Input label="Số điện thoại" type="tel" {...b("phone")} />
          <Input label="Vai trò" type="select" options={{ staff: "Nhân viên", admin: "Quản trị viên" }} {...b("role")} />
          <Input label={edit.id ? "Mật khẩu mới (để trống nếu giữ nguyên)" : "Mật khẩu * (8+ ký tự, có chữ và số)"} type="password" required={!edit.id} {...b("password")} />
          <Check label="Đang hoạt động" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
          <fieldset className="wide rk-perms" disabled={edit.role === "admin"}>
            <legend>Quyền hạn {edit.role === "admin" && "(quản trị viên có toàn quyền)"}</legend>
            {Object.entries(labels).map(([p, label]) => (
              <Check key={p} label={label} checked={edit.role === "admin" || edit.perms.includes(p)} onChange={(v) => togglePerm(p, v)} />
            ))}
          </fieldset>
          <div className="rk-actions wide">
            <button className="rk-btn primary">Hoàn tất</button>
            <button type="button" className="rk-btn" onClick={() => setEdit(null)}>Hủy</button>
          </div>
        </form>
      )}
      <div className="rk-card rk-scroll">
        <table>
          <thead><tr><th>Họ tên</th><th>Email</th><th>SĐT</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {list.map((s) => (
              <React.Fragment key={s.id}>
                <tr className={s.active ? "" : "rk-off"}>
                  <td><button className="rk-link" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>{s.name}</button>{s.id === me.id && " (bạn)"}</td>
                  <td>{s.email}</td><td>{s.phone || "—"}</td>
                  <td>{s.role === "admin" ? "Quản trị viên" : "Nhân viên"}</td>
                  <td>{s.active ? "Hoạt động" : "Vô hiệu hóa"}</td>
                  <td className="rk-actions">
                    <button className="rk-btn small" onClick={() => setEdit({ ...s, password: "" })}>Sửa</button>
                    {s.id !== me.id && <button className="rk-btn small danger" onClick={() => remove(s)}>Xóa</button>}
                  </td>
                </tr>
                {open === s.id && (
                  <tr className="rk-detail"><td colSpan={6}>
                    <p><b>Ngày tạo:</b> {date(s.created)}</p>
                    <p><b>Quyền hạn:</b> {s.perms.map((p) => labels[p]).join(", ") || "Chưa có quyền nào"}</p>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rk-muted">Không tìm thấy nhân viên phù hợp.</p>}
      </div>
    </>
  );
}

function Settings() {
  const [d, , error] = useLoad("/admin/settings");
  const [run, note] = useAction();
  const [s, setS] = useState(null);
  useEffect(() => {
    if (d) setS(d.settings);
  }, [d]);
  if (!s) return <Loading error={error} />;
  const b = binder(s, setS);
  const body = (extra) => ({ ...s, ...extra, shippingFee: Number(s.shippingFee), freeShippingFrom: Number(s.freeShippingFrom) });
  const save = async (e) => {
    e.preventDefault();
    const r = await run(() => api("/admin/settings", { method: "PUT", body: body() }), "Đã lưu cài đặt. Trang khách hàng được cập nhật ngay.");
    if (r) setS(r.settings);
  };
  const toggleOpen = async () => {
    if (!confirm(s.open ? "Tạm đóng cửa hàng? Khách sẽ không thể thêm giỏ hàng và đặt bánh." : "Mở cửa hàng trở lại?")) return;
    const r = await run(() => api("/admin/settings", { method: "PUT", body: body({ open: !s.open }) }), s.open ? "Cửa hàng đã tạm đóng." : "Cửa hàng đã mở lại.");
    if (r) setS(r.settings);
  };
  return (
    <>
      <div className="rk-head"><h2>Cài đặt hệ thống</h2></div>
      {note}
      <section className="rk-card rk-store">
        <div>
          <h3>Trạng thái cửa hàng</h3>
          <p>{s.open ? <span className="rk-tag delivered">Đang mở cửa</span> : <span className="rk-tag cancelled">Đang tạm đóng</span>}</p>
        </div>
        <button className={"rk-btn" + (s.open ? " danger" : " primary")} onClick={toggleOpen}>{s.open ? "Tạm đóng cửa hàng" : "Mở cửa trở lại"}</button>
      </section>
      <form className="rk-card rk-form" onSubmit={save}>
        <h3>Thông tin cửa hàng</h3>
        <Input label="Tên cửa hàng *" required {...b("storeName")} />
        <Input label="Số điện thoại" {...b("storePhone")} />
        <Input label="Email liên hệ" type="email" {...b("storeEmail")} />
        <Input label="Giờ mở cửa" placeholder="7:00 – 21:00 mỗi ngày" {...b("storeHours")} />
        <Input label="Địa chỉ" wide {...b("storeAddress")} />
        <Input label="Banner thông báo trang chủ (để trống nếu không dùng)" wide {...b("banner")} />
        <Input label="Thông báo khi tạm đóng cửa" wide {...b("closedMessage")} />
        <h3>Thanh toán & vận chuyển</h3>
        <Check label="Thanh toán khi nhận hàng (COD)" checked={s.cod} onChange={(v) => setS({ ...s, cod: v })} />
        <Check label="Thanh toán online VNPay" checked={s.vnpay} onChange={(v) => setS({ ...s, vnpay: v })} />
        <Input label="Phí giao hàng (₫)" type="number" min="0" {...b("shippingFee")} />
        <Input label="Miễn phí giao từ (₫)" type="number" min="0" {...b("freeShippingFrom")} />
        <p className="rk-muted wide">VNPay chỉ hoạt động khi máy chủ đã cấu hình mã VNPay trong .env.</p>
        <div className="rk-actions wide"><button className="rk-btn primary">Lưu cài đặt</button></div>
      </form>
      <section className="rk-card">
        <h3>Sao lưu dữ liệu</h3>
        <p className="rk-muted">Tải về file .sql chứa sản phẩm, danh mục, khách hàng, đơn hàng, đánh giá, nhân viên và cài đặt. File có mật khẩu đã mã hóa của các tài khoản — hãy cất giữ cẩn thận.</p>
        <a className="rk-btn" href="/api/admin/backup" download onClick={(e) => !confirm("Tải bản sao lưu dữ liệu cửa hàng?") && e.preventDefault()}>Tải bản sao lưu (.sql)</a>
      </section>
    </>
  );
}

function Account({ me, setMe, onLoggedOut }) {
  const [run, note] = useAction();
  const [info, setInfo] = useState({ name: me.name, phone: me.phone || "" }),
    [pw, setPw] = useState({ current: "", password: "", confirm: "" });
  const saveInfo = async (e) => {
    e.preventDefault();
    const r = await run(() => api("/admin/me", { method: "PATCH", body: info }), "Đã lưu thông tin.");
    if (r) setMe((m) => ({ ...m, user: r.user }));
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (await run(() => api("/admin/me/password", { method: "POST", body: pw }))) {
      alert("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      onLoggedOut();
    }
  };
  return (
    <>
      <div className="rk-head"><h2>Tài khoản của tôi</h2></div>
      {note}
      <section className="rk-card">
        <p><b>Email:</b> {me.email}</p>
        <p><b>Vai trò:</b> {me.role === "admin" ? "Quản trị viên" : "Nhân viên"}</p>
        <p><b>Ngày tạo:</b> {date(me.created)}</p>
      </section>
      <form className="rk-card rk-form" onSubmit={saveInfo}>
        <h3>Thông tin cá nhân</h3>
        <Input label="Họ tên" required {...binder(info, setInfo)("name")} />
        <Input label="Số điện thoại" type="tel" {...binder(info, setInfo)("phone")} />
        <div className="rk-actions wide"><button className="rk-btn primary">Lưu</button></div>
      </form>
      <form className="rk-card rk-form" onSubmit={savePw}>
        <h3>Đổi mật khẩu</h3>
        <Input label="Mật khẩu hiện tại" type="password" required autoComplete="current-password" {...binder(pw, setPw)("current")} />
        <Input label="Mật khẩu mới (8+ ký tự, có chữ và số)" type="password" required autoComplete="new-password" {...binder(pw, setPw)("password")} />
        <Input label="Nhập lại mật khẩu mới" type="password" required autoComplete="new-password" {...binder(pw, setPw)("confirm")} />
        <div className="rk-actions wide"><button className="rk-btn primary">Đổi mật khẩu</button></div>
      </form>
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
        Trang gặp lỗi: {String(this.state.error.message || this.state.error)}. Hãy tải lại trang hoặc cập nhật trình duyệt.
      </p>
    ) : this.props.children;
  }
}
// [label, component, who may open it]
const tabs = {
  dashboard: ["Tổng quan", Dashboard, "stats"],
  reports: ["Thống kê", Reports, "stats"],
  orders: ["Đơn hàng", Orders, "orders"],
  products: ["Sản phẩm", Products, "products"],
  categories: ["Danh mục", Categories, "categories"],
  customers: ["Khách hàng", Customers, "customers"],
  reviews: ["Đánh giá", Reviews, "reviews"],
  staff: ["Nhân viên", Staff, "admin"],
  settings: ["Cài đặt", Settings, "admin"],
  account: ["Tài khoản", Account, "any"],
};
function Admin() {
  // Always start logged out: a reload or revisit must show the login form again.
  const [me, setMe] = useState({ user: null }),
    [tab, setTab] = useState(null);
  const check = useCallback(() => api("/admin/me").then(setMe).catch(() => setMe({ user: null })), []);
  // Leaving the page (F5, closing the tab, navigating away) ends the server session too.
  useEffect(() => {
    if (!me.user) return;
    const end = () => navigator.sendBeacon("/api/admin/logout");
    addEventListener("pagehide", end);
    return () => removeEventListener("pagehide", end);
  }, [me.user]);
  if (!me.user) return <Login onDone={check} />;
  const u = me.user;
  const allowed = Object.keys(tabs).filter((k) => {
    const need = tabs[k][2];
    return need === "any" || (need === "admin" ? u.role === "admin" : u.perms.includes(need));
  });
  const current = allowed.includes(tab) ? tab : allowed[0];
  const loggedOut = () => setMe({ user: null });
  const logout = () => confirm("Đăng xuất khỏi trang quản trị?") && api("/admin/logout", { method: "POST" }).finally(loggedOut);
  const [label, Page] = tabs[current];
  const home = current === allowed[0];
  return (
    <div className="rk-shell">
      <aside className="rk-sidebar">
        <button className="rk-logo rk-wordmark" onClick={() => setTab(allowed[0])}>
          rookie<small>BAKERY & LITTLE JOYS</small>
        </button>
        <p className="rk-sidebar-label">GÓC QUẢN TRỊ</p>
        <nav aria-label="Quản trị Rookie">
          {allowed.map((k, i) => (
            <button key={k} className={current === k ? "on" : ""} aria-current={current === k ? "page" : undefined} onClick={() => setTab(k)}>
              <span className="rk-nav-number">{String(i + 1).padStart(2, "0")}</span>
              {tabs[k][0]}
              <span className="rk-nav-arrow" aria-hidden="true">→</span>
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
          <span className="rk-avatar" aria-hidden="true">{u.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{u.name}</strong>
            <small>{u.role === "admin" ? "Quản trị viên" : "Nhân viên"}</small>
            <button className="rk-link" onClick={logout}>Đăng xuất →</button>
          </div>
        </div>
      </aside>
      <main>
        <header className="rk-topbar">
          <p>
            Rookie Bakery <span>/</span> {label}
          </p>
          <a href="/">Ghé trang chủ ↗</a>
        </header>
        <section className="rk-page-banner">
          <div>
            <p className="rk-eyebrow">A LITTLE CARE, A LOT OF LOVE</p>
            <h1>
              {home ? (
                <>
                  CHÀO NGÀY MỚI, <em>{u.name}.</em>
                </>
              ) : (
                <>
                  {label} <em>của Rookie.</em>
                </>
              )}
            </h1>
            <p>{home ? "Cùng chăm chút cho những niềm vui ngọt ngào hôm nay." : "Mọi điều nhỏ bé, đều xứng đáng được chăm chút."}</p>
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
          <Guard key={current}>
            <Page me={u} labels={me.perms} setMe={setMe} onLoggedOut={loggedOut} />
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
