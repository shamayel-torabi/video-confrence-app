import { io, Socket } from "socket.io-client";
import { ClientParamsType, ClientTransportOptions, ConsumeData, Message, RoomType } from "./types";
import { DtlsParameters, MediaKind, RtpCapabilities, RtpParameters } from "mediasoup-client/types";

interface ClientToServerEvents {
  sendMessage: ({    text,    userName,    roomId,  }: {
    text: string;    userName: string;    roomId: string;  }) => void;
  createRoom: (
    roomName: string,
    ackCb: (result: { roomId?: string; error?: string }) => void
  ) => void;
  joinRoom: (
    data: { userName: string; roomId: string },
    ackCb: ({
      result,
      error,
    }: {
      result?: {
        routerRtpCapabilities: RtpCapabilities;
        newRoom: boolean;
        audioPidsToCreate: string[];
        videoPidsToCreate: string[];
        associatedUserNames: string[];
        messages: Message[];
      };
      error?: string;
    }) => void
  ) => void;
  closeRoom: (
    data: { roomId: string },
    ackCb: (result: { status: string }) => void
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

interface ServerToClientEvents {
  connectionSuccess: (data: { socketId: string; rooms: RoomType[] }) => void;
  newMessage: (message: Message) => void;
  newRoom: (room: { roomId: string; roomName: string }) => void;
  newProducersToConsume: (consumeData: ConsumeData) => void;
  updateActiveSpeakers: (newListOfActives: string[]) => Promise<void>;
}

export type SocketType = Socket<ServerToClientEvents, ClientToServerEvents>;



export const useSocket = () => {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io("/ws");
  return socket;
};
