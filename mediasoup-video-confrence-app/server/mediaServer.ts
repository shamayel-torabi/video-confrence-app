import { createServer } from "node:http";
import { DefaultEventsMap, Namespace, Server, Socket } from "socket.io";
import { v5 as uuidv5 } from "uuid";

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

const PORT = config.port;
const HOST = process.env.HOST || "localhost";
const UUIDV5_NAMESPACE = "af6f650e-3ced-4f80-afef-f956afe3191d";


//our globals

let workers: Worker[] = [];
const rooms = new Map<string, Room>();

interface ServerToClientEvents {
  sendMessage: ({
    text,
    userName,
    roomId,
  }: {
    text: string;
    userName: string;
    roomId: string;
  }) => void;
  createRoom: (
    roomName: string,
    ackCb: (result: { roomId: string }) => void
  ) => void;
  joinRoom: (
    data: { userName: string; roomId: string },
    ackCb: (result: {
      routerRtpCapabilities?: RtpCapabilities;
      newRoom?: boolean;
      audioPidsToCreate?: string[];
      videoPidsToCreate?: string[];
      associatedUserNames?: string[];
      messages?: Message[];
      error?: string;
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

  // const socketio = new Server<ServerToClientEvents, ClientToServerEvents>(
  //   httpServer,
  //   {
  //     cors: {
  //       origin: ["https://localhost:5173", "http://localhost:5173"],
  //     },
  //   }
  // );

  const socketio = new Server<ServerToClientEvents, ClientToServerEvents>(
    httpServer
  );

  const io = socketio.of("/ws");

  io.on("connection", (socket) => {
    console.log(`Peer connected: ${socket.id}`);
    let client: Client; //this client object available to all our socket listeners

    const currentRooms: { roomId: string; roomName: string }[] = [];
    rooms.forEach((room, key) => {
      currentRooms.push({ roomId: key, roomName: room.roomName });
    });

    socket.on("disconnect", () => {
      if (client) {
        client.close();
      }
    });
    socket.emit("connectionSuccess", {
      socketId: socket.id,
      rooms: currentRooms,
    });
    socket.on("sendMessage", ({ text, userName, roomId }) => {
      const requestedRoom = rooms.get(roomId);

      if (requestedRoom) {
        const message = {
          id: crypto.randomUUID().toString(),
          text,
          userName,
          date: new Date().toISOString(),
        };

        requestedRoom.addMessage(message);
        io.to(requestedRoom.id).emit("newMessage", message);
      } else {
        console.log(`RoomId :${roomId} not found`);
      }
    });
    socket.on("createRoom", async (roomName, ackCb) => {
      try {
        const roomId = uuidv5(roomName, UUIDV5_NAMESPACE);
        let requestedRoom = rooms.get(roomId);

        if (!requestedRoom) {
          const workerToUse = await getWorker(workers);
          requestedRoom = new Room(roomName, roomId, workerToUse, io);
          requestedRoom.on("close", () => {
            console.log("Room closed");
          });

          await requestedRoom.createRouter();
          rooms.set(requestedRoom.id, requestedRoom);

          io.emit("newRoom", {
            roomId: requestedRoom.id,
            roomName: requestedRoom.roomName,
          });
        }

        ackCb({ roomId: requestedRoom.id });
      } catch (error) {
        console.log(error);
      }
    });
    socket.on("joinRoom", async ({ userName, roomId }, ackCb) => {
      try {
        const requestedRoom = rooms.get(roomId);

        if (requestedRoom) {
          const newRoom = requestedRoom.clients.length === 0;

          client = new Client(userName, requestedRoom, socket);

          socket.join(client.room.id);

          const { audioPidsToCreate, videoPidsToCreate, associatedUserNames } =
            client.room.pidsToCreate();

          ackCb({
            routerRtpCapabilities: client.room.router?.rtpCapabilities!,
            newRoom,
            audioPidsToCreate,
            videoPidsToCreate,
            associatedUserNames,
            messages: client.room.messages,
          });
        } else {
          console.log(`Room with Id ${roomId} does not exist`);
          ackCb({ error: `Room with Id ${roomId} does not exist` });
        }
      } catch (error) {
        console.log(error);
        ackCb({ error: `Room with Id ${roomId} does not exist` });
      }
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
      client.room.updateActiveSpeakers();
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
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });
};

export default runMediaSoupServer;
