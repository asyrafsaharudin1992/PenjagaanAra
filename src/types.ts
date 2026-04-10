export type UserRole = 'Doctor' | 'Admin' | 'Superadmin';

export type UserPermission = 
  | 'create_case' 
  | 'delete_case' 
  | 'view_history' 
  | 'manage_users' 
  | 'ai_analysis'
  | 'view_dashboard'
  | 'whatsapp_patient'
  | 'export_csv';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermission[];
  createdAt: string;
}

export type FollowUpTag = string;

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth: string;
}

export type ClinicBranch = 'Kajang' | 'Seri Kembangan';

export interface FollowUpCase {
  id: string; // Firestore document ID (unique per follow-up)
  patientId: string; // User keyed-in ID (can be same for multiple follow-ups)
  patientName: string;
  branch: ClinicBranch;
  diagnosis: string;
  lastVisitDate: string;
  nextFollowUpDate: string;
  appointmentDate?: string;
  doctorInCharge: string;
  remarks: string;
  followUpDoneBy: string;
  followUpTag: FollowUpTag;
  patientPhone?: string;
  isNotesCopied?: boolean;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  aramommy: number;
  arachronic: number;
  arawellness: number;
  followUp: number;
  others: number;
}
