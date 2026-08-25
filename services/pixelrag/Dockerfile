# Python 3.12 required: pixelrag==0.3.0 pins Requires-Python >=3.12
FROM python:3.12-slim

# poppler-utils provides pdfinfo/pdftoppm, required by PixelRAG's PDF renderer
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "scripts/run_web.py"]
