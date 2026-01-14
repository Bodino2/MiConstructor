import { z } from 'zod';
import {
  Role,
  AccreditationStatus,
  JobStatus,
  ProType,
  DisputeOpener,
  CorrectOption,
} from './enums';

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Profile schemas
export const createClientProfileSchema = z.object({
  fullName: z.string().min(1),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(5),
  phone: z.string().optional(),
});

export const createProProfileSchema = z.object({
  displayNameOrCompany: z.string().min(1),
  proType: z.nativeEnum(ProType),
  nifNieCif: z.string().min(9),
  categories: z.array(z.string()).min(1),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(5),
  bio: z.string().optional(),
});

export const updateProStatusSchema = z.object({
  status: z.nativeEnum(AccreditationStatus),
});

// Job schemas
export const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(5),
  estimatedTotalCents: z.number().int().positive(),
  wantsGuarantee: z.boolean().default(false),
});

export const updateJobStatusSchema = z.object({
  status: z.nativeEnum(JobStatus),
});

export const jobFiltersSchema = z.object({
  category: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
});

// Test schemas
export const submitTestAttemptSchema = z.object({
  testId: z.string(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      selectedOption: z.nativeEnum(CorrectOption),
    })
  ),
});

// Messaging schemas
export const sendMessageSchema = z.object({
  text: z.string().min(1),
});

// Dispute schemas
export const openDisputeSchema = z.object({
  reason: z.string().min(1),
});

export const resolveDisputeSchema = z.object({
  resolution: z.literal('RELEASE'),
  note: z.string().optional(),
});

// Review schemas
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateClientProfileInput = z.infer<typeof createClientProfileSchema>;
export type CreateProProfileInput = z.infer<typeof createProProfileSchema>;
export type UpdateProStatusInput = z.infer<typeof updateProStatusSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;
export type JobFiltersInput = z.infer<typeof jobFiltersSchema>;
export type SubmitTestAttemptInput = z.infer<typeof submitTestAttemptSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
