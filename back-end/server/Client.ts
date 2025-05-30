import { EventEmitter } from "node:events";
import { SocketType } from "./mediaServer";
import { Room } from "./Room";
import { ClientTransportOptions, DownstreamTransportType } from "./types";
import { config } from "./config";
import { Consumer, MediaKind, Producer, WebRtcTransport } from "mediasoup/types";

export class Client extends EventEmitter  {
  id: string;
  userName: string;
  private socket: SocketType;
  room: Room;
  upstreamTransport: WebRtcTransport | undefined ;
  producer: Record<string, Producer> = {};
  downstreamTransports: DownstreamTransportType[] = [];

  constructor(userName: string, room: Room, socket: SocketType) {
    super()
    this.userName = userName;
    this.socket = socket;
    this.id = socket.id;
    this.room = room; // this will be a Room object
    this.room.addClient(this);
  }

  close() {
    console.log(`Close Client with socketId: ${this.socket.id}`);
    this.room.removeClient(this);

    this.upstreamTransport?.close();
    this.downstreamTransports.forEach(tr => tr.transport.close());
    this.emit("close");
  }

  getDownstreamTransport(audioPid: string) {
    return this.downstreamTransports.find((t) => t?.associatedAudioPid === audioPid);
  }

  getDownstreamConsumer(pid: string, kind: MediaKind){
    return this.downstreamTransports.find((t) => {
      return t[kind]?.producerId === pid;
    });
  }
  
  addTransport(type: string, audioPid?: string, videoPid?: string) {
    return new Promise<ClientTransportOptions>(async (resolve, _reject) => {
      const {
        listenInfos,
        initialAvailableOutgoingBitrate,
        maxIncomingBitrate,
      } = config.webRtcTransport;

      const transport: WebRtcTransport | undefined =
        await this.room.router?.createWebRtcTransport({
          enableUdp: true,
          enableTcp: true, //always use UDP unless we can't
          preferUdp: true,
          listenInfos: listenInfos,
          initialAvailableOutgoingBitrate,
        });

      if (maxIncomingBitrate) {
        // maxIncomingBitrate limit the incoming bandwidth from this transport
        try {
          await transport?.setMaxIncomingBitrate(maxIncomingBitrate);
        } catch (err) {
          console.log("Error setting bitrate");
          console.log(err);
        }
      }

      // console.log(transport)
      const clientTransportParams: ClientTransportOptions = {
        id: transport?.id!,
        iceParameters: transport?.iceParameters!,
        iceCandidates: transport?.iceCandidates!,
        dtlsParameters: transport?.dtlsParameters!,
      };
      if (type === "producer") {
        // set the new transport to the client's upstreamTransport
        this.upstreamTransport = transport!;
      } else if (type === "consumer") {
        // add the new transport AND the 2 pids, to downstreamTransports
        if(transport){
          this.downstreamTransports.push({
            transport, //will handle both audio and video
            associatedVideoPid: videoPid!,
            associatedAudioPid: audioPid!,
          }); 
        }
      }
      resolve(clientTransportParams);
    });
  }
  addProducer(kind: MediaKind, newProducer: Producer) {
    this.producer[kind] = newProducer;
    if (kind === "audio") {
      // add this to our activeSpeakerObserver
      this.room.activeSpeakerObserver?.addProducer({
        producerId: newProducer.id,
      });

      this.room.activeSpeakerList.push(newProducer?.id!);
    }
  }
  addConsumer(
    kind: MediaKind,
    newConsumer: Consumer,
    downstreamTransport: DownstreamTransportType
  ) {
    downstreamTransport[kind] = newConsumer;
  }
}
