import type { PrismaClient } from "../src/generated/prisma/client";

const DEMO_PLAN_NAME = "Apex Holdings · FY2026 Enterprise Strategy";

const IDS = {
  plan: "71000000-0000-4000-8000-000000000001",
  corporate: "71000000-0000-4000-8000-000000000010",

  growth: "71000000-0000-4000-8000-000000000100",
  customer: "71000000-0000-4000-8000-000000000200",
  operations: "71000000-0000-4000-8000-000000000300",
  people: "71000000-0000-4000-8000-000000000400",

  recurringRevenue: "71000000-0000-4000-8000-000000000110",
  priorityMarkets: "71000000-0000-4000-8000-000000000120",
  customerAdvocacy: "71000000-0000-4000-8000-000000000210",
  digitalAdoption: "71000000-0000-4000-8000-000000000220",
  operatingMargin: "71000000-0000-4000-8000-000000000310",
  supplyResilience: "71000000-0000-4000-8000-000000000320",
  criticalCapabilities: "71000000-0000-4000-8000-000000000410",
  innovationPipeline: "71000000-0000-4000-8000-000000000420",

  crossSell: "71000000-0000-4000-8000-000000001110",
  emeaExpansion: "71000000-0000-4000-8000-000000001120",
  partnerNetwork: "71000000-0000-4000-8000-000000001121",
  cxRedesign: "71000000-0000-4000-8000-000000001210",
  selfService: "71000000-0000-4000-8000-000000001220",
  automation: "71000000-0000-4000-8000-000000001310",
  controlTower: "71000000-0000-4000-8000-000000001320",
  skillsAcademy: "71000000-0000-4000-8000-000000001410",
  ventureStudio: "71000000-0000-4000-8000-000000001420",

  commercialPortfolio: "71000000-0000-4000-8000-000000002100",
  digitalPortfolio: "71000000-0000-4000-8000-000000002200",
  transformationPortfolio: "71000000-0000-4000-8000-000000002300",

  europeFocus: "71000000-0000-4000-8000-000000003100",
  customerDigitalFocus: "71000000-0000-4000-8000-000000003200",
  aiAutomationFocus: "71000000-0000-4000-8000-000000003300",
  talentFocus: "71000000-0000-4000-8000-000000003400",
} as const;

type NodeType =
  | "CORPORATE_STRATEGY"
  | "THEME"
  | "OBJECTIVE"
  | "STRATEGIC_PLAY"
  | "PORTFOLIO"
  | "AREA_OF_FOCUS";

type EdgeType = "CONTAINS" | "EXECUTED_BY" | "BELONGS_TO_PORTFOLIO";

interface DemoNode {
  id: string;
  type: NodeType;
  nameEn: string;
  nameAr: string;
  ownerEmail?: string;
}

interface DemoEdge {
  from: string;
  to: string;
  type: EdgeType;
}

