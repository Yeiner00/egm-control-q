import { z } from "zod";

export const reportImportTypeSchema = z.enum(["vehiculo", "embarcacion"]);
export const reportImportFieldKindSchema = z.enum(["deterministic", "person", "catalog", "text"]);
export const reportImportFieldSourceSchema = z.enum(["local", "gemini", "manual", "system"]);
export const reportImportFieldStatusSchema = z.enum(["accepted", "needs_review", "rejected"]);
export const reportImportPersonSuggestionActionSchema = z.enum([
  "saved_without_cedula",
  "possible_new_officer",
  "created_new_officer",
  "linked_existing",
  "omitted",
]);
export const reportImportCatalogTypeSchema = z.enum(["motive", "site"]);
export const reportImportCatalogSuggestionActionSchema = z.enum([
  "accepted_suggestion",
  "linked_existing",
  "created_new",
  "saved_for_report",
  "omitted",
]);
export const reportImportJobStatusSchema = z.enum([
  "uploaded",
  "parsed",
  "review_required",
  "gemini_failed",
  "ready",
  "confirmed",
  "failed",
]);

export const reportImportOfficerMatchSchema = z.object({
  officerId: z.string().nullable().optional(),
  nombre: z.string(),
  cedula: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  level: z.enum(["cedula", "alias", "normalized", "fuzzy", "gemini", "none"]),
  needsReview: z.boolean(),
});

export const reportImportCandidateSchema = z.object({
  officerId: z.string().nullable().optional(),
  nombre: z.string(),
  cedula: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  level: z.string(),
});

export const reportImportFieldSchema = z.object({
  fieldKey: z.string(),
  label: z.string(),
  kind: reportImportFieldKindSchema,
  rawValue: z.string().nullable(),
  normalizedValue: z.string().nullable(),
  finalValue: z.string().nullable(),
  cellAddress: z.string().nullable(),
  source: reportImportFieldSourceSchema,
  confidence: z.number().min(0).max(1),
  status: reportImportFieldStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const reportImportDraftSchema = z.object({
  jobId: z.string(),
  fileName: z.string(),
  reportType: reportImportTypeSchema,
  status: reportImportJobStatusSchema,
  storagePath: z.string().nullable().optional(),
  geminiError: z.string().nullable().optional(),
  fields: z.array(reportImportFieldSchema),
  extractedData: z.record(z.string(), z.unknown()),
});

export const reportImportAliasSuggestionSchema = z.object({
  rawAlias: z.string(),
  normalizedAlias: z.string(),
  officerCedula: z.string().nullable().optional(),
  fieldKey: z.string().nullable().optional(),
});

export const reportImportPersonSuggestionSchema = z.object({
  rawName: z.string(),
  normalizedName: z.string(),
  finalName: z.string().nullable().optional(),
  officerCedula: z.string().nullable().optional(),
  fieldKey: z.string().nullable().optional(),
  action: reportImportPersonSuggestionActionSchema,
});

export const reportImportCatalogSuggestionSchema = z.object({
  catalogType: reportImportCatalogTypeSchema,
  rawValue: z.string(),
  normalizedValue: z.string(),
  finalValue: z.string().nullable().optional(),
  fieldKey: z.string().nullable().optional(),
  action: reportImportCatalogSuggestionActionSchema,
  zona: z.string().nullable().optional(),
  posicion: z.string().nullable().optional(),
});

export const reportImportConfirmSchema = z.object({
  reportId: z.string(),
  reportType: reportImportTypeSchema,
  aliasSuggestions: z.array(reportImportAliasSuggestionSchema).default([]),
  personSuggestions: z.array(reportImportPersonSuggestionSchema).default([]),
  catalogSuggestions: z.array(reportImportCatalogSuggestionSchema).default([]),
});

export type ReportImportType = z.infer<typeof reportImportTypeSchema>;
export type ReportImportFieldKind = z.infer<typeof reportImportFieldKindSchema>;
export type ReportImportFieldSource = z.infer<typeof reportImportFieldSourceSchema>;
export type ReportImportFieldStatus = z.infer<typeof reportImportFieldStatusSchema>;
export type ReportImportPersonSuggestionAction = z.infer<typeof reportImportPersonSuggestionActionSchema>;
export type ReportImportCatalogType = z.infer<typeof reportImportCatalogTypeSchema>;
export type ReportImportCatalogSuggestionAction = z.infer<typeof reportImportCatalogSuggestionActionSchema>;
export type ReportImportJobStatus = z.infer<typeof reportImportJobStatusSchema>;
export type ReportImportOfficerMatch = z.infer<typeof reportImportOfficerMatchSchema>;
export type ReportImportCandidate = z.infer<typeof reportImportCandidateSchema>;
export type ReportImportField = z.infer<typeof reportImportFieldSchema>;
export type ReportImportDraft = z.infer<typeof reportImportDraftSchema>;
export type ReportImportAliasSuggestion = z.infer<typeof reportImportAliasSuggestionSchema>;
export type ReportImportPersonSuggestion = z.infer<typeof reportImportPersonSuggestionSchema>;
export type ReportImportCatalogSuggestion = z.infer<typeof reportImportCatalogSuggestionSchema>;
