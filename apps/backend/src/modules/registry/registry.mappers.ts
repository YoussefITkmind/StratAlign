import type { Prisma } from "../../generated/prisma/client";
import type {
  AlignmentType,
  KeyResultType,
  KpiDataSourceType,
  KpiFrequency,
  KpiPolarity,
  KpiStatus,
} from "../../generated/prisma/enums";

import type {
  AlignmentTypeView,
  KeyResultTypeView,
  KpiDataSourceTypeView,
  KpiFrequencyView,
  KpiPolarityView,
  KpiStatusView,
} from "./registry.types";

/**
 * Prisma enum members are UPPER_SNAKE while their database values and wire
 * form are lowercase. These translate between the two in both directions, the
 * same way `RulesService` does for RuleType, so neither casing leaks across
 * the service boundary.
 */

export function toKpiStatusView(value: KpiStatus): KpiStatusView {
  switch (value) {
    case "DRAFT":
      return "draft";
    case "ACTIVE":
      return "active";
    case "RETIRED":
      return "retired";
  }
}

export function toKpiPolarityView(value: KpiPolarity): KpiPolarityView {
  return value === "HIGHER_IS_BETTER"
    ? "higher_is_better"
    : "lower_is_better";
}

export function fromKpiPolarityView(value: KpiPolarityView): KpiPolarity {
  return value === "higher_is_better"
    ? "HIGHER_IS_BETTER"
    : "LOWER_IS_BETTER";
}

export function toKpiFrequencyView(value: KpiFrequency): KpiFrequencyView {
  return value === "MONTHLY" ? "monthly" : "quarterly";
}

export function fromKpiFrequencyView(value: KpiFrequencyView): KpiFrequency {
  return value === "monthly" ? "MONTHLY" : "QUARTERLY";
}

export function toKpiDataSourceTypeView(
  value: KpiDataSourceType,
): KpiDataSourceTypeView {
  return value === "MANUAL" ? "manual" : "feed";
}

export function fromKpiDataSourceTypeView(
  value: KpiDataSourceTypeView,
): KpiDataSourceType {
  return value === "manual" ? "MANUAL" : "FEED";
}

export function toKeyResultTypeView(value: KeyResultType): KeyResultTypeView {
  return value === "QUANTITATIVE" ? "quantitative" : "milestone";
}

export function fromKeyResultTypeView(value: KeyResultTypeView): KeyResultType {
  return value === "quantitative" ? "QUANTITATIVE" : "MILESTONE";
}

export function toAlignmentTypeView(value: AlignmentType): AlignmentTypeView {
  switch (value) {
    case "OBJECTIVE":
      return "objective";
    case "PLAY":
      return "play";
    case "SECTOR":
      return "sector";
    case "PROJECT":
      return "project";
  }
}

export function fromAlignmentTypeView(value: AlignmentTypeView): AlignmentType {
  switch (value) {
    case "objective":
      return "OBJECTIVE";
    case "play":
      return "PLAY";
    case "sector":
      return "SECTOR";
    case "project":
      return "PROJECT";
  }
}

/**
 * Decimal columns arrive as Prisma Decimal instances. Registry values are
 * target figures and percentages well inside double precision, and the tRPC
 * contract is JSON, so they cross the boundary as numbers.
 */
export function decimalToNumber(value: Prisma.Decimal): number;
export function decimalToNumber(value: Prisma.Decimal | null): number | null;
export function decimalToNumber(
  value: Prisma.Decimal | null,
): number | null {
  return value === null ? null : value.toNumber();
}