const NODES: DemoNode[] = [
  {
    id: IDS.corporate,
    type: "CORPORATE_STRATEGY",
    nameEn: "Accelerate Sustainable Growth & Digital Leadership",
    nameAr: "تسريع النمو المستدام والريادة الرقمية",
    ownerEmail: "bob@example.test",
  },

  { id: IDS.growth, type: "THEME", nameEn: "Growth & Market Expansion", nameAr: "النمو والتوسع في الأسواق", ownerEmail: "carol@example.test" },
  { id: IDS.customer, type: "THEME", nameEn: "Customer Excellence", nameAr: "التميز في تجربة العملاء", ownerEmail: "alice@example.test" },
  { id: IDS.operations, type: "THEME", nameEn: "Operational Resilience", nameAr: "المرونة والتميز التشغيلي", ownerEmail: "team@test.com" },
  { id: IDS.people, type: "THEME", nameEn: "People & Innovation", nameAr: "المواهب والابتكار", ownerEmail: "bob@example.test" },

  { id: IDS.recurringRevenue, type: "OBJECTIVE", nameEn: "Grow Recurring Revenue by 18%", nameAr: "زيادة الإيرادات المتكررة بنسبة 18٪", ownerEmail: "carol@example.test" },
  { id: IDS.priorityMarkets, type: "OBJECTIVE", nameEn: "Expand in Priority International Markets", nameAr: "التوسع في الأسواق الدولية ذات الأولوية", ownerEmail: "carol@example.test" },
  { id: IDS.customerAdvocacy, type: "OBJECTIVE", nameEn: "Increase Customer Advocacy and Retention", nameAr: "زيادة ولاء العملاء والاحتفاظ بهم", ownerEmail: "alice@example.test" },
  { id: IDS.digitalAdoption, type: "OBJECTIVE", nameEn: "Accelerate Digital Customer Adoption", nameAr: "تسريع تبني العملاء للقنوات الرقمية", ownerEmail: "alice@example.test" },
  { id: IDS.operatingMargin, type: "OBJECTIVE", nameEn: "Improve Operating Margin by 4 Points", nameAr: "تحسين هامش التشغيل بأربع نقاط", ownerEmail: "team@test.com" },
  { id: IDS.supplyResilience, type: "OBJECTIVE", nameEn: "Strengthen End-to-End Supply Resilience", nameAr: "تعزيز مرونة سلسلة الإمداد من البداية إلى النهاية", ownerEmail: "team@test.com" },
  { id: IDS.criticalCapabilities, type: "OBJECTIVE", nameEn: "Build Critical Digital and Leadership Capabilities", nameAr: "بناء القدرات الرقمية والقيادية الحيوية", ownerEmail: "bob@example.test" },
  { id: IDS.innovationPipeline, type: "OBJECTIVE", nameEn: "Double the Innovation Pipeline", nameAr: "مضاعفة محفظة الابتكار", ownerEmail: "bob@example.test" },

  { id: IDS.crossSell, type: "STRATEGIC_PLAY", nameEn: "Enterprise Cross-Sell Engine", nameAr: "محرك البيع المتقاطع لقطاع المؤسسات", ownerEmail: "carol@example.test" },
  { id: IDS.emeaExpansion, type: "STRATEGIC_PLAY", nameEn: "EMEA Market Expansion", nameAr: "التوسع في أسواق أوروبا والشرق الأوسط وأفريقيا", ownerEmail: "carol@example.test" },
  { id: IDS.partnerNetwork, type: "STRATEGIC_PLAY", nameEn: "Regional Partner Network", nameAr: "شبكة الشركاء الإقليميين", ownerEmail: "alice@example.test" },
  { id: IDS.cxRedesign, type: "STRATEGIC_PLAY", nameEn: "Customer Experience Redesign", nameAr: "إعادة تصميم تجربة العملاء", ownerEmail: "alice@example.test" },
  { id: IDS.selfService, type: "STRATEGIC_PLAY", nameEn: "Digital Self-Service Adoption", nameAr: "تبني الخدمة الذاتية الرقمية", ownerEmail: "alice@example.test" },
  { id: IDS.automation, type: "STRATEGIC_PLAY", nameEn: "Process Automation at Scale", nameAr: "أتمتة العمليات على نطاق واسع", ownerEmail: "team@test.com" },
  { id: IDS.controlTower, type: "STRATEGIC_PLAY", nameEn: "Supply Chain Control Tower", nameAr: "مركز التحكم في سلسلة الإمداد", ownerEmail: "team@test.com" },
  { id: IDS.skillsAcademy, type: "STRATEGIC_PLAY", nameEn: "Future Skills Academy", nameAr: "أكاديمية مهارات المستقبل", ownerEmail: "bob@example.test" },
  { id: IDS.ventureStudio, type: "STRATEGIC_PLAY", nameEn: "Innovation Venture Studio", nameAr: "استوديو مشاريع الابتكار", ownerEmail: "bob@example.test" },

  { id: IDS.commercialPortfolio, type: "PORTFOLIO", nameEn: "Commercial Growth Portfolio", nameAr: "محفظة النمو التجاري" },
  { id: IDS.digitalPortfolio, type: "PORTFOLIO", nameEn: "Digital Experience Portfolio", nameAr: "محفظة التجربة الرقمية" },
  { id: IDS.transformationPortfolio, type: "PORTFOLIO", nameEn: "Enterprise Transformation Portfolio", nameAr: "محفظة التحول المؤسسي" },

  { id: IDS.europeFocus, type: "AREA_OF_FOCUS", nameEn: "Europe & GCC Priority Markets", nameAr: "الأسواق ذات الأولوية في أوروبا ودول الخليج" },
  { id: IDS.customerDigitalFocus, type: "AREA_OF_FOCUS", nameEn: "Digital-First Customer Journeys", nameAr: "رحلات العملاء الرقمية أولاً" },
  { id: IDS.aiAutomationFocus, type: "AREA_OF_FOCUS", nameEn: "AI-Enabled Productivity", nameAr: "الإنتاجية المدعومة بالذكاء الاصطناعي" },
  { id: IDS.talentFocus, type: "AREA_OF_FOCUS", nameEn: "Leadership & Future Skills", nameAr: "القيادة ومهارات المستقبل" },
];

