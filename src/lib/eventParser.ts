import { Height, Packet } from "@initia/initia.js";
import { Event } from "@cosmjs/tendermint-rpc/build/comet38/responses";
import { Ack } from "src/msgs";

export function parseSendPacketEvent(
  event: Event,
  connectionId: string
): Packet | undefined {
  if (event.type !== "send_packet") return;

  // connection filter
  if (
    event.attributes.filter((v) => v.key === "connection_id")[0].value !==
    connectionId
  ) {
    return;
  }

  const sequence = Number(
    event.attributes.filter((v) => v.key === "packet_sequence")[0].value
  );

  const srcPort = event.attributes.filter((v) => v.key === "packet_src_port")[0]
    .value;

  const srcChannel = event.attributes.filter(
    (v) => v.key === "packet_src_channel"
  )[0].value;

  const dstPort = event.attributes.filter((v) => v.key === "packet_dst_port")[0]
    .value;

  const dstChannel = event.attributes.filter(
    (v) => v.key === "packet_dst_channel"
  )[0].value;

  const data = Buffer.from(
    event.attributes.filter((v) => v.key === "packet_data_hex")[0].value,
    "hex"
  ).toString("base64");

  const timeoutHeightRaw = event.attributes.filter(
    (v) => v.key === "packet_timeout_height"
  )[0].value;

  const timeoutHeight = new Height(
    Number(timeoutHeightRaw.split("-")[0]),
    Number(timeoutHeightRaw.split("-")[1])
  );

  const timeoutTimestamp = event.attributes.filter(
    (v) => v.key === "packet_timeout_timestamp"
  )[0].value;

  return new Packet(
    sequence,
    srcPort,
    srcChannel,
    dstPort,
    dstChannel,
    data,
    timeoutHeight,
    timeoutTimestamp
  );
}

export function parseWriteAckEvent(
  event: Event,
  connectionId: string
): Ack | undefined {
  if (event.type !== "write_acknowledgement") return;

  // connection filter
  if (
    event.attributes.filter((v) => v.key === "connection_id")[0].value !==
    connectionId
  ) {
    return;
  }

  const sequence = Number(
    event.attributes.filter((v) => v.key === "packet_sequence")[0].value
  );

  const srcPort = event.attributes.filter((v) => v.key === "packet_src_port")[0]
    .value;

  const srcChannel = event.attributes.filter(
    (v) => v.key === "packet_src_channel"
  )[0].value;

  const dstPort = event.attributes.filter((v) => v.key === "packet_dst_port")[0]
    .value;

  const dstChannel = event.attributes.filter(
    (v) => v.key === "packet_dst_channel"
  )[0].value;

  const data = Buffer.from(
    event.attributes.filter((v) => v.key === "packet_data")[0].value
  ).toString("base64");

  const timeoutHeightRaw = event.attributes.filter(
    (v) => v.key === "packet_timeout_height"
  )[0].value;

  const timeoutHeight = new Height(
    Number(timeoutHeightRaw.split("-")[0]),
    Number(timeoutHeightRaw.split("-")[1])
  );

  const timeoutTimestamp = event.attributes.filter(
    (v) => v.key === "packet_timeout_timestamp"
  )[0].value;

  const packet = new Packet(
    sequence,
    srcPort,
    srcChannel,
    dstPort,
    dstChannel,
    data,
    timeoutHeight,
    timeoutTimestamp
  );

  const acknowledgement = Buffer.from(
    event.attributes.filter((v) => v.key === "packet_ack_hex")[0].value,
    "hex"
  ).toString("base64");

  return {
    packet,
    acknowledgement,
  };
}
