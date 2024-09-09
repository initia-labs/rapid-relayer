FROM node:alpine

WORKDIR /usr/rapid-relayer
COPY package.json .
RUN npm install\
    && npm install typescript -g
COPY . .
RUN tsc


ENV CONFIGFILE=/config/config.json
ENV SYNC_INFO=/syncInfo/syncInfo
EXPOSE 3000
VOLUME /config
VOLUME /syncInfo

CMD ["npm", "start"]