import { Consumer, RtpCapabilities, Transport } from "mediasoup-client/types";

export type Message = {
    id: string
    text: string
    userName: string,
    date: string
}


export type MediaConsumer = {
    combinedStream: MediaStream;
    userName: string;
    consumerTransport: Transport;
    audioConsumer: Consumer,
    videoConsumer: Consumer
}

export type ConsumeData = {
    routerRtpCapabilities: RtpCapabilities;
    audioPidsToCreate: string[];
    videoPidsToCreate: string[];
    associatedUserNames: string[];
    activeSpeakerList?: string[];
}

export type DownstreamTransportType = {
    transport: Transport,
    associatedVideoPid: string,
    associatedAudioPid: string,
    audio?: Consumer,
    video?: Consumer
}
export type Room = {
    roomId: string
    roomName: string
}

