import React, { useState, useEffect, useCallback } from "react";
import { api, money, Profile, Orders, Favorites } from "./customer.jsx";
const tabs = [
  ["overview", "Tổng quan"],
  ["profile", "Thông tin cá nhân"],
  ["orders", "Đơn hàng của tôi"],
  ["transactions", "Lịch sử giao dịch"],
  ["favorites", "Bánh yêu thích"],
];
const statuses = {
  pending: "Chờ xác nhận",
  processing: "Đang chuẩn bị",
  shipping: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
  payment_review: "Cần đối soát thanh toán",
};
const date = (s) =>
  new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const payLabel = (o) =>
  o.status === "cancelled" && o.payment_status !== "paid"
    ? "Đã hủy · chưa thu tiền"
    : o.payment_status === "paid"
      ? "Đã thanh toán"
      : "Chưa thanh toán";
export function AccountPage({ c, Photo }) {
  const selected =
    new URLSearchParams(location.search).get("tab") || "overview";
  const tab = tabs.some(([id]) => id === selected) ? selected : "overview";
  const [orders, setOrders] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [paymentFilter, setPaymentFilter] = useState("all");
  const load = useCallback(async () => {
    if (!c.user) return;
    setLoading(true);
    setError("");
    try {
      setOrders((await api("/orders")).orders);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) await c.sync().catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [c.user?.id, c.sync]);
  useEffect(() => {
    if (!c.user) {
      setOrders([]);
      return;
    }
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, c.user?.id]);
  useEffect(() => {
    document.title = "Tài khoản của tôi — Rookie";
    return () => {
      document.title = "Rookie — Tiệm bánh nhỏ, niềm vui to";
    };
  }, []);
  if (!c.ready)
    return (
      <main className="account-page account-access">
        <p role="status">Đang tải tài khoản…</p>
      </main>
    );
  if (!c.user)
    return (
      <main className="account-page account-access">
        <p className="red-script">Your little corner</p>
        <h1>
          TÀI KHOẢN <em>của bạn</em>
        </h1>
        <p>Đăng nhập để xem hồ sơ, đơn hàng và các giao dịch của bạn.</p>
        {c.error && (
          <p className="form-error" role="alert">
            {c.error}
          </p>
        )}
        <button
          className="solid-button"
          onClick={() => c.setView({ type: "login" })}
        >
          Đăng nhập
        </button>
        <button
          className="outline-button"
          onClick={() => c.setView({ type: "register" })}
        >
          Tạo tài khoản
        </button>
        <a className="text-link" href="/">
          Về trang chủ
        </a>
      </main>
    );
  const paid = orders
    .filter((o) => o.payment_status === "paid")
    .reduce((n, o) => n + o.total, 0);
  const pending = orders.filter((o) =>
    ["pending", "processing", "shipping"].includes(o.status),
  ).length;
  const pc = { ...c, view: c.view || {} };
  return (
    <main className="account-page">
      <div className="account-breadcrumb">
        <a href="/">Trang chủ</a>
        <span>/</span>
        <span>Tài khoản của tôi</span>
      </div>
      <div className="account-page-title">
        <div>
          <p className="red-script">A little corner, just for you</p>
          <h1>
            XIN CHÀO, <em>{c.user.name}.</em>
          </h1>
          <p>Mọi thông tin và những lần ghé Rookie của bạn, ở ngay đây.</p>
        </div>
        <a className="outline-button" href="/#menu">
          Tiếp tục mua bánh →
        </a>
      </div>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              {c.user.name.slice(0, 1).toUpperCase()}
            </span>
            <strong>{c.user.name}</strong>
            <small>{c.user.email}</small>
            <span className="member-label">Khách hàng Rookie</span>
          </div>
          <nav className="account-tabs" aria-label="Quản lý tài khoản">
            {tabs.map(([id, label]) => (
              <a
                key={id}
                href={"/tai-khoan?tab=" + id}
                className={id === tab ? "selected" : ""}
                aria-current={id === tab ? "page" : undefined}
              >
                {label}
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </nav>
          <button
            className="account-signout"
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
        </aside>
        <div className="account-content">
          {tab === "overview" && (
            <>
              <div className="account-stats">
                <div>
                  <span>Tổng đơn hàng</span>
                  <strong>{loading ? "…" : orders.length}</strong>
                </div>
                <div>
                  <span>Đơn đang xử lý</span>
                  <strong>{loading ? "…" : pending}</strong>
                </div>
                <div>
                  <span>Đã thanh toán</span>
                  <strong>{loading ? "…" : money(paid)}</strong>
                </div>
              </div>
              <section className="account-card">
                <div className="account-card-heading">
                  <h2>
                    THÔNG TIN <em>khách hàng</em>
                  </h2>
                  <a href="/tai-khoan?tab=profile" className="text-link">
                    Chỉnh sửa →
                  </a>
                </div>
                <dl className="customer-information">
                  <div>
                    <dt>Họ và tên</dt>
                    <dd>{c.user.name}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{c.user.email}</dd>
                  </div>
                  <div>
                    <dt>Số điện thoại</dt>
                    <dd>{c.user.phone}</dd>
                  </div>
                  <div>
                    <dt>Địa chỉ mặc định</dt>
                    <dd>
                      {c.user.address || "Chưa cập nhật địa chỉ giao hàng"}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="account-card">
                <div className="account-card-heading">
                  <h2>
                    ĐƠN HÀNG <em>gần đây</em>
                  </h2>
                  <a href="/tai-khoan?tab=orders" className="text-link">
                    Xem tất cả →
                  </a>
                </div>
                {error ? (
                  <div role="alert" className="form-error">
                    {error}
                    <button onClick={load}>Thử lại</button>
                  </div>
                ) : loading && !orders.length ? (
                  <p className="hint">Đang tải đơn hàng…</p>
                ) : !orders.length ? (
                  <div className="account-empty">
                    <p>Bạn chưa có đơn bánh nào.</p>
                    <a className="text-link" href="/#menu">
                      Khám phá tủ bánh →
                    </a>
                  </div>
                ) : (
                  orders.slice(0, 3).map((o) => (
                    <a
                      className="recent-order"
                      href={"/tai-khoan?tab=orders#" + o.id}
                      key={o.id}
                    >
                      <div>
                        <strong>{o.id}</strong>
                        <small>{date(o.created)}</small>
                      </div>
                      <span className={"status " + o.status}>
                        {statuses[o.status] || o.status}
                      </span>
                      <b>{money(o.total)}</b>
                    </a>
                  ))
                )}
              </section>
            </>
          )}
          {tab === "profile" && (
            <section className="account-card account-profile">
              <Profile c={pc} embedded />
            </section>
          )}
          {tab === "orders" && (
            <section className="account-card">
              <Orders c={pc} Photo={Photo} />
            </section>
          )}
          {tab === "favorites" && (
            <section className="account-card">
              <Favorites c={pc} Photo={Photo} />
            </section>
          )}
          {tab === "transactions" && (
            <section className="account-card">
              <p className="red-script">Every sweet little moment</p>
              <h2>
                LỊCH SỬ <em>giao dịch</em>
              </h2>
              <p className="hint">
                Thông tin thanh toán theo từng đơn hàng. Đơn COD chưa giao không
                được tính là đã thanh toán.
              </p>
              <div className="transaction-toolbar">
                <label>
                  Trạng thái thanh toán
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                  >
                    <option value="all">Tất cả</option>
                    <option value="paid">Đã thanh toán</option>
                    <option value="unpaid">Chưa thanh toán</option>
                    <option value="cancelled">Đơn đã hủy</option>
                  </select>
                </label>
                <button
                  className="outline-button"
                  onClick={load}
                  disabled={loading}
                >
                  {loading ? "Đang tải…" : "Làm mới"}
                </button>
              </div>
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : (
                <div className="transaction-table-wrap">
                  <table className="transaction-table">
                    <caption>Lịch sử thanh toán đơn bánh của bạn</caption>
                    <thead>
                      <tr>
                        <th>Mã đơn / thời gian</th>
                        <th>Phương thức</th>
                        <th>Số tiền</th>
                        <th>Thanh toán</th>
                        <th>Đơn hàng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders
                        .filter(
                          (o) =>
                            paymentFilter === "all" ||
                            (paymentFilter === "cancelled"
                              ? o.status === "cancelled"
                              : o.status !== "cancelled" &&
                                o.payment_status === paymentFilter),
                        )
                        .map((o) => (
                          <tr key={o.id}>
                            <td>
                              <a href={"/tai-khoan?tab=orders#" + o.id}>
                                {o.id}
                              </a>
                              <small>{date(o.created)}</small>
                            </td>
                            <td>{o.payment === "cod" ? "COD" : "VNPay"}</td>
                            <td>{money(o.total)}</td>
                            <td>
                              <span
                                className={"payment-label " + o.payment_status}
                              >
                                {payLabel(o)}
                              </span>
                            </td>
                            <td>{statuses[o.status] || o.status}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!loading &&
                    !orders.some(
                      (o) =>
                        paymentFilter === "all" ||
                        (paymentFilter === "cancelled"
                          ? o.status === "cancelled"
                          : o.status !== "cancelled" &&
                            o.payment_status === paymentFilter),
                    ) && (
                      <p className="account-empty">
                        Không có giao dịch phù hợp.
                      </p>
                    )}
                </div>
              )}
              <p className="hint">
                Nếu đơn ghi “Cần đối soát thanh toán”, khoản thanh toán đã được
                ghi nhận nhưng cần cửa hàng xử lý; đây chưa phải xác nhận giao
                hàng hoặc hoàn tiền.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
