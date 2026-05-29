FROM python:3.11-slim

# Run as non-root for safety
RUN useradd --create-home --uid 10001 paperapp

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app_server.py mcp_dispatcher.py tool_schema_provider.py reading_mcp_server.py /app/
COPY index.html app.js chat.js styles.css privacy.html terms.html landing.html apple-touch-icon.png /app/
COPY assets/ /app/assets/

# Persistent data directories — must be mounted as volumes in compose
RUN mkdir -p /app/uploads /app/data && \
    chown -R paperapp:paperapp /app

USER paperapp

EXPOSE 8787

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Use a healthcheck — Caddy will detect when the app is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request, sys; r = urllib.request.urlopen('http://127.0.0.1:8787/api/health', timeout=3); sys.exit(0 if r.status == 200 else 1)" || exit 1

CMD ["python", "app_server.py"]
