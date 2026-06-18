/**
 * Public surface for the db module.
 * Import from '@/lib/db' in server components and API routes.
 */
export { createServiceRoleClient, createAnonClient } from './client';
export type {
  Database,
  Tables,
  Inserts,
  Updates,
  Views,
  DeviceGroup,
  ReportStatus,
  CapacityTier,
  CompressionPeriod,
  AlertSeverity,
  InterfaceState,
  NotificationType,
  NotificationSeverity,
  AlertRuleOperator,
  AlertRuleSeverity,
  IngestOutcome,
  UserRole,
  Json,
} from './types';
