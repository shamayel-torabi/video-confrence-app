import { Consumer, RtpCapabilities,  WebRtcTransport } from "mediasoup/types";

export type Message = {
    id: string
    text: string
    userName: string,
    date: string
}


export type User = {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    image: string | null;
    createdAt: Date;
}

export type MediaConsumer = {
    combinedStream: MediaStream;
    userName: string;
    consumerTransport: WebRtcTransport;
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
    transport: WebRtcTransport,
    associatedVideoPid: string,
    associatedAudioPid: string,
    audio?: Consumer,
    video?: Consumer
}

