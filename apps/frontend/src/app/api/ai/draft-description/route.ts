import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, type, context } = await req.json();

    if (!name || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Simulate an AI response delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    let draft = "";
    if (type === "objective") {
      draft = `To achieve the strategic objective of "${name}", we will focus on key measurable outcomes that align with our overall corporate strategy.`;
    } else if (type === "theme") {
      draft = `The theme "${name}" represents a core pillar of our strategic focus, guiding initiatives and objectives to drive sustainable growth.`;
    } else if (type === "initiative") {
      draft = `This initiative, "${name}", is designed to implement actionable steps toward our broader goals, requiring cross-functional collaboration.`;
    } else {
      draft = `Strategic focus area centered around "${name}", designed to drive performance and alignment across the organization.`;
    }

    if (context && context.parentName) {
      draft += ` This directly supports the parent goal of "${context.parentName}".`;
    }

    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate draft description" },
      { status: 500 }
    );
  }
}
