import { createServer } from "node:http";
import { DefaultEventsMap, Namespace, Server, Socket } from "socket.io";

import { createWorkers } from "./createWorkers";
import { getWorker } from "./getWorker";
import {
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  Worker,
} from "mediasoup/types";
import {
  ClientParamsType,
  ClientTransportOptions,
  ConsumeData,
  Message,
} from "./types";
import { Room } from "./Room";
import { Client } from "./Client";
import { config } from "./config";

const PORT = Number.parseInt(process.env.PORT || config.port.toString());

//our globals

let workers: Worker[] = [];
const rooms = new Map<string, Room>();

interface ServerToClientEvents {
  joinRoom: (
    data: { userName: string; roomName: string },
    ackCb: (result: {
      routerRtpCapabilities: RtpCapabilities;
      newRoom: boolean;
      audioPidsToCreate: string[];
      videoPidsToCreate: string[];
      associatedUserNames: string[];
    }) => void
  ) => void;
  requestTransport: (
    data: { type: string; audioPid?: string },
    ackCb: (clientTransportParams: ClientTransportOptions) => void
  ) => void;
  connectTransport: (
    data: { dtlsParameters: DtlsParameters; type: string; audioPid?: string },
    ackCb: (status: string) => void
  ) => void;
  startProducing: (
    data: { kind: MediaKind; rtpParameters: RtpParameters },
    ackCb: (result: { producerId?: string; error?: unknown }) => void
  ) => void;
  audioChange: (typeOfChange: string) => void;
  consumeMedia: (
    data: {
      rtpCapabilities: RtpCapabilities;
      producerId: string;
      kind: MediaKind;
    },
    ackCb: (result: {
      consumerOptions?: ClientParamsType;
      status?: string;
    }) => void
  ) => void;
  unpauseConsumer: (
    data: { producerId: string; kind: MediaKind },
    ackCb: ({ status }: { status: string }) => void
  ) => void;
}

interface ClientToServerEvents {
  connectionSuccess: (data: {
    socketId: string;
    rooms: { roomId: string; roomName: string }[];
  }) => void;
  newMessage: (message: Message) => void;
  newRoom: (room: { roomId: string; roomName: string }) => void;
  newProducersToConsume: (consumeData: ConsumeData) => void;
  updateActiveSpeakers: (newListOfActives: string[]) => Promise<void>;
}

export type SocketType = Socket<
  ServerToClientEvents,
  ClientToServerEvents,
  DefaultEventsMap,
  any
>;
export type SocketIOType = Namespace<
  ServerToClientEvents,
  ClientToServerEvents,
  DefaultEventsMap,
  any
>;

