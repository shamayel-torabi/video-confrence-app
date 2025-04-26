import { EventEmitter } from "node:events";
import { config } from "./config";
export class Client extends EventEmitter {
    constructor(userName, room, socket) {
        super();
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "socket", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "room", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "upstreamTransport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "producer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "downstreamTransports", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
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
    getDownstreamTransport(audioPid) {
        return this.downstreamTransports.find((t) => t?.associatedAudioPid === audioPid);
    }
    getDownstreamConsumer(pid, kind) {
        return this.downstreamTransports.find((t) => {
            return t[kind]?.producerId === pid;
        });
    }
    addTransport(type, audioPid, videoPid) {
        return new Promise(async (resolve, _reject) => {
            const { listenInfos, initialAvailableOutgoingBitrate, maxIncomingBitrate, } = config.webRtcTransport;
            const transport = await this.room.router?.createWebRtcTransport({
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
                listenInfos: listenInfos,
                initialAvailableOutgoingBitrate,
            });
            if (maxIncomingBitrate) {
                // maxIncomingBitrate limit the incoming bandwidth from this transport
                try {
                    await transport?.setMaxIncomingBitrate(maxIncomingBitrate);
                }
                catch (err) {
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
                this.upstreamTransport = transport;
            }
            else if (type === "consumer") {
                // add the new transport AND the 2 pids, to downstreamTransports
                if (transport) {
                    this.downstreamTransports.push({
                        transport,
                        associatedVideoPid: videoPid,
                        associatedAudioPid: audioPid,
                    });
                }
            }
            resolve(clientTransportParams);
        });
    }
    addProducer(kind, newProducer) {
        this.producer[kind] = newProducer;
        if (kind === "audio") {
            // add this to our activeSpeakerObserver
            this.room.activeSpeakerObserver?.addProducer({
                producerId: newProducer.id,
            });
            this.room.activeSpeakerList.push(newProducer?.id);
        }
    }
    addConsumer(kind, newConsumer, downstreamTransport) {
        downstreamTransport[kind] = newConsumer;
    }
}
