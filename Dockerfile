FROM node:alpine

WORKDIR /usr/rapid-relayer
COPY package.json .

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

RUN npm install
#    && npm install typescript -g
COPY . .
#RUN tsc

LABEL org.opencontainers.image.source="https://github.com/initia-labs/rapid-relayer"
LABEL org.opencontainers.image.description="Initia Labs Rapid Relayer"
ENV CONFIGFILE=/config/config.json
ENV SYNC_INFO=/syncInfo/syncInfo

# main port
EXPOSE 7010
# metrics port
EXPOSE 7011

# MNEMONIC must be provided at runtime (if your config uses it)
ENV MNEMONIC=""

VOLUME /config
VOLUME /syncInfo

CMD ["npm", "start"]
