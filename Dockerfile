FROM oven/bun:latest

# Install dependencies for Sharp
RUN apt-get update && apt-get install -y \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Expose backend port
EXPOSE 3005

# Run the app
CMD ["bun", "run", "src/index.ts"]