// Current authoritative strategy relationships after
// 20260812184500_wire_portfolio_relationship_rules:
//   portfolio -> area_of_focus uses CONTAINS
//   strategic_play -> area_of_focus uses BELONGS_TO_PORTFOLIO
// The earlier ALIGNS_TO relationship is intentionally no longer seeded.
const EDGES: DemoEdge[] = [
  { from: IDS.corporate, to: IDS.growth, type: "CONTAINS" },
  { from: IDS.corporate, to: IDS.customer, type: "CONTAINS" },
  { from: IDS.corporate, to: IDS.operations, type: "CONTAINS" },
  { from: IDS.corporate, to: IDS.people, type: "CONTAINS" },

  { from: IDS.growth, to: IDS.recurringRevenue, type: "CONTAINS" },
  { from: IDS.growth, to: IDS.priorityMarkets, type: "CONTAINS" },
  { from: IDS.customer, to: IDS.customerAdvocacy, type: "CONTAINS" },
  { from: IDS.customer, to: IDS.digitalAdoption, type: "CONTAINS" },
  { from: IDS.operations, to: IDS.operatingMargin, type: "CONTAINS" },
  { from: IDS.operations, to: IDS.supplyResilience, type: "CONTAINS" },
  { from: IDS.people, to: IDS.criticalCapabilities, type: "CONTAINS" },
  { from: IDS.people, to: IDS.innovationPipeline, type: "CONTAINS" },

  { from: IDS.recurringRevenue, to: IDS.crossSell, type: "EXECUTED_BY" },
  { from: IDS.priorityMarkets, to: IDS.emeaExpansion, type: "EXECUTED_BY" },
  { from: IDS.priorityMarkets, to: IDS.partnerNetwork, type: "EXECUTED_BY" },
  { from: IDS.customerAdvocacy, to: IDS.cxRedesign, type: "EXECUTED_BY" },
  { from: IDS.digitalAdoption, to: IDS.selfService, type: "EXECUTED_BY" },
  { from: IDS.operatingMargin, to: IDS.automation, type: "EXECUTED_BY" },
  { from: IDS.supplyResilience, to: IDS.controlTower, type: "EXECUTED_BY" },
  { from: IDS.criticalCapabilities, to: IDS.skillsAcademy, type: "EXECUTED_BY" },
  { from: IDS.innovationPipeline, to: IDS.ventureStudio, type: "EXECUTED_BY" },

  { from: IDS.commercialPortfolio, to: IDS.europeFocus, type: "CONTAINS" },
  { from: IDS.digitalPortfolio, to: IDS.customerDigitalFocus, type: "CONTAINS" },
  { from: IDS.transformationPortfolio, to: IDS.aiAutomationFocus, type: "CONTAINS" },
  { from: IDS.transformationPortfolio, to: IDS.talentFocus, type: "CONTAINS" },

  { from: IDS.crossSell, to: IDS.commercialPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.emeaExpansion, to: IDS.commercialPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.partnerNetwork, to: IDS.commercialPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.cxRedesign, to: IDS.digitalPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.selfService, to: IDS.digitalPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.automation, to: IDS.transformationPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.controlTower, to: IDS.transformationPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.skillsAcademy, to: IDS.transformationPortfolio, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.ventureStudio, to: IDS.transformationPortfolio, type: "BELONGS_TO_PORTFOLIO" },

  { from: IDS.emeaExpansion, to: IDS.europeFocus, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.partnerNetwork, to: IDS.europeFocus, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.cxRedesign, to: IDS.customerDigitalFocus, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.selfService, to: IDS.customerDigitalFocus, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.automation, to: IDS.aiAutomationFocus, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.skillsAcademy, to: IDS.talentFocus, type: "BELONGS_TO_PORTFOLIO" },
  { from: IDS.ventureStudio, to: IDS.aiAutomationFocus, type: "BELONGS_TO_PORTFOLIO" },
];

