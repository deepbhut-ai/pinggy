# Dockerfile for pinggy tunnel service
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    openssh-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# SSH host key generated at runtime (persisted via volume in production)
# NOT generated at build time — keys must survive container rebuilds

# Expose FastAPI (8000) and SSH (2222)
EXPOSE 8000 2222

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the app
CMD ["python", "run.py"]