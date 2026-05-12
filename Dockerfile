FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Preview Fly builds pass these via fly-review.yml so the UI can show branch / build time.
ARG PREVIEW_GIT_BRANCH=
ARG PREVIEW_BUILD_ISO=
ARG PREVIEW_GIT_SHA_SHORT=
ENV PREVIEW_GIT_BRANCH=$PREVIEW_GIT_BRANCH
ENV PREVIEW_BUILD_ISO=$PREVIEW_BUILD_ISO
ENV PREVIEW_GIT_SHA_SHORT=$PREVIEW_GIT_SHA_SHORT

EXPOSE 8080

CMD ["npm", "run", "start"]
