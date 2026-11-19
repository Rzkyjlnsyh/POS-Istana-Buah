import type { UserRole } from '../constants/enums';

export interface EmployeeDto {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  phoneNumber: string | null;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  shiftCount: number;
}
