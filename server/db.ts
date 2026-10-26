import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { InputError, isoDate, todayVN, effectiveStatus, validBirthDate, validatePassword, defaultCertificateExpiry, normalizeCertificateDates } from './rules';
import { DatabaseSync } from 'node:sqlite';
import {
  DriverCertificate,
  PublicCertificateView,
  CertificateStatus,
  AdminUser,
  SecuritySettings,
  DashboardStats
} from '../src/types';

const DB_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'db'));
const DB_FILE = path.join(DB_DIR, 'app.db');
const STORAGE_DIR = path.join(process.cwd(), 'storage');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(DB_DIR);
ensureDir(UPLOADS_DIR);

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Helper to normalize any raw score to scale 10 and auto-determine pass/fail
export function normalizeScoreToScale10(rawScore: any): { scoreStr: string; scoreNum: number; result: 'Đạt' | 'Không đạt' } {
  if (rawScore === null || rawScore === undefined || String(rawScore).trim() === '') {
    return { scoreStr: '', scoreNum: 0, result: 'Không đạt' };
  }
  const str = String(rawScore).trim();
  let num = NaN;

  if (str.includes('/')) {
    const parts = str.split('/');
    const numerator = Number(parts[0].trim());
    const denominator = Number(parts[1].trim());
    if (!isNaN(numerator) && !isNaN(denominator) && denominator > 0) {
      if (denominator === 10) {
        num = numerator;
      } else if (denominator === 100) {
        num = numerator / 10;
      } else {
        num = (numerator / denominator) * 10;
      }
    }
  } else {
    const parsed = Number(str);
    if (!isNaN(parsed)) {
      if (parsed > 10 && parsed <= 100) {
        num = parsed / 10;
      } else {
        num = parsed;
      }
    }
  }

  if (!Number.isFinite(num) || num < 0 || num > 10) throw new InputError('Điểm kiểm tra không hợp lệ.');

  const rounded = Math.round(num * 10) / 10;
  const scoreStr = `${rounded}/10`;
  const result: 'Đạt' | 'Không đạt' = rounded >= 5 ? 'Đạt' : 'Không đạt';

  return { scoreStr, scoreNum: rounded, result };
}

