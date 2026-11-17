// Local utility: create an admin account, or reset its password and re-enable it.
// It bypasses the password policy so a demo admin can use a short password.
import { openDatabase } from "./db.js";
import { encode } from "./app.js";
import { createStaff } from "./admin.js";
const [rawEmail, password] = process.argv.slice(2);
if (process.env.NODE_ENV === "production") {
  console.error("Không dùng lệnh này ở production. Hãy tạo admin với mật khẩu mạnh.");
  process.exit(1);
}
if (!rawEmail?.includes("@") || !password) {
  console.error("Cú pháp: npm run admin:create -- <email> <mật khẩu>");
  process.exit(1);
}
const db = openDatabase(),
  email = rawEmail.trim().toLowerCase(),
  old = db.prepare("SELECT id FROM staff WHERE email=?").get(email);
if (old)
  db.prepare("UPDATE staff SET password=?,role='admin',active=1 WHERE id=?").run(encode(password), old.id);
else createStaff(db, encode, { name: "Quản trị viên", email, role: "admin", password });
// Older versions stored the admin as a customer row; drop it if it never ordered.
try {
  const u = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (u && !db.prepare("SELECT 1 FROM orders WHERE user_id=?").get(u.id)) {
    for (const t of ["sessions", "resets", "cart", "favorites", "reviews", "payment_attempts"])
      db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(u.id);
    db.prepare("DELETE FROM users WHERE id=?").run(u.id);
  }
} catch (e) {
  console.warn("Không dọn được tài khoản khách cũ trùng email:", e.message);
}
db.close();
console.log(`${old ? "Đã đặt lại mật khẩu" : "Đã tạo tài khoản quản trị"} ${email}.`);
