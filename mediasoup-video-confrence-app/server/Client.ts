import { EventEmitter } from "node:events";
import config from "./config.js";
import Room from "./Room.js";
import { ClientToServerEvents, ServerToClientEvents } from "./mediaSoupServer.js";
import { DownstreamTransportType } from "./types.js";
import { Consumer, MediaKind, Producer, WebRtcTransport } from "mediasoup/types";
import { DefaultEventsMap, Socket } from "socket.io";
import { TransportOptions } from "mediasoup-client/types";

class Client extends EventEmitter {
  id: string;
  userName: string;
  socket: Socket<ServerToClientEvents, ClientToServerEvents, DefaultEventsMap, any>;
  upstreamTransport: WebRtcTransport | null;
  producer: Record<string, Producer>;
  downstreamTransports: DownstreamTransportType[];
  room: Room;

  constructor(userName: string, room: Room, socket: Socket) {
    super();
    this.id = socket.id;
    this.userName = userName;
    this.socket = socket;
    //instead of calling this producerTransport, call it upstream, THIS client's transport
    // for sending data
    this.upstreamTransport = null;
    //we will have an audio and video consumer
    this.producer = {};
    //instead of calling this consumerTransport, call it downstream,
    // THIS client's transport for pulling data
    this.downstreamTransports = [];
    // {
    // transport,
    // associatedVideoPid
    // associatedAudioPid
    // audio = audioConsumer
    // video  = videoConsumer
    // }

    //an array of consumers, each with 2 parts
    // this.consumers = []
    // this.rooms = []
    this.room = room; // this will be a Room object
    this.room.addClient(this);
  }

  close() {
    // if (this.upstreamTransport) {
    //   this.upstreamTransport.close();
    //   this.downstreamTransports.forEach((downstreamTransport) =>
    //     downstreamTransport.transport.close()
    //   );
    // }

    this.room.removeClient(this);
    this.emit("close");
  }

  getDownstreamTransport(audioPid: string) {
    return this.downstreamTransports.find(
      (t) => t?.associatedAudioPid === audioPid
    );
  }

  getDownstreamConsumer(pid: string, kind: MediaKind) {
    return this.downstreamTransports.find((t) => {
      return t[kind]?.producerId === pid;
    });
  }

  addTransport(type: string, audioPid?: string, videoPid?: string) {
    return new Promise<TransportOptions>(async (resolve, reject) => {
      const {
        listenInfos,
        initialAvailableOutgoingBitrate,
        maxIncomingBitrate,
      } = config.webRtcTransport;

      const transport = await this.room.router?.createWebRtcTransport({
        enableUdp: true,
        enableTcp: true, //always use UDP unless we can't
        preferUdp: true,
        listenInfos: listenInfos,
        initialAvailableOutgoingBitrate,
      });

      if (!transport) {
        console.log(`createWebRtcTransport return null`);
        reject(new Error("createWebRtcTransport return null"));
      }
      else{
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
        const clientTransportParams = {
          id: transport?.id,
          iceParameters: transport?.iceParameters,
          iceCandidates: transport?.iceCandidates,
          dtlsParameters: transport?.dtlsParameters,
        };
        if (type === "producer") {
          // set the new transport to the client's upstreamTransport
          this.upstreamTransport = transport!;
          // setInterval(async()=>{
          //     const stats = await this.upstreamTransport.getStats()
          //     for(const report of stats.values()){
          //         console.log(report.type)
          //         if(report.type === "webrtc-transport"){
          //             console.log(report.bytesReceived,'-',report.rtpBytesReceived)
          //             // console.log(report)
          //         }
          //     }
          // },1000)
        } else if (type === "consumer") {
          // add the new transport AND the 2 pids, to downstreamTransports
          this.downstreamTransports.push({
            transport, //will handle both audio and video
            associatedVideoPid: videoPid!,
            associatedAudioPid: audioPid!,
          });
        }
        resolve(clientTransportParams); 
      }
    });
  }
  addProducer(kind: MediaKind, newProducer: Producer) {
    this.producer[kind] = newProducer;
    if (kind === "audio") {
      // add this to our activeSpeakerObserver
      this.room.activeSpeakerObserver.addProducer({
        producerId: newProducer.id,
      });
      this.room.activeSpeakerList.push(newProducer.id);
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

export default Client;
