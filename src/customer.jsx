import React, { useState, useEffect, useCallback, useRef } from "react";
export const money = (n) => n.toLocaleString("vi-VN") + "₫";
export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw Error("Không kết nối được máy chủ. Vui lòng thử lại.");
  }
  const data = await res
    .json()
    .catch(() => ({ error: "Máy chủ chưa sẵn sàng. Vui lòng thử lại." }));
  if (!res.ok) throw Object.assign(Error(data.error), { status: res.status });
  return data;
}
export function useCustomer() {
  const [user, setUser] = useState(null),
    [cart, setCart] = useState([]),
    [products, setProducts] = useState([]),
    [favorites, setFavorites] = useState([]),
    [view, setView] = useState(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [config, setConfig] = useState({
      onlinePayment: false,
      cod: true,
      open: true,
      shippingFee: 25000,
      freeShippingFrom: 300000,
    }),
    [busy, setBusy] = useState(false);
  const timer = useRef();
  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  const loadProducts = useCallback(async () => {
    const d = await api("/products");
    setProducts(d.products);
  }, []);
  const sync = useCallback(async () => {
    const [{ user: u }, conf] = await Promise.all([
      api("/auth/me"),
      api("/config"),
    ]);
    setUser(u);
    setConfig(conf);
    if (u) {
      const [c, f] = await Promise.all([api("/cart"), api("/favorites")]);
      setCart(c.items);
      setFavorites(f.ids);
    } else {
      setCart([]);
      setFavorites([]);
    }
  }, []);
  useEffect(() => {
    Promise.all([loadProducts(), sync()])
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
    const params = new URLSearchParams(location.search);
    if (params.has("reset"))
      setView({ type: "reset", token: params.get("reset") });
    if (params.has("payment")) {
      setView({ type: "orders" });
      notify(
        params.get("payment") === "review"
          ? "Đã ghi nhận thanh toán nhưng bánh không còn đủ. Tiệm cần liên hệ để xử lý hoặc hoàn tiền."
          : params.get("payment") === "success"
            ? "Thanh toán thành công. Đơn bánh đã được lưu."
            : "Thanh toán chưa thành công. Giỏ bánh được giữ nguyên.",
      );
    }
    if (params.has("payment"))
      history.replaceState(null, "", location.pathname);
    return () => clearTimeout(timer.current);
  }, [loadProducts, sync, notify]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setView(null);
    };
    document.addEventListener("keydown", onKey);
    if (view) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
        document.removeEventListener("keydown", onKey);
      };
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [view]);
  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e.message);
      if (e.status === 401) {
        await sync().catch(() => {});
        setView({ type: "login" });
      }
    } finally {
      setBusy(false);
    }
  }
  function requireUser(type) {
    setView({ type: user ? type : "login" });
  }
  function add(p, qty = 1) {
    if (!user) {
      setView({ type: "login" });
      notify("Đăng nhập để lưu giỏ bánh của bạn.");
      return;
    }
    run(async () => {
      const current = cart.find((i) => i.id === p.id)?.qty || 0;
      const d = await api("/cart/" + p.id, {
        method: "PUT",
        body: { qty: current + qty },
      });
      setCart(d.items);
      notify("Đã thêm bánh vào giỏ ♡");
    });
  }
  function change(id, qty) {
    run(async () => {
      const d = await api("/cart/" + id, { method: "PUT", body: { qty } });
      setCart(d.items);
    });
  }
  function favorite(p) {
    if (!user) return setView({ type: "login" });
    run(async () => {
      const saved = !favorites.includes(p.id);
      await api("/favorites/" + p.id, { method: "PUT", body: { saved } });
      setFavorites((f) =>
        saved ? [...f, p.id] : f.filter((id) => id !== p.id),
      );
      notify(saved ? "Đã lưu bánh yêu thích." : "Đã bỏ lưu bánh.");
    });
  }
  return {
    user,
    setUser,
    cart,
    setCart,
    products,
    loadProducts,
    favorites,
    view,
    setView,
    toast,
    notify,
    error,
    setError,
    ready,
    config,
    busy,
    run,
    sync,
    requireUser,
    add,
    change,
    favorite,
  };
}
function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function ErrorBox({ message }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
function Form({
  onSubmit,
  children,
  className = "",
  submitLabel = "Xác nhận",
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className={"customer-form " + className}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        setBusy(true);
        const data = Object.fromEntries(new FormData(e.currentTarget));
        try {
          await onSubmit(data);
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <ErrorBox message={error} />
        <button className="solid-button" type="submit">
          {busy ? "Đang xử lý…" : submitLabel}
        </button>
      </fieldset>
    </form>
  );
}
export const statuses = {
  pending: "Chờ xác nhận",
  processing: "Đang chuẩn bị",
  shipping: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
  payment_review: "Cần đối soát thanh toán",
};
const date = (s) =>
  new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
function Auth({ c }) {
  const type = c.view.type,
    isRegister = type === "register",
    isForgot = type === "forgot",
    isReset = type === "reset";
  const [message, setMessage] = useState("");
  return (
    <>
      <p className="red-script">Welcome to our little bakery</p>
      <h2>
        {isRegister
          ? "TẠO TÀI KHOẢN"
          : isForgot
            ? "QUÊN MẬT KHẨU"
            : isReset
              ? "ĐẶT LẠI MẬT KHẨU"
              : "MỪNG BẠN TRỞ LẠI"}
      </h2>
      {message ? (
        <div className="success-message" role="status">
          {message}
          <button
            className="text-link"
            onClick={() => c.setView({ type: "login" })}
          >
            Quay lại đăng nhập
          </button>
        </div>
      ) : (
        <Form
          onSubmit={async (data) => {
            if (isForgot) {
              const r = await api("/auth/forgot", {
                method: "POST",
                body: data,
              });
              setMessage(r.message);
              return;
            }
            if (isReset) {
              await api("/auth/reset", {
                method: "POST",
                body: { ...data, token: c.view.token },
              });
              await c.sync();
              history.replaceState(null, "", location.pathname);
              setMessage(
                "Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.",
              );
              return;
            }
            const r = await api(
              "/auth/" + (isRegister ? "register" : "login"),
              { method: "POST", body: data },
            );
            c.setUser(r.user);
            await c.sync();
            c.setView(null);
            c.notify(
              isRegister
                ? "Chào mừng bạn đến với Rookie ♡"
                : "Đăng nhập thành công.",
            );
          }}
        >
          {isRegister && (
            <>
              <Field
                label="Họ và tên"
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
              <Field
                label="Số điện thoại"
                name="phone"
                type="tel"
                required
                pattern="0[0-9]{9}"
                placeholder="0901234567"
                autoComplete="tel"
              />
            </>
          )}
          {!isReset && (
            <Field
              label="Email"
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
            />
          )}
          {!isForgot && (
            <Field
              label="Mật khẩu"
              name="password"
              type="password"
              required
              minLength={isRegister || isReset ? 8 : 1}
              maxLength={128}
              autoComplete={
                isRegister || isReset ? "new-password" : "current-password"
              }
            />
          )}
          {(isRegister || isReset) && (
            <>
              <Field
                label="Nhập lại mật khẩu"
                name="confirm"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
              <p className="hint">Mật khẩu từ 8 ký tự, gồm chữ và số.</p>
            </>
          )}
        </Form>
      )}
      {!isReset && (
        <div className="auth-links">
          <button
            onClick={() =>
              c.setView({ type: isRegister ? "login" : "register" })
            }
          >
            {isRegister
              ? "Đã có tài khoản? Đăng nhập"
              : "Chưa có tài khoản? Đăng ký"}
          </button>
          {!isForgot && (
            <button onClick={() => c.setView({ type: "forgot" })}>
              Quên mật khẩu?
            </button>
          )}
        </div>
      )}
    </>
  );
}
function Cart({ c, Photo }) {
  const subtotal = c.cart.reduce((s, p) => s + p.qty * p.price, 0);
  return (
    <>
      <p className="red-script">A little box of happiness</p>
      <h2>
        GIỎ BÁNH <em>của bạn</em>
      </h2>
      {!c.cart.length ? (
        <Empty text="Giỏ bánh đang chờ một chút ngọt ngào." c={c} />
      ) : (
        <>
          <div className="cart-items">
            {c.cart.map((p) => (
              <div className="cart-item" key={p.id}>
                <Photo photo={p.img} alt={p.name} />
                <div>
                  <h3>{p.name}</h3>
                  <p>{money(p.price)}</p>
                  <div className="quantity">
                    <button
                      disabled={c.busy}
                      aria-label={"Giảm " + p.name}
                      onClick={() => c.change(p.id, p.qty - 1)}
                    >
                      −
                    </button>
                    <span>{p.qty}</span>
                    <button
                      disabled={c.busy || p.qty >= p.stock}
                      aria-label={"Tăng " + p.name}
                      onClick={() => c.change(p.id, p.qty + 1)}
                    >
                      +
                    </button>
                    <button
                      className="remove-item"
                      disabled={c.busy}
                      onClick={() => c.change(p.id, 0)}
                    >
                      Xóa
                    </button>
                  </div>
                  {p.qty > p.stock && (
                    <p className="form-error">
                      Chỉ còn {p.stock} bánh. Vui lòng giảm số lượng.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="total">
            <span>Tạm tính</span>
            <b>{money(subtotal)}</b>
          </div>
          <p className="hint">
            Phí giao hàng {money(c.config.shippingFee)}. Miễn phí từ{" "}
            {money(c.config.freeShippingFrom)}.
          </p>
          <button
            className="solid-button wide"
            onClick={() =>
              c.setView({ type: "checkout", key: crypto.randomUUID() })
            }
          >
            Tiến hành đặt bánh →
          </button>
        </>
      )}
    </>
  );
}
function Empty({ text, c }) {
  return (
    <div className="empty">
      <span>♡</span>
      <p>{text}</p>
      <button
        className="solid-button"
        onClick={() => {
          c.setView(null);
          const menu = document.getElementById("menu");
          if (menu) menu.scrollIntoView({ behavior: "smooth" });
          else location.assign("/#menu");
        }}
      >
        Ghé tủ bánh
      </button>
    </div>
  );
}
function Checkout({ c }) {
  const [draft, setDraft] = useState(null);
  const subtotal = c.cart.reduce((s, p) => s + p.price * p.qty, 0),
    fee = subtotal >= c.config.freeShippingFrom ? 0 : c.config.shippingFee;
  if (!c.cart.length) return <Empty text="Giỏ bánh đang trống." c={c} />;
  return (
    <>
      <p className="red-script">Gói ghém một chút yêu thương</p>
      <h2>ĐẶT BÁNH</h2>
      <div className="checkout-steps">
        <span className={!draft ? "active" : ""}>1. Giao hàng</span>
        <span className={draft ? "active" : ""}>2. Xác nhận</span>
      </div>
      {!draft ? (
        <Form onSubmit={async (data) => setDraft(data)}>
          <Field
            label="Người nhận"
            name="name"
            defaultValue={c.user.name}
            required
            minLength={2}
            maxLength={100}
          />
          <Field
            label="Số điện thoại nhận hàng"
            name="phone"
            type="tel"
            defaultValue={c.user.phone}
            pattern="0[0-9]{9}"
            required
          />
          <Field
            label="Địa chỉ giao hàng (số nhà, đường, phường/xã, tỉnh/thành)"
            name="address"
            defaultValue={c.user.address}
            required
            minLength={10}
            maxLength={500}
          />
          <Field
            label="Lời nhắn / ghi chú giao hàng"
            name="note"
            maxLength={500}
          />
          <label className="field">
            <span>Phương thức thanh toán</span>
            <select
              aria-label="Phương thức thanh toán"
              name="payment"
              required
              defaultValue={c.config.cod ? "cod" : "vnpay"}
            >
              <option value="cod" disabled={!c.config.cod}>
                Thanh toán khi nhận hàng (COD){c.config.cod ? "" : " — tạm ngưng"}
              </option>
              <option value="vnpay" disabled={!c.config.onlinePayment}>
                VNPay {c.config.onlinePayment ? "" : "— chưa khả dụng"}
              </option>
            </select>
          </label>
        </Form>
      ) : (
        <>
          <div className="order-summary">
            <h3>Thông tin giao bánh</h3>
            <p>
              {draft.name} · {draft.phone}
            </p>
            <p>{draft.address}</p>
            {draft.note && <p>Ghi chú: {draft.note}</p>}
            <p>
              Thanh toán: {draft.payment === "cod" ? "Khi nhận hàng" : "VNPay"}
            </p>
            <button className="text-link" onClick={() => setDraft(null)}>
              Chỉnh sửa thông tin
            </button>
          </div>
          {c.cart.map((p) => (
            <div className="summary-row" key={p.id}>
              <span>
                {p.name} × {p.qty}
              </span>
              <b>{money(p.price * p.qty)}</b>
            </div>
          ))}
          <div className="summary-row">
            <span>Tạm tính</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Giao hàng</span>
            <span>{fee ? money(fee) : "Miễn phí"}</span>
          </div>
          <div className="total">
            <span>Tổng thanh toán</span>
            <b>{money(subtotal + fee)}</b>
          </div>
          <Form
            onSubmit={async () => {
              const r = await api("/checkout", {
                method: "POST",
                body: {
                  shipping: draft,
                  payment: draft.payment,
                  key: c.view.key,
                },
              });
              if (r.redirect) {
                location.assign(r.redirect);
                return;
              }
              await Promise.all([c.sync(), c.loadProducts()]);
              c.setView({ type: "orders", success: r.order.id });
              c.notify("Đặt bánh thành công. Mã đơn: " + r.order.id);
            }}
          >
            <label className="check-field">
              <input type="checkbox" required /> Tôi đã kiểm tra sản phẩm, địa
              chỉ và tổng tiền.
            </label>
          </Form>
        </>
      )}
      <button className="text-link" onClick={() => c.setView({ type: "cart" })}>
        ← Quay về giỏ bánh
      </button>
    </>
  );
}
export function Profile({ c, embedded = false }) {
  return (
    <>
      <p className="red-script">Your little corner</p>
      <h2>
        TÀI KHOẢN <em>của bạn</em>
      </h2>
      {!embedded && (
        <div className="account-actions">
          <button
            className="outline-button"
            onClick={() => c.setView({ type: "orders" })}
          >
            Đơn hàng của tôi
          </button>
          <button
            className="outline-button"
            onClick={() => c.setView({ type: "favorites" })}
          >
            Bánh yêu thích
          </button>
        </div>
      )}
      <h3 className="form-heading">Thông tin cá nhân</h3>
      <Form
        onSubmit={async (data) => {
          const r = await api("/profile", { method: "PATCH", body: data });
          c.setUser(r.user);
          c.notify("Đã lưu thông tin cá nhân.");
        }}
      >
        <Field
          label="Họ và tên"
          name="name"
          defaultValue={c.user.name}
          minLength={2}
          maxLength={100}
          required
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={c.user.email}
          required
        />
        <Field
          label="Số điện thoại"
          name="phone"
          type="tel"
          defaultValue={c.user.phone}
          pattern="0[0-9]{9}"
          required
        />
        <Field
          label="Địa chỉ mặc định"
          name="address"
          defaultValue={c.user.address}
          maxLength={500}
        />
      </Form>
      <h3 className="form-heading">Đổi mật khẩu</h3>
      <Form
        onSubmit={async (data) => {
          await api("/profile/password", { method: "POST", body: data });
          await c.sync();
          c.setView({ type: "login" });
          c.notify("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
        }}
      >
        <Field
          label="Mật khẩu hiện tại"
          name="current"
          type="password"
          required
          autoComplete="current-password"
        />
        <Field
          label="Mật khẩu mới (chữ và số, ít nhất 8 ký tự)"
          name="password"
          type="password"
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
        />
        <Field
          label="Xác nhận mật khẩu mới"
          name="confirm"
          type="password"
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </Form>
      <button
        className="text-link"
        disabled={c.busy}
        onClick={() =>
          c.run(async () => {
            await api("/auth/logout", { method: "POST" });
            await c.sync();
            c.setView(null);
            c.notify("Đã đăng xuất an toàn.");
          })
        }
      >
        Đăng xuất
      </button>
    </>
  );
}
export function Orders({ c, Photo }) {
  const [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState("all"),
    [cancel, setCancel] = useState(null);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setOrders((await api("/orders")).orders);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <>
      <p className="red-script">Những niềm vui đã gói ghém</p>
      <h2>
        ĐƠN HÀNG <em>của tôi</em>
      </h2>
      {c.view.success && (
        <p className="success-message" role="status">
          Đặt bánh thành công! Mã đơn: {c.view.success}
        </p>
      )}
      <div className="order-toolbar">
        <select
          aria-label="Lọc trạng thái đơn hàng"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(statuses).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="text-link" onClick={load}>
          Làm mới
        </button>
      </div>
      <ErrorBox message={error} />
      {loading && !orders.length ? (
        <p className="hint">Đang tải đơn bánh…</p>
      ) : !orders.length && !error ? (
        <Empty text="Bạn chưa có đơn hàng nào." c={c} />
      ) : (
        <div className="orders-list">
          {orders
            .filter((o) => filter === "all" || o.status === filter)
            .map((o) => (
              <article className="order-card" key={o.id} id={o.id}>
                <div className="order-head">
                  <strong>{o.id}</strong>
                  <span className={"status " + o.status}>
                    {statuses[o.status] || o.status}
                  </span>
                </div>
                <p className="hint">{date(o.created)}</p>
                {o.status === "payment_review" && (
                  <p className="form-error">
                    Thanh toán đã ghi nhận nhưng tồn kho không còn đủ do phản
                    hồi đến muộn. Tiệm cần liên hệ để đổi bánh hoặc hoàn tiền;
                    giỏ bánh được giữ nguyên.
                  </p>
                )}
                <details
                  open={o.id === c.view.success || location.hash === "#" + o.id}
                >
                  <summary>Chi tiết đơn · {money(o.total)}</summary>
                  <div className="order-summary">
                    <p>
                      {o.shipping.name} · {o.shipping.phone}
                    </p>
                    <p>{o.shipping.address}</p>
                    {o.shipping.note && <p>Lời nhắn: {o.shipping.note}</p>}
                    <p>
                      {o.payment === "cod"
                        ? "Thanh toán khi nhận hàng"
                        : "VNPay"}{" "}
                      ·{" "}
                      {o.payment_status === "paid"
                        ? "Đã thanh toán"
                        : "Chưa thanh toán"}
                    </p>
                  </div>
                  {o.items.map((p) => (
                    <div className="cart-item" key={p.id}>
                      <Photo photo={p.img} alt={p.name} />
                      <div>
                        <h3>{p.name}</h3>
                        <p>
                          {p.qty} × {money(p.price)}
                        </p>
                        {o.status === "delivered" && (
                          <button
                            className="text-link"
                            onClick={() =>
                              c.setView({ type: "product", id: p.id })
                            }
                          >
                            Đánh giá sản phẩm
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="summary-row">
                    <span>Giao hàng</span>
                    <span>{money(o.fee)}</span>
                  </div>
                  <div className="total">
                    <span>Tổng tiền</span>
                    <b>{money(o.total)}</b>
                  </div>
                  <ol className="timeline">
                    {o.events.map((ev, i) => (
                      <li key={i}>
                        <strong>{statuses[ev.status] || ev.status}</strong>
                        <span>{date(ev.created)}</span>
                      </li>
                    ))}
                  </ol>
                </details>
                {o.status === "pending" &&
                  o.payment_status !== "paid" &&
                  (cancel === o.id ? (
                    <div className="cancel-confirm">
                      <p>Bạn muốn hủy đơn bánh này?</p>
                      <button
                        className="outline-button"
                        disabled={c.busy}
                        onClick={() =>
                          c.run(async () => {
                            await api("/orders/" + o.id + "/cancel", {
                              method: "POST",
                            });
                            setCancel(null);
                            await Promise.all([load(), c.loadProducts()]);
                            c.notify(
                              "Đã hủy đơn. Số lượng bánh đã được hoàn lại.",
                            );
                          })
                        }
                      >
                        Xác nhận hủy
                      </button>
                      <button
                        className="text-link"
                        onClick={() => setCancel(null)}
                      >
                        Giữ đơn bánh
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-link"
                      onClick={() => setCancel(o.id)}
                    >
                      Hủy đơn hàng
                    </button>
                  ))}
              </article>
            ))}
          {orders.length > 0 &&
            !orders.some((o) => filter === "all" || o.status === filter) && (
              <p className="hint">Không có đơn ở trạng thái này.</p>
            )}
        </div>
      )}
    </>
  );
}
function Product({ c, Photo }) {
  const [product, setProduct] = useState(null),
    [reviews, setReviews] = useState(null),
    [error, setError] = useState(""),
    [qty, setQty] = useState(1);
  const id = c.view.id;
  const load = useCallback(async () => {
    setError("");
    try {
      const [p, r] = await Promise.all([
        api("/products/" + id),
        api("/products/" + id + "/reviews"),
      ]);
      setProduct(p.product);
      setReviews(r);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (error)
    return (
      <>
        <ErrorBox message={error} />
        <button onClick={load}>Thử lại</button>
      </>
    );
  if (!product) return <p>Đang tải thông tin bánh…</p>;
  return (
    <>
      <div className="detail-photo">
        <Photo photo={product.img} alt={product.name} />
      </div>
      <span className="category">{product.type}</span>
      <h2 className="detail-title">{product.name}</h2>
      <p className="detail-price">{money(product.price)}</p>
      <p className="detail-description">{product.description}</p>
      <dl className="ingredients">
        <dt>Thành phần</dt>
        <dd>{product.ingredients}</dd>
        <dt>Dị ứng</dt>
        <dd>{product.allergens}</dd>
        <dt>Bảo quản</dt>
        <dd>{product.storage}</dd>
      </dl>
      <p className="hint">
        {product.stock > 0
          ? `Còn ${product.stock} bánh`
          : "Bánh đã hết hôm nay"}
      </p>
      <div className="detail-actions">
        <label className="field">
          <span>Số lượng</span>
          <input
            type="number"
            aria-label="Số lượng bánh"
            min={1}
            max={Math.min(product.stock, 99)}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
        <button
          className="solid-button"
          disabled={
            c.busy ||
            product.stock === 0 ||
            !Number.isInteger(qty) ||
            qty < 1 ||
            qty > product.stock ||
            qty > 99
          }
          onClick={() => c.add(product, qty)}
        >
          Thêm vào giỏ
        </button>
        <button className="outline-button" onClick={() => c.favorite(product)}>
          {c.favorites.includes(id) ? "Đã yêu thích ♥" : "Yêu thích ♡"}
        </button>
      </div>
      <section className="reviews">
        <h3>Đánh giá sản phẩm</h3>
        <p className="hint">
          {reviews?.reviews.length
            ? `${reviews.average.toFixed(1)} / 5 · ${reviews.reviews.length} đánh giá`
            : "Chưa có đánh giá. Hãy là người đầu tiên chia sẻ sau khi nhận bánh."}
        </p>
        {reviews?.reviews.map((r) => (
          <article className="review" key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <span className="stars">
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </span>
            </div>
            <small>{date(r.created)}</small>
            <p>{r.content}</p>
            {r.reply && <blockquote>Rookie phản hồi: {r.reply}</blockquote>}
          </article>
        ))}
        {reviews?.canReview ? (
          <Form
            onSubmit={async (data) => {
              await api("/products/" + id + "/reviews", {
                method: "POST",
                body: { rating: Number(data.rating), content: data.content },
              });
              await Promise.all([load(), c.loadProducts()]);
              c.notify("Cảm ơn bạn đã chia sẻ cảm nhận ♡");
            }}
          >
            <label className="field">
              <span>Chấm điểm</span>
              <select
                aria-label="Chấm điểm"
                name="rating"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Chọn số sao
                </option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option value={n} key={n}>
                    {n} sao
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Cảm nhận của bạn</span>
              <textarea
                name="content"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
              />
            </label>
          </Form>
        ) : (
          <p className="hint">
            {reviews?.reviewed
              ? "Bạn đã đánh giá chiếc bánh này."
              : "Chỉ khách hàng đã nhận bánh mới có thể gửi đánh giá."}
          </p>
        )}
      </section>
    </>
  );
}
export function Favorites({ c, Photo }) {
  const items = c.products.filter((p) => c.favorites.includes(p.id));
  return (
    <>
      <p className="red-script">Saved with love</p>
      <h2>
        BÁNH <em>yêu thích</em>
      </h2>
      {!items.length ? (
        <Empty text="Bạn chưa lưu chiếc bánh nào." c={c} />
      ) : (
        items.map((p) => (
          <div className="cart-item" key={p.id}>
            <Photo photo={p.img} alt={p.name} />
            <div>
              <h3>
                <button
                  className="plain-button"
                  onClick={() => c.setView({ type: "product", id: p.id })}
                >
                  {p.name}
                </button>
              </h3>
              <p>{money(p.price)}</p>
              <button
                className="outline-button"
                disabled={!p.stock || c.busy}
                onClick={() => c.add(p)}
              >
                Thêm vào giỏ
              </button>
              <button
                className="text-link"
                disabled={c.busy}
                onClick={() => c.favorite(p)}
              >
                Bỏ lưu
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
export function CustomerUI({ c, Photo }) {
  const ref = useRef(null),
    previous = useRef(null);
  useEffect(() => {
    if (!c.view) return;
    previous.current = document.activeElement;
    const t = setTimeout(
      () => ref.current?.querySelector("input,button,select,textarea")?.focus(),
      50,
    );
    return () => {
      clearTimeout(t);
      previous.current?.focus?.();
    };
  }, [c.view?.type]);
  if (!c.view)
    return c.toast ? (
      <div className="toast" role="status">
        {c.toast}
      </div>
    ) : null;
  const type = c.view.type;
  const isAuth = ["login", "register", "forgot", "reset"].includes(type);
  const needsUser = [
    "cart",
    "checkout",
    "profile",
    "orders",
    "favorites",
  ].includes(type);
  return (
    <>
      {c.toast && (
        <div className="toast" role="status">
          {c.toast}
        </div>
      )}
      <div
        className={"overlay" + (isAuth ? " auth-overlay" : "")}
        onClick={() => c.setView(null)}
      >
        <aside
          className={
            "cart customer-panel " +
            (["product", "orders"].includes(type) ? "wide-panel" : "") +
            (isAuth ? " auth-panel" : "")
          }
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Chức năng khách hàng Rookie"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            const els = [
              ...ref.current.querySelectorAll(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary",
              ),
            ].filter((el) => el.getClientRects().length);
            const first = els[0],
              last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }}
        >
          <button
            className="close"
            aria-label="Đóng cửa sổ"
            onClick={() => c.setView(null)}
          >
            ×
          </button>
          {needsUser && !c.user ? (
            <>
              <h2>ĐĂNG NHẬP</h2>
              <p className="hint">
                Đăng nhập để xem thông tin dành riêng cho bạn.
              </p>
              <button
                className="solid-button"
                onClick={() => c.setView({ type: "login" })}
              >
                Đăng nhập
              </button>
            </>
          ) : ["login", "register", "forgot", "reset"].includes(type) ? (
            <Auth key={type} c={c} />
          ) : type === "cart" ? (
            <Cart c={c} Photo={Photo} />
          ) : type === "checkout" ? (
            <Checkout c={c} />
          ) : type === "profile" ? (
            <Profile c={c} />
          ) : type === "orders" ? (
            <Orders c={c} Photo={Photo} />
          ) : type === "product" ? (
            <Product key={c.view.id} c={c} Photo={Photo} />
          ) : type === "favorites" ? (
            <Favorites c={c} Photo={Photo} />
          ) : null}
        </aside>
      </div>
    </>
  );
}
