import { Device, TransportOptions } from "mediasoup-client/types";
import { Socket } from "socket.io-client";

const createConsumerTransport = (
  transportParams: TransportOptions,
  device: Device,
  socket: Socket,
  audioPid: string
) => {
  // make a downstream transport for ONE producer/peer/client (with audio and video producers)
  const consumerTransport = device.createRecvTransport(transportParams);
  consumerTransport.on("connectionstatechange", (state) => {
    console.log("==connectionstatechange==", state);
  });
  consumerTransport.on("icegatheringstatechange", (state) => {
    console.log("==icegatheringstatechange==", state);
  });
  // transport connect listener... fires on .consume()
  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      console.log("Transport connect event has fired!");
      // connect comes with local dtlsParameters. We need
      // to send these up to the server, so we can finish
      // the connection
      const connectResp = await socket.emitWithAck("connectTransport", {
        dtlsParameters,
        type: "consumer",
        audioPid,
      });
      //console.log(connectResp,"connectResp is back!")
      if (connectResp === "success") {
        callback(); //this will finish our await consume
      } else {
        errback(new Error('Error consumer connect'));
      }
    }
  );
  return consumerTransport;
};

export default createConsumerTransport;
