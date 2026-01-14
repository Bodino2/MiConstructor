// Enums
export enum Role {
  CLIENT = 'CLIENT',
  PRO = 'PRO',
  ADMIN = 'ADMIN',
}

export enum AccreditationStatus {
  PENDING_TESTS = 'PENDING_TESTS',
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACCREDITED = 'ACCREDITED',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED',
}

export enum JobStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  CONTACT_LOCKED = 'CONTACT_LOCKED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED',
}

export enum LeadStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum GuaranteeStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum EscrowStatus {
  PENDING = 'PENDING',
  HELD = 'HELD',
  RELEASED = 'RELEASED',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  RESOLVED_RELEASE = 'RESOLVED_RELEASE',
  CLOSED = 'CLOSED',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  CLOSED = 'CLOSED',
}

export enum Provider {
  SIMULATED = 'SIMULATED',
  STRIPE = 'STRIPE',
}

export enum ProType {
  AUTONOMO = 'AUTONOMO',
  EMPRESA = 'EMPRESA',
}

export enum DisputeOpener {
  CLIENT = 'CLIENT',
  PRO = 'PRO',
  ADMIN = 'ADMIN',
}

export enum CorrectOption {
  A = 'A',
  B = 'B',
  C = 'C',
}