export async function seedCanonicalStrategy(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.log("Skipping canonical demo strategy seed in production");
    return;
  }

  const administrator =
    (await prisma.user.findUnique({ where: { email: "bob@example.test" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!administrator) {
    console.log("No users exist yet, skipping canonical strategy seed");
    return;
  }

  const existingActivePlan = await prisma.planVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { opensAt: "desc" },
  });

  const targetPlan = existingActivePlan ?? await prisma.planVersion.upsert({
    where: { id: IDS.plan },
    update: {
      name: DEMO_PLAN_NAME,
      status: "ACTIVE",
      opensAt: new Date("2026-01-01T00:00:00.000Z"),
      closesAt: null,
    },
    create: {
      id: IDS.plan,
      name: DEMO_PLAN_NAME,
      status: "ACTIVE",
      opensAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  console.log(
    existingActivePlan
      ? `Using existing active strategy plan: “${targetPlan.name}”`
      : `Created active demo strategy plan: “${targetPlan.name}”`,
  );

  for (const node of NODES) {
    await prisma.strategyNode.upsert({
      where: { id: node.id },
      update: {
        type: node.type,
        nameEn: node.nameEn,
        nameAr: node.nameAr,
        planVersionId: targetPlan.id,
        state: "ACTIVE",
      },
      create: {
        id: node.id,
        type: node.type,
        nameEn: node.nameEn,
        nameAr: node.nameAr,
        planVersionId: targetPlan.id,
        state: "ACTIVE",
        createdBy: administrator.id,
      },
    });
  }

  for (const edge of EDGES) {
    await prisma.strategyEdge.upsert({
      where: {
        fromNodeId_toNodeId_edgeType_planVersionId: {
          fromNodeId: edge.from,
          toNodeId: edge.to,
          edgeType: edge.type,
          planVersionId: targetPlan.id,
        },
      },
      update: {},
      create: {
        fromNodeId: edge.from,
        toNodeId: edge.to,
        edgeType: edge.type,
        planVersionId: targetPlan.id,
      },
    });
  }

  for (const node of NODES) {
    if (!node.ownerEmail) continue;
    const owner = await prisma.user.findUnique({ where: { email: node.ownerEmail } });
    if (!owner) continue;

    await prisma.ownerAssignment.upsert({
      where: {
        nodeId_ownerUserId: {
          nodeId: node.id,
          ownerUserId: owner.id,
        },
      },
      update: { assignedBy: administrator.id },
      create: {
        nodeId: node.id,
        ownerUserId: owner.id,
        assignedBy: administrator.id,
      },
    });
  }

  console.log(
    `Canonical strategy seeded: ${NODES.length} nodes, ${EDGES.length} relationships in “${targetPlan.name}”`,
  );
}