// Automatically update all existing student records in database to scale 10 and auto-set results
export function migrateExistingScoresToScale10() {
  try {
    const rows = db.prepare('SELECT id, examScore, examResult FROM certificates').all() as any[];
    const updateStmt = db.prepare('UPDATE certificates SET examScore = ?, examResult = ? WHERE id = ?');
    for (const r of rows) {
      const norm = normalizeScoreToScale10(r.examScore);
      updateStmt.run(norm.scoreStr, norm.result, r.id);
    }
    console.log(`[DB Migration] Normalized ${rows.length} certificate scores to 10-point scale.`);
  } catch (err) {
    console.error('[DB Migration Error]', err);
  }
}

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS certificate_sequences (year INTEGER PRIMARY KEY, lastNumber INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS certificates (
    id                 TEXT PRIMARY KEY,
    qrToken            TEXT UNIQUE NOT NULL,
    certificateNumber  TEXT UNIQUE NOT NULL,
    decisionNumber     TEXT,
    decisionDate       TEXT,
    fullName           TEXT NOT NULL,
    dateOfBirth        TEXT NOT NULL,
    cccdNumber         TEXT NOT NULL,
    cccdIssueDate      TEXT,
    phoneNumber        TEXT,
    address            TEXT,
    avatarUrl          TEXT,
    licenseNumber      TEXT NOT NULL,
    licenseClass       TEXT NOT NULL,
    licenseIssueDate   TEXT,
    schoolName         TEXT NOT NULL,
    schoolCode         TEXT NOT NULL,
    courseCode         TEXT NOT NULL,
    courseName         TEXT NOT NULL,
    coorganizingUnit   TEXT,
    transportUnit      TEXT,
    examEligibility    TEXT DEFAULT 'Đủ điều kiện',
    examScore          TEXT,
    examResult         TEXT DEFAULT 'Đạt',
    trainingStartDate  TEXT,
    trainingEndDate    TEXT,
    examDate           TEXT,
    status             TEXT DEFAULT 'ISSUED',
    issueDate          TEXT,
    validUntil         TEXT,
    signatoryName      TEXT,
    signatoryTitle     TEXT,
    revokedReason      TEXT,
    notes              TEXT,
    createdAt          TEXT,
    updatedAt          TEXT,
    createdBy          TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_cert_token   ON certificates(qrToken);
  CREATE INDEX IF NOT EXISTS idx_cert_number  ON certificates(certificateNumber);
  CREATE INDEX IF NOT EXISTS idx_cert_cccd    ON certificates(cccdNumber);
  CREATE INDEX IF NOT EXISTS idx_cert_license ON certificates(licenseNumber);
  CREATE INDEX IF NOT EXISTS idx_cert_school  ON certificates(schoolCode);
  CREATE INDEX IF NOT EXISTS idx_cert_status  ON certificates(status);

  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    fullName     TEXT NOT NULL,
    role         TEXT NOT NULL,
    schoolName   TEXT,
    schoolCode   TEXT,
    status       TEXT DEFAULT 'ACTIVE',
    createdAt    TEXT,
    lastLogin    TEXT
  );

  CREATE TABLE IF NOT EXISTS security_settings (
    id       TEXT PRIMARY KEY,
    settings TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id        TEXT PRIMARY KEY,
    action    TEXT NOT NULL,
    target    TEXT,
    ip        TEXT,
    userAgent TEXT,
    timestamp TEXT NOT NULL,
    details   TEXT
  );

  CREATE TABLE IF NOT EXISTS schools (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    code           TEXT NOT NULL UNIQUE,
    address        TEXT,
    phone          TEXT,
    email          TEXT,
    licenseNumber  TEXT,
    classes        TEXT,
    certifiedCount INTEGER DEFAULT 0,
    sampleToken    TEXT,
    isActive       INTEGER DEFAULT 1,
    status         TEXT DEFAULT 'ACTIVE',
    createdAt      TEXT,
    updatedAt      TEXT
  );
`);

// Additive catalog links; keep historical certificate text unchanged.
for (const column of ['trainingProgramId','transportUnitId']) {
  if (!(db.prepare('PRAGMA table_info(certificates)').all() as any[]).some(row=>row.name===column)) {
    db.exec('ALTER TABLE certificates ADD COLUMN '+column+" TEXT NOT NULL DEFAULT ''");
  }
}

// Password Hashing Helper
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  if (!hash.startsWith('scrypt$')) {
    const legacy = crypto.createHash('sha256').update(password.trim() + '_driver_edu_secure_salt_2026').digest('hex');
    return hash.length === legacy.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(legacy));
  }
  const [, salt, expected] = hash.split('$');
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}

// Generate secure random QR Token hash (SHA-256 hex string)
export function generateSecureToken(): string {
  return crypto.randomBytes(20).toString('hex');
}

// Data Masking Helpers to prevent leaking sensitive information
export function maskCCCD(cccd: string): string {
  if (!cccd) return '***';
  const clean = cccd.trim();
  if (clean.length < 6) return '******';
  return clean.slice(0, 3) + '******' + clean.slice(-3);
}

export function maskPhone(phone?: string): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length < 5) return '***';
  return clean.slice(0, 3) + '*****' + clean.slice(-2);
}

export function maskLicense(license: string): string {
  if (!license) return '***';
  const clean = license.trim();
  if (clean.length < 6) return '****';
  return clean.slice(0, 4) + '****' + clean.slice(-4);
}

export function maskAddress(addressInput: any): string {
  if (!addressInput) return 'TP. Hồ Chí Minh';

  const formatObj = (obj: any): string => {
    if (!obj) return 'TP. Hồ Chí Minh';
    if (typeof obj === 'string') return obj.trim() || 'TP. Hồ Chí Minh';
    const street = (obj.streetAddress || '').trim();
    const ward = (obj.ward || '').trim();
    const district = (obj.district || '').trim();
    const province = (obj.province || '').trim();

    // If streetAddress is already a complete address with province/district
    if (street && (street.includes(province) || (district && street.includes(district)))) {
      return street;
    }

    const parts: string[] = [];
    if (street) parts.push(street);
    if (ward && !street.includes(ward)) parts.push(ward);
    if (district && !street.includes(district)) parts.push(district);
    if (province && !street.includes(province)) parts.push(province);
    return parts.filter(Boolean).join(', ') || street || province || 'TP. Hồ Chí Minh';
  };

  if (typeof addressInput === 'object' && addressInput !== null) {
    return formatObj(addressInput);
  }
  try {
    const parsed = JSON.parse(addressInput);
    if (typeof parsed === 'object' && parsed !== null) {
      return formatObj(parsed);
    }
    return String(parsed).trim() || 'TP. Hồ Chí Minh';
  } catch {
    return String(addressInput).trim() || 'TP. Hồ Chí Minh';
  }
}

export function formatAddress(addressInput: any): string {
  return maskAddress(addressInput);
}

export function maskDate(dateStr?: string): string {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return dateStr;
}

// Convert Database row to Safe Public View
// If accessed by direct token, cccd and licenseNumber are unmasked as authorized
export function toPublicCertificate(row: any, isTokenAccess = false): PublicCertificateView {
  const status = effectiveStatus(row);
  const isIssued = status === 'ISSUED';
  const isExpired = status === 'EXPIRED';
  const isRevoked = status === 'REVOKED';

  let statusLabel = 'Đã cấp Giấy chứng nhận';
  if (isRevoked) statusLabel = 'Giấy chứng nhận đã bị thu hồi';
  else if (isExpired) statusLabel = 'Giấy chứng nhận hết hiệu lực';
  else if (row.status === 'PENDING') statusLabel = 'Chưa cấp Giấy chứng nhận';

  // If accessed by direct token, CCCD and License Number are NOT masked!
  const cccdDisplay = isTokenAccess ? row.cccdNumber : maskCCCD(row.cccdNumber);
  const licenseDisplay = isTokenAccess ? row.licenseNumber : maskLicense(row.licenseNumber);

  return {
    qrToken: isTokenAccess ? row.qrToken : '',
    certificateNumber: row.certificateNumber,
    decisionNumber: row.decisionNumber || '',
    decisionDate: maskDate(row.decisionDate),
    fullName: row.fullName,
    dateOfBirthMasked: maskDate(row.dateOfBirth),
    cccd: cccdDisplay,
    cccdMasked: cccdDisplay,
    phoneNumberMasked: maskPhone(row.phoneNumber),
    addressMasked: isTokenAccess ? formatAddress(row.address) : 'Đã ẩn địa chỉ',
    avatarUrl: row.avatarUrl || '',
    licenseNumber: licenseDisplay,
    licenseNumberMasked: licenseDisplay,
    licenseClass: row.licenseClass,
    isTokenAccess,
    schoolName: row.schoolName,
    schoolCode: row.schoolCode,
    courseCode: row.courseCode,
    courseName: row.courseName,
    coorganizingUnit: row.coorganizingUnit || '',
    transportUnit: row.transportUnit || '',
    examEligibility: row.examEligibility || 'Đủ điều kiện',
    examScore: row.examScore || '',
    examResult: row.examResult || 'Đạt',
    trainingStartDate: maskDate(row.trainingStartDate),
    trainingEndDate: maskDate(row.trainingEndDate),
    examDate: maskDate(row.examDate),
    status: isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : (row.status as CertificateStatus),
    statusLabel,
    isIssued,
    isExpired: isExpired && !isRevoked,
    isRevoked,
    issueDate: maskDate(row.issueDate),
    validUntil: maskDate(row.validUntil),
    signatoryName: row.signatoryName || '',
    signatoryTitle: row.signatoryTitle || 'Hiệu trưởng',
    verifiedAt: new Date().toISOString()
  };
}

// Default Security Settings
const DEFAULT_SECURITY: SecuritySettings = {
  antiF12Enabled: true,
  disableRightClick: true,
  detectDevTools: true,
  maskSensitiveDataPublic: true,
  requireTwoFactorLookup: false,
  watermarkText: 'HỆ THỐNG CÔNG BỐ & XÁC THỰC LÁI XE'
};

// Seed initial system data
export function initSeedData() {
  const demo = process.env.ENABLE_DEMO_DATA === 'true' && ['development', 'test'].includes(process.env.NODE_ENV || '');
  // Retire credentials published in earlier releases, including legacy SHA-256 hashes.
  if (!demo) {
    for (const [username, password] of [['admin','Admin@2026!'],['truong.gtvt','Gtvt@2026!'],['thanhtra','Thanhtra@2026!']]) {
      const user = db.prepare('SELECT id, passwordHash FROM users WHERE username = ?').get(username) as any;
      if (user && verifyPassword(password, user.passwordHash)) {
        db.prepare("UPDATE users SET status = 'DISABLED' WHERE id = ?").run(user.id);
      }
    }
    for (const user of db.prepare('SELECT id, passwordHash FROM users').all() as any[]) {
      if (verifyPassword('User@2026!', user.passwordHash)) db.prepare("UPDATE users SET status = 'DISABLED' WHERE id = ?").run(user.id);
    }
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      validatePassword(password);
      if (['Admin@2026!', 'User@2026!', 'Gtvt@2026!', 'Thanhtra@2026!'].includes(password)) throw new InputError('Không sử dụng mật khẩu mẫu.');
      const existing = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
      if (existing) db.prepare("UPDATE users SET passwordHash = ?, status = 'ACTIVE', role = 'SUPERADMIN' WHERE id = ?").run(hashPassword(password), existing.id);
      else createUser({username:'admin',password,fullName:'Quản trị viên',role:'SUPERADMIN'});
      delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    }
  }
  // Check settings
  const settingRow = db.prepare('SELECT settings FROM security_settings WHERE id = ?').get('global') as any;
  if (!settingRow) {
    db.prepare('INSERT INTO security_settings (id, settings) VALUES (?, ?)').run('global', JSON.stringify(DEFAULT_SECURITY));
  }

  // Check Admin accounts
  const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (demo && adminCount.cnt === 0) {
    const now = new Date().toISOString();
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, passwordHash, fullName, role, schoolName, schoolCode, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'admin-1',
      'admin',
      hashPassword('Admin@2026!'),
      'Quản Trị Viên Hệ Thống (Sở Xây Dựng)',
      'SUPERADMIN',
      'Sở Xây Dựng TP.HCM',
      'SXD-HCM',
      'ACTIVE',
      now
    );

    insertUser.run(
      'school-1',
      'truong.gtvt',
      hashPassword('Gtvt@2026!'),
      'Phòng Đào Tạo - Trường TC GTVT Miền Nam',
      'SCHOOL_ADMIN',
      'Trường Trung cấp Giao thông Vận tải Miền Nam',
      'TCGTVT-MN',
      'ACTIVE',
      now
    );

    insertUser.run(
      'inspector-1',
      'thanhtra',
      hashPassword('Thanhtra@2026!'),
      'Thanh Tra Giao Thông & Kiểm Tra Chứng Chỉ',
      'INSPECTOR',
      'Thanh Tra Sở GTVT',
      'TT-GTVT',
      'ACTIVE',
      now
    );
  }

  // Check Schools table
  const schoolCount = db.prepare('SELECT COUNT(*) as cnt FROM schools').get() as { cnt: number };
  if (demo && schoolCount.cnt === 0) {
    const now = new Date().toISOString();
    const insertSchool = db.prepare(`
      INSERT INTO schools (id, name, code, address, phone, email, licenseNumber, classes, certifiedCount, sampleToken, isActive, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialSchools = [
      {
        id: 'school-1',
        name: 'Trường Trung cấp Giao thông Vận tải Miền Nam',
        code: 'TCGTVT-MN',
        address: '252 Lý Chính Thắng, Phường 9, Quận 3, TP. Hồ Chí Minh',
        phone: '(028) 3931 7977 · 0903 819 283',
        email: 'tuyensinh@tcgtvt-miennam.edu.vn',
        licenseNumber: 'Quyết định số 286/QĐ-SXD',
        classes: JSON.stringify(['Hạng B1', 'Hạng B2', 'Hạng C', 'Hạng D', 'Hạng E (Xe khách)', 'Hạng FC']),
        certifiedCount: 1450,
        sampleToken: '3b8404cc15ef3bcae0a25ab4a21fcd6f958c9f38',
        isActive: 1,
        status: 'ACTIVE'
      },
      {
        id: 'school-2',
        name: 'Trường Cao đẳng Giao thông Vận tải Trung ương III',
        code: 'CDGTVT-TW3',
        address: '73 Văn Cao, Phường Phú Thọ Hòa, Quận Tân Phú, TP. Hồ Chí Minh',
        phone: '(028) 3860 5088 · 0918 726 354',
        email: 'daotao@cvct3.edu.vn',
        licenseNumber: 'Quyết định số 312/QĐ-SXD',
        classes: JSON.stringify(['Hạng B2', 'Hạng C (Xe tải)', 'Hạng D', 'Hạng FC (Xe đầu kéo)']),
        certifiedCount: 1120,
        sampleToken: '7f9a21c4e9014588b209d816fe32b00512fa9831',
        isActive: 1,
        status: 'ACTIVE'
      },
      {
        id: 'school-3',
        name: 'Trung tâm Đào tạo và Sát hạch Lái xe ĐH An ninh Nhân dân',
        code: 'TTSH-ANND',
        address: 'Km 18 Xa Lộ Hà Nội, Phường Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh',
        phone: '(028) 3896 3883 · 0983 192 847',
        email: 'ttshlaixe@dhannd.edu.vn',
        licenseNumber: 'Quyết định số 95/QĐ-SXD',
        classes: JSON.stringify(['Hạng B1', 'Hạng B2', 'Hạng C', 'Hạng D (Xe khách 10-30 chỗ)']),
        certifiedCount: 980,
        sampleToken: 'e1b82937fc4591a3cd9081273645bbef90123456',
        isActive: 1,
        status: 'ACTIVE'
      },
      {
        id: 'school-4',
        name: 'Trung tâm GDNN Đào tạo & Sát hạch Lái xe Tiến Bộ',
        code: 'TT-TIENBO',
        address: '111 Tân Sơn Nhì, Phường Tân Sơn Nhì, Quận Tân Phú, TP. Hồ Chí Minh',
        phone: '(028) 3849 6090 · 0978 123 948',
        email: 'hotro@tienbodriving.vn',
        licenseNumber: 'Quyết định số 144/QĐ-SXD',
        classes: JSON.stringify(['Hạng B2', 'Hạng C', 'Hạng FC (Xe đầu kéo siêu trường)']),
        certifiedCount: 760,
        sampleToken: 'a45f901b238cd457e891234056712398b1c4e902',
        isActive: 1,
        status: 'AUDITED'
      },
      {
        id: 'school-5',
        name: 'Trung tâm Đào tạo Lái xe Thống Nhất',
        code: 'TT-THONGNHAT',
        address: '52 Thành Thái, Phường 12, Quận 10, TP. Hồ Chí Minh',
        phone: '(028) 3865 2432',
        email: 'info@laixethongnhat.edu.vn',
        licenseNumber: 'Quyết định số 88/QĐ-SXD',
        classes: JSON.stringify(['Hạng B1', 'Hạng B2', 'Tập huấn Nghiệp vụ Lái xe Taxi / Buýt']),
        certifiedCount: 620,
        sampleToken: '3b8404cc15ef3bcae0a25ab4a21fcd6f958c9f38',
        isActive: 1,
        status: 'ACTIVE'
      }
    ];

    for (const s of initialSchools) {
      insertSchool.run(
        s.id, s.name, s.code, s.address, s.phone, s.email,
        s.licenseNumber, s.classes, s.certifiedCount, s.sampleToken,
        s.isActive, s.status, now, now
      );
    }
  }

  // Check Certificates
  const certCount = db.prepare('SELECT COUNT(*) as cnt FROM certificates').get() as { cnt: number };
  if (demo && certCount.cnt === 0) {
    const now = new Date().toISOString();
    const insertCert = db.prepare(`
      INSERT INTO certificates (
        id, qrToken, certificateNumber, decisionNumber, decisionDate,
        fullName, dateOfBirth, cccdNumber, cccdIssueDate, phoneNumber,
        address, avatarUrl, licenseNumber, licenseClass, licenseIssueDate,
        schoolName, schoolCode, courseCode, courseName, coorganizingUnit,
        transportUnit, examEligibility, examScore, examResult,
        trainingStartDate, trainingEndDate, examDate, status,
        issueDate, validUntil, signatoryName, signatoryTitle,
        notes, createdAt, updatedAt, createdBy
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    // Record matching exactly the user's provided link!
    // https://taphuanvantai.vn/verify-certificate/3b8404cc15ef3bcae0a25ab4a21fcd6f958c9f38
    insertCert.run(
      'cert-sample-01',
      '3b8404cc15ef3bcae0a25ab4a21fcd6f958c9f38',
      'GCN-2024-009182',
      '286/QĐ-TCGTVT',
      '2024-05-18',
      'NGUYỄN VĂN HẢI',
      '1987-08-14',
      '079087019284',
      '2021-09-12',
      '0903819283',
      JSON.stringify({
        streetAddress: '142 Nguyễn Thị Minh Khai',
        ward: 'Phường Võ Thị Sáu',
        district: 'Quận 3',
        province: 'TP. Hồ Chí Minh'
      }),
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
      '790158291039',
      'Hạng E (Xe khách trên 30 chỗ)',
      '2019-06-20',
      'Trường Trung cấp Giao thông Vận tải Miền Nam',
      'TCGTVT-MN',
      'TH-2024-E-K12',
      'Tập huấn nghiệp vụ người lái xe kinh doanh vận tải và an toàn giao thông',
      'Hiệp hội Vận tải Ô tô TP. Hồ Chí Minh',
      'Công ty Cổ phần Xe khách Phương Nam',
      'Đủ điều kiện kiểm tra',
      '9.6/10',
      'Đạt',
      '2024-05-10',
      '2024-05-16',
      '2024-05-17',
      'ISSUED',
      '2024-05-18',
      '2027-05-18',
      'ThS. Lê Hoàng Tuấn',
      'Hiệu trưởng',
      'Học viên hoàn thành xuất sắc khóa tập huấn nghiệp vụ theo Nghị định 10/2020/NĐ-CP.',
      now,
      now,
      'admin'
    );

    // Sample 2: Another valid certificate
    insertCert.run(
      'cert-sample-02',
      '7f9a21c4e9014588b209d816fe32b00512fa9831',
      'GCN-2024-010452',
      '312/QĐ-CĐGTVT3',
      '2024-06-02',
      'TRẦN QUỐC BẢO',
      '1992-03-25',
      '079092008472',
      '2022-04-10',
      '0918726354',
      JSON.stringify({
        streetAddress: '78 Lê Văn Sỹ',
        ward: 'Phường 13',
        district: 'Quận Phú Nhuận',
        province: 'TP. Hồ Chí Minh'
      }),
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      '790219482910',
      'Hạng C (Xe tải trên 3.5 tấn)',
      '2020-11-15',
      'Trường Cao đẳng Giao thông Vận tải Trung ương III',
      'CDGTVT-TW3',
      'TH-2024-C-K05',
      'Tập huấn kỹ năng lái xe an toàn và nghiệp vụ vận tải hàng hóa',
      'Hợp tác xã Vận tải Hàng hóa Sài Gòn',
      'Công ty TNHH Vận tải & Logistics Tiến Đạt',
      'Đủ điều kiện kiểm tra',
      '9.2/10',
      'Đạt',
      '2024-05-25',
      '2024-05-30',
      '2024-05-31',
      'ISSUED',
      '2024-06-02',
      '2027-06-02',
      'TS. Vũ Đình Khoa',
      'Phó Hiệu trưởng',
      'Đã hoàn thành sát hạch lý thuyết và thực hành nghiệp vụ.',
      now,
      now,
      'truong.gtvt'
    );

    // Sample 3: Expired certificate (Hết hiệu lực)
    insertCert.run(
      'cert-sample-03',
      'e1b82937fc4591a3cd9081273645bbef90123456',
      'GCN-2021-003810',
      '95/QĐ-TTSH-ANND',
      '2021-04-10',
      'PHẠM VĂN ĐỨC',
      '1979-12-05',
      '079079001928',
      '2021-01-15',
      '0983192847',
      JSON.stringify({
        streetAddress: '235 Kinh Dương Vương',
        ward: 'Phường An Lạc',
        district: 'Quận Bình Tân',
        province: 'TP. Hồ Chí Minh'
      }),
      '',
      '790102938475',
      'Hạng D (Xe khách 10-30 chỗ)',
      '2018-05-12',
      'Trung tâm Đào tạo và Sát hạch Lái xe Đại học An ninh Nhân dân',
      'TTSH-ANND',
      'TH-2021-D-K02',
      'Tập huấn nghiệp vụ lái xe kinhdong vận tải hành khách',
      'Sở Giao thông Vận tải TP.HCM',
      'Hợp tác xã Xe khách Miền Tây',
      'Đủ điều kiện kiểm tra',
      '8.8/10',
      'Đạt',
      '2021-04-01',
      '2021-04-08',
      '2021-04-09',
      'EXPIRED',
      '2021-04-10',
      '2024-04-10',
      'Đại tá Nguyễn Hữu Trí',
      'Giám đốc Trung tâm',
      'Giấy chứng nhận đã hết hiệu lực 3 năm, yêu cầu đăng ký tập huấn lại.',
      now,
      now,
      'admin'
    );

    // Sample 4: Revoked certificate (Bị thu hồi)
    insertCert.run(
      'cert-sample-04',
      'a45f901b238cd457e891234056712398b1c4e902',
      'GCN-2023-007120',
      '144/QĐ-TH-SGTVT',
      '2023-08-15',
      'HOÀNG THANH TÙNG',
      '1985-04-18',
      '079085002938',
      '2022-03-10',
      '0978123948',
      JSON.stringify({
        streetAddress: '55 Hoàng Văn Thụ',
        ward: 'Phường 4',
        district: 'Quận Tân Bình',
        province: 'TP. Hồ Chí Minh'
      }),
      '',
      '790192847501',
      'Hạng FC (Xe đầu kéo rơ-moóc)',
      '2020-02-14',
      'Trung tâm GDNN Đào tạo & Sát hạch Lái xe Tiến Bộ',
      'TT-TIENBO',
      'TH-2023-FC-K04',
      'Tập huấn nghiệp vụ lái xe ô tô đầu kéo siêu trường siêu trọng',
      'Hiệp hội Vận tải Ô tô',
      'Công ty Cổ phần Vận tải Container Á Châu',
      'Đủ điều kiện kiểm tra',
      '9.0/10',
      'Đạt',
      '2023-08-01',
      '2023-08-08',
      '2023-08-09',
      'REVOKED',
      '2023-08-15',
      '2026-08-15',
      'Nguyễn Văn Tiến',
      'Giám đốc',
      'Vi phạm quy chế sát hạch và bị tước quyền sử dụng GPLX theo quyết định số 45/QĐ-XPHC.',
      now,
      now,
      'thanhtra'
    );
  }

  // Historical scores are preserved; migrations must be explicit and versioned.
}

// -------------------------------------------------------------
// Database Query Functions
// -------------------------------------------------------------

// 1. Public Lookup by Cryptographic QR Token
export function getPublicCertificateByToken(token: string): PublicCertificateView | null {
  const row = db.prepare('SELECT * FROM certificates WHERE qrToken = ?').get(token);
  if (!row) return null;
  return toPublicCertificate(row, true);
}

function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function normalizeDob(dobStr?: string): string {
  if (!dobStr) return '';
  const clean = dobStr.trim();
  const m = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(clean);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return clean;
}

// 2. Public Lookup by CCCD / License Number + Full Name + Date of Birth
export function lookupPublicCertificates(query: {
  searchKey?: string;
  lookupType?: 'cccd' | 'license' | 'certNumber';
  cccd?: string;
  licenseNumber?: string;
  fullName?: string;
  dateOfBirth?: string;
  certificateNumber?: string;
}): PublicCertificateView[] {
  if (!['cccd','license'].includes(query.lookupType || '') || !query.fullName?.trim() || !isoDate(query.dateOfBirth)) return [];
  const value = query.lookupType === 'cccd' ? query.cccd : query.licenseNumber;
  if (typeof value !== 'string' || !/^\d{12}$/.test(value)) return [];
  const column = query.lookupType === 'cccd' ? 'cccdNumber' : 'licenseNumber';
  const rows = db.prepare('SELECT * FROM certificates WHERE ' + column + ' = ?').all(value) as any[];
  const name = removeVietnameseTones(query.fullName).replace(/\s+/g, ' ');
  return rows.filter(row => isoDate(row.dateOfBirth) === isoDate(query.dateOfBirth)
    && removeVietnameseTones(row.fullName).replace(/\s+/g, ' ') === name)
    .map(row => toPublicCertificate(row, false));
}

// -------------------------------------------------------------
// School Directory Management Functions
// -------------------------------------------------------------

export function getAllSchools(): any[] {
  const rows = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM certificates c WHERE c.schoolCode = s.code OR c.schoolName = s.name) AS actualCertifiedCount
    FROM schools s 
    ORDER BY s.isActive DESC, s.name ASC
  `).all() as any[];
  return rows.map(r => ({
    ...r,
    certifiedCount: Number(r.actualCertifiedCount || 0),
    isActive: Boolean(r.isActive),
    classes: r.classes ? (typeof r.classes === 'string' ? JSON.parse(r.classes) : r.classes) : []
  }));
}

export function getSchoolById(id: string): any {
  const row = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM certificates c WHERE c.schoolCode = s.code OR c.schoolName = s.name) AS actualCertifiedCount
    FROM schools s 
    WHERE s.id = ?
  `).get(id) as any;
  if (!row) return null;
  return {
    ...row,
    certifiedCount: Number(row.actualCertifiedCount || 0),
    isActive: Boolean(row.isActive),
    classes: row.classes ? (typeof row.classes === 'string' ? JSON.parse(row.classes) : row.classes) : []
  };
}

export function createSchool(data: any): any {
  validateSchool(data);
  const id = 'school-' + crypto.randomUUID();
  const now = new Date().toISOString();
  const isActive = data.isActive !== false ? 1 : 0;
  const status = isActive ? (data.status || 'ACTIVE') : 'DISABLED';
  const classesJson = Array.isArray(data.classes)
    ? JSON.stringify(data.classes)
    : JSON.stringify(typeof data.classes === 'string' ? data.classes.split(',').map((s: string) => s.trim()).filter(Boolean) : []);

  db.prepare(`
    INSERT INTO schools (id, name, code, address, phone, email, licenseNumber, classes, certifiedCount, sampleToken, isActive, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name.trim(),
    data.code.trim().toUpperCase(),
    data.address || '',
    data.phone || '',
    data.email || '',
    data.licenseNumber || '',
    classesJson,
    0, // Dynamically computed from actual student certificates table
    data.sampleToken || '',
    isActive,
    status,
    now,
    now
  );

  return getSchoolById(id);
}

