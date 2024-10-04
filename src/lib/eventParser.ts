import { Height, Packet } from '@initia/initia.js'
import { Event } from '@cosmjs/tendermint-rpc/build/comet38/responses'
import { Ack } from 'src/msgs'

// Helper function to get the attribute value by key
function getAttribute(event: Event, key: string): string | undefined {
  return event.attributes.find((v) => v.key === key)?.value;
}

// Function to parse packet attributes from the event
function parsePacketAttributes(event: Event): Packet | undefined {
  const sequence = Number(getAttribute(event, 'packet_sequence'));
  const srcPort = getAttribute(event, 'packet_src_port');
  const srcChannel = getAttribute(event, 'packet_src_channel');
  const dstPort = getAttribute(event, 'packet_dst_port');
  const dstChannel = getAttribute(event, 'packet_dst_channel');
  const dataHex = getAttribute(event, 'packet_data_hex') || getAttribute(event, 'packet_data');
  const timeoutHeightRaw = getAttribute(event, 'packet_timeout_height');
  const timeoutTimestamp = getAttribute(event, 'packet_timeout_timestamp');

  if (!sequence || !srcPort || !srcChannel || !dstPort || !dstChannel || !dataHex || !timeoutHeightRaw || !timeoutTimestamp) {
    return undefined;
  }

  // Convert packet data from hex to base64
  const data = Buffer.from(dataHex, 'hex').toString('base64');

  // Parse the timeout height value
  const [revisionNumber, revisionHeight] = timeoutHeightRaw.split('-').map(Number);
  const timeoutHeight = new Height(revisionNumber, revisionHeight);

  return new Packet(
    sequence,
    srcPort,
    srcChannel,
    dstPort,
    dstChannel,
    data,
    timeoutHeight,
    timeoutTimestamp
  )
}

// Function to parse the "send_packet" event
export function parseSendPacketEvent(
  event: Event,
  connectionId: string
): Packet | undefined {
  if (event.type !== 'send_packet') return;

  // connection filter
  const eventConnectionId = getAttribute(event, 'connection_id');
  if (eventConnectionId !== connectionId) return;

  // Parse and return the packet attributes
  return parsePacketAttributes(event);
}

// Function to parse the "write_acknowledgement" event
export function parseWriteAckEvent(
  event: Event,
  connectionId: string
): Ack | undefined {
  if (event.type !== 'write_acknowledgement') return;

  // connection filter
  const eventConnectionId = getAttribute(event, 'connection_id');
  if (eventConnectionId !== connectionId) return;

  // Parse the packet attributes
  const packet = parsePacketAttributes(event);
  if (!packet) return;

  // Get and parse the acknowledgement
  const ackHex = getAttribute(event, 'packet_ack_hex');
  if (!ackHex) return;

  const acknowledgement = Buffer.from(ackHex, 'hex').toString('base64');

  return {
    packet,
    acknowledgement,
  }
}
