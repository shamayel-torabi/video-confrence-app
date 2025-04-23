// Rooms are not a MediaSoup thing. MS cares about mediastreams, transports,
// things like that. It doesn't care, or know, about rooms.
// Rooms can be inside of clients, clients inside of rooms,
import { EventEmitter } from "node:events";
import {
  ActiveSpeakerObserver,
  ActiveSpeakerObserverDominantSpeaker,
  Router,
  Worker,
} from "mediasoup/types";
import { Client } from "./Client";
import { config } from "./config";
import { SocketIOType } from "./mediaServer";

// transports can belong to rooms or clients, etc.
export class Room extends EventEmitter {
  roomName: string;
  worker: Worker;
  io: SocketIOType;
  router: Router | undefined;
  clients: Client[];
  activeSpeakerList: string[];
  activeSpeakerObserver: ActiveSpeakerObserver | undefined;

  constructor(roomName: string, workerToUse: Worker, io: SocketIOType) {
    super();
    this.roomName = roomName;
    this.worker = workerToUse;
    this.io = io;
    //all the Client objects that are in this room
    this.clients = [];
    //an array of id's with the most recent dominant speaker first
    this.activeSpeakerList = [];
  }

  close() {
    if (this.router) {
      this.router.close();
    }
    this.emit("close");
  }

  addClient(client: Client) {
    this.clients.push(client);
  }

  removeClient(client: Client) {
    const producerId = client.producer?.audio?.id;
    if (producerId) {
      //console.log("activeSpeakerObserver removeProducer:", producerId);
      this.activeSpeakerObserver?.removeProducer({ producerId });
      this.activeSpeakerList = this.activeSpeakerList.filter(ac => ac !== producerId);

      const newTransportsByPeer = this.updateActiveSpeakers();
      this.updateProducersToConsume(newTransportsByPeer); 
    }

    this.clients = this.clients.filter((c) => c.id !== client.id);
  }

  createRouter() {
    return new Promise<void>(async (resolve, _reject) => {
      this.router = await this.worker.createRouter({
        mediaCodecs: config.routerMediaCodecs,
      });
      this.activeSpeakerObserver =
        await this.router.createActiveSpeakerObserver({
          interval: 300, //300 is default
        });
      this.activeSpeakerObserver.on("dominantspeaker", (ds) =>
        this.newDominantSpeaker(ds)
      );
      resolve();
    });
  }

  newDominantSpeaker(ds: ActiveSpeakerObserverDominantSpeaker) {
    console.log("======ds======", ds.producer.id);
    // look through this room's activeSpeakerList for this producer's pid
    // we KNOW that it is an audio pid
    const i = this.activeSpeakerList.findIndex((pid) => pid === ds.producer.id);
    if (i > -1) {
      // this person is in the list, and need to moved to the front
      const [pid] = this.activeSpeakerList.splice(i, 1);
      this.activeSpeakerList.unshift(pid);
    } else {
      // this is a new producer, just add to the front
      this.activeSpeakerList.unshift(ds.producer.id);
    }
    //console.log(this.activeSpeakerList);
    // PLACEHOLDER - the activeSpeakerlist has changed!
    // updateActiveSpeakers = mute/unmute/get new transports
    const newTransportsByPeer = this.updateActiveSpeakers();
    this.updateProducersToConsume(newTransportsByPeer);
  }

  updateActiveSpeakers() {
    //this function is called on newDominantSpeaker, or a new peer produces
    // mutes existing consumers/producer if below 5, for all peers in room
    // unmutes existing consumers/producer if in top 5, for all peers in room
    // return new transports by peer
    //called by either activeSpeakerObserver (newDominantSpeaker) or startProducing

    const activeSpeakers = this.activeSpeakerList.slice(0, 5);
    const mutedSpeakers = this.activeSpeakerList.slice(5);
    const newTransportsByPeer: Record<string, string[]> = {};
    // loop through all connected clients in the room
    this.clients.forEach((client) => {
      // loop through all clients to mute
      mutedSpeakers.forEach((pid) => {
        // pid is the producer id we want to mute
        if (client?.producer?.audio?.id === pid) {
          // this client is the produer. Mute the producer
          client?.producer?.audio.pause();
          client?.producer?.video.pause();
          return;
        }
        const downstreamToStop = client.downstreamTransports.find(
          (t) => t?.audio?.producerId === pid
        );
        if (downstreamToStop) {
          // found the audio, mute both
          downstreamToStop?.audio?.pause();
          downstreamToStop?.video?.pause();
        } //no else. Do nothing if no match
      });
      // store all the pid's this client is not yet consuming
      const newSpeakersToThisClient: string[] = [];
      activeSpeakers.forEach((pid) => {
        if (client?.producer?.audio?.id === pid) {
          // this client is the produer. Resume the producer
          client?.producer?.audio.resume();
          client?.producer?.video.resume();
          return;
        }
        // can grab pid from the audio.producerId like above, or use our own associatedAudioPid
        const downstreamToStart = client.downstreamTransports.find(
          (t) => t?.associatedAudioPid === pid
        );
        if (downstreamToStart) {
          // we have a match. Just resume
          downstreamToStart?.audio?.resume();
          downstreamToStart?.video?.resume();
        } else {
          // this client is not consuming... start the process
          newSpeakersToThisClient.push(pid);
        }
      });
      if (newSpeakersToThisClient.length) {
        // this client has at least 1 new consumer/transport to make
        // at socket.id key, put the array of newSpeakers to make
        // if there were no newSpeakers, then there will be no key for that client
        newTransportsByPeer[client.socket.id] = newSpeakersToThisClient;
      }
    });
    // client loop is done. We have muted or unmuted all producers/consumers
    // based on the new activeSpeakerList. Now, send out the consumers that
    // need to be made.
    // Broadcast to this this
    this.io.to(this.roomName).emit("updateActiveSpeakers", activeSpeakers);
    return newTransportsByPeer;
  }

  updateProducersToConsume(newTransportsByPeer: Record<string, string[]>) {
    for (const [socketId, audioPidsToCreate] of Object.entries(
      newTransportsByPeer
    )) {
      // we have the audioPidsToCreate this socket needs to create
      // map the video pids and the username
      const videoPidsToCreate = audioPidsToCreate.map((aPid) => {
        const producerClient = this.clients.find(
          (c) => c?.producer?.audio?.id === aPid
        );
        return producerClient?.producer?.video?.id || "";
      });
      const associatedUserNames = audioPidsToCreate.map((aPid) => {
        const producerClient = this.clients.find(
          (c) => c?.producer?.audio?.id === aPid
        );
        return producerClient?.userName || "";
      });
      this.io.to(socketId).emit("newProducersToConsume", {
        routerRtpCapabilities: this.router?.rtpCapabilities!,
        audioPidsToCreate,
        videoPidsToCreate,
        associatedUserNames,
        activeSpeakerList: this.activeSpeakerList.slice(0, 5),
      });
    }
  }
}
