import { Consumer, Device, MediaKind, Transport } from "mediasoup-client/types";
import { Socket } from "socket.io-client";

const createConsumer = (
  consumerTransport: Transport,
  producerId: string,
  device: Device,
  socket: Socket,
  kind: MediaKind,
  slot?: number
) => {
  return new Promise<Consumer>(async (resolve, reject) => {
    // consume from the basics, emit the consumeMedia event, we take
    // the params we get back, and run .consume(). That gives us our track
    const consumerParams = await socket.emitWithAck("consumeMedia", {
      rtpCapabilities: device.rtpCapabilities,
      producerId,
      kind,
    });
    // console.log("consumeMedia result", consumerParams);

    if (consumerParams.status === "cannotConsume") {
      //console.log("Cannot consume");
      reject(new Error("Cannot consume"));
    } else if (consumerParams.status === "consumeFailed") {
      //console.log("Consume failed...")
      reject(new Error("Consume failed..."));
    } else {
      // we got valid params! Use them to consume
      const consumer = await consumerTransport.consume(
        consumerParams.consumerOptions
      );
      //console.log("consume() has finished")
      // const { track } = consumer;
      // add track events
      //unpause
      const { status } = await socket.emitWithAck("unpauseConsumer", {
        producerId,
        kind,
      });
      if (status === "error") {
        console.log("Error unpauseConsumer");
      }
      resolve(consumer);
    }
  });
};

export default createConsumer;
