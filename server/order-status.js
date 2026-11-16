// Local development/staff utility; deliberately not exposed to customer HTTP routes.
import { openDatabase, transaction } from "./db.js";
const [id, status] = process.argv.slice(2),
  db = openDatabase();
const next = {
  pending: "processing",
  processing: "shipping",
  shipping: "delivered",
};
try {
  transaction(db, () => {
    const o = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!o)
      throw Error(
        "Không tìm thấy đơn hàng. Cú pháp: npm run order:status -- <mã đơn> <processing|shipping|delivered>",
      );
    if (next[o.status] !== status)
      throw Error(
        "Trạng thái tiếp theo hợp lệ: " + (next[o.status] || "không có"),
      );
    db.prepare("UPDATE orders SET status=?,payment_status=? WHERE id=?").run(
      status,
      status === "delivered" ? "paid" : o.payment_status,
      id,
    );
    db.prepare(
      "INSERT INTO order_events(order_id,status,created) VALUES(?,?,?)",
    ).run(id, status, new Date().toISOString());
  });
  console.log(`Đã cập nhật ${id}: ${status}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
