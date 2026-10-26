import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { InputError, isoDate, validBirthDate, effectiveStatus } from "./server/rules";
import { normalizeExcelRow } from "./src/utils/excel";
import { mountIntegration } from './server/integration';
import { mountCatalogs } from './server/catalogs';
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import * as XLSX from "xlsx";
import {
  initSeedData,
  getPublicCertificateByToken,
  lookupPublicCertificates,
  getAdminCertificates,
  getCertificateById,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  getDashboardStats,
  authenticateAdmin,
  getSecuritySettings,
  updateSecuritySettings,
  logSecurityEvent,
  getAllSchools,
  createSchool,
  updateSchool,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  formatAddress,
  normalizeScoreToScale10,
  db
} from "./server/db.ts";

// Base directories
const DIST_DIR = path.join(process.cwd(), 'dist', 'client');

// Rate Limiters
const globalLimiter = rateLimit({
  // Integration has its own IP limiter and persistent per-key quota.
  skip: req => req.originalUrl.split('?')[0] === '/api/v1/certificates/verify',
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Quá nhiều yêu cầu từ IP của bạn, vui lòng thử lại sau 15 phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

const lookupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30, // 30 requests per minute
  message: { error: "Thao tác tra cứu quá nhanh. Để đảm bảo an toàn thông tin, vui lòng chờ 1 phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Vượt quá số lần thử đăng nhập (tối đa 15 lần/15 phút). Vui lòng thử lại sau." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input Sanitizer to block XSS and malicious injections
function sanitizeInput(obj: any): any {
  if (typeof obj === 'string') {
    return obj
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();
  } else if (Array.isArray(obj)) {
    return obj.map(sanitizeInput);
  } else if (obj !== null && typeof obj === 'object') {
    const sanitized: any = Object.create(null);
    for (const key of Object.keys(obj)) {
      if (['__proto__','prototype','constructor'].includes(key)) continue;
      sanitized[key] = key === 'password' ? obj[key] : sanitizeInput(obj[key]);
    }
    return sanitized;
  }
  return obj;
}

// Simple Bearer Token Auth Middleware for Admin with 24-Hour Expiration
const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours auto-logout
const activeSessions = new Map<string, { user: any; createdAt: number }>();

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];

  }

  if (!token) {
    return res.status(401).json({ error: "Yêu cầu đăng nhập quản trị viên." });
  }
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
  }

  // Enforce automatic session expiration after 24 hours
  if (Date.now() - session.createdAt > SESSION_EXPIRATION_MS) {
    activeSessions.delete(token);
    return res.status(401).json({ error: "Phiên đăng nhập đã tự động hết hạn sau 24 giờ. Vui lòng đăng nhập lại." });
  }

  const current = getUserById(session.user.id);
  if (!current || current.status !== 'ACTIVE' || !['SUPERADMIN','SCHOOL_ADMIN','INSPECTOR'].includes(current.role)
    || (current.role === 'SCHOOL_ADMIN' && !current.schoolCode)) {
    activeSessions.delete(token);
    return res.status(401).json({error:'Tài khoản đã bị vô hiệu hóa hoặc thay đổi quyền.'});
  }
  (req as any).user = current;
  next();
}

function revokeUserSessions(userId: string) {
  for (const [token, session] of activeSessions) if (session.user.id === userId) activeSessions.delete(token);
}
function requireSuperadmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req as any).user.role !== 'SUPERADMIN') return res.status(403).json({error:'Yêu cầu quyền quản trị hệ thống.'});
  next();
}

// Periodic cleanup of sessions expired after 24h
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_EXPIRATION_MS) {
      activeSessions.delete(token);
    }
  }
}, 15 * 60 * 1000);

