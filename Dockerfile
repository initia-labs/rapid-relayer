FROM node:alpine

WORKDIR /usr/rapid-relayer
COPY package.json .
RUN npm install\
    && npm install typescript -g
COPY . .
#RUN tsc

LABEL org.opencontainers.image.source="https://github.com/initia-labs/rapid-relayer"
LABEL org.opencontainers.image.description="Initia Labs Rapid Relayer"
ENV CONFIGFILE=/config/config.json
ENV SYNC_INFO=/syncInfo/syncInfo

EXPOSE 7010
EXPOSE 7011
ENV MNEMONIC="your seed goes here"

VOLUME /config
VOLUME /syncInfo

CMD ["npm", "start"]
