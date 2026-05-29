# Local development image for Agency Watch.
# Production deploys to Cloudflare Workers (see README) — this image is NOT used in prod.

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Install dependencies (cached layer)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Development server with hot reload
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
ENV HOST=0.0.0.0
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# Optional: build artifacts (use with `docker build --target build`)
FROM deps AS build
COPY . .
ARG VITE_API_URL
ARG VITE_API_PUBLIC_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_PUBLIC_KEY=$VITE_API_PUBLIC_KEY
RUN npm run build
