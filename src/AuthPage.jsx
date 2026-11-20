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

  return (
    <main className="auth-page">
      <a className="auth-back" href="/">
        ← Về trang chủ
      </a>

      <section className="auth-page-card">
        <a className="auth-brand" href="/">rookie</a>
        <Auth key={type} c={authCustomer} />
      </section>
    </main>
  );
}