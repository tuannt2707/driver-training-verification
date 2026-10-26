export type CertificateStatus = 'ISSUED' | 'PENDING' | 'EXPIRED' | 'REVOKED';

export type UserRole = 'SUPERADMIN' | 'SCHOOL_ADMIN' | 'INSPECTOR';

export interface DriverAddress {
  province: string;
  district: string;
  ward?: string;
  streetAddress?: string;
}

export interface DriverCertificate {
  id: string;
  qrToken: string; // Cryptographic hash token (e.g., 3b8404cc15ef3bcae0a25ab4a21fcd6f958c9f38)
  certificateNumber: string;
  decisionNumber: string;
  decisionDate: string;
  
  // Personal Info (Contains sensitive fields)
  fullName: string;
  dateOfBirth: string;
  cccdNumber: string; // Sensitive
  cccdIssueDate?: string;
  phoneNumber?: string; // Sensitive
  address: DriverAddress;
  avatarUrl?: string;

  // Driving License Info
  licenseNumber: string; // GPLX
  licenseClass: string; // B1, B2, C, D, E, FC,...
  licenseIssueDate?: string;

  // Training & School Info
  schoolName: string;
  schoolCode: string;
  courseCode: string; // Mã lớp
  courseName: string; // Chương trình tập huấn
  coorganizingUnit?: string;
  transportUnit?: string; // Đơn vị KDVT
  trainingProgramId?: string; // Danh mục chương trình; tên lưu theo thời điểm chọn
  transportUnitId?: string; // Danh mục đơn vị KDVT

  // Results
  examEligibility: 'Đạt' | 'Không đạt' | 'Đủ điều kiện' | 'Chưa đủ điều kiện' | 'Đủ điều kiện kiểm tra' | string;
  examScore?: string;
  examResult: 'Đạt' | 'Không đạt';
  trainingStartDate: string;
  trainingEndDate: string;
  examDate?: string;

  // Certificate Status
  status: CertificateStatus;
  issueDate: string;
  validUntil: string;
  signatoryName: string;
  signatoryTitle: string;
  revokedReason?: string;
  notes?: string;

  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// Public-safe sanitized certificate data (Masked to prevent data leakage)
export interface PublicCertificateView {
  qrToken: string;
  certificateNumber: string;
  decisionNumber: string;
  decisionDate: string;
  
  // Identity fields (Full when accessed via valid token, masked otherwise)
  fullName: string;
  dateOfBirthMasked: string; // e.g., "14/08/1987"
  cccd: string; // Full unmasked CCCD for token access
  cccdMasked: string; // e.g., "079******345"
  phoneNumberMasked?: string; // e.g., "091*****78"
  addressMasked: string; // e.g., "Quận 1, TP. Hồ Chí Minh"
  avatarUrl?: string;

  licenseNumber: string; // Full unmasked license for token access
  licenseNumberMasked: string; // e.g., "7901****0194"
  licenseClass: string;
  isTokenAccess?: boolean;

  schoolName: string;
  schoolCode: string;
  courseCode: string;
  courseName: string;
  coorganizingUnit?: string;
  transportUnit?: string;

  examEligibility: string;
  examScore?: string;
  examResult: string;
  trainingStartDate: string;
  trainingEndDate: string;
  examDate?: string;

  status: CertificateStatus;
  statusLabel: string;
  isIssued: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  issueDate: string;
  validUntil: string;
  signatoryName: string;
  signatoryTitle: string;

  verifiedAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  schoolName?: string;
  schoolCode?: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  lastLogin?: string;
}

export interface AuthSession {
  token: string;
  user: AdminUser;
}

export interface DashboardStats {
  totalDrivers: number;
  issuedCount: number;
  pendingCount: number;
  expiredCount: number;
  revokedCount: number;
  schoolCount: number;
  recentCertificates: PublicCertificateView[];
  createdByMonth: { month: string; count: number }[];
  expiringSoonCount: number;
  generatedAt: string;
}

export interface SecuritySettings {
  antiF12Enabled: boolean;
  disableRightClick: boolean;
  detectDevTools: boolean;
  maskSensitiveDataPublic: boolean;
  requireTwoFactorLookup: boolean; // Require CCCD + GPLX together
  watermarkText: string;
}

export interface DrivingSchool {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  licenseNumber: string;
  classes: string[];
  certifiedCount: number;
  sampleToken: string;
  isActive: boolean; // Còn hoạt động (true) hoặc Tạm ngưng/Disable (false)
  status: 'ACTIVE' | 'AUDITED' | 'DISABLED';
  createdAt?: string;
  updatedAt?: string;
}

export interface IntegrationApiKey {
  id: string;
  name: string;
  organization: string;
  keyPrefix: string;
  schoolCode: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  requestCount: number;
  rateLimit: number;
}
