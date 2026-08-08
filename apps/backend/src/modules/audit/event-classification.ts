import type { DomainEventEnvelope } from "../../events/event.types";

export type AuditEventClassification =
  | "security"
  | "governance"
  | "data"
  | "content";

function startsWithAny(
  value: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function procedurePath(
  event: DomainEventEnvelope,
): string | null {
  const value = event.payload["procedurePath"];
  return typeof value === "string" ? value : null;
}

export function classifyAuditEvent(
  event: DomainEventEnvelope,
): AuditEventClassification {
  const type = event.eventType.toLowerCase();
  const procedure = procedurePath(event)?.toLowerCase() ?? "";

  if (
    startsWithAny(type, [
      "auth.",
      "iam.",
      "security.",
      "access.",
      "role.",
    ]) ||
    startsWithAny(procedure, [
      "auth.",
      "iam.",
    ])
  ) {
    return "security";
  }

  if (
    startsWithAny(type, [
      "rules.",
      "rule.",
      "workflow.",
      "approval.",
      "governance.",
      "schedule.",
    ]) ||
    startsWithAny(procedure, [
      "rules.",
      "workflow.",
      "schedule.",
    ])
  ) {
    return "governance";
  }

  if (
    startsWithAny(type, [
      "notification.",
      "content.",
      "document.",
      "message.",
    ]) ||
    startsWithAny(procedure, [
      "notification.",
      "content.",
      "document.",
    ])
  ) {
    return "content";
  }

  return "data";
}
