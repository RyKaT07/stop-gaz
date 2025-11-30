FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY .next ./.next
COPY public ./public
COPY next.config.mjs ./next.config.mjs

EXPOSE 3000
CMD ["npm", "run", "start"]
