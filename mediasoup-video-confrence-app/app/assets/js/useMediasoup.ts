import {
  Device,
  type Consumer,
  type ConsumerOptions,
  type DtlsParameters,
  type Producer,
  type RtpCapabilities,
  type RtpParameters,
  type Transport,
  type TransportOptions,
} from "mediasoup-client/types";
import { io, Socket } from "socket.io-client";
import { ConsumeData, MediaConsumer, Message, Room } from "./types";

interface ServerToClientEvents {
  connectionSuccess: (data: { socketId: string, rooms: Room[] }) => void;
  newMessage: (message: Message) => void;
  newRoom: (room: Room) => void;
  newProducersToConsume: (consumeData: ConsumeData) => void;
  updateActiveSpeakers: (newListOfActives: string[]) => Promise<void>
}

interface ClientToServerEvents {
  sendMessage: (
    data: { text: string; userName: string; roomId: string; }
  ) => void;
  createRoom: (
    roomName: string,
    ackCb: (result: { roomId: string }) => void
  ) => void,
  joinRoom: (
    data: { userName: string; roomId: string },
    ackCb: (result: { consumeData: ConsumeData, newRoom: boolean, messages: Message[], error?: string; }) => void
  ) => void;
  requestTransport: (
    data: { type: string; audioPid?: string },
    ackCb: (clientTransportParams: TransportOptions) => void
  ) => void;
  connectTransport: (
    data: { dtlsParameters: DtlsParameters; type: string; audioPid?: string },
    ackCb: ({ status }: { status: string }) => void
  ) => void;
  startProducing: (
    data: { kind: string; rtpParameters: RtpParameters },
    ackCb: (result: { id?: string, error?: unknown }) => void
  ) => void;
  audioChange: (typeOfChange: string) => void;
  consumeMedia: (
    data: { rtpCapabilities: RtpCapabilities; producerId: string; kind: string },
    ackCb: (result: { consumerOptions: ConsumerOptions, status: string; }) => void
  ) => void;
  unpauseConsumer: (
    data: { pid: string; kind: string },
    ackCb: ({ status }: { status: string }) => void
  ) => void;
}

