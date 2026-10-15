FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

RUN mkdir -p /app/data /state && chown node:node /app/data /state

COPY --chown=node:node package.json server.js index.html login.html login.js theme.js styles.css app.js ./
COPY --chown=node:node collector ./collector

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
