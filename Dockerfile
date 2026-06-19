FROM node:22-bookworm

WORKDIR /usr/rapid-relayer

# Copy package metadata early to leverage Docker layer caching
COPY package.json package-lock.json .npmrc ./

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 make g++ libusb-1.0-0-dev libudev-dev \
 && rm -rf /var/lib/apt/lists/*

# Install npm dependencies
RUN npx -y npm@11 ci
# RUN npm install -g typescript  # Uncomment if needed

# Copy the rest of the app
COPY . .

LABEL org.opencontainers.image.source="https://github.com/initia-labs/rapid-relayer"
LABEL org.opencontainers.image.description="Initia Labs Rapid Relayer"

ENV CONFIGFILE=/config/config.json
ENV SYNC_INFO=/syncInfo/syncInfo

# main port
EXPOSE 7010
# metrics port
EXPOSE 7011

# MNEMONIC must be provided at runtime
ENV MNEMONIC=""

VOLUME /config
VOLUME /syncInfo

CMD ["npm", "start"]
