export type UserRole = "cliente" | "profesional" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  accountStatus: string;
  verificationStatus: string;
};

export type Project = {
  id: string;
  title: string;
  description: string;
  category: string;
  project_type?: string;
  projectType?: string;
  location: string;
  budget_cents?: number | string;
  budgetCents?: number;
  status: string;
  created_at?: string;
  already_applied?: boolean;
  proposals?: Proposal[];
};

export type Proposal = {
  id: string;
  professional_id: string;
  name?: string;
  company_name?: string | null;
  amount_cents: number | string;
  estimated_days: number;
  message: string;
  status: string;
  rating?: number | string;
  review_count?: number | string;
  insured?: boolean;
};

export type AssessmentOption = { id: string; label: string };
export type AssessmentQuestion = {
  id: string;
  prompt: string;
  options: AssessmentOption[];
};
export type Assessment = {
  version: string;
  specialtySlug?: string;
  specialtyLabel?: string;
  questionCount: number;
  passScore: number;
  questions: AssessmentQuestion[];
};
export type Specialty = { slug: string; label: string };

export type SupportMessage = {
  id: string | number;
  sender_role: "usuario" | "admin";
  body: string;
  created_at: string;
};

export type SupportThread = {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  last_message_at: string;
  unread_count: number;
  last_message: string;
};

export type BillingAccount = {
  status: string;
  overdue_balance_cents: number | string;
  sepa_mandate_reference?: string | null;
  payment_method_ready?: boolean;
};

export type BillingSummary = {
  account: BillingAccount | null;
  charges: Array<{
    id: string;
    description: string;
    amount_cents: number | string;
    status: string;
    service_date: string;
    collection_requested_at?: string | null;
    paid_at?: string | null;
    failure_reason?: string | null;
    retry_count: number;
    project_id: string;
    project_title: string;
  }>;
  legacyInvoices: Array<{
    id: string;
    period_start: string;
    period_end: string;
    total_cents: number | string;
    status: string;
    failure_reason?: string | null;
    paid_at?: string | null;
  }>;
};

export type AdminOverview = {
  usersTotal: number;
  clientsTotal: number;
  professionalsTotal: number;
  suspendedAccounts: number;
  projectsTotal: number;
  activeProjects: number;
  pendingQualifications: number;
  pendingPortfolios: number;
  pendingInsurance: number;
  overdueBalanceCents: number;
};

export type RuntimeConfig = {
  appUrl: string;
  contactEmail: string;
  contactPhone: string | null;
  legalEntityType: "persona_fisica" | "sociedad";
  legalEntityName: string | null;
  legalTaxId: string | null;
  legalAddress: string | null;
  legalRegistry: string | null;
  legalIdentityComplete: boolean;
  privacyVersion: string;
  termsVersion: string;
  sepaTermsVersion: string;
  billingEnabled: boolean;
  stripePublishableKey: string | null;
};