export function updateSchool(id: string, data: any): any {
  const existing = getSchoolById(id);
  if (!existing) return null;
  validateSchool({...existing,...data});
  if (data.code !== undefined && data.code.trim().toUpperCase() !== existing.code) throw new InputError('Mã cơ sở đã tạo không được thay đổi để bảo toàn liên kết hồ sơ.');
  const now = new Date().toISOString();

  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);
  const status = isActive ? (data.status === 'DISABLED' ? 'ACTIVE' : (data.status || existing.status || 'ACTIVE')) : 'DISABLED';

  let classesJson = existing.classes ? JSON.stringify(existing.classes) : '[]';
  if (data.classes !== undefined) {
    classesJson = Array.isArray(data.classes)
      ? JSON.stringify(data.classes)
      : JSON.stringify(typeof data.classes === 'string' ? data.classes.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
  }

  db.prepare(`
    UPDATE schools SET
      name = ?,
      code = ?,
      address = ?,
      phone = ?,
      email = ?,
      licenseNumber = ?,
      classes = ?,
      sampleToken = ?,
      isActive = ?,
      status = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    data.name !== undefined ? data.name.trim() : existing.name,
    data.code !== undefined ? data.code.trim().toUpperCase() : existing.code,
    data.address !== undefined ? data.address : existing.address,
    data.phone !== undefined ? data.phone : existing.phone,
    data.email !== undefined ? data.email : existing.email,
    data.licenseNumber !== undefined ? data.licenseNumber : existing.licenseNumber,
    classesJson,
    data.sampleToken !== undefined ? data.sampleToken : existing.sampleToken,
    isActive,
    status,
    now,
    id
  );

  return getSchoolById(id);
}

export const CERTIFICATE_STATUS_SQL = "CASE WHEN status IN ('REVOKED','PENDING','EXPIRED') THEN status WHEN (CASE WHEN validUntil LIKE '__/__/____' THEN substr(validUntil,7,4)||'-'||substr(validUntil,4,2)||'-'||substr(validUntil,1,2) ELSE validUntil END) < date('now','+7 hours') THEN 'EXPIRED' ELSE status END";

// 3. Admin: Get all certificates with filters (Unmasked for authorized personnel)
export function getAdminCertificates(filters?: {
  schoolCode?: string;
  status?: string;
  search?: string;
  courseCode?: string;
  startDate?: string;
  endDate?: string;
  dateType?: 'issueDate' | 'validUntil' | 'examDate' | 'decisionDate';
  limit?: number;
  offset?: number;
}): { items: DriverCertificate[]; total: number } {
  let countSql = 'SELECT COUNT(*) as total FROM certificates WHERE 1=1';
  let querySql = 'SELECT * FROM certificates WHERE 1=1';
  const params: any[] = [];

  if (filters?.schoolCode && filters.schoolCode !== 'ALL') {
    countSql += ' AND schoolCode = ?';
    querySql += ' AND schoolCode = ?';
    params.push(filters.schoolCode);
  }

  if (filters?.status && filters.status !== 'ALL') {
    countSql += ' AND (' + CERTIFICATE_STATUS_SQL + ') = ?';
    querySql += ' AND (' + CERTIFICATE_STATUS_SQL + ') = ?';
    params.push(filters.status);
  }

  if (filters?.courseCode && filters.courseCode !== 'ALL') {
    countSql += ' AND courseCode = ?';
    querySql += ' AND courseCode = ?';
    params.push(filters.courseCode);
  }

  if (filters?.search) {
    const term = `%${filters.search.trim()}%`;
    const searchClause = ' AND (fullName LIKE ? OR cccdNumber LIKE ? OR licenseNumber LIKE ? OR certificateNumber LIKE ? OR courseCode LIKE ?)';
    countSql += searchClause;
    querySql += searchClause;
    params.push(term, term, term, term, term);
  }

  // Date filtering
  const rawDateCol = (filters?.dateType && ['issueDate', 'validUntil', 'examDate', 'decisionDate'].includes(filters.dateType))
    ? filters.dateType
    : 'issueDate';

  const normDateExpr = `(CASE WHEN ${rawDateCol} LIKE '__/__/____' THEN substr(${rawDateCol}, 7, 4) || '-' || substr(${rawDateCol}, 4, 2) || '-' || substr(${rawDateCol}, 1, 2) ELSE ${rawDateCol} END)`;

  if (filters?.startDate) {
    const s = filters.startDate.trim();
    countSql += ` AND ${normDateExpr} >= ?`;
    querySql += ` AND ${normDateExpr} >= ?`;
    params.push(s);
  }

  if (filters?.endDate) {
    const e = filters.endDate.trim();
    countSql += ` AND ${normDateExpr} <= ?`;
    querySql += ` AND ${normDateExpr} <= ?`;
    params.push(e);
  }

  const total = (db.prepare(countSql).get(...params) as any).total;

  querySql += ' ORDER BY createdAt DESC';

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) throw new InputError('Phân trang không hợp lệ (limit 1–200, offset >= 0).');
  querySql += ' LIMIT ? OFFSET ?';
  const queryParams = [...params, limit, offset];

  const rows = db.prepare(querySql).all(...queryParams) as any[];

  const items: DriverCertificate[] = rows.map(r => ({
    ...normalizeCertificateDates(r),
    status: effectiveStatus(r),
    address: (() => {
      try {
        return typeof r.address === 'string' ? JSON.parse(r.address) : r.address;
      } catch {
        return { province: 'TP. Hồ Chí Minh', district: '' };
      }
    })()
  }));

  return { items, total };
}

// 4. Admin: Get Certificate by ID
export function getCertificateById(id: string): DriverCertificate | null {
  const row = db.prepare('SELECT * FROM certificates WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...normalizeCertificateDates(row),
    address: (() => {
      try {
        return typeof row.address === 'string' ? JSON.parse(row.address) : row.address;
      } catch {
        return { province: 'TP. Hồ Chí Minh', district: '' };
      }
    })()
  };
}

// 5. Admin: Create Certificate
export type CertificateInput = Omit<Partial<DriverCertificate>, 'address'> & { address?: DriverCertificate['address'] | string };

function validateCertificate(input: CertificateInput, allowInactiveSchool = false, existing?:DriverCertificate): CertificateInput {
  const data = { ...input };
  for (const [field,nameField,table,label] of [
    ['trainingProgramId','courseName','training_programs','Chương trình tập huấn'],
    ['transportUnitId','transportUnit','transport_units','Đơn vị kinh doanh vận tải'],
  ] as const) {
    const selected=data[field];
    if(selected!==undefined && (typeof selected!=='string'||selected.length>100)) throw new InputError(label+' không hợp lệ.');
    if(selected) {
      if(existing && existing[field]===selected) {
        // Editing another field must not rewrite a historical certificate after catalog changes.
        data[nameField]=existing[nameField]||'';
      } else {
        const catalog=db.prepare('SELECT name FROM '+table+' WHERE id=? AND isActive=1').get(selected) as any;
        if(!catalog)throw new InputError(label+' không tồn tại hoặc đã ngừng sử dụng.');
        data[nameField]=catalog.name;
      }
    }
  }
  for (const field of ['certificateNumber','decisionNumber','fullName','cccdNumber','phoneNumber','licenseNumber','licenseClass','schoolCode','courseCode','courseName','coorganizingUnit','transportUnit','examEligibility','signatoryName','signatoryTitle','notes','revokedReason','avatarUrl'] as const) {
    // Older SQLite records may have NULL in optional text columns.
    if (data[field] === null) data[field] = '';
    if (data[field] !== undefined && (typeof data[field] !== 'string' || data[field].length > 2000)) throw new InputError(`Thông tin không hợp lệ: ${field}.`);
  }
  for (const key of ['fullName', 'cccdNumber', 'licenseNumber', 'licenseClass', 'schoolCode', 'courseCode', 'courseName'] as const) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > 500) throw new InputError(`Thiếu hoặc sai thông tin: ${key}.`);
  }
  if (!/^\d{12}$/.test(data.cccdNumber!) || !/^\d{12}$/.test(data.licenseNumber!)) throw new InputError('CCCD và GPLX phải gồm 12 chữ số.');
  if (!validBirthDate(data.dateOfBirth)) throw new InputError('Ngày sinh không hợp lệ hoặc chưa đủ 18 tuổi.');
  const school = db.prepare('SELECT name, isActive FROM schools WHERE code = ?').get(data.schoolCode!) as any;
  if (!school || (!allowInactiveSchool && !school.isActive)) throw new InputError('Cơ sở đào tạo không tồn tại hoặc đã ngừng hoạt động.');
  data.schoolName = school.name;
  for (const field of ['dateOfBirth','cccdIssueDate','licenseIssueDate','trainingStartDate','trainingEndDate','examDate','issueDate','validUntil','decisionDate'] as const) {
    if (data[field]) {
      const normalized = isoDate(data[field]);
      if (!normalized) throw new InputError(`Ngày không hợp lệ: ${field}.`);
      data[field] = normalized;
    }
  }
  if (data.phoneNumber && !/^0\d{9}$/.test(data.phoneNumber)) throw new InputError('Số điện thoại không hợp lệ.');
  if (data.status && !['ISSUED','PENDING','EXPIRED','REVOKED'].includes(data.status)) throw new InputError('Trạng thái GCN không hợp lệ.');
  const score = normalizeScoreToScale10(data.examScore);
  data.examScore = score.scoreStr;
  data.examResult = score.result;
  if ((data.status === 'ISSUED' || data.status === 'EXPIRED') && (score.result !== 'Đạt' || /chưa|không/i.test(data.examEligibility || ''))) throw new InputError('Chưa đủ điều kiện hoặc chưa đạt điểm để cấp GCN.');
  if (!data.status) data.status = score.result === 'Đạt' && !/chưa|không/i.test(data.examEligibility || '') ? 'ISSUED' : 'PENDING';
  if (data.trainingStartDate && data.trainingEndDate && data.trainingStartDate > data.trainingEndDate) throw new InputError('Ngày kết thúc phải sau ngày bắt đầu.');
  if (data.validUntil && data.validUntil < (data.issueDate || todayVN())) throw new InputError('Ngày hết hạn phải sau ngày cấp.');
  if (data.address !== undefined && typeof data.address !== 'string' && (typeof data.address !== 'object' || data.address === null || Array.isArray(data.address))) throw new InputError('Địa chỉ không hợp lệ.');
  if (typeof data.address === 'object') {
    for (const value of Object.values(data.address)) if (typeof value !== 'string' || value.length > 2000) throw new InputError('Địa chỉ phải chứa các trường văn bản.');
  }
  return data;
}

function validateSchool(data: any) {
  for (const field of ['name','code']) if (typeof data[field] !== 'string' || !data[field].trim() || data[field].length > 200) throw new InputError('Tên và mã cơ sở là bắt buộc.');
  if (!/^[A-Z0-9_-]{2,64}$/i.test(data.code)) throw new InputError('Mã cơ sở không hợp lệ.');
  for (const field of ['address','phone','email','licenseNumber','sampleToken']) if (data[field] !== undefined && (typeof data[field] !== 'string' || data[field].length > 1000)) throw new InputError('Thông tin cơ sở không hợp lệ.');
  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') throw new InputError('Trạng thái cơ sở phải là true/false.');
  if (data.classes !== undefined && (!Array.isArray(data.classes) || data.classes.some(v=>typeof v !== 'string'))) throw new InputError('Hạng đào tạo phải là danh sách chuỗi.');
}

function validateUser(data: any, update = false) {
  if (!['SUPERADMIN','SCHOOL_ADMIN','INSPECTOR'].includes(data.role)) throw new InputError('Vai trò không hợp lệ.');
  if (!['ACTIVE','DISABLED'].includes(data.status || 'ACTIVE')) throw new InputError('Trạng thái tài khoản không hợp lệ.');
  if (typeof data.fullName !== 'string' || !data.fullName.trim()) throw new InputError('Họ tên là bắt buộc.');
  if (!update && (typeof data.username !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(data.username))) throw new InputError('Tên đăng nhập không hợp lệ.');
  if (!update || data.password !== undefined) validatePassword(data.password);
  if (data.role === 'SCHOOL_ADMIN') {
    const school = typeof data.schoolCode === 'string' && db.prepare('SELECT name FROM schools WHERE code = ? AND isActive = 1').get(data.schoolCode) as any;
    if (!school) throw new InputError('Quản trị trường phải gắn với cơ sở đang hoạt động.');
    data.schoolName = school.name;
  }
}

export function createCertificate(data: CertificateInput, creatorUsername: string): DriverCertificate {
  data = validateCertificate(data);
  const now = new Date().toISOString();
  const id = 'cert-' + crypto.randomUUID();
  const qrToken = generateSecureToken();
  
  const year = new Date().getFullYear();
  // Seed once from the largest historical suffix, then never reuse a deleted number.
  const max = db.prepare("SELECT COALESCE(MAX(CAST(substr(certificateNumber,10) AS INTEGER)),0) AS n FROM certificates WHERE certificateNumber GLOB ?").get('GCN-' + year + '-[0-9]*') as any;
  const sequence = db.prepare('INSERT INTO certificate_sequences(year,lastNumber) VALUES (?,?) ON CONFLICT(year) DO UPDATE SET lastNumber = MAX(lastNumber, excluded.lastNumber - 1) + 1 RETURNING lastNumber').get(year, Number(max.n) + 1) as any;
  const nextSeq = String(sequence.lastNumber).padStart(5, '0');
  const certificateNumber = data.certificateNumber || `GCN-${year}-${nextSeq}`;

  const issueDate = data.issueDate || todayVN();
  const validUntil = data.validUntil || defaultCertificateExpiry(issueDate);
  if(!validUntil)throw new InputError('Ngày cấp không thể tính được thời hạn chứng nhận.');

  let addressJson = '{"province":"TP. Hồ Chí Minh","district":""}';
  if (data.address) {
    if (typeof data.address === 'string') {
      addressJson = JSON.stringify({ streetAddress: data.address.trim(), province: 'TP. Hồ Chí Minh' });
    } else {
      addressJson = JSON.stringify(data.address);
    }
  }

  const scoreNorm = normalizeScoreToScale10(data.examScore);

  const record = [
    id,
    qrToken,
    certificateNumber,
    data.decisionNumber || `${nextSeq}/QĐ-GTVT`,
    data.decisionDate || issueDate,
    (data.fullName || '').toUpperCase().trim(),
    data.dateOfBirth || '',
    (data.cccdNumber || '').trim(),
    data.cccdIssueDate || '',
    data.phoneNumber || '',
    addressJson,
    data.avatarUrl || '',
    (data.licenseNumber || '').trim(),
    data.licenseClass || 'Hạng B2',
    data.licenseIssueDate || '',
    data.schoolName || 'Trường Trung cấp Giao thông Vận tải',
    data.schoolCode || 'TC-GTVT',
    data.courseCode || `TH-${year}-01`,
    data.courseName || 'Tập huấn nghiệp vụ lái xe kinh doanh vận tải',
    data.coorganizingUnit || '',
    data.transportUnit || '',
    data.examEligibility || 'Đủ điều kiện kiểm tra',
    scoreNorm.scoreStr,
    scoreNorm.result,
    data.trainingStartDate || issueDate,
    data.trainingEndDate || issueDate,
    data.examDate || issueDate,
    data.status || (scoreNorm.result === 'Đạt' ? 'ISSUED' : 'PENDING'),
    issueDate,
    validUntil,
    data.signatoryName || 'Hiệu Trưởng',
    data.signatoryTitle || 'Hiệu trưởng',
    data.notes || '',
    now,
    now,
    creatorUsername,
    data.trainingProgramId || '',
    data.transportUnitId || ''
  ];

  db.prepare(`
    INSERT INTO certificates (
      id, qrToken, certificateNumber, decisionNumber, decisionDate,
      fullName, dateOfBirth, cccdNumber, cccdIssueDate, phoneNumber,
      address, avatarUrl, licenseNumber, licenseClass, licenseIssueDate,
      schoolName, schoolCode, courseCode, courseName, coorganizingUnit,
      transportUnit, examEligibility, examScore, examResult,
      trainingStartDate, trainingEndDate, examDate, status,
      issueDate, validUntil, signatoryName, signatoryTitle,
      notes, createdAt, updatedAt, createdBy, trainingProgramId, transportUnitId
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(...record);

  return getCertificateById(id)!;
}

// 6. Admin: Update Certificate
export function updateCertificate(id: string, data: CertificateInput): DriverCertificate | null {
  const existing = getCertificateById(id);
  if (!existing) return null;
  if(data.validUntil!==undefined&&!isoDate(data.validUntil))throw new InputError('Ngày hết hạn không hợp lệ.');
  const combined={...existing,...data};
  if(data.issueDate!==undefined&&isoDate(data.issueDate)!==isoDate(existing.issueDate)&&data.validUntil===undefined){
    combined.validUntil=defaultCertificateExpiry(data.issueDate);
    if(!combined.validUntil)throw new InputError('Ngày cấp không thể tính được thời hạn chứng nhận.');
  }
  data = validateCertificate(combined, !data.schoolCode || data.schoolCode === existing.schoolCode, existing);

  const now = new Date().toISOString();
  let addressStr = typeof existing.address === 'string' ? existing.address : JSON.stringify(existing.address);
  if (data.address !== undefined) {
    if (typeof data.address === 'string') {
      addressStr = JSON.stringify({ streetAddress: data.address.trim(), province: 'TP. Hồ Chí Minh' });
    } else {
      addressStr = JSON.stringify(data.address);
    }
  }

  const updatedFullName = data.fullName !== undefined ? data.fullName.toUpperCase().trim() : existing.fullName;
  const updatedDob = data.dateOfBirth !== undefined ? data.dateOfBirth : existing.dateOfBirth;
  const updatedCccd = data.cccdNumber !== undefined ? data.cccdNumber : existing.cccdNumber;
  const updatedCccdDate = data.cccdIssueDate !== undefined ? data.cccdIssueDate : existing.cccdIssueDate;
  const updatedPhone = data.phoneNumber !== undefined ? data.phoneNumber : existing.phoneNumber;
  const updatedAvatar = data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl;
  const updatedLicense = data.licenseNumber !== undefined ? data.licenseNumber : existing.licenseNumber;
  const updatedLicenseClass = data.licenseClass !== undefined ? data.licenseClass : existing.licenseClass;
  const updatedSchoolName = data.schoolName !== undefined ? data.schoolName : existing.schoolName;
  const updatedSchoolCode = data.schoolCode !== undefined ? data.schoolCode : existing.schoolCode;
  const updatedCourseCode = data.courseCode !== undefined ? data.courseCode : existing.courseCode;
  const updatedCourseName = data.courseName !== undefined ? data.courseName : existing.courseName;
  const updatedCoorg = data.coorganizingUnit !== undefined ? data.coorganizingUnit : existing.coorganizingUnit;
  const updatedTransport = data.transportUnit !== undefined ? data.transportUnit : existing.transportUnit;
  const updatedEligibility = data.examEligibility !== undefined ? data.examEligibility : existing.examEligibility;
  let updatedScore = existing.examScore;
  let updatedExamResult = existing.examResult;
  if (data.examScore !== undefined) {
    const norm = normalizeScoreToScale10(data.examScore);
    updatedScore = norm.scoreStr;
    updatedExamResult = norm.result;
  } else if (data.examResult !== undefined) {
    updatedExamResult = data.examResult;
  }
  const updatedTrainStart = data.trainingStartDate !== undefined ? data.trainingStartDate : existing.trainingStartDate;
  const updatedTrainEnd = data.trainingEndDate !== undefined ? data.trainingEndDate : existing.trainingEndDate;
  const updatedExamDate = data.examDate !== undefined ? data.examDate : existing.examDate;
  const updatedStatus = data.status !== undefined ? data.status : existing.status;
  const updatedIssueDate = data.issueDate !== undefined ? data.issueDate : existing.issueDate;
  const updatedValidUntil = data.validUntil !== undefined ? data.validUntil : existing.validUntil;
  const updatedSignName = data.signatoryName !== undefined ? data.signatoryName : existing.signatoryName;
  const updatedSignTitle = data.signatoryTitle !== undefined ? data.signatoryTitle : existing.signatoryTitle;
  const updatedRevokedReason = data.revokedReason !== undefined ? data.revokedReason : existing.revokedReason;
  const updatedNotes = data.notes !== undefined ? data.notes : existing.notes;

  db.prepare(`
    UPDATE certificates SET
      fullName = ?,
      dateOfBirth = ?,
      cccdNumber = ?,
      cccdIssueDate = ?,
      phoneNumber = ?,
      address = ?,
      avatarUrl = ?,
      licenseNumber = ?,
      licenseClass = ?,
      schoolName = ?,
      schoolCode = ?,
      courseCode = ?,
      courseName = ?,
      coorganizingUnit = ?,
      transportUnit = ?,
      examEligibility = ?,
      examScore = ?,
      examResult = ?,
      trainingStartDate = ?,
      trainingEndDate = ?,
      examDate = ?,
      status = ?,
      issueDate = ?,
      validUntil = ?,
      signatoryName = ?,
      signatoryTitle = ?,
      revokedReason = ?,
      notes = ?,
      updatedAt = ?,
      trainingProgramId = ?,
      transportUnitId = ?
    WHERE id = ?
  `).run(
    updatedFullName,
    updatedDob,
    updatedCccd,
    updatedCccdDate,
    updatedPhone,
    addressStr,
    updatedAvatar,
    updatedLicense,
    updatedLicenseClass,
    updatedSchoolName,
    updatedSchoolCode,
    updatedCourseCode,
    updatedCourseName,
    updatedCoorg,
    updatedTransport,
    updatedEligibility,
    updatedScore,
    updatedExamResult,
    updatedTrainStart,
    updatedTrainEnd,
    updatedExamDate,
    updatedStatus,
    updatedIssueDate,
    updatedValidUntil,
    updatedSignName,
    updatedSignTitle,
    updatedRevokedReason,
    updatedNotes,
    now,
    data.trainingProgramId || '',
    data.transportUnitId || '',
    id
  );

  return getCertificateById(id);
}

// 7. Admin: Delete Certificate
export function deleteCertificate(id: string): boolean {
  const result = db.prepare('DELETE FROM certificates WHERE id = ?').run(id);
  return result.changes > 0;
}

// 8. Admin: Dashboard Stats
export function getDashboardStats(schoolCode?: string): DashboardStats {
  const where = schoolCode ? ' WHERE schoolCode = ?' : '';
  const params = schoolCode ? [schoolCode] : [];
  const recentRows = db.prepare('SELECT * FROM certificates'+where+' ORDER BY createdAt DESC LIMIT 5').all(...params);
  const counts = db.prepare('SELECT (' + CERTIFICATE_STATUS_SQL + ') AS state, COUNT(*) AS n FROM certificates' + where + ' GROUP BY state').all(...params) as any[];
  const count = (state: string) => Number(counts.find(r => r.state === state)?.n || 0);
  const today = todayVN();
  const monthStart = new Date(today.slice(0,7) + '-01T00:00:00Z');
  const months = Array.from({length:6},(_,index) => {
    const date = new Date(monthStart);
    date.setUTCMonth(date.getUTCMonth() - 5 + index);
    return date.toISOString().slice(0,7);
  });
  const monthly = db.prepare("SELECT strftime('%Y-%m', createdAt, '+7 hours') AS month, COUNT(*) AS n FROM certificates WHERE strftime('%Y-%m', createdAt, '+7 hours') BETWEEN ? AND ?" + (schoolCode ? ' AND schoolCode = ?' : '') + ' GROUP BY month').all(months[0],months[5],...params) as any[];
  const deadline = new Date(today+'T00:00:00Z');
  deadline.setUTCDate(deadline.getUTCDate()+30);
  const expirySql = "CASE WHEN validUntil LIKE '__/__/____' THEN substr(validUntil,7,4)||'-'||substr(validUntil,4,2)||'-'||substr(validUntil,1,2) ELSE validUntil END";
  const expiringSoon = db.prepare('SELECT COUNT(*) AS n FROM certificates WHERE ('+CERTIFICATE_STATUS_SQL+") = 'ISSUED' AND ("+expirySql+') BETWEEN ? AND ?'+(schoolCode?' AND schoolCode = ?':'')).get(today,deadline.toISOString().slice(0,10),...params) as any;
  return {
    totalDrivers:counts.reduce((sum,row)=>sum+Number(row.n),0),
    issuedCount:count('ISSUED'), pendingCount:count('PENDING'),
    expiredCount:count('EXPIRED'), revokedCount:count('REVOKED'),
    schoolCount:schoolCode ? 1 : Number((db.prepare('SELECT COUNT(*) AS n FROM schools').get() as any).n),
    recentCertificates:recentRows.map(row=>toPublicCertificate(row,false)),
    createdByMonth:months.map(month=>({month,count:Number(monthly.find(row=>row.month===month)?.n || 0)})),
    expiringSoonCount:Number(expiringSoon.n), generatedAt:new Date().toISOString(),
  };
}

// 9. Admin User Authentication
export function authenticateAdmin(username: string, passwordPlain: string): AdminUser | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(username.trim().toLowerCase(), 'ACTIVE') as any;
  if (!row || !verifyPassword(passwordPlain, row.passwordHash)) return null;
  if (!row.passwordHash.startsWith('scrypt$')) db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(passwordPlain), row.id);

  db.prepare('UPDATE users SET lastLogin = ? WHERE id = ?').run(new Date().toISOString(), row.id);

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    schoolName: row.schoolName,
    schoolCode: row.schoolCode,
    status: row.status,
    createdAt: row.createdAt,
    lastLogin: row.lastLogin
  };
}

