import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { useCustomer, CustomerUI, api } from "./customer.jsx";
import "./customer.css";
import { AccountPage } from "./account.jsx";
import "./account.css";
import "./typography.css";
import bagIcon from "../display/icon/bag.png";
import userIcon from "../display/icon/user.png";
import teaCake from "../display/img/102bb9d0e68be13d12f55b2052ed9c8c.jpg";
import redVelvet from "../display/img/3868391957bcdd47fe12b9a6de563dc2.jpg";
import creamCake from "../display/img/781ceee5769234488786764e1313badc.jpg";
import croissant from "../display/img/794a94793d024182af6f5f4fdf2a1974.jpg";
import doughnuts from "../display/img/ad1c3ce105bd3e70319840364dd6643a.jpg";
import littleCake from "../display/img/ddf497124cd8d76b6b302bfa1c0a897a.jpg";

const photos = {
  "hero.jpg": { src: creamCake, position: "center 66%" },
  "berry.jpg": { src: redVelvet, position: "center 70%" },
  "cake.jpg": { src: littleCake, position: "center 55%" },
  "toast.jpg": { src: croissant, position: "center 55%" },
  "memory.jpg": { src: teaCake, position: "center 65%" },
  "doughnuts.jpg": { src: doughnuts, position: "center 65%" },
};
function CakePhoto({ photo, alt }) {
  // Admin-added products may use an image link instead of a bundled photo.
  const image = /^https?:\/\//.test(photo || "")
    ? { src: encodeURI(photo), position: "center" }
    : photos[photo] || photos["hero.jpg"];
  return (
    <div
      className="food-photo"
      role="img"
      aria-label={alt}
      style={{
        backgroundImage: `url("${image.src}")`,
        backgroundPosition: image.position,
      }}
    />
  );
}
const money = (n) => n.toLocaleString("vi-VN") + "₫";
function App() {
  const c = useCustomer();
  const isAccountPage = location.pathname.replace(/\/$/, "") === "/tai-khoan";
  const [filter, setFilter] = useState("Tất cả"),
    [query, setQuery] = useState(""),
    [range, setRange] = useState("all"),
    [sort, setSort] = useState("default");
  const [categories, setCategories] = useState([
    "Bánh kem",
    "Bánh ngọt",
    "Bánh nướng",
  ]);
  useEffect(() => {
    api("/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);
  const count = c.cart.reduce((s, p) => s + p.qty, 0);
  const normalize = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase();
  const visible = c.products
    .filter(
      (p) =>
        (filter === "Tất cả" || p.type === filter) &&
        normalize(p.name + " " + p.note + " " + p.type).includes(
          normalize(query.trim()),
        ) &&
        (range === "all" ||
          (range === "under100"
            ? p.price < 100000
            : range === "100to200"
              ? p.price >= 100000 && p.price <= 200000
              : p.price > 200000)),
    )
    .sort((a, b) =>
      sort === "asc"
        ? a.price - b.price
        : sort === "desc"
          ? b.price - a.price
          : a.id - b.id,
    );
  return (
    <>
      {(!c.config.open || c.config.banner) && (
        <p className="shop-notice" role="status">
          {!c.config.open ? c.config.closedMessage : c.config.banner}
        </p>
      )}
      <header
        className={"hero" + (isAccountPage ? " account-header" : "")}
        id="home"
      >
        <nav>
          <a href="/" className="logo">
            rookie<span>BAKERY & LITTLE JOYS</span>
          </a>
          <div className="navlinks">
            <a href="/#story">Chuyện Rookie</a>
            <a href="/#menu">Tủ bánh hôm nay</a>
            <a href="/#love">Gửi chút thương</a>
          </div>
          <div className="nav-customer">
            {c.user ? (
              <>
                <a
                  className="nav-account"
                  href="/tai-khoan"
                  aria-current={isAccountPage ? "page" : undefined}
                >
                  <img className="account-icon" src={userIcon} alt="" />
                  <span>{c.user.name}</span>
                </a>
                <button
                  className="nav-account nav-orders"
                  onClick={() => c.requireUser("orders")}
                >
                  Đơn hàng
                </button>
              </>
            ) : (
              <div className="nav-auth" aria-label="Tài khoản khách hàng">
                <button
                  className="nav-account"
                  onClick={() => c.setView({ type: "login" })}
                >
                  Đăng nhập
                </button>
                <span aria-hidden="true">/</span>
                <button
                  className="nav-account"
                  onClick={() => c.setView({ type: "register" })}
                >
                  Đăng ký
                </button>
              </div>
            )}
            <button className="bag" onClick={() => c.requireUser("cart")}>
              <img src={bagIcon} alt="" />
              Giỏ bánh <span>({count})</span>
            </button>
          </div>
        </nav>
        {!isAccountPage && (
          <div className="hero-content">
            <div className="sticky">
              <span className="tape" />
              Dear sweet soul,
              <br />
              Hôm nay, bạn xứng đáng
              <br />
              với một điều ngọt ngào.<span className="note-heart">♡</span>
            </div>
            <p className="eyebrow">HANDMADE WITH LOVE · SINCE 2024</p>
            <h1>
              MỘT CHÚT BÁNH.
              <br />
              <span>MỘT CHÚT</span> <em>thương.</em>
            </h1>
            <div className="hero-photo">
              <CakePhoto photo="hero.jpg" alt="Bánh kem thủ công của Rookie" />
              <span className="photo-label">freshly baked, just for you.</span>
            </div>
            <div className="hero-side">
              Không cần dịp đặc biệt.
              <br />
              Có bánh là thành ngày vui.
              <a href="/#menu">
                Ghé tủ bánh <span>↗</span>
              </a>
            </div>
            <span className="hero-stamp">
              100%
              <br />
              <small>LOVE & BUTTER</small>
            </span>
            <p className="hero-bottom">
              BÁNH TƯƠI MỖI NGÀY <span>✳</span> NGUYÊN LIỆU THẬT <span>✳</span>{" "}
              NIỀM VUI THẬT
            </p>
          </div>
        )}
      </header>
      {isAccountPage ? (
        <AccountPage c={c} Photo={CakePhoto} />
      ) : (
        <main>
          <section id="story" className="intro section">
            <div>
              <p className="red-script">Xin chào, tụi mình là Rookie!</p>
              <h2>
                TIỆM BÁNH NHỎ,
                <br />
                NIỀM VUI <em>to.</em>
              </h2>
              <p>
                Rookie tin rằng, hạnh phúc đôi khi chỉ là một miếng bánh ngon,
                một tách trà ấm và một người để sẻ chia.
              </p>
              <p>
                Tụi mình làm bánh bằng đôi tay, chọn nguyên liệu bằng sự kỹ
                tính, và gửi gắm vào đó thật nhiều thương yêu.
              </p>
              <a className="text-link" href="/#love">
                Một chút về điều tụi mình tin ↗
              </a>
            </div>
            <div className="quote">
              <span>♡</span>
              <p>
                “Có những ngày,
                <br />
                chỉ cần một miếng bánh
                <br />
                là thấy đời <em>dễ thương.”</em>
              </p>
              <small>— MỘT CHÚT NGỌT, MỘT CHÚT VUI —</small>
              <i className="hand-arrow">↝</i>
            </div>
          </section>
          <section
            className="clothesline"
            aria-label="Những khoảnh khắc ngọt ngào"
          >
            <div className="line" />
            {[
              { img: "toast.jpg", text: "Một buổi sáng thơm bơ" },
              { img: "doughnuts.jpg", text: "Ngọt ngào vừa đủ thôi" },
              { img: "cake.jpg", text: "Gói lại một chút thương" },
              { img: "memory.jpg", text: "Hôm nay, mình có hẹn!" },
            ].map((p, i) => (
              <figure key={p.img} className={"polaroid p" + i}>
                <span className="peg" />
                <CakePhoto photo={p.img} alt={p.text} />
                <figcaption>
                  {p.text}
                  <small>rookie memories · no. 0{i + 1}</small>
                </figcaption>
              </figure>
            ))}
          </section>
          <section className="menu section" id="menu">
            <div className="section-heading">
              <div>
                <p className="red-script">Made with butter. Baked with love.</p>
                <h2>
                  TỦ BÁNH <em>hôm nay</em>
                </h2>
              </div>
              <span className="round-note">
                Mỗi chiếc bánh
                <br />
                một niềm vui ♡
              </span>
            </div>
            <div className="menu-bar">
              <p>Chọn một chút ngọt ngào cho ngày của bạn.</p>
              <div className="filters">
                {["Tất cả", ...categories].map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "active" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="catalog-tools">
              <label className="search-box">
                <span>Tìm chiếc bánh của bạn</span>
                <input
                  aria-label="Tìm kiếm bánh"
                  placeholder="Tên bánh, hương vị…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                <span>Khoảng giá</span>
                <select
                  aria-label="Khoảng giá"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                >
                  <option value="all">Tất cả mức giá</option>
                  <option value="under100">Dưới 100.000₫</option>
                  <option value="100to200">100.000–200.000₫</option>
                  <option value="over200">Trên 200.000₫</option>
                </select>
              </label>
              <label>
                <span>Sắp xếp</span>
                <select
                  aria-label="Sắp xếp bánh"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="default">Mặc định</option>
                  <option value="asc">Giá tăng dần</option>
                  <option value="desc">Giá giảm dần</option>
                </select>
              </label>
              <button
                className="outline-button"
                onClick={() => c.requireUser("favorites")}
              >
                Yêu thích ♡
              </button>
            </div>
            {c.error && (
              <div className="form-error" role="alert">
                {c.error}{" "}
                <button
                  onClick={() =>
                    Promise.all([c.loadProducts(), c.sync()])
                      .then(() => c.setError(""))
                      .catch((e) => c.setError(e.message))
                  }
                >
                  Thử lại
                </button>
              </div>
            )}
            {!c.ready && <p className="catalog-message">Đang mở tủ bánh…</p>}
            {c.ready && !c.error && (
              <p className="results-count" aria-live="polite">
                {visible.length} chiếc bánh dành cho bạn
              </p>
            )}
            {c.ready && !c.error && !visible.length && (
              <div className="empty">
                <p>Không tìm thấy bánh phù hợp.</p>
                <button
                  className="text-link"
                  onClick={() => {
                    setQuery("");
                    setFilter("Tất cả");
                    setRange("all");
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
            <div className="products">
              {visible.map((p, i) => (
                <article className="product" key={p.id}>
                  <div className="product-image">
                    <button
                      className="product-detail-photo"
                      aria-label={"Xem chi tiết " + p.name}
                      onClick={() => c.setView({ type: "product", id: p.id })}
                    >
                      <CakePhoto photo={p.img} alt={p.name} />
                    </button>
                    <span>{i === 0 ? "BEST LOVED" : "FRESHLY BAKED"}</span>
                    <button
                      aria-label={"Thêm " + p.name + " vào giỏ"}
                      disabled={c.busy || !p.stock}
                      onClick={() => c.add(p)}
                    >
                      +
                    </button>
                  </div>
                  <span className="category">{p.type}</span>
                  <div className="product-title">
                    <h3>
                      <button
                        className="plain-button"
                        onClick={() => c.setView({ type: "product", id: p.id })}
                      >
                        {p.name}
                      </button>
                    </h3>
                    <b>{money(p.price)}</b>
                  </div>
                  <p>{p.note}</p>
                  <div className="product-extras">
                    <span>
                      {p.stock ? "Còn " + p.stock + " bánh" : "Hết hàng"}
                    </span>
                    <button
                      aria-label={"Yêu thích " + p.name}
                      aria-pressed={c.favorites.includes(p.id)}
                      disabled={c.busy}
                      onClick={() => c.favorite(p)}
                    >
                      {c.favorites.includes(p.id) ? "♥" : "♡"}
                    </button>
                  </div>
                  <button
                    className="review-link"
                    onClick={() => c.setView({ type: "product", id: p.id })}
                  >
                    {p.reviewCount
                      ? Number(p.rating).toFixed(1) +
                        " / 5 · " +
                        p.reviewCount +
                        " đánh giá"
                      : "Xem chi tiết & đánh giá"}
                  </button>
                </article>
              ))}
            </div>
            <p className="menu-foot">
              Bánh được làm mới mỗi sáng. Ngon nhất khi dùng trong ngày.{" "}
              <span>♡</span>
            </p>
          </section>
          <section className="values section" id="love">
            <div className="values-title">
              <p className="red-script">The little things that matter</p>
              <h2>
                NGON TỪ NHỮNG ĐIỀU
                <br />
                <em>thật lòng.</em>
              </h2>
            </div>
            <div className="value-pills">
              <span>Bơ thơm thật</span>
              <span>Ít ngọt hơn</span>
              <span>Không chất bảo quản</span>
              <span>Làm mới mỗi ngày</span>
              <span>Gói ghém bằng yêu thương</span>
            </div>
            <div className="paper-notes">
              <article className="paper pink">
                <span className="tape" />
                <p className="red-script">Một lời hứa nhỏ</p>
                <h3>
                  Chỉ những gì tụi mình
                  <br />
                  muốn dành cho người thương.
                </h3>
                <p>
                  Từ bơ thơm, trứng mới đến trái cây đúng mùa. Rookie chọn
                  nguyên liệu tử tế, để mỗi miếng bánh đều khiến bạn an tâm và
                  mỉm cười.
                </p>
                <span className="drawn-heart">♡ ♡ ♡</span>
              </article>
              <article className="paper cream">
                <span className="tape" />
                <p className="red-script">Gửi bạn một chiếc ôm</p>
                <h3>
                  Có những tình cảm,
                  <br />
                  mình gửi bằng một chiếc bánh.
                </h3>
                <p>
                  Một sinh nhật, một lời cảm ơn, hay đơn giản là “mình nhớ bạn”.
                  Để Rookie gói ghém giúp bạn, kèm một lời nhắn viết tay thật
                  riêng.
                </p>
                <a href="/#menu" className="text-link">
                  Chọn bánh cho người thương ↗
                </a>
              </article>
            </div>
          </section>
          <section className="closing">
            <CakePhoto
              photo="berry.jpg"
              alt="Bánh ngọt cho những khoảnh khắc bên nhau"
            />
            <div className="closing-paper">
              <span className="tape" />
              <p className="red-script">Life is what you bake it.</p>
              <h2>
                HẸN BẠN,
                <br />Ở MỘT NGÀY
                <br />
                <em>thật ngọt.</em>
              </h2>
              <a className="solid-button" href="/#menu">
                Chọn chiếc bánh của bạn ↗
              </a>
              <p>With love, Rookie ♡</p>
            </div>
          </section>
        </main>
      )}
      <footer>
        <a className="logo" href="/">
          rookie<span>BAKERY & LITTLE JOYS</span>
        </a>
        <p>Một tiệm bánh nhỏ. Thật nhiều thương yêu.</p>
        {[c.config.storeAddress, c.config.storePhone, c.config.storeEmail, c.config.storeHours].some(Boolean) && (
          <address className="store-info">
            {[c.config.storeAddress, c.config.storePhone, c.config.storeEmail, c.config.storeHours]
              .filter(Boolean)
              .join(" · ")}
          </address>
        )}
        <a href="/#menu">Khám phá tủ bánh ↗</a>
        <div className="footer-bottom">
          <span>© 2026 {c.config.storeName || "Rookie Bakery"}</span>
          <a href="https://www.flaticon.com/" target="_blank" rel="noreferrer">
            Icons by Flaticon
          </a>
          <span>Made with butter & love ♡</span>
        </div>
      </footer>
      <CustomerUI c={c} Photo={CakePhoto} />
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
