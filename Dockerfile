FROM node:alpine

WORKDIR /usr/rapid-relayer
COPY package.json .
RUN npm install\
    && npm install typescript -g
COPY . .
RUN tsc


ENV CONFIGFILE=/config/config.json
VOLUME /config

CMD ["npm", "start"]