// 9.1 User Management Functions (Admin Account & Permissions)
export function getAllUsers(): AdminUser[] {
  const rows = db.prepare(`
    SELECT id, username, fullName, role, schoolName, schoolCode, status, createdAt, lastLogin
    FROM users
    ORDER BY createdAt ASC
  `).all() as any[];
  return rows.map(r => ({
    id: r.id,
    username: r.username,
    fullName: r.fullName,
    role: r.role,
    schoolName: r.schoolName || '',
    schoolCode: r.schoolCode || '',
    status: r.status,
    createdAt: r.createdAt,
    lastLogin: r.lastLogin
  }));
}

export function getUserById(id: string): AdminUser | null {
  const row = db.prepare(`
    SELECT id, username, fullName, role, schoolName, schoolCode, status, createdAt, lastLogin
    FROM users WHERE id = ?
  `).get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    schoolName: row.schoolName || '',
    schoolCode: row.schoolCode || '',
    status: row.status,
    createdAt: row.createdAt,
    lastLogin: row.lastLogin
  };
}

export function createUser(data: {
  username: string;
  password?: string;
  fullName: string;
  role: 'SUPERADMIN' | 'SCHOOL_ADMIN' | 'INSPECTOR';
  schoolName?: string;
  schoolCode?: string;
  status?: 'ACTIVE' | 'DISABLED';
}): AdminUser {
  validateUser(data);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(data.username.trim().toLowerCase());
  if (existing) {
    throw new Error('Tên đăng nhập đã tồn tại trong hệ thống.');
  }

  const id = 'user-' + crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordPlain = data.password!;
  const passwordHash = hashPassword(passwordPlain);

  db.prepare(`
    INSERT INTO users (id, username, passwordHash, fullName, role, schoolName, schoolCode, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.username.trim().toLowerCase(),
    passwordHash,
    data.fullName.trim(),
    data.role || 'SCHOOL_ADMIN',
    data.schoolName || '',
    data.schoolCode || '',
    data.status || 'ACTIVE',
    now
  );

  return getUserById(id)!;
}

export function updateUser(id: string, data: {
  fullName?: string;
  role?: 'SUPERADMIN' | 'SCHOOL_ADMIN' | 'INSPECTOR';
  schoolName?: string;
  schoolCode?: string;
  status?: 'ACTIVE' | 'DISABLED';
  password?: string;
}): AdminUser | null {
  const existing = getUserById(id);
  if (!existing) return null;

  const validated = { ...existing, ...data };
  validateUser(validated, true);
  const newFullName = data.fullName !== undefined ? data.fullName.trim() : existing.fullName;
  const newRole = data.role !== undefined ? data.role : existing.role;
  const newSchoolName = validated.schoolName;
  const newSchoolCode = data.schoolCode !== undefined ? data.schoolCode : existing.schoolCode;
  const newStatus = data.status !== undefined ? data.status : existing.status;
  if (existing.role === 'SUPERADMIN' && existing.status === 'ACTIVE' && (newRole !== 'SUPERADMIN' || newStatus !== 'ACTIVE')) {
    const remaining = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'SUPERADMIN' AND status = 'ACTIVE' AND id != ?").get(id) as any;
    if (!remaining.n) throw new InputError('Không thể vô hiệu hóa quản trị viên cuối cùng.');
  }

  if (data.password && data.password.trim()) {
    db.prepare(`
      UPDATE users SET
        fullName = ?,
        role = ?,
        schoolName = ?,
        schoolCode = ?,
        status = ?,
        passwordHash = ?
      WHERE id = ?
    `).run(newFullName, newRole, newSchoolName, newSchoolCode, newStatus, hashPassword(data.password), id);
  } else {
    db.prepare(`
      UPDATE users SET
        fullName = ?,
        role = ?,
        schoolName = ?,
        schoolCode = ?,
        status = ?
      WHERE id = ?
    `).run(newFullName, newRole, newSchoolName, newSchoolCode, newStatus, id);
  }

  return getUserById(id);
}

export function deleteUser(id: string): boolean {
  const user = getUserById(id);
  if (!user) return false;
  if (user.username === 'admin') {
    throw new Error('Không thể xóa tài khoản Quản trị viên tối cao (admin).');
  }

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return result.changes > 0;
}

// 10. Security Settings
export function getSecuritySettings(): SecuritySettings {
  const row = db.prepare('SELECT settings FROM security_settings WHERE id = ?').get('global') as any;
  if (!row) return DEFAULT_SECURITY;
  try {
    return JSON.parse(row.settings);
  } catch {
    return DEFAULT_SECURITY;
  }
}

export function updateSecuritySettings(newSettings: Partial<SecuritySettings>): SecuritySettings {
  const current = getSecuritySettings();
  const updated = { ...current, ...newSettings };
  db.prepare('INSERT OR REPLACE INTO security_settings (id, settings) VALUES (?, ?)').run('global', JSON.stringify(updated));
  return updated;
}

// 11. Security Audit Log
export function logSecurityEvent(action: string, target: string, ip: string, userAgent: string, details?: any) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (id, action, target, ip, userAgent, timestamp, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, action, target, ip, userAgent, timestamp, details ? JSON.stringify(details) : null);
  // Keep a bounded recent history; longer retention requires a separate archive.
  db.prepare('DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs ORDER BY timestamp DESC, rowid DESC LIMIT -1 OFFSET 10000)').run();
}
