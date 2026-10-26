import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..');
const pidFile = path.join(root,'storage','server-process.json');
if (!fs.existsSync(pidFile)) {console.log('Không có phiên server do launcher quản lý.');process.exit(0);}
const saved = JSON.parse(fs.readFileSync(pidFile,'utf8'));
if (saved.root !== root || !/^[a-f0-9]{64}$/.test(saved.instance)) throw new Error('Thông tin phiên server không hợp lệ.');
// Authenticate to this specific application instance instead of killing by PID or port.
const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/internal/stop`,{method:'POST',headers:{Authorization:'Bearer '+saved.instance}});
if (!response.ok) throw new Error('Không thể xác thực phiên server để dừng.');
console.log('Đã yêu cầu server đóng an toàn.');
