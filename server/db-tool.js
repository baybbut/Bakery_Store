// Share shop data through the committed SQL file database/rookie.sql.
//   npm run db:export  -> write the current database into database/rookie.sql
//   npm run db:import  -> rebuild the database from database/rookie.sql (old file kept as .bak)
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase, dumpSql, seedPath } from "./db.js";
const cmd = process.argv[2],
  dbPath = process.env.DATABASE_PATH || resolve("data/rookie.sqlite");
if (cmd === "export") {
  const db = openDatabase(dbPath);
  mkdirSync(dirname(seedPath), { recursive: true });
  writeFileSync(seedPath, dumpSql(db));
  db.close();
  console.log(`Đã xuất dữ liệu ra ${seedPath}.`);
  console.log("Lưu ý: file chứa thông tin khách hàng và mật khẩu đã mã hóa. Chỉ commit dữ liệu demo.");
} else if (cmd === "import") {
  if (!existsSync(seedPath)) {
    console.error(`Không tìm thấy ${seedPath}.`);
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    for (const ext of ["", "-wal", "-shm"])
      if (existsSync(dbPath + ext)) renameSync(dbPath + ext, `${dbPath}${ext}.${stamp}.bak`);
  } catch (e) {
    console.error("Không đổi tên được file dữ liệu cũ. Hãy dừng `npm run dev` (Ctrl+C) rồi chạy lại.\n" + e.message);
    process.exit(1);
  }
  openDatabase(dbPath).close();
  console.log(`Đã nạp dữ liệu từ ${seedPath}. Bản cũ được giữ tại ${dbPath}.${stamp}.bak`);
} else {
  console.error("Cú pháp: npm run db:export | npm run db:import");
  process.exit(1);
}