export const useMediasoup = () => {
  let device: Device | null = null;
  let consumers: Record<string, MediaConsumer> = {};
  let producerTransport: Transport | null = null;
  let audioProducer: Producer | null = null;
  let videoProducer: Producer | null = null;

  let rooms: Room[] = [];
  let messages: Message[] = [];
  let listOfActives: string[] = [];

  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io("/ws");

  socket.on("connectionSuccess", (data) => {
    console.log(`Connection socketId: ${data.socketId}`);
    rooms = data.rooms
  });

  socket.on("newMessage", (message) => {
    messages = [...messages, message];
  });

  socket.on("newRoom", (room) => {
    [...rooms, room];
  });

  socket.on('newProducersToConsume', consumeData => {
    requestTransportToConsume(consumeData)
  });

  socket.on('updateActiveSpeakers', async newListOfActives => {
    listOfActives = newListOfActives;
  })

  const socketSendMessage = async (text: string, userName: string, roomId: string) => {
    socket?.emit("sendMessage", { text, userName, roomId });
  };

  const createMediaSoupRoom = async (roomName: string) => {
    const createRoomResp = await socket?.emitWithAck("createRoom", roomName);
    return createRoomResp?.roomId;
  }

  const joinRoom = async (userName: string, roomId: string) => {
    const joinRoomResp = await socket?.emitWithAck("joinRoom", {
      userName,
      roomId,
    });
    return joinRoomResp;
  };

  const requestTransport = async (type: string, audioPid?: string) => {
    return await socket?.emitWithAck("requestTransport", { type, audioPid });
  };

  const connectTransport = async (dtlsParameters: DtlsParameters, type: string, audioPid?: string) => {
    const connectResp = await socket?.emitWithAck("connectTransport", {
      dtlsParameters,
      type,
      audioPid,
    });

    return connectResp;
  };

  const startProducing = async (kind: string, rtpParameters: RtpParameters) => {
    const produceResp = await socket?.emitWithAck("startProducing", {
      kind,
      rtpParameters,
    });

    return produceResp;
  };

  const audioChangeImpl = (typeOfChange: string) => {
    socket?.emit("audioChange", typeOfChange);
  };

  const consumeMedia = async (rtpCapabilities: RtpCapabilities, producerId: string, kind: string) => {
    const consumerParams = await socket?.emitWithAck("consumeMedia", {
      rtpCapabilities,
      producerId,
      kind,
    });

    return consumerParams;
  };

  const unpauseConsumer = async (pid: string, kind: string) => {
    return await socket?.emitWithAck("unpauseConsumer", { pid, kind });
  };

  const createConsumer = (consumerTransport: Transport, producerId: string, kind: string) => {
    return new Promise<Consumer>(async (resolve, reject) => {
      // consume from the basics, emit the consumeMedia event, we take
      // the params we get back, and run .consume(). That gives us our track
      const consumerParams = await consumeMedia(device!.rtpCapabilities, producerId, kind);

      if (consumerParams) {
        //console.log("consumerParams:", consumerParams);
        if (consumerParams?.status === "cannotConsume") {
          console.log("Cannot consume");
          reject(new Error("Cannot consume"));
        } else if (consumerParams?.status === "consumeFailed") {
          console.log("Consume failed...");
          reject(new Error("Consume failed..."));
        } else {
          // we got valid params! Use them to consume
          const consumer = await consumerTransport.consume(
            consumerParams.consumerOptions
          );
          //console.log("consume() has finished");
          //const { track } = consumer;
          // add track events
          //unpause
          const result = await unpauseConsumer(producerId, kind);
          console.log('unpauseConsumer result', result)
          resolve(consumer);
        }
      }
      else {
        reject(new Error("consumerParams is null"))
      }
    });
  };

  const createConsumerTransport = (transportParams: TransportOptions, audioPid: string) => {
    // make a downstream transport for ONE producer/peer/client (with audio and video producers)
    const consumerTransport = device!.createRecvTransport(transportParams);
    // consumerTransport.on("connectionstatechange", (state) => {
    //   //console.log("==connectionstatechange==");
    //   //console.log(state);
    // });
    // consumerTransport.on("icegatheringstatechange", (state) => {
    //   //console.log("==icegatheringstatechange==");
    //   //console.log(state);
    // });
    // transport connect listener... fires on .consume()
    consumerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        //console.log("Transport connect event has fired!");
        // connect comes with local dtlsParameters. We need
        // to send these up to the server, so we can finish
        // the connection
        const connectResp = await connectTransport(
          dtlsParameters,
          "consumer",
          audioPid
        );
        //console.log(connectResp, "connectResp is back!");
        if (connectResp?.status === "success") {
          callback(); //this will finish our await consume
        } else {
          errback(new Error("consumerTransport connect Error"));
        }
      }
    );
    return consumerTransport;
  };

  const createProducerTransport = () => new Promise<Transport>(async (resolve, _reject) => {
    // ask the server to make a transport and send params
    const producerTransportParams = await requestTransport("producer");
    // console.log(producerTransportParams)
    //use the device to create a front-end transport to send
    // it takes our object from requestTransport
    const producerTransport = device!.createSendTransport(
      producerTransportParams!
    );
    // console.log(producerTransport)
    producerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        // transport connect event will NOT fire until transport.produce() runs
        // dtlsParams are created by the browser so we can finish
        // the other half of the connection
        // emit connectTransport
        //console.log("Connect running on produce...");
        const connectResp = await connectTransport(dtlsParameters, "producer");
        //console.log(connectResp, "connectResp is back");
        if (connectResp?.status === "success") {
          // we are connected! move forward
          callback();
        } else if (connectResp?.status === "error") {
          // connection failed. Stop
          errback(new Error("Error connectTransport"));
        }
      }
    );
    producerTransport.on("produce", async (parameters, callback, errback) => {
      // emit startProducing
      //console.log("Produce event is now running");
      const { kind, rtpParameters } = parameters;
      const produceResp = await startProducing(kind, rtpParameters);
      //console.log(produceResp, "produceResp is back!");
      if (produceResp.error === "error") {
        errback(new Error("Error startProducing"));
      } else {
        // only other option is the producer id
        callback({ id: produceResp.id! });
      }
    });

    resolve(producerTransport);
  });

  const requestTransportToConsume = (consumeData: ConsumeData) => {

    consumeData.audioPidsToCreate.forEach(async (audioPid, i) => {
      const videoPid = consumeData.videoPidsToCreate[i];
      // expecting back transport params for THIS audioPid. Maybe 5 times, maybe 0
      const consumerTransportParams = await requestTransport("consumer", audioPid);

      //console.log(consumerTransportParams);

      const consumerTransport = createConsumerTransport(
        consumerTransportParams!,
        audioPid
      );

      try {
        const [audioConsumer, videoConsumer] = await Promise.all([
          createConsumer(consumerTransport, audioPid, "audio"),
          createConsumer(consumerTransport, videoPid, "video"),
        ]);
        //console.log(audioConsumer);
        //console.log(videoConsumer);
        // create a new MediaStream on the client with both tracks
        // This is why we have gone through all this pain!!!
        const combinedStream = new MediaStream([
          audioConsumer.track,
          videoConsumer.track,
        ]);

        // const remoteVideo = document.getElementById(`remote-video-${i}`) as HTMLVideoElement;
        // remoteVideo.srcObject = combinedStream;

        //setRemoteStreams(prev => [...prev, combinedStream])

        console.log("Hope this works...");

        consumers[audioPid] = {
          combinedStream,
          userName: consumeData.associatedUserNames[i],
          consumerTransport,
          audioConsumer: audioConsumer as Consumer,
          videoConsumer: videoConsumer as Consumer,
        };
      }
      catch (error) {
        console.log(error);
      }
    });
  }

  const createProducer = (localStream: MediaStream, producerTransport: Transport) => {
    return new Promise<{ audioProducer: Producer, videoProducer: Producer }>(async (resolve, reject) => {
      //get the audio and video tracks so we can produce
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];
      try {
        // running the produce method, will tell the transport
        // connect event to fire!!
        console.log("Calling produce on video");
        const videoProducer = await producerTransport.produce({
          track: videoTrack,
        });
        console.log("Calling produce on audio");
        const audioProducer = await producerTransport.produce({
          track: audioTrack,
        });
        console.log("finished producing!");
        resolve({ audioProducer, videoProducer });
      } catch (err) {
        console.log(err, "error producing");
        reject(err);
      }
    });
  }

  const joinMediaSoupRoom = async (userName: string, roomId: string) => {
    const joinRoomResp = await joinRoom(userName, roomId);
    if (!joinRoomResp || joinRoomResp.error) {
      return false;
    }

    messages = joinRoomResp.messages;
    listOfActives = joinRoomResp.consumeData.activeSpeakerList!;


    device = new Device();
    await device.load({ routerRtpCapabilities: joinRoomResp.consumeData.routerRtpCapabilities });

    console.log('consumeData: ', joinRoomResp.consumeData)
    requestTransportToConsume(joinRoomResp.consumeData);

    return true;
  }

  const startPublish = async () => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const pTransport = await createProducerTransport();
      producerTransport = pTransport;

      const producers = await createProducer(localStream, pTransport);
      audioProducer = producers.audioProducer;
      videoProducer = producers.videoProducer;

      return localStream;
    }
    catch (err) {
      console.log(err);
    }
  }

  const audioChange = () => {
    // mute at the producer level, to keep the transport, and all
    // other mechanism in place
    if (audioProducer?.paused) {
      // currently paused. User wants to unpause
      audioProducer.resume();
      // unpause on the server
      audioChangeImpl("unmute");
      return true;
    } else {
      //currently on, user wnats to pause
      audioProducer?.pause();
      audioChangeImpl("mute");
      return false
    }
  }

  return {
    messages,
    rooms,
    consumers,
    listOfActives,
    socketSendMessage,
    joinMediaSoupRoom,
    startPublish,
    createMediaSoupRoom,
    audioChange,
  };
};
