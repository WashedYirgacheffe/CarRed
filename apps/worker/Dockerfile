FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/worker/package*.json ./apps/worker/
COPY packages/shared/package*.json ./packages/shared/
RUN npm install --workspaces
COPY . .
CMD ["npm", "-w", "apps/worker", "run", "dev"]