async function startServer() {
  const app = express();
  app.set('trust proxy', process.env.TRUSTED_PROXIES ? process.env.TRUSTED_PROXIES.split(',').map(s=>s.trim()) : false);
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize DB and sample data
  try {
    initSeedData();
    console.log("Database initialized and verified.");
  } catch (err) {
    throw err;
  }

  // HTTP Security Headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Disable caching on sensitive API routes
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // Body parser with size limits
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Bound parsing and audit writes independently of the general API budget.
  app.use('/api/security/log-event', rateLimit({windowMs:60_000,limit:10,standardHeaders:true,legacyHeaders:false}));

  // Sanitize incoming payloads
  app.use((req, _res, next) => {
    if (req.body) req.body = sanitizeInput(req.body);
    if (req.query) req.query = sanitizeInput(req.query);
    if (req.params) req.params = sanitizeInput(req.params);
    next();
  });

  if (process.env.APP_STOP_TOKEN) {
    app.post('/api/internal/stop', (req, res) => {
      const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
      const received = Buffer.from(req.headers.authorization || '');
      const expected = Buffer.from('Bearer ' + process.env.APP_STOP_TOKEN);
      if (!local || received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return res.status(403).json({error:'Không có quyền dừng phiên server.'});
      res.once('finish', () => shutdown());
      res.json({success:true});
    });
  }
  app.use("/api/", globalLimiter);

  // -------------------------------------------------------------
  // PUBLIC ENDPOINTS (Masked data, Zero leak)
  // -------------------------------------------------------------

  // 1. Verify certificate by unique cryptographic token (replica of taphuanvantai.vn/verify-certificate/:token)
  app.get("/api/public/verify-certificate/:token", lookupLimiter, (req, res) => {
    const token = req.params.token;
    if (!token || token.length < 8) {
      return res.status(400).json({ success: false, error: "Mã định danh chứng nhận không hợp lệ." });
    }

    const cert = getPublicCertificateByToken(token);
    if (!cert) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy Giấy chứng nhận hoặc mã xác thực không tồn tại/đã bị hủy."
      });
    }

    return res.json({
      success: true,
      data: cert
    });
  });

  // 2. Public lookup by (CCCD + Full Name + DOB) OR (GPLX + Full Name + DOB) OR Certificate Number
  app.post("/api/public/lookup", lookupLimiter, (req, res) => {
    const { lookupType, cccd, licenseNumber, fullName, dateOfBirth } = req.body || {};
    const identifier = lookupType === 'cccd' ? cccd : licenseNumber;
    if (!['cccd','license'].includes(lookupType) || typeof fullName !== 'string' || !fullName.trim()
      || !isoDate(dateOfBirth) || typeof identifier !== 'string' || !/^\d{12}$/.test(identifier)) {
      return res.status(400).json({success:false,error:'Vui lòng nhập loại tra cứu, số CCCD/GPLX 12 chữ số, họ tên đầy đủ và ngày sinh hợp lệ.'});
    }
    const results = lookupPublicCertificates({lookupType,cccd,licenseNumber,fullName,dateOfBirth});

    return res.json({
      success: true,
      count: results.length,
      data: results
    });
  });

  // 2.1 Public Schools List (from SQLite database)
  app.get("/api/public/schools", (_req, res) => {
    try {
      const schools = getAllSchools().map(({sampleToken: _token, ...school}) => ({...school,sampleToken:''}));
      res.json({ success: true, count: schools.length, data: schools });
    } catch (err: any) {
      res.status(500).json({ success: false, error: "Không thể lấy danh sách cơ sở đào tạo." });
    }
  });

  // 2.2 Create new training school (Superadmin only)
  app.post("/api/schools", requireAdminAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'SUPERADMIN') {
        return res.status(403).json({ success: false, error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền thêm cơ sở đào tạo." });
      }
      const { name, code } = req.body;
      if (!name || !code) {
        return res.status(400).json({ success: false, error: "Tên trường và Mã trường là bắt buộc." });
      }
      const newSchool = createSchool(req.body);
      logSecurityEvent('CREATE_SCHOOL', newSchool.code, req.ip || '', req.headers['user-agent'] || '', { id: newSchool.id, name: newSchool.name, by: user.username });
      res.json({ success: true, data: newSchool });
    } catch (err: any) {
      res.status(err instanceof InputError ? 400 : 409).json({ success: false, error: err instanceof InputError ? err.message : 'Mã cơ sở đã tồn tại hoặc dữ liệu không hợp lệ.' });
    }
  });

  // 2.3 Update training school (Superadmin only, supports toggling isActive)
  app.put("/api/schools/:id", requireAdminAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'SUPERADMIN') {
        return res.status(403).json({ success: false, error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền chỉnh sửa cơ sở đào tạo." });
      }
      const updated = updateSchool(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: "Không tìm thấy cơ sở đào tạo để cập nhật." });
      }
      logSecurityEvent('UPDATE_SCHOOL', updated.code, req.ip || '', req.headers['user-agent'] || '', { id: updated.id, isActive: updated.isActive, status: updated.status, by: user.username });
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(err instanceof InputError ? 400 : 500).json({ success: false, error: err instanceof InputError ? err.message : 'Không thể cập nhật cơ sở đào tạo.' });
    }
  });

  // 3. Public security configuration (Anti-F12, right click restrictions)
  app.get("/api/public/security-config", (_req, res) => {
    const settings = getSecuritySettings();
    res.json({
      success: true,
      data: {
        antiF12Enabled: settings.antiF12Enabled,
        disableRightClick: settings.disableRightClick,
        detectDevTools: settings.detectDevTools,
        watermarkText: settings.watermarkText
      }
    });
  });

  // 4. Log client-side security events (e.g. user pressing F12 or opening DevTools)
  app.post("/api/security/log-event", (req, res) => {
    const { action, target } = req.body || {};
    if (typeof action !== 'string' || action.length > 64 || (target !== undefined && (typeof target !== 'string' || target.length > 128))) return res.status(400).json({error:'Sự kiện không hợp lệ.'});
    // Client claims can never impersonate trusted server audit actions.
    logSecurityEvent('CLIENT_EVENT', String(target || 'CLIENT'), req.ip || '', req.headers['user-agent'] || '', {reportedAction:action});
    res.json({ success: true });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION ENDPOINTS
  // -------------------------------------------------------------

  app.post("/api/auth/login", authLimiter, [
    body("username").trim().notEmpty().withMessage("Tên đăng nhập không được để trống"),
    body("password").isString().isLength({ min: 1, max: 128 }).withMessage("Mật khẩu không được để trống"),
  ], (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { username, password } = req.body;
    const user = authenticateAdmin(username, password);

    if (!user) {
      logSecurityEvent('LOGIN_FAILED', username, req.ip || '', req.headers['user-agent'] || '');
      return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không chính xác." });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    activeSessions.set(sessionToken, {
      user,
      createdAt: Date.now()
    });

    logSecurityEvent('LOGIN_SUCCESS', username, req.ip || '', req.headers['user-agent'] || '');

    res.json({
      success: true,
      token: sessionToken,
      user
    });
  });

  app.post("/api/auth/logout", requireAdminAuth, (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      activeSessions.delete(token);
    }
    res.json({ success: true, message: "Đã đăng xuất." });
  });

  app.get("/api/auth/me", requireAdminAuth, (req, res) => {
    res.json({ success: true, user: (req as any).user });
  });

  // -------------------------------------------------------------
  // ADMIN & SCHOOL MANAGEMENT ENDPOINTS (Authorized Personnel Only)
  // -------------------------------------------------------------

  // Dashboard Stats
  app.get("/api/admin/stats", requireAdminAuth, (_req, res) => {
    const user = (_req as any).user;
    const stats = getDashboardStats(user.role === 'SCHOOL_ADMIN' ? user.schoolCode : undefined);
    res.json({ success: true, data: stats });
  });

  // List all driver certificates with filters & pagination (Supports authorized admin and safe public view)
  app.get("/api/admin/certificates", requireAdminAuth, (req, res) => {
    const { schoolCode, status, courseCode, search, limit, offset, startDate, endDate, dateType } = req.query;
    const user = (req as any).user;

    // School admin can only view their own school
    let effectiveSchoolCode = schoolCode ? String(schoolCode) : undefined;
    if (user && user.role === 'SCHOOL_ADMIN' && user.schoolCode) {
      effectiveSchoolCode = user.schoolCode;
    }

    const result = getAdminCertificates({
      schoolCode: effectiveSchoolCode,
      status: status ? String(status) : undefined,
      courseCode: courseCode ? String(courseCode) : undefined,
      search: search ? String(search) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      dateType: dateType ? String(dateType) as any : undefined,
      limit: limit !== undefined ? Number(limit) : 50,
      offset: offset !== undefined ? Number(offset) : 0
    });

    const items = result.items;

    res.json({
      success: true,
      items,
      total: result.total
    });
  });

  // Helper function: Validate birth date format & age
  const isValidBirthDate = validBirthDate;

  // -------------------------------------------------------------
  // 1. SPECIFIC EXCEL ENDPOINTS (Registered BEFORE :id parameter)
  // -------------------------------------------------------------

  // Download Sample Excel Template for Import (Text Format @ for all columns)
  app.get(["/api/admin/certificates/sample-excel", "/api/admin/sample-excel"], (_req, res) => {
    const sampleRows = [
      {
        'STT': '1',
        'Họ và tên': 'NGUYỄN VĂN AN',
        'Số CCCD': '079087019284',
        'Ngày sinh': '14/08/1987',
        'Số GPLX': '790158291039',
        'Hạng GPLX': 'Hạng E (Xe khách trên 30 chỗ)',
        'Số điện thoại': '0903819283',
        'Địa chỉ thường trú': '142 Nguyễn Thị Minh Khai, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
        'Trường / Cơ Sở Đào Tạo': 'Trường Trung cấp Giao thông Vận tải Miền Nam',
        'Mã Cơ Sở': 'TCGTVT-MN',
        'Mã Lớp': 'TH-2024-E-K12',
        'Khóa Đào Tạo': 'Tập huấn nghiệp vụ người lái xe kinh doanh vận tải và an toàn giao thông',
        'Đơn vị phối hợp': 'Hiệp hội Vận tải Ô tô TP. Hồ Chí Minh',
        'Đơn vị KDVT': 'Công ty Cổ phần Xe khách Phương Nam',
        'Điều kiện kiểm tra': 'Đủ điều kiện kiểm tra',
        'Thời gian bắt đầu': '10/05/2024',
        'Thời gian kết thúc': '16/05/2024',
        'Ngày kiểm tra': '17/05/2024',
        'Điểm kiểm tra': '9.6',
        'Kết quả': 'Đạt',
        'Ngày cấp': '18/05/2024',
        'Có giá trị đến': '18/05/2027'
      },
      {
        'STT': '2',
        'Họ và tên': 'TRẦN QUỐC BẢO',
        'Số CCCD': '079092008472',
        'Ngày sinh': '25/03/1992',
        'Số GPLX': '790219482910',
        'Hạng GPLX': 'Hạng C (Xe tải trên 3.5 tấn)',
        'Số điện thoại': '0918726354',
        'Địa chỉ thường trú': '78 Lê Văn Sỹ, Phường 13, Quận Phú Nhuận, TP. Hồ Chí Minh',
        'Trường / Cơ Sở Đào Tạo': 'Trường Cao đẳng Giao thông Vận tải Trung ương III',
        'Mã Cơ Sở': 'CDGTVT-TW3',
        'Mã Lớp': 'TH-2024-C-K05',
        'Khóa Đào Tạo': 'Tập huấn kỹ năng lái xe an toàn và nghiệp vụ vận tải hàng hóa',
        'Đơn vị phối hợp': 'Hợp tác xã Vận tải Hàng hóa Sài Gòn',
        'Đơn vị KDVT': 'Công ty TNHH Vận tải & Logistics Tiến Đạt',
        'Điều kiện kiểm tra': 'Đủ điều kiện kiểm tra',
        'Thời gian bắt đầu': '20/05/2024',
        'Thời gian kết thúc': '30/05/2024',
        'Ngày kiểm tra': '01/06/2024',
        'Điểm kiểm tra': '9.2',
        'Kết quả': 'Đạt',
        'Ngày cấp': '02/06/2024',
        'Có giá trị đến': '02/06/2027'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);

    // Format all cells as explicit Text (@)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:R3');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].t = 's'; // Force type String
          worksheet[cellAddress].z = '@'; // Force Excel Text format
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauHocVien");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=Mau_Danh_Sach_Hoc_Vien_Tap_Huan_TEXT_FORMAT.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  });

  // Export Certificates to Excel
  app.get(["/api/admin/certificates/export-excel", "/api/admin/export-excel"], requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    let sql = 'SELECT * FROM certificates';
    const params: any[] = [];

    // School admin can only export their own school certificates
    if (user.role === 'SCHOOL_ADMIN' && user.schoolCode) {
      sql += ' WHERE schoolCode = ?';
      params.push(user.schoolCode);
    }
    sql += ' ORDER BY createdAt DESC';

    const certs = db.prepare(sql).all(...params) as any[];
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

    const excelData = certs.map((c, idx) => ({
      'STT': String(idx + 1),
      'Mã Token Xác Thực (Token)': String(c.qrToken || ''),
      'Đường Dẫn Xác Thực Trực Tiếp': `${baseUrl}/verify-certificate/${c.qrToken}`,
      'Số Giấy Chứng Nhận': String(c.certificateNumber || ''),
      'Số Quyết Định': String(c.decisionNumber || ''),
      'Họ và Tên': String(c.fullName || ''),
      'Ngày Sinh': String(c.dateOfBirth || ''),
      'Số CCCD': String(c.cccdNumber || ''),
      'Số GPLX': String(c.licenseNumber || ''),
      'Hạng GPLX': String(c.licenseClass || ''),
      'Địa Chỉ Thường Trú': formatAddress(c.address),
      'Đơn Vị KDVT': String(c.transportUnit || ''),
      'Trường / Cơ Sở Đào Tạo': String(c.schoolName || ''),
      'Mã Cơ Sở': String(c.schoolCode || ''),
      'Mã Lớp': String(c.courseCode || ''),
      'Chương Trình Tập Huấn': String(c.courseName || ''),
      'Đơn Vị Phối Hợp': String(c.coorganizingUnit || ''),
      'Điều Kiện Kiểm Tra': String(c.examEligibility || 'Đủ điều kiện kiểm tra'),
      'Thời Gian Bắt Đầu': String(c.trainingStartDate || ''),
      'Thời Gian Kết Thúc': String(c.trainingEndDate || ''),
      'Ngày Kiểm Tra': String(c.examDate || ''),
      'Điểm Kiểm Tra': String(c.examScore || ''),
      'Kết Quả': String(c.examResult || ''),
      'Trạng Thái GCN': effectiveStatus(c) === 'ISSUED' ? 'Đã cấp' : effectiveStatus(c) === 'EXPIRED' ? 'Hết hạn' : effectiveStatus(c) === 'PENDING' ? 'Chưa cấp' : 'Thu hồi',
      'Ngày Cấp': String(c.issueDate || ''),
      'Có Giá Trị Đến': String(c.validUntil || ''),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Format all cells as explicit Text (@)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:S1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].t = 's'; // Force type String
          worksheet[cellAddress].z = '@'; // Force Excel Text format
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DanhSachChungNhan");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename=Danh_Sach_Giay_Chung_Nhan_Lai_Xe_${Date.now()}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  });

  // Import Excel Batch List with Strict Input Validation
  app.post(["/api/admin/certificates/import-excel", "/api/admin/import-excel"], requireAdminAuth, (req, res) => {
    const { rows, schoolName, schoolCode, courseCode, courseName, importValidOnly } = req.body;
    const user = (req as any).user;

    if (user.role === 'INSPECTOR') {
      return res.status(403).json({ error: "Thanh tra viên chỉ có quyền tra cứu, không có quyền nhập hồ sơ học viên." });
    }

    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
      return res.status(400).json({ error: "Không có dữ liệu học viên để nhập." });
    }

    const errorDetails: { row: number; fullName: string; cccd: string; license: string; dob: string; reasons: string[] }[] = [];
    const validatedRows: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || typeof rows[i] !== 'object' || Array.isArray(rows[i])) return res.status(400).json({error:'Dòng Excel không hợp lệ.'});
      const r = normalizeExcelRow(rows[i]);
      const rowNum = i + 1;
      const reasons: string[] = [];

      const fullName = String(r['Họ và tên'] || r['Họ tên'] || r['FullName'] || r['fullName'] || '').trim();
      const rawCccd = String(r['Số CCCD'] || r['CCCD'] || r['Số CMND'] || r['cccdNumber'] || '').trim();
      const rawLicense = String(r['Số GPLX'] || r['GPLX'] || r['licenseNumber'] || '').trim();
      const rawDob = String(r['Ngày sinh'] || r['Năm sinh'] || r['dateOfBirth'] || '').trim();
      const rawPhone = String(r['Số điện thoại'] || r['SĐT'] || r['phoneNumber'] || '').trim();

      // 1. Kiểm tra Họ và tên
      if (!fullName) {
        reasons.push("Họ và tên học viên không được để trống");
      }

      // 2. Kiểm tra Số CCCD (Bắt buộc 12 số)
      let cleanCccd = rawCccd.replace(/\s+/g, '');
      if (/^\d{11}$/.test(cleanCccd)) {
        cleanCccd = '0' + cleanCccd; // Bù số 0 đầu nếu Excel cắt mất
      }
      if (!/^\d{12}$/.test(cleanCccd)) {
        reasons.push(`Số CCCD phải gồm đúng 12 chữ số (Thực tế: '${rawCccd || 'trống'}')`);
      }

      // 3. Kiểm tra Số GPLX (Bắt buộc 12 số theo phôi PET)
      let cleanLicense = rawLicense.replace(/\s+/g, '');
      if (/^\d{11}$/.test(cleanLicense)) {
        cleanLicense = '0' + cleanLicense;
      }
      if (!/^\d{12}$/.test(cleanLicense)) {
        reasons.push(`Số GPLX phải gồm đúng 12 chữ số theo phôi PET (Thực tế: '${rawLicense || 'trống'}')`);
      }

      // 4. Kiểm tra Định dạng Ngày sinh
      if (!rawDob) {
        reasons.push("Ngày sinh không được để trống");
      } else if (!isValidBirthDate(rawDob)) {
        reasons.push(`Ngày sinh '${rawDob}' không đúng định dạng (Ví dụ: 14/08/1987 hoặc 1987-08-14) hoặc năm sinh không trong độ tuổi lái xe (1940-2008)`);
      }

      // 5. Kiểm tra Số điện thoại (nếu có)
      let cleanPhone = rawPhone.replace(/\s+/g, '');
      if (/^[35789]\d{8}$/.test(cleanPhone)) {
        cleanPhone = '0' + cleanPhone;
      }
      if (cleanPhone && !/^0\d{9}$/.test(cleanPhone)) {
        reasons.push(`Số điện thoại '${rawPhone}' không hợp lệ (Phải gồm 10 chữ số bắt đầu bằng 0)`);
      }

      if (reasons.length > 0) {
        errorDetails.push({
          row: rowNum,
          fullName: fullName || '(Chưa nhập tên)',
          cccd: rawCccd,
          license: rawLicense,
          dob: rawDob,
          reasons
        });
      } else {
        validatedRows.push({
          rowNum,
          data: r,
          cleanCccd,
          cleanLicense,
          cleanPhone,
          fullName: fullName.toUpperCase(),
          dob: rawDob
        });
      }
    }

    // Nếu phát hiện lỗi và người dùng chưa đồng ý bỏ qua dòng lỗi
    if (errorDetails.length > 0 && !importValidOnly) {
      return res.status(400).json({
        success: false,
        error: `Phát hiện ${errorDetails.length} dòng dữ liệu bị lỗi trong tệp Excel. Vui lòng kiểm tra báo cáo lỗi chi tiết.`,
        totalRows: rows.length,
        validCount: validatedRows.length,
        errorCount: errorDetails.length,
        errors: errorDetails.map(e => `Dòng ${e.row} [${e.fullName}]: ${e.reasons.join('; ')}`),
        errorDetails
      });
    }

    // Tiến hành nhập các dòng hợp lệ
    let importedCount = 0;
    const insertErrors: string[] = [];

    db.exec('SAVEPOINT certificate_import');
    for (const item of validatedRows) {
      try {
        const r = item.data;
        const targetSchoolName = user.role === 'SCHOOL_ADMIN' ? (user.schoolName || schoolName) : (r['Trường / Cơ Sở Đào Tạo'] || schoolName || 'Trường Trung cấp Giao thông Vận tải');
        const targetSchoolCode = user.role === 'SCHOOL_ADMIN' ? (user.schoolCode || schoolCode) : (r['Mã Cơ Sở'] || schoolCode || 'TCGTVT-MN');

        const trainingStart = r['Thời Gian Bắt Đầu'] || r['Thời gian bắt đầu'] || r['Từ ngày'] || undefined;
        const trainingEnd = r['Thời Gian Kết Thúc'] || r['Thời gian kết thúc'] || r['Đến ngày'] || undefined;
        const examDate = r['Ngày Kiểm Tra'] || r['Ngày kiểm tra'] || r['Ngày Thi Sát Hạch'] || r['Ngày thi sát hạch'] || r['Ngày thi'] || undefined;
        const rawAddress = String(
          r['Địa Chỉ Thường Trú'] ||
          r['Địa chỉ thường trú'] ||
          r['Địa chỉ'] ||
          r['Address'] ||
          ''
        ).trim();

        const rawScore = r['Điểm Kiểm Tra'] ?? '';
        const normScore = normalizeScoreToScale10(rawScore);

        createCertificate({
          fullName: item.fullName,
          cccdNumber: item.cleanCccd,
          licenseNumber: item.cleanLicense,
          licenseClass: String(r['Hạng GPLX'] || r['Hạng bằng'] || 'Hạng B2').trim(),
          dateOfBirth: item.dob,
          phoneNumber: item.cleanPhone,
          schoolName: targetSchoolName,
          schoolCode: targetSchoolCode,
          courseCode: String(r['Mã Lớp'] || r['Mã lớp'] || courseCode || 'TH-2024-K01').trim(),
          courseName: String(r['Khóa Đào Tạo'] || r['Khóa đào tạo'] || r['Chương Trình Tập Huấn'] || courseName || 'Tập huấn nghiệp vụ lái xe kinh doanh vận tải').trim(),
          coorganizingUnit: String(r['Đơn Vị Phối Hợp'] || r['Đơn vị phối hợp'] || '').trim(),
          transportUnit: String(r['Đơn Vị KDVT'] || r['Đơn vị KDVT'] || r['Đơn vị kinh doanh vận tải'] || r['Doanh nghiệp'] || '').trim(),
          examEligibility: String(r['Điều Kiện Kiểm Tra'] || r['Điều kiện kiểm tra'] || 'Đủ điều kiện kiểm tra').trim(),
          examScore: normScore.scoreStr,
          examResult: normScore.result,
          trainingStartDate: trainingStart ? String(trainingStart).trim() : undefined,
          trainingEndDate: trainingEnd ? String(trainingEnd).trim() : undefined,
          examDate: examDate ? String(examDate).trim() : undefined,
          status: normScore.result === 'Đạt' ? 'ISSUED' : 'PENDING',
          issueDate: r['Ngày Cấp'] ? String(r['Ngày Cấp']).trim() : r['Ngày cấp'] ? String(r['Ngày cấp']).trim() : undefined,
          validUntil: r['Có Giá Trị Đến'] ? String(r['Có Giá Trị Đến']).trim() : r['Có giá trị đến'] ? String(r['Có giá trị đến']).trim() : undefined,
          address: {
            province: 'TP. Hồ Chí Minh',
            district: '',
            ward: '',
            streetAddress: rawAddress
          }
        }, user.username);

        importedCount++;
      } catch (err: any) {
        insertErrors.push(`Dòng ${item.rowNum}: ${err.message}`);
      }
    }

    if (insertErrors.length && !importValidOnly) {
      db.exec('ROLLBACK TO certificate_import');
      importedCount = 0;
    }
    db.exec('RELEASE certificate_import');
    logSecurityEvent('IMPORT_CERTIFICATES', 'BATCH', req.ip || '', req.headers['user-agent'] || '', {by:user.username,totalRows:rows.length,importedCount,failedCount:errorDetails.length + insertErrors.length});
    res.json({
      success: insertErrors.length === 0,
      importedCount,
      totalRows: rows.length,
      validCount: validatedRows.length,
      errorCount: errorDetails.length,
      errors: insertErrors,
      errorDetails
    });
  });

  // -------------------------------------------------------------
  // 2. PARAMETERIZED CERTIFICATE ROUTES
  // -------------------------------------------------------------

  // Get certificate detail
  app.get("/api/admin/certificates/:id", requireAdminAuth, (req, res) => {
    const cert = getCertificateById(req.params.id);
    if (!cert) return res.status(404).json({ error: "Không tìm thấy hồ sơ." });
    const user = (req as any).user;
    if (user.role === 'SCHOOL_ADMIN' && cert.schoolCode !== user.schoolCode) return res.status(403).json({error:'Bạn chỉ có quyền xem hồ sơ của trường mình.'});
    res.json({ success: true, data: {...cert,status:effectiveStatus(cert)} });
  });

  // Create new certificate
  app.post("/api/admin/certificates", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role === 'INSPECTOR') {
      return res.status(403).json({ error: "Thanh tra viên chỉ có quyền tra cứu, không có quyền cấp mới chứng nhận." });
    }

    const certData = req.body;
    if (!certData.fullName || !certData.cccdNumber || !certData.licenseNumber) {
      return res.status(400).json({ error: "Vui lòng điền đủ: Họ tên, số CCCD và số Giấy phép lái xe." });
    }

    // School admin is strictly bound to their school
    if (user.role === 'SCHOOL_ADMIN') {
      certData.schoolName = user.schoolName || certData.schoolName;
      certData.schoolCode = user.schoolCode || certData.schoolCode;
    }

    const newCert = createCertificate(certData, user.username);
    logSecurityEvent('CREATE_CERTIFICATE', newCert.certificateNumber, req.ip || '', req.headers['user-agent'] || '', { id: newCert.id, by: user.username });

    res.json({ success: true, data: {...newCert,status:effectiveStatus(newCert)} });
  });

  // Update certificate
  app.put("/api/admin/certificates/:id", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role === 'INSPECTOR') {
      return res.status(403).json({ error: "Thanh tra viên chỉ có quyền tra cứu, không có quyền chỉnh sửa hồ sơ." });
    }

    const existing = getCertificateById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Không tìm thấy hồ sơ để cập nhật." });

    if (user.role === 'SCHOOL_ADMIN' && existing.schoolCode !== user.schoolCode) {
      return res.status(403).json({ error: "Bạn chỉ có quyền chỉnh sửa hồ sơ thuộc cơ sở đào tạo của mình." });
    }

    // School admin cannot change school assignment of certificate
    if (user.role === 'SCHOOL_ADMIN') {
      req.body.schoolCode = existing.schoolCode;
      req.body.schoolName = existing.schoolName;
    }

    const updated = updateCertificate(req.params.id, req.body);
    logSecurityEvent('UPDATE_CERTIFICATE', updated?.certificateNumber || req.params.id, req.ip || '', req.headers['user-agent'] || '', { id: updated?.id, by: user.username });
    res.json({ success: true, data: updated ? {...updated,status:effectiveStatus(updated)} : null });
  });

  // Delete certificate (Allowed for Superadmin only)
  app.delete("/api/admin/certificates/:id", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'SUPERADMIN') {
      return res.status(403).json({ error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền xóa vĩnh viễn hồ sơ chứng nhận." });
    }

    const existing = getCertificateById(req.params.id);
    const success = deleteCertificate(req.params.id);
    if (!success) return res.status(404).json({ error: "Không thể xóa hồ sơ." });

    logSecurityEvent('DELETE_CERTIFICATE', existing?.certificateNumber || req.params.id, req.ip || '', req.headers['user-agent'] || '', { by: user.username });
    res.json({ success: true, message: "Đã xóa hồ sơ thành công." });
  });

  // -------------------------------------------------------------
  // USER MANAGEMENT ENDPOINTS (Superadmin Only: Cấp tài khoản & Phân quyền)
  // -------------------------------------------------------------

  // List all users
  app.get("/api/admin/users", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền xem danh sách tài khoản." });
    }
    const users = getAllUsers();
    res.json({ success: true, data: users });
  });

  // Create new user account & assign permissions
  app.post("/api/admin/users", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền tạo tài khoản." });
    }
    try {
      const { username, fullName, role } = req.body;
      if (!username || !fullName || !role) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ: Tên đăng nhập, Họ tên và Phân quyền." });
      }
      const newUser = createUser(req.body);
      logSecurityEvent('CREATE_USER', newUser.username, req.ip || '', req.headers['user-agent'] || '', { id: newUser.id, role: newUser.role });
      res.json({ success: true, data: newUser });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Lỗi tạo tài khoản." });
    }
  });

  // Update user info, permissions, status or password
  app.put("/api/admin/users/:id", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền cập nhật tài khoản." });
    }
    try {
      const updated = updateUser(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: "Không tìm thấy người dùng." });
      }
      revokeUserSessions(req.params.id);
      logSecurityEvent('UPDATE_USER', updated.username, req.ip || '', req.headers['user-agent'] || '', { id: updated.id, role: updated.role, status: updated.status });
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Lỗi cập nhật tài khoản." });
    }
  });

  // Delete user account
  app.delete("/api/admin/users/:id", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: "Chỉ Quản trị viên Sở Xây dựng mới có quyền xóa tài khoản." });
    }
    try {
      const success = deleteUser(req.params.id);
      if (!success) {
        return res.status(404).json({ success: false, error: "Không tìm thấy người dùng." });
      }
      revokeUserSessions(req.params.id);
      logSecurityEvent('DELETE_USER', req.params.id, req.ip || '', req.headers['user-agent'] || '');
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Lỗi xóa tài khoản." });
    }
  });

  // Security Settings Endpoint
  app.get("/api/admin/security-settings", requireAdminAuth, requireSuperadmin, (_req, res) => {
    res.json({ success: true, data: getSecuritySettings() });
  });

  app.post("/api/admin/security-settings", requireAdminAuth, (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'SUPERADMIN') {
      return res.status(403).json({ error: "Chỉ Quản trị viên cấp cao mới có quyền thay đổi chính sách bảo mật." });
    }
    const updated = updateSecuritySettings(req.body);
    logSecurityEvent('UPDATE_SECURITY_SETTINGS', 'GLOBAL', req.ip || '', req.headers['user-agent'] || '', { by: user.username, settings: updated });
    res.json({ success: true, data: updated });
  });

  // Audit Logs Endpoint
  app.get("/api/admin/audit-logs", requireAdminAuth, requireSuperadmin, (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100').all();
    res.json({ success: true, data: logs });
  });

  // -------------------------------------------------------------
  // VITE DEV SERVER / PRODUCTION STATIC SERVER
  // -------------------------------------------------------------
  mountIntegration(app,requireAdminAuth,requireSuperadmin);
  mountCatalogs(app,requireAdminAuth,requireSuperadmin);
  app.use('/api', (_req,res)=>res.status(404).json({error:'API không tồn tại.'}));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof InputError ? 400 : err.code?.startsWith('ERR_SQLITE') && String(err.message).includes('UNIQUE') ? 409 : Number(err.status) || 500;
    res.status(status).json({success:false,error: status === 400 ? (err instanceof InputError ? err.message : 'Dữ liệu yêu cầu không hợp lệ.') : status === 409 ? 'Dữ liệu đã tồn tại.' : 'Không thể xử lý yêu cầu.'});
  });
  const isProduction = process.env.NODE_ENV !== "development";
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          usePolling: true,
          interval: 1000
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = DIST_DIR;
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, process.env.HOST || "127.0.0.1", () => {
    console.log(`=======================================================`);
    console.log(`  Driver Training & Certificate Verification System   `);
    console.log(`  Server running on http://localhost:${PORT}          `);

    console.log(`=======================================================`);
  });
  const shutdown = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch(err => {
  console.error("Fatal server error:", err);
  process.exit(1);
});
