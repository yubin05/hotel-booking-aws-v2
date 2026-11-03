# Docker Hub 요청 한도를 피하려고 ECR Public 미러를 쓴다
# 화면(React) 빌드: 결과는 /app/public으로 나간다 (web/vite.config.ts)
FROM public.ecr.aws/docker/library/node:24-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY test ./test
RUN npm run build

FROM public.ecr.aws/docker/library/node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/src ./dist/src
COPY --from=web /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
