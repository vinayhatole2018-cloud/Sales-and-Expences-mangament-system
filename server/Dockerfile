# API server image (Cloud Run / any container host).
# Build context: the server/ folder, after `npm run build` has produced dist/.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
# The shared workspace package is bundled into dist/, so drop it from install.
RUN node -e "const p=require('./package.json');delete p.dependencies['@pbms/shared'];delete p.devDependencies;require('fs').writeFileSync('package.json',JSON.stringify(p))" \
  && npm install --omit=dev --no-audit --no-fund
COPY dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
