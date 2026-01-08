# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY craco.config.js ./

# Install dependencies
RUN npm ci --silent --legacy-peer-deps

# Copy source code
COPY public ./public
COPY src ./src
COPY scripts ./scripts

# Create a placeholder env-config.js for build (real values injected at runtime)
RUN echo 'window.__ENV__ = {};' > public/env-config.js

# Build the app (skip prebuild since env is injected at runtime)
RUN npm run build --ignore-scripts

# Production stage
FROM nginx:alpine

LABEL maintainer="Snowflake Intelligence Demo Generator"
LABEL version="1.0.0"

# Install bash for entrypoint script
RUN apk add --no-cache bash

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Run entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

