# Dockerfile — placed at project root (/heatloss/Dockerfile)
#
# Multi-stage build:
#   Stage 1 (builder): installs Node deps and builds the React frontend
#   Stage 2 (runtime): Node + Python for Express + PDF generation

# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install client dependencies and build
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim

# Install Python and pip for ReportLab PDF generation
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install ReportLab into a venv to avoid externally-managed-environment errors
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install reportlab==4.2.5

WORKDIR /app

# Install server Node dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built frontend from builder stage into the location Express expects
COPY --from=builder /app/client/dist ./public/

# Railway injects PORT — Express already reads process.env.PORT
EXPOSE 3000

CMD ["node", "server/server.js"]