const runMediaSoupServer = async (app: any) => {
  workers = await createWorkers();

  const httpServer = createServer(app);

  const socketio = new Server<ServerToClientEvents, ClientToServerEvents>(
    httpServer,
    {
      cors: {
        origin: ["https://localhost:5173", "http://localhost:5173"],
      },
    }
  );

  const io = socketio.of("/ws");

  io.on("connection", (socket) => {
    console.log(`Peer connected: ${socket.id}`);
    let client: Client; //this client object available to all our socket listeners

    const currentRooms: { roomId: string; roomName: string }[] = [];
    rooms.forEach((room, key) => {
      currentRooms.push({ roomId: key, roomName: room.roomName });
    });

    socket.emit("connectionSuccess", {
      socketId: socket.id,
      rooms: currentRooms,
    });
    socket.on("disconnect", () => {
      if (client){
        client.close();
      }
    });
    socket.on("joinRoom", async ({ userName, roomName }, ackCb) => {
      let newRoom = false;
      let requestedRoom = rooms.get(roomName);

      if (!requestedRoom) {
        newRoom = true;
        // make the new room, add a worker, add a router
        const workerToUse = await getWorker(workers);
        requestedRoom = new Room(roomName, workerToUse, io);
        await requestedRoom.createRouter();
        rooms.set(requestedRoom.roomName, requestedRoom);
      }

      client = new Client(userName, requestedRoom, socket);

      // add this socket to the socket room
      socket.join(client.room.roomName);

      //fetch the first 0-5 pids in activeSpeakerList
      const audioPidsToCreate = client.room.activeSpeakerList.slice(0, 5);
      //find the videoPids and make an array with matching indicies
      // for our audioPids.
      const videoPidsToCreate = audioPidsToCreate.map((aid) => {
        const producingClient = client.room.clients.find(
          (c) => c?.producer?.audio?.id === aid
        );
        return producingClient?.producer?.video?.id || "";
      });
      //find the username and make an array with matching indicies
      // for our audioPids/videoPids.
      const associatedUserNames = audioPidsToCreate.map((aid) => {
        const producingClient = client.room.clients.find(
          (c) => c?.producer?.audio?.id === aid
        );
        return producingClient?.userName || "";
      });

      ackCb({
        routerRtpCapabilities: client.room.router?.rtpCapabilities!,
        newRoom,
        audioPidsToCreate,
        videoPidsToCreate,
        associatedUserNames,
      });
    });
    socket.on("requestTransport", async ({ type, audioPid }, ackCb) => {
      // whether producer or consumer, client needs params
      let clientTransportParams: ClientTransportOptions;
      if (type === "producer") {
        // run addClient, which is part of our Client class
        clientTransportParams = await client.addTransport(type);
      } else if (type === "consumer") {
        // we have 1 trasnport per client we are streaming from
        // each trasnport will have an audio and a video producer/consumer
        // we know the audio Pid (because it came from dominantSpeaker), get the video
        const producingClient = client.room.clients.find(
          (c) => c?.producer?.audio?.id === audioPid
        );
        const videoPid = producingClient?.producer?.video?.id;
        clientTransportParams = await client.addTransport(
          type,
          audioPid!,
          videoPid
        );
      }
      ackCb(clientTransportParams!);
    });
    socket.on(
      "connectTransport",
      async ({ dtlsParameters, type, audioPid }, ackCb) => {
        if (type === "producer") {
          try {
            await client.upstreamTransport?.connect({ dtlsParameters });
            ackCb("success");
          } catch (error) {
            console.log(error);
            ackCb("error");
          }
        } else if (type === "consumer") {
          // find the right transport, for this consumer
          try {
            const downstreamTransport = client.downstreamTransports.find(
              (t) => {
                return t.associatedAudioPid === audioPid;
              }
            );
            downstreamTransport?.transport.connect({ dtlsParameters });
            ackCb("success");
          } catch (error) {
            console.log(error);
            ackCb("error");
          }
        }
      }
    );
    socket.on("startProducing", async ({ kind, rtpParameters }, ackCb) => {
      // create a producer with the rtpParameters we were sent
      try {
        const newProducer = await client.upstreamTransport?.produce({
          kind,
          rtpParameters,
        });
        //add the producer to this client obect
        client.addProducer(kind, newProducer!);
        if (kind === "audio") {
          client.room.activeSpeakerList.push(newProducer?.id!);
        }
        // the front end is waiting for the id
        ackCb({ producerId: newProducer?.id! });
      } catch (err) {
        console.log(err);
        ackCb({ error: err });
      }

      // run updateActiveSpeakers
      const newTransportsByPeer = client.room.updateActiveSpeakers();
      client.room.updateProducersToConsume(newTransportsByPeer);
      // newTransportsByPeer is an object, each property is a socket.id that
      // has transports to make. They are in an array, by pid
      // Changed by sham
      // for (const [socketId, audioPidsToCreate] of Object.entries(
      //   newTransportsByPeer
      // )) {
      //   // we have the audioPidsToCreate this socket needs to create
      //   // map the video pids and the username
      //   const videoPidsToCreate = audioPidsToCreate.map((aPid) => {
      //     const producerClient = client.room.clients.find(
      //       (c) => c?.producer?.audio?.id === aPid
      //     );
      //     return producerClient?.producer?.video?.id || '';
      //   });
      //   const associatedUserNames = audioPidsToCreate.map((aPid) => {
      //     const producerClient = client.room.clients.find(
      //       (c) => c?.producer?.audio?.id === aPid
      //     );
      //     return producerClient?.userName || '';
      //   });
      //   io.to(socketId).emit("newProducersToConsume", {
      //     routerRtpCapabilities: client.room.router?.rtpCapabilities!,
      //     audioPidsToCreate,
      //     videoPidsToCreate,
      //     associatedUserNames,
      //     activeSpeakerList: client.room.activeSpeakerList.slice(0, 5),
      //   });
      // }
    });
    socket.on("audioChange", (typeOfChange) => {
      try {
        if (typeOfChange === "mute") {
          client?.producer?.audio?.pause();
        } else {
          client?.producer?.audio?.resume();
        }
      } catch (error) {
        console.log("Error:", error);
      }
    });
    socket.on(
      "consumeMedia",
      async ({ rtpCapabilities, producerId, kind }, ackCb) => {
        // will run twice for every peer to consume... once for video, once for audio
        console.log("Kind: ", kind, "   producerId:", producerId);
        // we will set up our clientConsumer, and send back the params
        // use the right transport and add/update the consumer in Client
        // confirm canConsume
        try {
          if (
            !client.room.router?.canConsume({ producerId, rtpCapabilities })
          ) {
            ackCb({ status: "cannotConsume" });
          } else {
            // we can consume!
            const downstreamTransport = client.downstreamTransports.find(
              (t) => {
                if (kind === "audio") {
                  return t.associatedAudioPid === producerId;
                } else if (kind === "video") {
                  return t.associatedVideoPid === producerId;
                }
              }
            );
            // create the consumer with the transport
            const newConsumer = await downstreamTransport?.transport.consume({
              producerId,
              rtpCapabilities,
              paused: true, //good practice
            });
            // add this newCOnsumer to the CLient
            client.addConsumer(kind, newConsumer!, downstreamTransport!);
            // respond with the params
            const clientParams: ClientParamsType = {
              producerId,
              id: newConsumer?.id!,
              kind: newConsumer?.kind!,
              rtpParameters: newConsumer?.rtpParameters!,
            };
            ackCb({ consumerOptions: clientParams });
          }
        } catch (err) {
          console.log(err);
          ackCb({ status: "consumeFailed" });
        }
      }
    );
    socket.on("unpauseConsumer", async ({ producerId, kind }, ackCb) => {
      try {
        const consumerToResume = client.downstreamTransports.find((t) => {
          return t?.[kind]?.producerId === producerId;
        });
        if (consumerToResume) {
          await consumerToResume[kind]?.resume();
        }
        ackCb({ status: "success" });
      } catch (error) {
        console.log(error);
        ackCb({ status: "error" });
      }
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

export default runMediaSoupServer;
