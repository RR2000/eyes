# One image: the Node server serves the page, its scripts and the WebSocket (/ws) on the same port.
FROM node:26.13.1-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY tsconfig.json tsconfig.client.json ./
COPY src ./src
RUN npm run build

FROM node:26.13.1-alpine3.24
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/shared ./dist/shared
COPY --from=build /app/dist/client ./dist/client
COPY public ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server/main.js"]
