# StratAlign PixelRAG Service

PixelRAG is an isolated document- and performance-intelligence service used by the StratAlign **AI Intelligence** workspace.

## Safety boundary

PixelRAG does not connect to StratAlign Prisma models or write to StratAlign business data. Smart Import and Data Capture are exposed to StratAlign as **preview/proposal-only** operations. There is no apply procedure in the TypeScript PixelRAG router.

The Python POC keeps its own local JSON/filesystem state for documents, proposals, governance, alerts, audit events, ingestion settings, and workflow history.

## Runtime modes

`python scripts/run_web.py` selects the runtime automatically:

- If `EMBED_API_URL` is set, rendering/chunking and FAISS stay local to this service while image/text embedding inference is delegated to the remote GPU endpoint.
- If `EMBED_API_URL` is unset, the original local PixelRAG embedding/search runtime is used.

### Office rendering requirement

PixelRAG is a visual retrieval system. DOCX, PPTX and XLSX uploads must therefore be rendered to a real PDF before indexing so evidence tiles preserve the source page, slide or worksheet layout.

LibreOffice/`soffice` is required on the PixelRAG service host for Office uploads. PixelRAG intentionally does **not** fall back to reconstructed text pages, because those are not faithful visual evidence.

On Ubuntu/WSL:

```bash
sudo apt-get update
sudo apt-get install -y libreoffice
```

Verify with:

```bash
which soffice || which libreoffice
```

PDF, PNG and JPG uploads do not require LibreOffice.

## Setup

```bash
cd services/pixelrag
./scripts/setup.sh
source .venv/bin/activate
```

Or use an existing compatible virtual environment and install `requirements.txt`.

## Environment

See `.env.example`. The usual remote-GPU development configuration is:

```bash
export EMBED_API_URL="https://your-embedding-service.example"
export VLM_API_KEY="<provider-key>"
export VLM_BASE_URL="https://api.openai.com/v1"
export VLM_MODEL="gpt-4.1-mini"
```

Never commit real API keys.

Optional service-to-service authentication can be enabled with:

```bash
export PIXELRAG_SERVICE_TOKEN="<random-token>"
```

When enabled, configure the exact same `PIXELRAG_SERVICE_TOKEN` in `apps/backend/.env`.

## Run

```bash
python scripts/run_web.py
```

The service listens on `http://127.0.0.1:8000`.

The StratAlign backend should be configured with:

```bash
PIXELRAG_SERVICE_URL=http://127.0.0.1:8000
PIXELRAG_TIMEOUT_MS=300000
```

## Tests

```bash
python -m pytest -q
```

Backend client tests are run from the repository root with the normal backend test command.

## StratAlign workspace

The `/ai-intelligence` page provides:

- document upload, selection, re-indexing and status
- single-document grounded Q&A with visual evidence
- multi-document comparison
- structured objective/KPI/initiative extraction and re-analysis
- Smart Import preview
- Data Capture preview
- executive summaries, variance explanations, KPI/objective/initiative intelligence, and recommendations
- KPI forecast guardrails and measurement lineage
- alerts and acknowledgement
- PixelRAG governance settings
- watched-folder ingestion and connector readiness
- PixelRAG-local audit and proposal workflow history

## Remote embedding contract

The remote embedding service must expose:

- `POST /embed_image` with `{ "image_b64": "..." }`
- `POST /embed_text` with `{ "text": "..." }`

Both return:

```json
{ "embedding": [0.0], "dim": 1 }
```

The adapter validates dimensions/finite values and L2-normalizes vectors before FAISS indexing/search.
