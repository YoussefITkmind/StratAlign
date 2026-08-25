import "dotenv/config";
import { createHash } from "node:crypto";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed strategy maps");

const url = new URL(connectionString);
url.searchParams.delete("schema");
const client = new pg.Client({ connectionString: url.toString() });

function stableUuid(label: string): string {
  const hex = createHash("sha256").update(`stratalign-strategy-map:${label}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type ObjectiveSeed = {
  key: string;
  name: string;
  perspective: "financial" | "customer" | "internal" | "learning";
  status: "on-track" | "at-risk" | "off-track";
  progress: number;
  owner: string;
  description: string;
  linkedKpis: string[];
};

type RelationshipType = "enables" | "impacts" | "drives" | "supports";

type AdditionalMapSeed = {
  key: string;
  name: string;
  objectiveKeys: string[];
};

const perspectiveSeeds = [
  { key: "financial", name: "Financial", order: 0 },
  { key: "customer", name: "Customer", order: 1 },
  { key: "internal", name: "Internal Process", order: 2 },
  { key: "learning", name: "Learning & Growth", order: 3 },
] as const;

const objectives: ObjectiveSeed[] = [
  { key: "grow-revenue", name: "Grow Revenue 40% YoY", perspective: "financial", status: "at-risk", progress: 67, owner: "Sarah Chen", description: "Drive aggressive top-line growth through enterprise expansion and stronger recurring revenue performance.", linkedKpis: ["Revenue Growth", "New ARR"] },
  { key: "improve-profitability", name: "Improve Profitability", perspective: "financial", status: "on-track", progress: 78, owner: "Sarah Chen", description: "Improve margin performance through disciplined pricing, product mix, and operating leverage.", linkedKpis: ["Gross Margin", "Operating Margin"] },
  { key: "expand-market", name: "Expand Market Share", perspective: "financial", status: "at-risk", progress: 55, owner: "Tom Richards", description: "Increase share in priority segments and markets while protecting profitable growth.", linkedKpis: ["Market Share", "Revenue Mix"] },
  { key: "acquire-logos", name: "Acquire Enterprise Logos", perspective: "customer", status: "at-risk", progress: 48, owner: "Tom Richards", description: "Win 50 new enterprise logos across priority markets and strategic accounts.", linkedKpis: ["New Logos", "Win Rate"] },
  { key: "retention", name: "Drive Customer Retention", perspective: "customer", status: "on-track", progress: 82, owner: "Mira Wallace", description: "Improve retention by increasing product value realization and proactive customer success engagement.", linkedKpis: ["Retention Rate", "Net Revenue Retention"] },
  { key: "premium-experience", name: "Deliver Premium Experience", perspective: "customer", status: "on-track", progress: 74, owner: "Mira Wallace", description: "Deliver a consistent premium experience across onboarding, support, and product interactions.", linkedKpis: ["NPS", "CSAT"] },
  { key: "innovation", name: "Accelerate Innovation", perspective: "internal", status: "on-track", progress: 71, owner: "Priya Nair", description: "Shorten the cycle from validated customer insight to production-ready capability.", linkedKpis: ["Innovation Cycle Time", "Features Shipped"] },
  { key: "ops-excellence", name: "Operational Excellence", perspective: "internal", status: "on-track", progress: 83, owner: "James Park", description: "Increase operational reliability, automation, and process efficiency across core workflows.", linkedKpis: ["OPEX Variance", "Process Efficiency"] },
  { key: "sales-excellence", name: "Sales Excellence", perspective: "internal", status: "at-risk", progress: 60, owner: "Tom Richards", description: "Improve pipeline discipline, deal execution, and repeatability of the enterprise sales motion.", linkedKpis: ["Sales Cycle", "Pipeline Coverage"] },
  { key: "talent", name: "Talent & Leadership Development", perspective: "learning", status: "on-track", progress: 80, owner: "Diana Foxx", description: "Build leadership capacity and critical skills required to execute the strategy at scale.", linkedKpis: ["Leadership Bench", "Skills Coverage"] },
  { key: "technology", name: "Technology Adoption", perspective: "learning", status: "on-track", progress: 71, owner: "James Park", description: "Increase adoption of strategic platforms, automation, and modern engineering practices.", linkedKpis: ["Digital Adoption", "Automation Coverage"] },
  { key: "culture", name: "High-Performance Culture", perspective: "learning", status: "on-track", progress: 84, owner: "Diana Foxx", description: "Strengthen accountability, engagement, and cross-functional execution across the organization.", linkedKpis: ["Employee Engagement", "Goal Alignment"] },
];

const links: Array<[string, string, RelationshipType]> = [
  ["acquire-logos", "grow-revenue", "drives"],
  ["retention", "grow-revenue", "impacts"],
  ["premium-experience", "expand-market", "supports"],
  ["innovation", "premium-experience", "enables"],
  ["ops-excellence", "retention", "impacts"],
  ["sales-excellence", "acquire-logos", "drives"],
  ["talent", "innovation", "enables"],
  ["technology", "ops-excellence", "enables"],
  ["culture", "sales-excellence", "supports"],
  ["acquire-logos", "expand-market", "drives"],
  ["ops-excellence", "improve-profitability", "impacts"],
  ["technology", "premium-experience", "supports"],
  ["innovation", "improve-profitability", "impacts"],
  ["retention", "expand-market", "supports"],
  ["culture", "retention", "supports"],
];

const additionalMaps: AdditionalMapSeed[] = [
  {
    key: "product",
    name: "Product Strategy 2025",
    objectiveKeys: [
      "improve-profitability",
      "retention",
      "premium-experience",
      "innovation",
      "ops-excellence",
      "talent",
      "technology",
      "culture",
    ],
  },
  {
    key: "apac",
    name: "APAC Expansion Strategy",
    objectiveKeys: [
      "grow-revenue",
      "expand-market",
      "acquire-logos",
      "premium-experience",
      "sales-excellence",
      "technology",
      "culture",
    ],
  },
];

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query<{ id: string }>(`SELECT id FROM iam.users ORDER BY created_at LIMIT 1`);
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      console.log("No users exist yet, skipping Strategy Map seed");
      await client.query("ROLLBACK");
      return;
    }

    const rootResult = await client.query<{ id: string }>(`SELECT id FROM strategy_hierarchy.strategy_hierarchy_nodes WHERE parent_id IS NULL ORDER BY created_at LIMIT 1`);
    const rootId = rootResult.rows[0]?.id ?? stableUuid("hierarchy-root");
    if (rootResult.rowCount === 0) {
      await client.query(`
        INSERT INTO strategy_hierarchy.strategy_hierarchy_nodes
          (id, parent_id, name, type, status, progress, owner_name, owner_initials, owner_color, description, linked_kpis, created_by, updated_at)
        VALUES ($1, NULL, 'Corporate Strategy 2025', 'plan', 'on-track', 74, 'Alex Morgan', 'AM', 'bg-indigo-500',
                'Corporate strategy used by the persisted Strategy Maps workspace.', ARRAY['Strategy Score'], $2, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [rootId, userId]);
    }

    const planId = stableUuid("plan-version");
    await client.query(`
      INSERT INTO strategy.plan_versions (id, name, status)
      VALUES ($1, 'Strategy Maps 2025', 'draft')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [planId]);

    const scorecardId = stableUuid("corporate-scorecard");
    await client.query(`
      INSERT INTO scorecard.scorecards (id, name_en, name_ar, plan_version_id)
      VALUES ($1, 'Corporate Strategy 2025', 'Corporate Strategy 2025', $2)
      ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, plan_version_id = EXCLUDED.plan_version_id, updated_at = NOW()
    `, [scorecardId, planId]);

    const perspectiveIds = new Map<string, string>();
    for (const perspective of perspectiveSeeds) {
      const hierarchyPerspectiveId = stableUuid(`hierarchy-perspective:${perspective.key}`);
      const scorecardPerspectiveId = stableUuid(`scorecard-perspective:${perspective.key}`);
      perspectiveIds.set(perspective.key, scorecardPerspectiveId);

      await client.query(`
        INSERT INTO strategy_hierarchy.strategy_hierarchy_nodes
          (id, parent_id, name, type, status, progress, owner_name, owner_initials, owner_color, linked_kpis, created_by, updated_at)
        VALUES ($1, $2, $3, 'perspective', 'on-track', 75, 'Alex Morgan', 'AM', 'bg-indigo-500', ARRAY[]::text[], $4, NOW())
        ON CONFLICT (id) DO UPDATE SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, updated_at = NOW()
      `, [hierarchyPerspectiveId, rootId, perspective.name, userId]);

      await client.query(`
        INSERT INTO strategy.strategy_nodes (id, type, name_en, name_ar, plan_version_id, state, created_by)
        VALUES ($1, 'theme', $2, $2, $3, 'active', $4)
        ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, plan_version_id = EXCLUDED.plan_version_id, state = 'active'
      `, [hierarchyPerspectiveId, perspective.name, planId, userId]);

      await client.query(`
        INSERT INTO scorecard.perspectives (id, scorecard_id, name_en, name_ar, "order")
        VALUES ($1, $2, $3, $3, $4)
        ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, "order" = EXCLUDED."order", updated_at = NOW()
      `, [scorecardPerspectiveId, scorecardId, perspective.name, perspective.order]);
    }

    const objectiveIds = new Map<string, string>();
    for (const objective of objectives) {
      const objectiveId = stableUuid(`objective:${objective.key}`);
      objectiveIds.set(objective.key, objectiveId);
      const hierarchyPerspectiveId = stableUuid(`hierarchy-perspective:${objective.perspective}`);
      const scorecardPerspectiveId = perspectiveIds.get(objective.perspective)!;
      const initials = objective.owner.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

      await client.query(`
        INSERT INTO strategy_hierarchy.strategy_hierarchy_nodes
          (id, parent_id, name, type, status, progress, owner_name, owner_initials, owner_color, description, linked_kpis, created_by, updated_at)
        VALUES ($1, $2, $3, 'objective', $4::strategy_hierarchy."StrategyHierarchyNodeStatus", $5, $6, $7, 'bg-sky-600', $8, $9::text[], $10, NOW())
        ON CONFLICT (id) DO UPDATE SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, status = EXCLUDED.status,
          progress = EXCLUDED.progress, owner_name = EXCLUDED.owner_name, owner_initials = EXCLUDED.owner_initials,
          description = EXCLUDED.description, linked_kpis = EXCLUDED.linked_kpis, updated_at = NOW()
      `, [objectiveId, hierarchyPerspectiveId, objective.name, objective.status, objective.progress, objective.owner, initials, objective.description, objective.linkedKpis, userId]);

      await client.query(`
        INSERT INTO strategy.strategy_nodes (id, type, name_en, name_ar, plan_version_id, state, created_by)
        VALUES ($1, 'objective', $2, $2, $3, 'active', $4)
        ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, plan_version_id = EXCLUDED.plan_version_id, state = 'active'
      `, [objectiveId, objective.name, planId, userId]);

      await client.query(`
        INSERT INTO strategy.strategy_edges (id, from_node_id, to_node_id, edge_type, plan_version_id)
        VALUES ($1, $2, $3, 'contains', $4)
        ON CONFLICT (from_node_id, to_node_id, edge_type, plan_version_id) DO NOTHING
      `, [stableUuid(`contains:${objective.key}`), hierarchyPerspectiveId, objectiveId, planId]);

      await client.query(`
        INSERT INTO strategy.owner_assignments (id, node_id, owner_user_id, assigned_by)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (node_id, owner_user_id) DO NOTHING
      `, [stableUuid(`owner:${objective.key}`), objectiveId, userId]);

      await client.query(`
        INSERT INTO scorecard.placements (id, perspective_id, objective_node_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (perspective_id, objective_node_id) DO NOTHING
      `, [stableUuid(`placement:${objective.key}`), scorecardPerspectiveId, objectiveId]);
    }

    const mapId = stableUuid("published-map");
    await client.query(`
      INSERT INTO scorecard.strategy_maps (id, scorecard_id, state)
      VALUES ($1, $2, 'published')
      ON CONFLICT (id) DO UPDATE SET state = 'published', updated_at = NOW()
    `, [mapId, scorecardId]);

    for (const [fromKey, toKey, type] of links) {
      await client.query(`
        INSERT INTO scorecard.map_links (id, strategy_map_id, from_objective_id, to_objective_id, strength)
        VALUES ($1, $2, $3, $4, $5::scorecard.map_link_strength)
        ON CONFLICT (strategy_map_id, from_objective_id, to_objective_id) DO UPDATE SET strength = EXCLUDED.strength
      `, [stableUuid(`link:${fromKey}:${toKey}`), mapId, objectiveIds.get(fromKey), objectiveIds.get(toKey), type]);
    }

    let additionalPlacementCount = 0;
    let additionalLinkCount = 0;

    for (const additionalMap of additionalMaps) {
      const additionalScorecardId = stableUuid(`${additionalMap.key}-scorecard`);
      await client.query(`
        INSERT INTO scorecard.scorecards (id, name_en, name_ar, plan_version_id)
        VALUES ($1, $2, $2, $3)
        ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, plan_version_id = EXCLUDED.plan_version_id, updated_at = NOW()
      `, [additionalScorecardId, additionalMap.name, planId]);

      const additionalPerspectiveIds = new Map<string, string>();
      for (const perspective of perspectiveSeeds) {
        const perspectiveId = stableUuid(`${additionalMap.key}:scorecard-perspective:${perspective.key}`);
        additionalPerspectiveIds.set(perspective.key, perspectiveId);
        await client.query(`
          INSERT INTO scorecard.perspectives (id, scorecard_id, name_en, name_ar, "order")
          VALUES ($1, $2, $3, $3, $4)
          ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, "order" = EXCLUDED."order", updated_at = NOW()
        `, [perspectiveId, additionalScorecardId, perspective.name, perspective.order]);
      }

      const objectiveKeySet = new Set(additionalMap.objectiveKeys);
      for (const objectiveKey of additionalMap.objectiveKeys) {
        const objective = objectives.find((item) => item.key === objectiveKey);
        const objectiveId = objectiveIds.get(objectiveKey);
        if (!objective || !objectiveId) continue;
        const perspectiveId = additionalPerspectiveIds.get(objective.perspective)!;
        await client.query(`
          INSERT INTO scorecard.placements (id, perspective_id, objective_node_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (perspective_id, objective_node_id) DO NOTHING
        `, [stableUuid(`${additionalMap.key}:placement:${objectiveKey}`), perspectiveId, objectiveId]);
        additionalPlacementCount += 1;
      }

      const additionalMapId = stableUuid(`${additionalMap.key}:published-map`);
      await client.query(`
        INSERT INTO scorecard.strategy_maps (id, scorecard_id, state)
        VALUES ($1, $2, 'published')
        ON CONFLICT (id) DO UPDATE SET state = 'published', updated_at = NOW()
      `, [additionalMapId, additionalScorecardId]);

      for (const [fromKey, toKey, type] of links) {
        if (!objectiveKeySet.has(fromKey) || !objectiveKeySet.has(toKey)) continue;
        await client.query(`
          INSERT INTO scorecard.map_links (id, strategy_map_id, from_objective_id, to_objective_id, strength)
          VALUES ($1, $2, $3, $4, $5::scorecard.map_link_strength)
          ON CONFLICT (strategy_map_id, from_objective_id, to_objective_id) DO UPDATE SET strength = EXCLUDED.strength
        `, [stableUuid(`${additionalMap.key}:link:${fromKey}:${toKey}`), additionalMapId, objectiveIds.get(fromKey), objectiveIds.get(toKey), type]);
        additionalLinkCount += 1;
      }
    }

    await client.query("COMMIT");
    console.log(
      `Seeded persisted Strategy Maps: ${1 + additionalMaps.length} maps, ${objectives.length + additionalPlacementCount} placements, ${links.length + additionalLinkCount} connections`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Strategy Map seed failed", error);
  process.exitCode = 1;
});
