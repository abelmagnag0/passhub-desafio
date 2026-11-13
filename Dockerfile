# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.build.json tsconfig.json ./
COPY src ./src
RUN ./node_modules/.bin/tsc -p tsconfig.build.json && npm prune --omit=dev

# imagem padrão do serviço: Compose local E produção na EC2
FROM node:22-alpine AS runtime
WORKDIR /srv
ENV NODE_ENV=production
COPY --from=build /srv/node_modules ./node_modules
COPY --from=build /srv/dist ./dist
COPY public ./public
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 8000
CMD ["node", "dist/server.js"]
