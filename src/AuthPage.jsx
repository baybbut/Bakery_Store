import React from "react";
import { Auth } from "./customer.jsx";
import "./auth-page.css";

const paths = {
  login: "/dang-nhap",
  register: "/dang-ky",
  forgot: "/quen-mat-khau",
  reset: "/dat-lai-mat-khau",
};

export default function AuthPage({ c, type }) {
  const params = new URLSearchParams(window.location.search);

  const authCustomer = {
    ...c,
    view: {
      type,
      token: params.get("token") || params.get("reset"),
    },
    setView(next) {
      // Sau khi đăng nhập/đăng ký thành công
      if (!next) {
        window.location.assign("/tai-khoan");
        return;
      }

      window.location.assign(paths[next.type] || "/");
    },
    
  };

    //nut return to home page
  return (
  <main className="auth-page">
    <a className="auth-back" href="/">
      ← Về trang chủ
    </a>

    <div className="auth-page-wrapper">
      <nav className="auth-tabs" aria-label="Đăng nhập và đăng ký">
        <a
          href="/dang-nhap"
          className={type === "login" ? "active" : ""}
          aria-current={type === "login" ? "page" : undefined}
        >
          ĐĂNG NHẬP
        </a>

        <a
          href="/dang-ky"
          className={type === "register" ? "active" : ""}
          aria-current={type === "register" ? "page" : undefined}
        >
          ĐĂNG KÝ
        </a>
      </nav>

      <section className="auth-page-card">
        <a className="auth-brand" href="/">
          rookie
        </a>

        <Auth key={type} c={authCustomer} />
      </section>
    </div>
  </main>
);
}