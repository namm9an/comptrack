FROM python:3.12-slim

WORKDIR /app

# System deps for Crawl4AI (Playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget gnupg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers for Crawl4AI
RUN python -m playwright install chromium --with-deps

COPY app/ .

RUN mkdir -p data

EXPOSE 8081

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
