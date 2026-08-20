import type { StrategyNode } from "@/types/strategy";
import { colorForInitials } from "@/lib/strategyConfig";

function owner(initials: string) {
  return { initials, color: colorForInitials(initials) };
}

export const initialStrategyData: StrategyNode = {
  id: "plan-1",
  name: "Acme Corp 2025 Strategic Plan",
  type: "plan",
  status: "on-track",
  progress: 74,
  owner: owner("AM"),
  children: [
    {
      id: "pillar-revenue",
      name: "Revenue & Growth",
      type: "perspective",
      status: "at-risk",
      progress: 58,
      owner: owner("SC"),
      children: [
        {
          id: "obj-drive-revenue",
          name: "Drive Revenue Growth 40% YoY",
          type: "objective",
          status: "at-risk",
          progress: 67,
          owner: owner("SC"),
          children: [
            {
              id: "init-enterprise-sales",
              name: "Enterprise Sales Acceleration",
              type: "initiative",
              status: "at-risk",
              progress: 63,
              owner: owner("TR"),
              children: [
                {
                  id: "proj-apac",
                  name: "APAC Market Entry",
                  type: "project",
                  status: "off-track",
                  progress: 31,
                  owner: owner("TR"),
                },
                {
                  id: "proj-pipeline",
                  name: "Enterprise Pipeline Expansion",
                  type: "project",
                  status: "on-track",
                  progress: 72,
                  owner: owner("MW"),
                },
              ],
            },
            {
              id: "init-new-products",
              name: "New Product Lines",
              type: "initiative",
              status: "on-track",
              progress: 65,
              owner: owner("PN"),
            },
          ],
        },
        {
          id: "obj-geo-expansion",
          name: "Expand into 3 New Geographic Markets",
          type: "objective",
          status: "at-risk",
          progress: 42,
          owner: owner("JP"),
        },
      ],
    },
  ],
};
