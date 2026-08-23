import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PixelRagClient,
  PixelRagClientError,
} from "../../src/modules/pixelrag/pixelrag.client";

const fetchMock = vi.fn<typeof fetch>();

describe("PixelRagClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("calls the PixelRAG health endpoint using a normalized base URL", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "stratalign-pixelrag-poc",
          version: "1.0.0",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const client = new PixelRagClient("http://localhost:8000/");

    await expect(client.health()).resolves.toEqual({
      status: "ok",
      service: "stratalign-pixelrag-poc",
      version: "1.0.0",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/health",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("forwards Q&A as JSON and passes the StratAlign role", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          document_id: "doc-1",
          answer: "Revenue is above target.",
          evidence: ["Revenue table"],
          tiles: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const client = new PixelRagClient("http://localhost:8000");

    await client.ask({
      question: "How is revenue performing?",
      topK: 4,
      role: "data_steward",
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];

    expect(options?.method).toBe("POST");
    expect(options?.body).toBe(
      JSON.stringify({
        question: "How is revenue performing?",
        top_k: 4,
      }),
    );

    const headers = new Headers(options?.headers);
    expect(headers.get("X-User-Role")).toBe("data_steward");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("maps a PixelRAG HTTP error to PixelRagClientError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: "No document is selected",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const client = new PixelRagClient("http://localhost:8000");

    await expect(
      client.ask({ question: "What is the current KPI status?" }),
    ).rejects.toMatchObject({
      name: "PixelRagClientError",
      message: "No document is selected",
      status: 409,
    } satisfies Partial<PixelRagClientError>);
  });
});
