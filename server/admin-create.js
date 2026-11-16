// Local dev utility: create or reset an account's password, bypassing the signup password policy.
import { randomUUID } from "node:crypto";
import { openDatabase } from "./db.js";
import { encode } from "./app.js";
const [email, password] = process.argv.slice(2);
if (process.env.NODE_ENV === "production") {
  console.error("Không dùng lệnh này ở production. Hãy đăng ký với mật khẩu mạnh.");
  process.exit(1);
}
if (!email?.includes("@") || !password) {
  console.error("Cú pháp: npm run admin:create -- <email> <mật khẩu>");
  process.exit(1);
}
const db = openDatabase(),
  e = email.trim().toLowerCase(),
  old = db.prepare("SELECT id FROM users WHERE email=?").get(e);
if (old) db.prepare("UPDATE users SET password=? WHERE id=?").run(encode(password), old.id);
else
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
    randomUUID(),
    "Quản trị viên",
    e,
    // shortcut: placeholder phone; edit it in the profile page if the admin also shops.
    "0" + String(Date.now()).slice(-9),
    "",
    encode(password),
  );
db.close();
console.log(`${old ? "Đã đặt lại mật khẩu" : "Đã tạo tài khoản"} ${e}. Nhớ thêm email này vào ADMIN_EMAILS trong .env.`);
